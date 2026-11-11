from datetime import timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from app.database import db
from app.middleware.authMiddleware import verify_token

router = APIRouter(dependencies=[Depends(verify_token)])


def _serialize(notification: dict) -> dict:
    created_at = notification.get("createdAt")
    if created_at and created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return {
        "id": str(notification["_id"]),
        "type": notification.get("type", "activity"),
        "eventId": notification.get("eventId", ""),
        "senderId": notification.get("senderId", ""),
        "senderName": notification.get("senderName", "Someone"),
        "senderAvatar": notification.get("senderAvatar", ""),
        "message": notification.get("message", ""),
        "conversationType": notification.get("conversationType", "private"),
        "conversationId": notification.get("conversationId", ""),
        "read": bool(notification.get("read", False)),
        "createdAt": created_at.isoformat().replace("+00:00", "Z") if created_at else None,
    }


@router.get("")
async def get_notifications(payload: dict = Depends(verify_token)):
    user_id = payload.get("user_id")
    cursor = db.notifications.find({"userId": user_id}).sort("createdAt", -1).limit(100)
    return [_serialize(item) async for item in cursor]


@router.patch("/read-all")
async def mark_all_notifications_read(payload: dict = Depends(verify_token)):
    result = await db.notifications.update_many(
        {"userId": payload.get("user_id"), "read": {"$ne": True}},
        {"$set": {"read": True}},
    )
    return {"updated": result.modified_count}


@router.delete("")
async def clear_notifications(payload: dict = Depends(verify_token)):
    result = await db.notifications.delete_many({"userId": payload.get("user_id")})
    return {"deleted": result.deleted_count}


@router.patch("/{notification_id}/read")
async def mark_notification_read(notification_id: str, payload: dict = Depends(verify_token)):
    try:
        object_id = ObjectId(notification_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notification id")
    result = await db.notifications.update_one(
        {"_id": object_id, "userId": payload.get("user_id")},
        {"$set": {"read": True}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"id": notification_id, "read": True}
