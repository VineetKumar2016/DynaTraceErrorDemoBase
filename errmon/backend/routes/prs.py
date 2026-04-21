from fastapi import APIRouter
from database import db
from bson import ObjectId

router = APIRouter(tags=["prs"])

def serialize(doc):
    if not doc: return None
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    return doc

@router.get("/")
async def list_prs():
    # Get all fixes that have PRs created
    cursor = db.fixes.find({"pr_status": "created"}).sort("updated_at", -1)
    docs = await cursor.to_list(length=100)
    prs = []
    for doc in docs:
        error_id = doc.get("error_id", "")
        error = None
        try:
            error = await db.errors.find_one({"_id": ObjectId(error_id)})
        except:
            error = await db.errors.find_one({"_id": error_id})
        prs.append({
            "id": doc.get("pr_number", str(doc["_id"])[:6]),
            "fix_id": str(doc["_id"]),
            "title": f"fix: AI-generated fix for {error.get('error_type', 'error') if error else 'error'}",
            "repo": (error.get("repo", "unknown") if error else "unknown"),
            "pr_number": doc.get("pr_number"),
            "pr_url": doc.get("pr_url"),
            "pr_branch": doc.get("pr_branch", ""),
            "jira_id": doc.get("jira_id"),
            "jira_url": doc.get("jira_url"),
            "cost": doc.get("cost_usd", 0),
            "status": "open",
            "created": doc.get("updated_at", "")
        })
    return {"prs": prs, "total": len(prs)}
