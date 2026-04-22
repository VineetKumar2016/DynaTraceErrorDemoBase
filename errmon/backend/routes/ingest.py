"""
Log Ingestion API — receives log data and forwards it to Dynatrace Log Ingest v2.

Supported inputs
----------------
POST /api/ingest/logs
  • multipart file upload  (text/plain .log/.txt, JSON .json, CSV .csv)
  • raw text body          (Content-Type: text/plain)
  • JSON body              (Content-Type: application/json) — array or single object

Dynatrace Log Ingest v2
  POST {environment_url}/api/v2/logs/ingest
  Authorization: Api-Token {api_token}   (scope: logs.ingest)
  Limits: ≤1 000 entries / request, ≤5 MB / request
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from datetime import datetime, timezone
from typing import List, Dict, Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from database import db

router = APIRouter(tags=["ingest"])

# ──────────────────────────────────────────────────────────────
# Severity mapping  →  Dynatrace accepted values
# ──────────────────────────────────────────────────────────────
_DT_SEV: Dict[str, str] = {
    "fatal":    "FATAL",
    "emerg":    "EMERGENCY",
    "emergency":"EMERGENCY",
    "alert":    "ALERT",
    "crit":     "CRITICAL",
    "critical": "CRITICAL",
    "error":    "ERROR",
    "err":      "ERROR",
    "severe":   "SEVERE",
    "warn":     "WARN",
    "warning":  "WARN",
    "notice":   "NOTICE",
    "info":     "INFO",
    "debug":    "DEBUG",
    "trace":    "NONE",
    "verbose":  "NONE",
}

# ──────────────────────────────────────────────────────────────
# Log parsing helpers  (shared patterns from errors.py)
# ──────────────────────────────────────────────────────────────
_LEVEL_RE     = re.compile(r'\[([a-zA-Z]+)\]')
_TS_RE        = re.compile(r'^\d{4}[/\-]\d{2}[/\-]\d{2}[\sT]\d{2}:\d{2}:\d{2}[,.\d]*\s*')
_ISO_TS_RE    = re.compile(r'(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)')
_NGINX_PID_RE = re.compile(r'^\d+#\d+:\s+\*?\d*\s*')
_NGINX_HOST_RE = re.compile(r'host:\s*"([^"]+)"')
_EXCEPTION_RE  = re.compile(r'([A-Z][a-zA-Z0-9_]*(?:Exception|Error|Fault|Panic|Failure))')
_SKIP_LEVELS   = {'info', 'debug', 'notice', 'trace', 'verbose'}
_ERROR_LEVELS  = {'error', 'warn', 'warning', 'fatal', 'critical', 'emerg', 'crit', 'alert', 'severe', 'err'}


def _parse_log_text(text: str) -> List[Dict]:
    """Parse a plain-text log file into raw log record dicts."""
    records: List[Dict] = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        i += 1
        if not line.strip():
            continue

        block = [line]
        while i < len(lines):
            nxt = lines[i]
            if nxt and (nxt[0] in ('\t', ' ')
                        or nxt.lstrip().startswith('at ')
                        or nxt.lstrip().startswith('--- ')
                        or (not _TS_RE.match(nxt) and not _LEVEL_RE.search(nxt) and not nxt[0].isdigit())):
                block.append(nxt.rstrip())
                i += 1
            else:
                break

        full = '\n'.join(block)
        level_match = _LEVEL_RE.search(line)
        level = level_match.group(1).lower() if level_match else ''

        if level in _SKIP_LEVELS:
            continue
        if level not in _ERROR_LEVELS and not _EXCEPTION_RE.search(full):
            continue

        # Build clean message
        msg = line
        msg = _TS_RE.sub('', msg)
        msg = _LEVEL_RE.sub('', msg)
        msg = _NGINX_PID_RE.sub('', msg)
        msg = msg.strip(' \t-–:')
        if len(block) > 1:
            msg = msg + ' ' + ' '.join(block[1:])
        msg = msg[:2000]

        # Extract timestamp from original line if present
        ts_m = _ISO_TS_RE.search(line)
        timestamp = ts_m.group(1) if ts_m else None

        host_m = _NGINX_HOST_RE.search(full)
        service = host_m.group(1) if host_m else 'unknown-service'

        exc = _EXCEPTION_RE.search(full)
        error_type = exc.group(1) if exc else ((level.capitalize() + 'Error') if level else 'LogError')

        records.append({
            "content":    msg,
            "severity":   level,
            "service":    service,
            "error_type": error_type,
            "timestamp":  timestamp,
            "raw":        full,
        })
    return records


# ──────────────────────────────────────────────────────────────
# Convert parsed records  →  Dynatrace log entry format
# ──────────────────────────────────────────────────────────────
def _to_dt_entry(rec: Dict, source: str) -> Dict:
    """Map a parsed log record to a Dynatrace Log Ingest entry."""
    sev_raw = rec.get("severity", "").lower()
    dt_sev  = _DT_SEV.get(sev_raw, "ERROR")

    entry: Dict = {
        "content":      rec.get("content", "")[:4096],   # DT hard limit
        "severity":     dt_sev,
        "log.source":   source,
        "service.name": rec.get("service", "unknown-service"),
        "error.type":   rec.get("error_type", ""),
    }

    # Prefer the timestamp embedded in the log line; fall back to now (UTC ISO-8601)
    ts = rec.get("timestamp")
    if ts:
        # Normalise to ISO-8601 with Z suffix so DT accepts it
        ts = ts.replace(" ", "T")
        if not ts.endswith("Z") and "+" not in ts[-6:]:
            ts += "Z"
        entry["timestamp"] = ts
    else:
        entry["timestamp"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    return entry


# ──────────────────────────────────────────────────────────────
# Dynatrace sender
# ──────────────────────────────────────────────────────────────
_DT_BATCH = 1000   # max entries per DT request


async def _send_to_dynatrace(entries: List[Dict], dt_cfg: Dict) -> Dict:
    """Send log entries to Dynatrace in batches. Returns a summary dict."""
    env_url   = dt_cfg.get("environment_url", "").rstrip("/")
    api_token = dt_cfg.get("api_token", "")

    if not env_url or not api_token:
        raise HTTPException(400, "Dynatrace not configured — set environment_url and api_token in Settings > Dynatrace")

    endpoint = f"{env_url}/api/v2/logs/ingest"
    headers  = {
        "Authorization": f"Api-Token {api_token}",
        "Content-Type":  "application/json; charset=utf-8",
    }

    forwarded = 0
    errors: List[str] = []

    async with httpx.AsyncClient(timeout=30) as client:
        for start in range(0, len(entries), _DT_BATCH):
            batch = entries[start : start + _DT_BATCH]
            try:
                r = await client.post(endpoint, headers=headers, content=json.dumps(batch))
                if r.status_code in (200, 204):
                    forwarded += len(batch)
                elif r.status_code == 400:
                    errors.append(f"batch {start}-{start+len(batch)}: 400 bad request — {r.text[:200]}")
                elif r.status_code in (401, 403):
                    raise HTTPException(401, f"Dynatrace auth failed ({r.status_code}) — check your api_token and logs.ingest scope")
                elif r.status_code == 429:
                    errors.append(f"batch {start}-{start+len(batch)}: 429 rate-limited by Dynatrace")
                else:
                    errors.append(f"batch {start}-{start+len(batch)}: {r.status_code} {r.text[:200]}")
            except httpx.TimeoutException:
                errors.append(f"batch {start}-{start+len(batch)}: timed out")

    return {"forwarded": forwarded, "errors": errors}


# ──────────────────────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────────────────────

@router.post("/logs")
async def ingest_logs(request: Request, file: Optional[UploadFile] = File(default=None)):
    """
    Ingest log data and forward every entry to Dynatrace Log Ingest v2.

    Accepted inputs (in order of detection):
      1. Multipart file upload  — .log / .txt / .json / .csv
      2. Raw text body          — Content-Type: text/plain
      3. JSON body              — Content-Type: application/json (array or object)
    """
    dt_cfg_doc = await db.settings.find_one({"key": "dynatrace"})
    dt_cfg = dt_cfg_doc.get("value", {}) if dt_cfg_doc else {}

    # ── 1. Parse input ────────────────────────────────────────
    raw_records: List[Dict] = []       # list of dicts with at least {"content", "severity", "service"}
    source = "errmon-upload"

    if file is not None:
        # ── multipart file upload ──────────────────────────────
        source   = file.filename or "uploaded-file"
        content  = await file.read()
        filename = file.filename or ""
        text     = content.decode("utf-8", errors="replace")

        if filename.endswith(".json") or (file.content_type or "").startswith("application/json"):
            try:
                data = json.loads(content)
                raw_records = data if isinstance(data, list) else [data]
            except Exception as e:
                raise HTTPException(400, f"Invalid JSON: {e}")

        elif filename.endswith(".csv") or "csv" in (file.content_type or ""):
            try:
                reader = csv.DictReader(io.StringIO(text))
                raw_records = [
                    {
                        "content":  row.get("message") or row.get("msg") or row.get("content") or str(row),
                        "severity": row.get("severity") or row.get("level") or row.get("classification") or "",
                        "service":  row.get("service") or row.get("app") or "unknown-service",
                        "error_type": row.get("error_type") or row.get("type") or "LogError",
                        "timestamp": row.get("timestamp") or row.get("time") or None,
                        "raw": str(row),
                    }
                    for row in list(reader)
                ]
            except Exception as e:
                raise HTTPException(400, f"Invalid CSV: {e}")

        else:
            # treat as plain text log
            raw_records = _parse_log_text(text)
            if not raw_records:
                raise HTTPException(400, "No ERROR/WARN/exception lines found in log file")

    else:
        # ── body-based input ──────────────────────────────────
        ct = request.headers.get("content-type", "")
        body = await request.body()

        if not body:
            raise HTTPException(400, "No input provided — send a file upload or a request body")

        if "application/json" in ct:
            try:
                data = json.loads(body)
                if isinstance(data, list):
                    raw_records = data
                elif isinstance(data, dict):
                    raw_records = [data]
                else:
                    raise HTTPException(400, "JSON body must be an array or object")
            except json.JSONDecodeError as e:
                raise HTTPException(400, f"Invalid JSON: {e}")
            source = "errmon-api"

        else:
            # treat as plain text / log stream
            text = body.decode("utf-8", errors="replace")
            raw_records = _parse_log_text(text)
            if not raw_records:
                raise HTTPException(400, "No ERROR/WARN/exception lines found in log data")
            source = "errmon-stream"

    if not raw_records:
        raise HTTPException(400, "No log records found in input")

    # ── 2. Normalise JSON / CSV records that aren't from log parser ─────
    normalised: List[Dict] = []
    for rec in raw_records:
        if not isinstance(rec, dict):
            continue
        # Already has 'content' (from log parser or JSON array with that key)
        if "content" not in rec:
            # Try common field names
            rec["content"] = (
                rec.get("message") or rec.get("msg") or
                rec.get("error_message") or rec.get("log") or
                str(rec)[:2000]
            )
        if "severity" not in rec:
            rec["severity"] = (
                rec.get("level") or rec.get("classification") or
                rec.get("severity") or ""
            )
        if "service" not in rec:
            rec["service"] = rec.get("app") or rec.get("application") or rec.get("source") or "unknown-service"
        normalised.append(rec)

    # ── 3. Convert to Dynatrace format ────────────────────────
    dt_entries = [_to_dt_entry(r, source) for r in normalised]

    # ── 4. Forward to Dynatrace ───────────────────────────────
    result = await _send_to_dynatrace(dt_entries, dt_cfg)

    return {
        "parsed":    len(normalised),
        "forwarded": result["forwarded"],
        "errors":    result["errors"],
        "source":    source,
    }


@router.post("/logs/json")
async def ingest_logs_json(body: list):
    """
    Shorthand endpoint — POST a JSON array of log objects directly.
    Each object should have at minimum a 'content' or 'message' field.
    """
    dt_cfg_doc = await db.settings.find_one({"key": "dynatrace"})
    dt_cfg = dt_cfg_doc.get("value", {}) if dt_cfg_doc else {}

    if not body:
        raise HTTPException(400, "Empty array")

    normalised = []
    for rec in body:
        if not isinstance(rec, dict):
            continue
        if "content" not in rec:
            rec["content"] = rec.get("message") or rec.get("msg") or str(rec)[:2000]
        if "severity" not in rec:
            rec["severity"] = rec.get("level") or rec.get("classification") or ""
        if "service" not in rec:
            rec["service"] = rec.get("app") or rec.get("service") or "unknown-service"
        normalised.append(rec)

    dt_entries = [_to_dt_entry(r, "errmon-json") for r in normalised]
    result = await _send_to_dynatrace(dt_entries, dt_cfg)

    return {
        "parsed":    len(normalised),
        "forwarded": result["forwarded"],
        "errors":    result["errors"],
    }


@router.get("/from-dynatrace")
async def fetch_from_dynatrace(
    from_time: str = "now-1h",
    query: str = 'status="ERROR" OR status="CRITICAL" OR status="FATAL" OR status="SEVERE" OR status="WARN"',
    limit: int = 1000,
):
    """
    Fetch log entries from Dynatrace Logs Search API and insert new ones into
    the local errors collection so they appear in the Errors tab.

    Params
    ------
    from_time : DT relative time or ISO-8601 (default: now-1h)
    query     : DQL filter string
    limit     : max entries to fetch (1–5000)
    """
    dt_cfg_doc = await db.settings.find_one({"key": "dynatrace"})
    dt_cfg = dt_cfg_doc.get("value", {}) if dt_cfg_doc else {}
    env_url   = dt_cfg.get("environment_url", "").rstrip("/")
    api_token = dt_cfg.get("api_token", "")

    if not env_url or not api_token:
        raise HTTPException(400, "Dynatrace not configured — set environment_url and api_token in Settings > Dynatrace")

    headers = {
        "Authorization": f"Api-Token {api_token}",
        "Accept": "application/json; charset=utf-8",
    }

    # ── 1. Fetch from Dynatrace Logs Search API ───────────────
    params = {
        "from":  from_time,
        "to":    "now",
        "query": query,
        "limit": min(limit, 5000),
        "sort":  "-timestamp",
    }

    dt_entries: List[Dict] = []
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{env_url}/api/v2/logs/search", headers=headers, params=params)
        if r.status_code in (401, 403):
            raise HTTPException(401, f"Dynatrace auth failed ({r.status_code}) — ensure api_token has logs.read scope")
        if r.status_code != 200:
            raise HTTPException(502, f"Dynatrace returned {r.status_code}: {r.text[:300]}")
        data = r.json()
        dt_entries = data.get("results", [])

    if not dt_entries:
        return {"inserted": 0, "skipped": 0, "total": 0, "message": "No log entries returned from Dynatrace"}

    # ── 2. Map DT entries → error records and deduplicate ────
    now  = datetime.now(timezone.utc)
    inserted = 0
    skipped  = 0
    seen_fps: set = set()

    for entry in dt_entries:
        content = entry.get("content", "").strip()
        if not content:
            continue

        # Extract fields from additionalColumns (DT returns them as {"key": ["val1"]})
        extra = entry.get("additionalColumns", {})
        def _col(key: str, fallback: str = "") -> str:
            v = extra.get(key, [])
            return v[0] if v else fallback

        service    = _col("service.name") or _col("dt.entity.service") or _col("host.name") or "dynatrace"
        log_source = _col("log.source") or "dynatrace"
        dt_status  = (entry.get("status") or "ERROR").upper()

        # Map DT status → our classification
        classif = {
            "FATAL":     "fatal",
            "EMERGENCY": "fatal",
            "ALERT":     "fatal",
            "CRITICAL":  "critical",
            "SEVERE":    "severe",
            "ERROR":     "error",
            "WARN":      "warning",
            "WARNING":   "warning",
        }.get(dt_status, "error")

        # Extract error_type — look for an exception class in content
        exc_m = _EXCEPTION_RE.search(content)
        if exc_m:
            error_type = exc_m.group(1)
        else:
            error_type = f"{dt_status.capitalize()}Log"

        # Dedup fingerprint
        fp_raw = f"{error_type}:{content[:200]}:{service}".encode()
        fingerprint = hashlib.sha256(fp_raw).hexdigest()[:16]

        if fingerprint in seen_fps:
            skipped += 1
            continue
        existing = await db.errors.find_one({"fingerprint": fingerprint})
        if existing:
            skipped += 1
            seen_fps.add(fingerprint)
            continue

        # Parse timestamp  (DT returns epoch millis as int or ISO string)
        raw_ts = entry.get("timestamp")
        try:
            if isinstance(raw_ts, (int, float)):
                ts = datetime.fromtimestamp(raw_ts / 1000, tz=timezone.utc)
            else:
                ts = datetime.fromisoformat(str(raw_ts).replace("Z", "+00:00"))
        except Exception:
            ts = now

        doc = {
            "fingerprint":    fingerprint,
            "error_type":     error_type,
            "classification": classif,
            "message":        content[:500],
            "service":        service,
            "occurrences":    1,
            "first_seen":     ts,
            "last_seen":      ts,
            "status":         "new",
            "source":         "dynatrace",
            "log_source":     log_source,
            "raw_logs":       [{"timestamp": ts.isoformat(), "content": content}],
        }

        await db.errors.insert_one(doc)
        seen_fps.add(fingerprint)
        inserted += 1

    return {
        "inserted": inserted,
        "skipped":  skipped,
        "total":    len(dt_entries),
        "message":  f"Fetched {len(dt_entries)} from Dynatrace — {inserted} new, {skipped} duplicates skipped",
    }


@router.get("/status")
async def ingest_status():
    """Returns whether Dynatrace Log Ingest is configured and ready."""
    dt_cfg_doc = await db.settings.find_one({"key": "dynatrace"})
    dt_cfg = dt_cfg_doc.get("value", {}) if dt_cfg_doc else {}
    env_url   = dt_cfg.get("environment_url", "")
    api_token = dt_cfg.get("api_token", "")
    ready = bool(env_url and api_token)
    return {
        "ready":       ready,
        "endpoint":    f"{env_url.rstrip('/')}/api/v2/logs/ingest" if env_url else None,
        "token_set":   bool(api_token),
        "upload_url":  "/api/ingest/logs",
        "json_url":    "/api/ingest/logs/json",
    }
