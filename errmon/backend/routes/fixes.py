from fastapi import APIRouter, HTTPException
from database import db
from bson import ObjectId
from datetime import datetime, timezone
from typing import Optional

# FIXES
router = APIRouter(tags=["fixes"])

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
    try:
        doc = await db.fixes.find_one({"_id": ObjectId(fix_id)})
    except:
        doc = await db.fixes.find_one({"_id": fix_id})
    if not doc:
        raise HTTPException(404, "Fix not found")
    return serialize(doc)

@router.get("/by-error/{error_id}")
async def get_fix_by_error(error_id: str):
    doc = await db.fixes.find_one({"error_id": error_id})
    return serialize(doc)
