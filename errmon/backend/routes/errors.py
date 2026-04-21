from fastapi import APIRouter, Query, HTTPException, UploadFile, File
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
import json, csv, io, hashlib, re
from database import db

# Levels that indicate errors worth storing
_ERROR_LEVELS = {'error', 'warn', 'warning', 'fatal', 'critical', 'emerg', 'crit', 'alert', 'severe', 'err'}
# Levels to always skip
_SKIP_LEVELS  = {'info', 'debug', 'notice', 'trace', 'verbose'}

_LEVEL_RE     = re.compile(r'\[([a-zA-Z]+)\]')
_TS_RE        = re.compile(r'^\d{4}[/\-]\d{2}[/\-]\d{2}[\sT]\d{2}:\d{2}:\d{2}[,.\d]*\s*')
_NGINX_PID_RE = re.compile(r'^\d+#\d+:\s+\*?\d*\s*')
_EXCEPTION_RE = re.compile(r'([A-Z][a-zA-Z0-9_]*(?:Exception|Error|Fault|Panic|Failure))')
_FUNC_ERR_RE  = re.compile(r'([A-Z][a-zA-Z0-9_]+\(\)).*?failed', re.IGNORECASE)
_DYN_RE       = re.compile(r'\*\d+\s*|:\d+$|\s+\d{1,5}#\d+:')  # strip dynamic IDs for fingerprint

def parse_log_lines(text: str) -> list:
    """Parse a plain-text log file (nginx, app server, etc.) into error records."""
    records = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        i += 1
        if not line.strip():
            continue

        # Determine log level from [level] tag
        level_match = _LEVEL_RE.search(line)
        level = level_match.group(1).lower() if level_match else ''

        if level in _SKIP_LEVELS:
            continue
        # Keep if error level OR line contains an exception class name
        if level not in _ERROR_LEVELS and not _EXCEPTION_RE.search(line):
            continue

        # Collect continuation lines (stack traces, indented context)
        block = [line]
        while i < len(lines):
            nxt = lines[i]
            if nxt and (nxt[0] in ('\t', ' ') or nxt.lstrip().startswith('at ') or nxt.lstrip().startswith('--- ')):
                block.append(nxt.rstrip())
                i += 1
            else:
                break

        full = '\n'.join(block)

        # Build clean message: strip timestamp, [level], nginx pid#tid:*N
        msg = line
        msg = _TS_RE.sub('', msg)
        msg = _LEVEL_RE.sub('', msg)
        msg = _NGINX_PID_RE.sub('', msg)
        msg = msg.strip(' \t-–:')

        # Determine error_type
        exc = _EXCEPTION_RE.search(full)
        if exc:
            error_type = exc.group(1)
        else:
            func = _FUNC_ERR_RE.search(msg)
            if func:
                error_type = func.group(1).rstrip('()') + 'Error'
            else:
                error_type = (level.capitalize() + 'Error') if level else 'LogError'

        # Normalize message for fingerprint (strip dynamic connection IDs, line numbers)
        fp_msg = _DYN_RE.sub(' ', msg).strip()

        records.append({
            'error_type': error_type,
            'message': msg[:500],
            '_fp_msg': fp_msg,   # used for dedup, not stored
            'service': 'unknown-service',
            'classification': level or 'log_error',
            'raw_log': full,
        })
    return records

router = APIRouter(tags=["errors"])

def serialize(doc):
    if doc is None:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    for k, v in doc.items():
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc

@router.get("/")
async def list_errors(
    status: Optional[str] = None,
    classification: Optional[str] = None,
    repo: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = "last_seen",
    sort_dir: int = -1,
    page: int = 1,
    limit: int = 50
):
    query = {}
    if status and status != "all":
        query["status"] = status
    if classification and classification != "all":
        query["classification"] = {"$regex": classification, "$options": "i"}
    if repo and repo not in ("all", "monitored"):
        query["repo"] = repo
    elif repo == "monitored":
        gh = await db.settings.find_one({"key": "github"})
        if gh and gh.get("value", {}).get("enabled_repos"):
            query["repo"] = {"$in": gh["value"]["enabled_repos"]}
    if search:
        query["$or"] = [
            {"message": {"$regex": search, "$options": "i"}},
            {"error_type": {"$regex": search, "$options": "i"}},
            {"service": {"$regex": search, "$options": "i"}},
        ]

    total = await db.errors.count_documents(query)
    skip = (page - 1) * limit
    cursor = db.errors.find(query).sort(sort_by, sort_dir).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)
    return {
        "errors": [serialize(d) for d in docs],
        "total": total,
        "page": page,
        "pages": max(1, (total + limit - 1) // limit)
    }

@router.get("/{error_id}")
async def get_error(error_id: str):
    try:
        doc = await db.errors.find_one({"_id": ObjectId(error_id)})
    except:
        doc = await db.errors.find_one({"_id": error_id})
    if not doc:
        raise HTTPException(404, "Error not found")
    return serialize(doc)

@router.delete("/{error_id}")
async def delete_error(error_id: str):
    try:
        await db.errors.delete_one({"_id": ObjectId(error_id)})
    except:
        await db.errors.delete_one({"_id": error_id})
    return {"success": True}

@router.post("/upload")
async def upload_errors(file: UploadFile = File(...)):
    """Accept a JSON array or CSV file and insert errors into the database."""
    content = await file.read()
    filename = file.filename or ""
    records = []

    text = content.decode("utf-8", errors="replace")

    if filename.endswith(".json") or file.content_type == "application/json":
        try:
            data = json.loads(content)
            if isinstance(data, dict):
                data = [data]
            records = data
        except Exception as e:
            raise HTTPException(400, f"Invalid JSON: {e}")

    elif filename.endswith(".csv") or "csv" in (file.content_type or ""):
        try:
            reader = csv.DictReader(io.StringIO(text))
            records = list(reader)
        except Exception as e:
            raise HTTPException(400, f"Invalid CSV: {e}")

    elif filename.endswith(".log") or filename.endswith(".txt") or "text/plain" in (file.content_type or ""):
        records = parse_log_lines(text)
        if not records:
            raise HTTPException(400, "No ERROR/WARN/exception lines found in log file.")

    else:
        # Auto-detect: try JSON → CSV → log
        try:
            data = json.loads(content)
            records = data if isinstance(data, list) else [data]
        except Exception:
            try:
                reader = csv.DictReader(io.StringIO(text))
                rows = list(reader)
                if rows and len(rows[0]) > 1:
                    records = rows
                else:
                    raise ValueError("not csv")
            except Exception:
                records = parse_log_lines(text)
                if not records:
                    raise HTTPException(400, "Unsupported file format. Use .json, .csv, or .log")

    if not records:
        raise HTTPException(400, "File contains no records.")

    inserted = 0
    skipped = 0
    now = datetime.now(timezone.utc)

    for row in records:
        # Normalize field names (support snake_case and camelCase variants)
        def g(*keys):
            for k in keys:
                v = row.get(k) or row.get(k.replace("_", "")) or row.get(k.lower()) or row.get(k.upper())
                if v is not None and str(v).strip():
                    return str(v).strip()
            return None

        message     = g("message", "msg", "error_message", "errorMessage") or "Unknown error"
        error_type  = g("error_type", "errorType", "type", "error", "exception") or "UnknownError"
        service     = g("service", "app", "application", "source") or "unknown-service"
        container   = g("container", "host", "pod", "instance")
        repo        = g("repo", "repository", "project")
        classif     = g("classification", "category", "class", "severity") or "unknown"
        occurrences = int(g("occurrences", "count", "occurrenceCount") or 1)

        fp_msg_key = row.pop("_fp_msg", message)
        fp_raw = f"{error_type}:{fp_msg_key}:{service}".encode()
        fingerprint = hashlib.sha256(fp_raw).hexdigest()[:16]

        existing = await db.errors.find_one({"fingerprint": fingerprint})
        if existing:
            skipped += 1
            continue

        raw_log_entry = row.get("raw_log")
        doc = {
            "fingerprint": fingerprint,
            "error_type": error_type,
            "classification": classif,
            "message": message,
            "service": service,
            "occurrences": occurrences,
            "first_seen": now,
            "last_seen": now,
            "status": "new",
            "raw_logs": [{"timestamp": now.isoformat(), "content": raw_log_entry}] if raw_log_entry else [],
        }
        if container:
            doc["container"] = container
        if repo:
            doc["repo"] = repo

        await db.errors.insert_one(doc)
        inserted += 1

    return {"inserted": inserted, "skipped": skipped, "total": len(records)}


@router.get("/stats/summary")
async def error_stats():
    total = await db.errors.count_documents({})
    by_status = {}
    by_class = {}
    by_repo = {}
    async for doc in db.errors.find({}):
        s = doc.get("status", "new")
        by_status[s] = by_status.get(s, 0) + 1
        c = doc.get("classification", "unknown")
        by_class[c] = by_class.get(c, 0) + 1
        r = doc.get("repo", "unknown")
        by_repo[r] = by_repo.get(r, 0) + doc.get("occurrences", 1)
    top_repos = sorted(by_repo.items(), key=lambda x: x[1], reverse=True)[:5]
    return {
        "total": total,
        "by_status": by_status,
        "by_classification": by_class,
        "top_repos": [{"name": k, "count": v} for k, v in top_repos]
    }
