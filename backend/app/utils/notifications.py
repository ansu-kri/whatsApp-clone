import json
from datetime import datetime, timezone
from bson import ObjectId
from app.database import db
from app.websocket.socket import manager


async def create_notification(
    recipient_id: str,
    sender_id: str,
    event_id: str,
    message: str,
    conversation_type: str,
    conversation_id: str,
    notification_type: str = "message",
) -> dict | None:
    sender = await db.users.find_one({"_id": ObjectId(sender_id)}, {"name": 1, "avatar": 1})
    now = datetime.now(timezone.utc)
    document = {
        "userId": recipient_id,
        "eventId": event_id,
        "type": notification_type,
        "senderId": sender_id,
        "senderName": sender.get("name", "Someone") if sender else "Someone",
        "senderAvatar": sender.get("avatar", "") if sender else "",
        "message": message,
        "conversationType": conversation_type,
        "conversationId": conversation_id,
        "read": False,
        "createdAt": now,
    }
    result = await db.notifications.update_one(
        {"userId": recipient_id, "eventId": event_id},
        {"$setOnInsert": document},
        upsert=True,
    )
    if not result.upserted_id:
        return None
    notification = {
        "id": str(result.upserted_id),
        "type": notification_type,
        "eventId": event_id,
        "senderId": sender_id,
        "senderName": document["senderName"],
        "senderAvatar": document["senderAvatar"],
        "message": message,
        "conversationType": conversation_type,
        "conversationId": conversation_id,
        "read": False,
        "createdAt": now.isoformat().replace("+00:00", "Z"),
    }
    await manager.send_personal_message(
        recipient_id,
        json.dumps({"type": "notification", "notification": notification}),
    )
    return notification
