"""
Dynatrace integration - fetches real production errors via Grail API
"""
import httpx
import hashlib
import json
import re
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional
from database import db

async def get_dynatrace_config():
    doc = await db.settings.find_one({"key": "dynatrace"})
    if not doc or not doc.get("value"):
        return None
    return doc["value"]

async def get_pipeline_config():
    doc = await db.settings.find_one({"key": "pipeline"})
    if not doc or not doc.get("value"):
        return {"target_environments": "prod", "environment_prefixes": "prod-,staging-,dev-,qa-", "max_errors_per_scan": 20}
    return doc["value"]

async def get_github_config():
    doc = await db.settings.find_one({"key": "github"})
    return doc.get("value", {}) if doc else {}

def extract_repo_from_service(service: str, prefixes: str) -> str:
    """Strip env prefix from service name to get repo name"""
    prefix_list = [p.strip() for p in prefixes.split(",") if p.strip()]
    for prefix in prefix_list:
        if service.startswith(prefix):
            return service[len(prefix):]
    return service

def classify_error(error_type: str, message: str) -> str:
    error_lower = (error_type + " " + message).lower()
    if any(k in error_lower for k in ["outofmemory", "cpu", "network", "timeout", "connection refused", "dns"]):
        return "infrastructure noise"
    if any(k in error_lower for k in ["nullreference", "argumentexception", "invalidoperation", "keynotfound", "formatexception"]):
        return "structured error"
    return "unknown"

def fingerprint(error_type: str, message: str, service: str) -> str:
    # Normalize variable parts
    msg = re.sub(r'\b[0-9a-f]{8,}\b', '<id>', message, flags=re.IGNORECASE)
    msg = re.sub(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}', '<ts>', msg)
    msg = re.sub(r'\b\d+\b', '<n>', msg)
    raw = f"{error_type}::{service}::{msg[:200]}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]

async def fetch_dynatrace_logs(dt_config: dict, pipeline_config: dict) -> List[Dict]:
    """Fetch logs from Dynatrace Grail API"""
    platform_token = dt_config.get("platform_token", "")
    env_url = dt_config.get("environment_url", "").rstrip("/")
    
    if not platform_token or not env_url:
        return []

    headers = {
        "Authorization": f"Api-Token {platform_token}",
        "Content-Type": "application/json"
    }

    target_envs = [e.strip() for e in pipeline_config.get("target_environments", "prod").split(",")]
    # Build DQL query for Grail
    env_filter = " or ".join([f'matchesPhrase(dt.entity.process_group, "{e}")' for e in target_envs])
    
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(hours=24)

    dql = f"""
fetch logs
| filter loglevel == "ERROR"
| filter toTimestamp("{start_time.strftime('%Y-%m-%dT%H:%M:%SZ')}") < timestamp
| summarize count = count(), lastSeen = max(timestamp), firstSeen = min(timestamp), by: {{dt.entity.process_group, content, loglevel}}
| limit {pipeline_config.get('max_errors_per_scan', 20)}
"""

    payload = {"query": dql, "defaultTimeframeStart": start_time.isoformat(), "defaultTimeframeEnd": end_time.isoformat()}
    
    records = []
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # Start query
            r = await client.post(f"{env_url}/api/v2/logs/search", headers=headers, json={
                "query": "status:error",
                "from": f"now-24h",
                "limit": pipeline_config.get("max_errors_per_scan", 20)
            })
            
            if r.status_code == 200:
                data = r.json()
                records = data.get("results", [])
            elif r.status_code == 400:
                # Try Grail DQL endpoint
                r2 = await client.post(f"{env_url}/platform/storage/query/v1/query:execute", 
                    headers=headers, json={"query": dql})
                if r2.status_code == 200:
                    job = r2.json()
                    handle = job.get("requestToken") or job.get("handle")
                    if handle:
                        for _ in range(10):
                            import asyncio
                            await asyncio.sleep(1)
                            r3 = await client.get(
                                f"{env_url}/platform/storage/query/v1/query:poll",
                                headers=headers, params={"requestToken": handle}
                            )
                            if r3.status_code == 200:
                                result = r3.json()
                                if result.get("state") == "SUCCEEDED":
                                    records = result.get("result", {}).get("records", [])
                                    break
    except Exception as e:
        print(f"Dynatrace fetch error: {e}")
    
    return records

async def fetch_dynatrace_problems(dt_config: dict) -> List[Dict]:
    """Fetch problems/incidents from Dynatrace Environment API v2"""
    api_token = dt_config.get("api_token", "")
    env_url = dt_config.get("environment_url", "").rstrip("/")
    
    if not api_token or not env_url:
        return []
    
    headers = {"Authorization": f"Api-Token {api_token}"}
    problems = []
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{env_url}/api/v2/problems",
                headers=headers,
                params={"pageSize": 50, "from": "now-24h", "status": "OPEN"}
            )
            if r.status_code == 200:
                problems = r.json().get("problems", [])
    except Exception as e:
        print(f"Dynatrace problems fetch error: {e}")
    return problems

async def process_log_records(records: List[Dict], pipeline_config: dict) -> Dict:
    """Process raw Dynatrace records into deduped errors"""
    gh_config = await get_github_config()
    prefixes = pipeline_config.get("environment_prefixes", "prod-")
    enabled_repos = set(gh_config.get("enabled_repos", []))
    
    created = 0
    updated = 0
    
    for record in records:
        # Extract fields from various Dynatrace response formats
        service = (record.get("dt.entity.process_group") or 
                  record.get("service.name") or 
                  record.get("processGroupName") or "unknown")
        
        content = (record.get("content") or 
                   record.get("message") or 
                   record.get("log.message") or "")
        
        timestamp_str = record.get("timestamp") or record.get("startTime") or ""
        
        # Parse error type from content
        error_type = "UnknownError"
        et_match = re.search(r'(System\.\w+(?:\.\w+)*Exception|Error|Exception)', content)
        if et_match:
            error_type = et_match.group(0)
        
        repo_name = extract_repo_from_service(service, prefixes)
        
        # Skip if not in monitored repos (only when repos are configured)
        if enabled_repos and repo_name not in enabled_repos and service not in enabled_repos:
            # still process, but mark as unmonitored
            pass
        
        fp = fingerprint(error_type, content, service)
        classification = classify_error(error_type, content)
        
        try:
            ts = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00")) if timestamp_str else datetime.now(timezone.utc)
        except:
            ts = datetime.now(timezone.utc)
        
        # Upsert error
        existing = await db.errors.find_one({"fingerprint": fp})
        
        if existing:
            await db.errors.update_one(
                {"fingerprint": fp},
                {"$set": {
                    "last_seen": ts,
                    "occurrences": existing.get("occurrences", 1) + record.get("count", 1)
                }}
            )
            updated += 1
        else:
            await db.errors.insert_one({
                "fingerprint": fp,
                "error_type": error_type,
                "classification": classification,
                "message": content[:500],
                "service": service,
                "container": service,
                "repo": repo_name,
                "occurrences": record.get("count", 1),
                "first_seen": ts,
                "last_seen": ts,
                "status": "new",
                "raw_logs": [record]
            })
            created += 1
    
    return {"created": created, "updated": updated, "total": len(records)}

async def run_scan() -> Dict:
    """Main scan function - called by polling service and manual trigger"""
    from datetime import datetime
    started = datetime.now(timezone.utc)
    
    dt_config = await get_dynatrace_config()
    pipeline_config = await get_pipeline_config()
    
    result = {
        "started_at": started.isoformat(),
        "status": "completed",
        "errors_found": 0,
        "new_errors": 0,
        "updated_errors": 0,
        "repos_scanned": 0,
        "error": None
    }
    
    if not dt_config or not dt_config.get("platform_token"):
        result["status"] = "skipped"
        result["error"] = "Dynatrace not configured"
        await db.scans.insert_one({**result, "finished_at": datetime.now(timezone.utc).isoformat()})
        return result
    
    if pipeline_config.get("pause_scanning"):
        result["status"] = "paused"
        result["error"] = "Scanning is paused"
        await db.scans.insert_one({**result, "finished_at": datetime.now(timezone.utc).isoformat()})
        return result
    
    try:
        records = await fetch_dynatrace_logs(dt_config, pipeline_config)
        
        # Also fetch problems if API token configured
        if dt_config.get("api_token"):
            problems = await fetch_dynatrace_problems(dt_config)
            # Convert problems to records format
            for p in problems:
                records.append({
                    "dt.entity.process_group": p.get("entityLabel", "unknown"),
                    "content": f"{p.get('title', 'Problem')}: {p.get('severityLevel', '')}",
                    "timestamp": p.get("startTime", ""),
                    "count": p.get("eventCount", 1)
                })
        
        gh_config = await get_github_config()
        result["repos_scanned"] = len(gh_config.get("enabled_repos", []))
        
        proc = await process_log_records(records, pipeline_config)
        result["errors_found"] = proc["total"]
        result["new_errors"] = proc["created"]
        result["updated_errors"] = proc["updated"]
        
    except Exception as e:
        result["status"] = "failed"
        result["error"] = str(e)
    
    result["finished_at"] = datetime.now(timezone.utc).isoformat()
    result["duration_seconds"] = (datetime.now(timezone.utc) - started).total_seconds()
    
    await db.scans.insert_one(result)
    return result
