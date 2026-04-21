from fastapi import APIRouter
from database import db
from datetime import datetime, timezone, date

router = APIRouter(tags=["dashboard"])

@router.get("/")
async def get_dashboard():
    total_errors = await db.errors.count_documents({})
    pending_review = await db.errors.count_documents({"status": {"$in": ["fix_generated", "analyzing"]}})
    open_prs = await db.fixes.count_documents({"pr_status": "created"})
    
    # Resolved today
    today_start = datetime.combine(date.today(), datetime.min.time()).isoformat()
    resolved_today = await db.fixes.count_documents({
        "status": "approved",
        "updated_at": {"$gte": today_start}
    })
    
    # Classification breakdown
    by_class = {}
    async for doc in db.errors.find({}, {"classification": 1, "occurrences": 1}):
        c = doc.get("classification", "unknown")
        by_class[c] = by_class.get(c, 0) + 1
    
    # Top erroring services
    by_service = {}
    async for doc in db.errors.find({}, {"service": 1, "occurrences": 1}):
        s = doc.get("service", "unknown")
        by_service[s] = by_service.get(s, 0) + doc.get("occurrences", 1)
    top_services = sorted(by_service.items(), key=lambda x: x[1], reverse=True)[:5]
    
    # Last scan info
    last_scan = None
    async for doc in db.scans.find({}).sort("started_at", -1).limit(1):
        last_scan = doc.get("started_at", "")
    
    return {
        "total_errors": total_errors,
        "pending_review": pending_review,
        "open_prs": open_prs,
        "resolved_today": resolved_today,
        "by_classification": by_class,
        "top_services": [{"name": k, "count": v} for k, v in top_services],
        "last_scan": last_scan
    }
