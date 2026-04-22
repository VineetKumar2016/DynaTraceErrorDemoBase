from fastapi import APIRouter, HTTPException
from database import db
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel

# FIXES
router = APIRouter(tags=["fixes"])

class GenerateFixRequest(BaseModel):
    repo_name: str
    error_message: str
    prompt: str

def serialize(doc):
    if not doc: return None
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    return doc

@router.get("/")
async def list_fixes(page: int = 1, limit: int = 50):
    skip = (page - 1) * limit
    total = await db.fixes.count_documents({})
    cursor = db.fixes.find({}).sort("created_at", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)
    return {"fixes": [serialize(d) for d in docs], "total": total}

@router.get("/{fix_id}")
async def get_fix(fix_id: str):
    doc = await db.fixes.find_one({"_id": fix_id})
    if not doc:
        raise HTTPException(404, "Fix not found")
    return serialize(doc)

@router.get("/by-error/{error_id}")
async def get_fix_by_error(error_id: str):
    doc = await db.fixes.find_one({"error_id": error_id})
    return serialize(doc)

@router.post("/generate")
async def generate_fix(request: GenerateFixRequest):
    """Generate a fix using AI based on repository name, error message, and prompt."""
    try:
        from ai_service import generate_fix as ai_generate_fix
        
        # Call AI service to generate fix
        fix_response = await ai_generate_fix(
            repo_name=request.repo_name,
            error_message=request.error_message,
            prompt=request.prompt
        )
        
        return {
            "success": True,
            "repo_name": request.repo_name,
            "error_message": request.error_message,
            "fix": fix_response,
            "generated_at": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        raise HTTPException(500, f"Error generating fix: {str(e)}")
