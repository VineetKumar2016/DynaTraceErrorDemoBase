from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from models import AnalyzeRequest, ApproveRequest, ReviseRequest
from ai_service import analyze_error_stream, create_github_pr, create_jira_ticket, get_error_by_id
from database import db
from bson import ObjectId
from datetime import datetime, timezone
import json

router = APIRouter(tags=["analysis"])

@router.post("/analyze")
async def start_analysis(req: AnalyzeRequest):
    """Start streaming AI analysis of an error"""
    return StreamingResponse(
        analyze_error_stream(req.error_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )

@router.post("/approve")
async def approve_fix(req: ApproveRequest):
    """Approve a fix, create GitHub PR and Jira ticket"""
    try:
        fix = await db.fixes.find_one({"_id": ObjectId(req.fix_id)})
    except:
        fix = await db.fixes.find_one({"_id": req.fix_id})
    
    if not fix:
        raise HTTPException(404, "Fix not found")
    
    error = await get_error_by_id(fix["error_id"])
    if not error:
        raise HTTPException(404, "Error not found")
    
    gh_config_doc = await db.settings.find_one({"key": "github"})
    jira_config_doc = await db.settings.find_one({"key": "jira"})
    
    gh_config = gh_config_doc.get("value", {}) if gh_config_doc else {}
    jira_config = jira_config_doc.get("value", {}) if jira_config_doc else {}
    
    results = {"fix_id": req.fix_id, "pr": None, "jira": None}
    update = {"status": "approved", "updated_at": datetime.now(timezone.utc).isoformat()}
    
    # Create GitHub PR
    if gh_config.get("token"):
        pr_result = await create_github_pr(fix, error, gh_config)
        results["pr"] = pr_result
        if pr_result.get("success"):
            update["pr_status"] = "created"
            update["pr_number"] = pr_result.get("pr_number")
            update["pr_url"] = pr_result.get("pr_url")
        else:
            update["pr_status"] = f"failed: {pr_result.get('error', '')}"
    
    # Create Jira ticket
    if jira_config.get("token") and req.jira_board_key:
        jira_result = await create_jira_ticket(fix, error, jira_config, req.jira_board_key, req.jira_epic_key)
        results["jira"] = jira_result
        if jira_result.get("success"):
            update["jira_status"] = "created"
            update["jira_id"] = jira_result.get("jira_id")
            update["jira_url"] = jira_result.get("jira_url")
        else:
            update["jira_status"] = f"failed: {jira_result.get('error', '')}"
    
    # Update fix and error status
    try:
        await db.fixes.update_one({"_id": ObjectId(req.fix_id)}, {"$set": update})
        await db.errors.update_one({"_id": ObjectId(fix["error_id"])}, {"$set": {"status": "pr_created" if update.get("pr_status") == "created" else "approved"}})
    except:
        await db.fixes.update_one({"_id": req.fix_id}, {"$set": update})
    
    return results

@router.post("/reject")
async def reject_fix(data: dict):
    fix_id = data.get("fix_id")
    try:
        await db.fixes.update_one({"_id": ObjectId(fix_id)}, {"$set": {"status": "rejected", "updated_at": datetime.now(timezone.utc).isoformat()}})
        fix = await db.fixes.find_one({"_id": ObjectId(fix_id)})
        if fix:
            await db.errors.update_one({"_id": ObjectId(fix["error_id"])}, {"$set": {"status": "rejected"}})
    except Exception as e:
        raise HTTPException(400, str(e))
    return {"success": True}

@router.get("/fix/{fix_id}")
async def get_fix(fix_id: str):
    try:
        doc = await db.fixes.find_one({"_id": ObjectId(fix_id)})
    except:
        doc = await db.fixes.find_one({"_id": fix_id})
    if not doc:
        raise HTTPException(404, "Fix not found")
    doc["id"] = str(doc.pop("_id"))
    return doc
