from fastapi import APIRouter, BackgroundTasks
from database import db
from dynatrace_service import run_scan

router = APIRouter(tags=["scans"])

def serialize(doc):
    if not doc: return None
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    return doc

@router.get("/")
async def list_scans(limit: int = 20):
    cursor = db.scans.find({}).sort("started_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    return {"scans": [serialize(d) for d in docs]}

@router.post("/trigger")
async def trigger_scan(background_tasks: BackgroundTasks):
    background_tasks.add_task(run_scan)
    return {"success": True, "message": "Scan started in background"}

@router.post("/trigger-sync")
async def trigger_scan_sync():
    """Synchronous scan - waits for result"""
    result = await run_scan()
    return result
