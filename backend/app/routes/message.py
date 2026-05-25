from fastapi import APIRouter, Depends, HTTPException
from app.database import db
from datetime import timezone
from app.middleware.authMiddleware import verify_token
from bson import ObjectId

router = APIRouter(
    dependencies=[Depends(verify_token)]
)

@router.get("/{senderId}/{receiverId}")
async def get_messages(
    senderId: str,
    receiverId: str
):

    messages = []

    cursor = db.messages.find({
        "$or": [
            {
                "senderId": senderId,
                "receiverId": receiverId
            },
            {
                "senderId": receiverId,
                "receiverId": senderId
            }
        ]
    }).sort("createdAt", 1)

    async for doc in cursor:

        created_at = doc.get("createdAt")

        # Mongo removes timezone info
        if created_at and created_at.tzinfo is None:
            created_at = created_at.replace(
                tzinfo=timezone.utc
            )

        messages.append({
            "id": str(doc["_id"]),
            "senderId": doc["senderId"],
            "receiverId": doc["receiverId"],
            "message": doc["message"],

            # IMPORTANT FIX
            "createdAt": (
                created_at
                .isoformat()
                .replace("+00:00", "Z")
            ) if created_at else None,

            "status": doc.get("status", "sent"),
            "edited": doc.get("edited", False),
            "deleted": doc.get("deleted", False),
            "seen": doc.get("seen", False),
        })

    return messages

@router.put("/edit/{message_id}")
async def edit_message(message_id: str, payload: dict):

    try:
        msg = await db.messages.find_one({"_id": ObjectId(message_id)})
    except:
        raise HTTPException(status_code=400, detail="Invalid message id")

    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    await db.messages.update_one(
        {"_id": ObjectId(message_id)},
        {
            "$set": {
                "message": payload["message"],
                "edited": True
            }
        }
    )

    return {
        "id": message_id,
        "message": payload["message"],
        "edited": True
    }

@router.delete("/delete/{message_id}")
async def delete_message(message_id: str):

    try:
        msg = await db.messages.find_one({"_id": ObjectId(message_id)})
    except:
        raise HTTPException(status_code=400, detail="Invalid message id")

    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    await db.messages.update_one(
        {"_id": ObjectId(message_id)},
        {
            "$set": {
                "deleted": True,
                "message": ""
            }
        }
    )

    return {
        "id": message_id,
        "deleted": True
    }