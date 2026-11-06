import re
from datetime import timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from bson import ObjectId
from app.middleware.authMiddleware import verify_token
from app.database import db

router = APIRouter()

class UpdateProfileRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., min_length=3, max_length=254)
    avatar: str | None = None

def _serialize_user(user: dict) -> dict:
    last_seen = user.get("lastSeen")
    if last_seen and last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    return {
        "id": str(user["_id"]), "name": user.get("name", ""),
        "email": user.get("email", ""), "avatar": user.get("avatar") or "",
        "createdAt": user["createdAt"].isoformat() if user.get("createdAt") else None,
        "lastSeen": last_seen.isoformat().replace("+00:00", "Z") if last_seen else None,
        "isOnline": bool(user.get("isOnline", False)),
    }

@router.get("/me")
async def get_me(payload: dict = Depends(verify_token)):
    try:
        current_user = await db.users.find_one({"_id": ObjectId(payload["user_id"])})
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid user session")
    if not current_user:
        raise HTTPException(status_code=404, detail="User not found")
    return _serialize_user(current_user)

@router.patch("/me")
async def update_me(data: UpdateProfileRequest, payload: dict = Depends(verify_token)):
    try:
        user_id = ObjectId(payload["user_id"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid user session")
    name, email = data.name.strip(), data.email.strip().lower()
    if not name:
        raise HTTPException(status_code=422, detail="Name cannot be empty")
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    if await db.users.find_one({"email": email, "_id": {"$ne": user_id}}):
        raise HTTPException(status_code=409, detail="Email address is already in use")
    avatar = data.avatar or ""
    if avatar:
        media_id = avatar.rsplit("/", 1)[-1]
        record = await db.uploads.find_one({"_id": media_id, "ownerId": str(user_id), "purpose": "profile-avatar"})
        if not record:
            raise HTTPException(status_code=403, detail="Profile image does not belong to this account")
    await db.users.update_one({"_id": user_id}, {"$set": {"name": name, "email": email, "avatar": avatar}})
    return _serialize_user(await db.users.find_one({"_id": user_id}))

@router.get("/")
async def get_users(payload: dict = Depends(verify_token)):
    try:
        current_user_id = ObjectId(payload["user_id"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid user session")
    users = []
    unread_counts = {}
    async for item in db.messages.aggregate([
        {"$match": {"receiverId": str(current_user_id), "seen": {"$ne": True}}},
        {"$group": {"_id": "$senderId", "count": {"$sum": 1}}},
    ]):
        unread_counts[item["_id"]] = item["count"]
    async for user in db.users.find({"_id": {"$ne": current_user_id}}):
        serialized = _serialize_user(user)
        serialized["unreadCount"] = unread_counts.get(serialized["id"], 0)
        users.append(serialized)
    return users
