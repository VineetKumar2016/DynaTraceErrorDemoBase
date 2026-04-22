from fastapi import APIRouter, HTTPException
from typing import Optional, Dict, Any
import httpx
from database import db
from models import SettingsPayload, GitHubSettings, DynatraceSettings, JiraSettings, AISettings, PipelineSettings

router = APIRouter(tags=["settings"])

async def get_setting(key: str, default=None):
    doc = await db.settings.find_one({"key": key})
    return doc.get("value") if doc else default

async def save_setting(key: str, value):
    await db.settings.update_one(
        {"key": key},
        {"$set": {"key": key, "value": value}},
        upsert=True
    )

@router.post("/repair")
async def repair_tokens():
    """Force-clear any non-ASCII / masked credential values stored in the DB."""
    cleaned = []
    for key, fields in [
        ("github",    ["token"]),
        ("dynatrace", ["platform_token", "api_token"]),
        ("jira",      ["token"]),
        ("ai",        ["api_key"]),
    ]:
        doc = await db.settings.find_one({"key": key})
        if not doc:
            continue
        val = doc.get("value", {})
        changed = False
        for field in fields:
            v = val.get(field, "")
            if v and (not str(v).isascii() or "•" in str(v)):
                val[field] = ""
                changed = True
                cleaned.append(f"{key}.{field}")
        if changed:
            await db.settings.update_one({"key": key}, {"$set": {"value": val}})
    return {"cleaned": cleaned, "message": "Re-enter your credentials and save again."}

@router.get("/")
async def get_all_settings():
    keys = ["github", "dynatrace", "jira", "ai", "pipeline"]
    result = {}
    for k in keys:
        raw = await get_setting(k, {})
        result[k] = dict(raw) if raw else {}  # copy so masking never mutates the stored value
    # Mask tokens on the copy
    if result.get("github", {}).get("token"):
        result["github"]["token"] = "••••••••••"
    if result.get("dynatrace", {}).get("platform_token"):
        result["dynatrace"]["platform_token"] = "••••••••••"
    if result.get("dynatrace", {}).get("api_token"):
        result["dynatrace"]["api_token"] = "•••••••••"
    if result.get("jira", {}).get("token"):
        result["jira"]["token"] = "••••••••••"
    for field, mask in [
        ("investigation_api_key", "sk-••••••"),
        ("triage_api_key",        "sk-••••••"),
    ]:
        if result.get("ai", {}).get(field):
            result["ai"][field] = mask
    return result

@router.post("/github")
async def save_github(data: dict):
    existing = await get_setting("github", {})
    # Don't overwrite when token is blank, masked, or non-ASCII (corrupted)
    t = data.get("token", "")
    if not t or not t.isascii() or t.startswith("•"):
        data["token"] = existing.get("token", "")
    await save_setting("github", data)
    return {"success": True}

@router.post("/dynatrace")
async def save_dynatrace(data: dict):
    existing = await get_setting("dynatrace", {})
    if not data.get("platform_token") or data.get("platform_token", "").startswith("•"):
        data["platform_token"] = existing.get("platform_token", "")
    if not data.get("api_token") or data.get("api_token", "").startswith("•"):
        data["api_token"] = existing.get("api_token", "")
    await save_setting("dynatrace", data)
    return {"success": True}

@router.post("/jira")
async def save_jira(data: dict):
    existing = await get_setting("jira", {})
    if not data.get("token") or data.get("token", "").startswith("•"):
        data["token"] = existing.get("token", "")
    await save_setting("jira", data)
    return {"success": True}

@router.post("/ai")
async def save_ai(data: dict):
    existing = await get_setting("ai", {})
    for field in ("investigation_api_key", "triage_api_key"):
        v = data.get(field, "")
        if not v or v.startswith("sk-•"):
            data[field] = existing.get(field, "")
    await save_setting("ai", data)
    return {"success": True}

@router.post("/pipeline")
async def save_pipeline(data: dict):
    await save_setting("pipeline", data)
    return {"success": True}

@router.post("/test/github")
async def test_github(data: dict = {}):
    token = data.get("token", "")
    if not token or token.startswith("•"):
        gh = await get_setting("github", {})
        token = gh.get("token", "")
    def _token_looks_valid(t):
        return t and t.isascii() and t.startswith(("ghp_", "github_pat_", "ghs_", "gho_"))
    if not _token_looks_valid(token):
        raise HTTPException(400, "No valid GitHub token — enter your PAT (ghp_…) and save first")
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                "https://api.github.com/user",
                headers={"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"},
                timeout=10
            )
            if r.status_code == 200:
                user = r.json()
                return {"success": True, "user": user.get("login"), "name": user.get("name")}
            else:
                raise HTTPException(400, f"GitHub returned {r.status_code}: {r.text}")
    except httpx.TimeoutException:
        raise HTTPException(408, "Connection timed out")

@router.post("/dynatrace/generate-token")
async def dynatrace_generate_token(data: dict):
    """
    Use a Dynatrace PAT (admin API token) to create a scoped platform/API token
    for errmon and return it so the UI can populate the platform_token field.

    The PAT must have the `apiTokens.write` scope.
    """
    pat = data.get("pat", "")
    env_url = data.get("environment_url", "").rstrip("/")
    if not pat or not env_url:
        raise HTTPException(400, "pat and environment_url are required")

    headers = {
        "Authorization": f"Api-Token {pat}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    payload = {
        "name": "errmon-auto",
        "scopes": [
            "logs.ingest",
            "logs.read",
            "metrics.read",
            "entities.read",
            "problems.read",
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(f"{env_url}/api/v2/apiTokens", headers=headers, json=payload)

        if r.status_code == 201:
            token = r.json().get("token", "")
            return {"success": True, "token": token, "generated": True}
        elif r.status_code in (401, 403):
            raise HTTPException(401, "Token rejected — ensure it has the apiTokens.write scope")
        elif r.status_code == 400:
            detail = r.json().get("error", {}).get("message", r.text[:200])
            # PATs cannot create classic API tokens — use the PAT itself as the platform token
            if "personal access token" in detail.lower():
                return {"success": True, "token": pat, "generated": False,
                        "note": "PAT used directly as platform token (PATs cannot create classic API tokens)"}
            raise HTTPException(400, f"Dynatrace error: {detail}")
        else:
            raise HTTPException(502, f"Dynatrace returned {r.status_code}: {r.text[:200]}")
    except httpx.TimeoutException:
        raise HTTPException(408, "Connection timed out")


@router.post("/test/dynatrace")
async def test_dynatrace(data: dict = {}):
    token = data.get("platform_token", "")
    env_url = data.get("environment_url", "")
    if not token or token.startswith("•") or not env_url:
        dt = await get_setting("dynatrace", {})
        if not token or token.startswith("•"):
            token = dt.get("platform_token", "")
        if not env_url:
            env_url = dt.get("environment_url", "")
    if not token or not env_url:
        raise HTTPException(400, "Dynatrace platform token and environment URL are required")
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{env_url.rstrip('/')}/api/v2/metrics",
                headers={"Authorization": f"Api-Token {token}"},
                timeout=10
            )
            if r.status_code in (200, 401, 403):
                if r.status_code == 200:
                    return {"success": True, "message": "Connected to Dynatrace"}
                else:
                    raise HTTPException(401, "Invalid Dynatrace token")
            raise HTTPException(400, f"Dynatrace returned {r.status_code}")
    except httpx.TimeoutException:
        raise HTTPException(408, "Connection timed out")

@router.post("/test/jira")
async def test_jira(data: dict = {}):
    token = data.get("token", "")
    email = data.get("email", "")
    base_url = data.get("base_url", "")
    if not token or token.startswith("•") or not email or not base_url:
        jira = await get_setting("jira", {})
        if not token or token.startswith("•"):
            token = jira.get("token", "")
        if not email:
            email = jira.get("email", "")
        if not base_url:
            base_url = jira.get("base_url", "")
    if not token or not email or not base_url:
        raise HTTPException(400, "Jira email, token, and base URL are required")
    import base64
    auth = base64.b64encode(f"{email}:{token}".encode()).decode()
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{base_url.rstrip('/')}/rest/api/3/myself",
                headers={"Authorization": f"Basic {auth}", "Accept": "application/json"},
                timeout=10
            )
            if r.status_code == 200:
                user = r.json()
                return {"success": True, "user": user.get("displayName")}
            raise HTTPException(401, f"Jira returned {r.status_code}: {r.text[:200]}")
    except httpx.TimeoutException:
        raise HTTPException(408, "Connection timed out")

@router.get("/debug/github-token")
async def debug_github_token():
    gh = await get_setting("github", {})
    token = gh.get("token", "")
    return {
        "token_length": len(token),
        "is_ascii": token.isascii() if token else None,
        "starts_with": token[:4] if token else None,
        "valid": bool(token and token.isascii() and token.startswith(("ghp_", "github_pat_", "ghs_", "gho_")))
    }

@router.get("/github/repos")
async def get_github_repos():
    gh = await get_setting("github", {})
    token = gh.get("token", "")
    org = gh.get("org", "")
    def _token_looks_valid(t):
        return t and t.isascii() and t.startswith(("ghp_", "github_pat_", "ghs_", "gho_"))
    if not _token_looks_valid(token):
        return {"repos": [], "error": "No valid GitHub token — enter your PAT and click Save first"}
    headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"}
    repos = []
    try:
        async with httpx.AsyncClient() as client:
            page = 1
            while len(repos) < 500:
                if org:
                    url = f"https://api.github.com/orgs/{org}/repos?per_page=100&page={page}&sort=pushed"
                else:
                    url = f"https://api.github.com/user/repos?per_page=100&page={page}&sort=pushed"
                r = await client.get(url, headers=headers, timeout=15)
                if r.status_code != 200:
                    break
                data = r.json()
                if not data:
                    break
                for repo in data:
                    repos.append({
                        "name": repo["name"],
                        "full_name": repo["full_name"],
                        "language": repo.get("language", "Unknown"),
                        "description": repo.get("description", ""),
                        "private": repo.get("private", False),
                        "updated_at": repo.get("pushed_at", "")
                    })
                page += 1
    except Exception as e:
        return {"repos": [], "error": str(e)}
    enabled = gh.get("enabled_repos", [])
    filtered_repos = [r for r in repos if "Clone_Demo_Repo" in r["name"] or "Clone_Demo_Repo" in r["full_name"]]
    enabled = gh.get("enabled_repos", [])
    for r in filtered_repos:
        r["enabled"] = r["name"] in enabled
    return {"repos": filtered_repos, "total": len(filtered_repos)}
    # for r in repos:
    #     r["enabled"] = r["name"] in enabled
    # return {"repos": repos, "total": len(repos)}
