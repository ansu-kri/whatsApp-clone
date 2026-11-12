from fastapi import APIRouter, Depends, HTTPException
from app.database import db
from app.middleware.authMiddleware import verify_token
from datetime import datetime, timezone
import base64
import hashlib
import hmac
import os

router = APIRouter(dependencies=[Depends(verify_token)])

@router.get("/history")
async def call_history(payload: dict = Depends(verify_token)):
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user session")
    cursor = db.calls.find({"$or": [{"callerId": user_id}, {"receiverId": user_id}]}).sort("createdAt", -1).limit(100)
    items = []
    async for row in cursor:
        created = row.get("startTime") or row.get("createdAt")
        ended = row.get("endTime")
        items.append({
            "id": str(row["_id"]), "callerId": row["callerId"], "receiverId": row["receiverId"],
            "callType": row["callType"], "status": row["status"],
            "startTime": created.isoformat().replace("+00:00", "Z") if created else None,
            "endTime": ended.isoformat().replace("+00:00", "Z") if ended else None,
            "duration": row.get("duration", 0),
        })
    return items


@router.get("/ice-servers")
async def get_ice_servers(payload: dict = Depends(verify_token)):
    user_id = payload.get("user_id")
    servers = [{"urls": "stun:stun.l.google.com:19302"}]
    urls = [url.strip() for url in os.getenv("TURN_URLS", "").split(",") if url.strip()]
    secret = os.getenv("TURN_SHARED_SECRET")
    if urls and secret and user_id:
        username = f"{int(datetime.now(timezone.utc).timestamp()) + 3600}:{user_id}"
        credential = base64.b64encode(hmac.new(secret.encode(), username.encode(), hashlib.sha1).digest()).decode()
        servers.append({"urls": urls, "username": username, "credential": credential})
    return {"iceServers": servers}
