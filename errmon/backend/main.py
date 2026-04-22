"""
AI Error Monitor - FastAPI Backend
Serves built React frontend + all API routes + background polling.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import asyncio, os
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from pathlib import Path

from database import db, init_db
from routes.settings  import router as settings_router
from routes.errors    import router as errors_router
from routes.fixes     import router as fixes_router
from routes.prs       import router as prs_router
from routes.scans     import router as scans_router
from routes.dashboard import router as dashboard_router
from routes.analysis  import router as analysis_router
from routes.ingest    import router as ingest_router

_poll_task = None

async def polling_loop():
    from dynatrace_service import run_scan
    interval = 300
    while True:
        try:
            doc = await db.settings.find_one({"key": "pipeline"})
            cfg = doc.get("value", {}) if doc else {}
            interval = int(cfg.get("poll_interval_minutes", 5)) * 60
            if cfg.get("enable_polling", True) and not cfg.get("pause_scanning", False):
                print(f"[poll] running scan at {datetime.now(timezone.utc).isoformat()}")
                await run_scan()
        except Exception as e:
            print(f"[poll] error: {e}")
        await asyncio.sleep(interval)

async def clean_corrupted_tokens():
    """Clear any non-ASCII / masked tokens that were accidentally stored."""
    try:
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
                if v and (not str(v).isascii() or str(v).startswith("•")):
                    print(f"[startup] clearing corrupted {key}.{field} from DB")
                    val[field] = ""
                    changed = True
            if changed:
                await db.settings.update_one({"key": key}, {"$set": {"value": val}})
    except Exception as e:
        print(f"[startup] token cleanup error: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _poll_task
    await init_db()
    await clean_corrupted_tokens()
    _poll_task = asyncio.create_task(polling_loop())
    yield
    if _poll_task:
        _poll_task.cancel()

app = FastAPI(title="AI Error Monitor API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8000", "http://127.0.0.1:5173", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(settings_router,  prefix="/api/settings")
app.include_router(errors_router,    prefix="/api/errors")
app.include_router(fixes_router,     prefix="/api/fixes")
app.include_router(prs_router,       prefix="/api/prs")
app.include_router(scans_router,     prefix="/api/scans")
app.include_router(dashboard_router, prefix="/api/dashboard")
app.include_router(analysis_router,  prefix="/api/analysis")
app.include_router(ingest_router,    prefix="/api/ingest")

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "store":  "file",
        "time":   datetime.now(timezone.utc).isoformat(),
        "poll":   "running" if (_poll_task and not _poll_task.done()) else "stopped",
    }

STATIC = Path(__file__).parent / "static"

if STATIC.exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC / "assets")), name="assets")

    @app.get("/favicon.svg")
    async def favicon():
        return FileResponse(str(STATIC / "favicon.svg"))

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(404)
        return FileResponse(str(STATIC / "index.html"))
else:
    @app.get("/")
    async def root():
        return {"message": "API running. Build frontend: cd frontend && npm run build"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=os.getenv("HOST","0.0.0.0"), port=int(os.getenv("PORT","8000")), reload=False)
