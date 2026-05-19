from fastapi import APIRouter
from app.database import db
from datetime import timezone

router = APIRouter()

@router.get("/{senderId}/{receiverId}")
async def get_messages(senderId: str, receiverId: str):

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

        doc["_id"] = str(doc["_id"])

        # convert datetime properly
        if "createdAt" in doc:
            doc["createdAt"] = (
                doc["createdAt"]
                .replace(tzinfo=timezone.utc)
                .isoformat()
            )

        messages.append(doc)

    return messages