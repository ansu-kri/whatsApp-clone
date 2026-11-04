from fastapi import FastAPI, WebSocket,WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.database import db
from app.routes.auth import router as authRouter
from app.routes.user import router as userRouter
from app.websocket.socket import manager
from app.routes.message import ( router as messageRouter )
import json
from datetime import datetime, timezone
from bson import ObjectId
from app.routes.upload import router as uploadRouter
from app.routes.group import router as groupRouter
from app.middleware.authMiddleware import SECRET_KEY, ALGORITHM
from jose import jwt

app = FastAPI()

app.include_router(
    authRouter,
    prefix="/api/auth"
)

app.include_router(
    userRouter,
    prefix="/api/user"
)

app.include_router(
    messageRouter,
    prefix="/api/messages"
)

app.include_router(
    uploadRouter,
    prefix="/api/upload"
)

app.include_router(
    groupRouter,
    prefix="/api/group"
)

origins = [
    "http://localhost:5173"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):

    token = websocket.query_params.get("token")
    try:
        payload = jwt.decode(token or "", SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        ObjectId(user_id)
    except Exception:
        await websocket.close(code=1008)
        return

    await manager.connect_user(user_id, websocket)
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"isOnline": True, "lastSeen": datetime.now(timezone.utc)}})

    try:

        # ================= ONLINE USERS =================
        await manager.send_personal_message(
            user_id,
            json.dumps({
                "type": "online_list",
                "users": list(manager.active_users)
            })
        )

        # ================= MISSED MESSAGES =================
        cursor = db.messages.find({
            "receiverId": user_id,
            "status": { "$ne": "seen" }
        })

        missed = []

        async for m in cursor:
            m["id"] = str(m["_id"])
            del m["_id"]

            if "createdAt" in m:
                m["createdAt"] = m["createdAt"].isoformat()

            missed.append(m)

        await manager.send_personal_message(
            user_id,
            json.dumps({
                "type": "sync_messages",
                "data": missed
            })
        )

        # ================= MAIN LOOP =================
        while True:

            data = await websocket.receive_text()
            parsed = json.loads(data)
            event = parsed.get("type")

            if event == "activity":
                now = datetime.now(timezone.utc)
                was_online, is_online = manager.set_connection_active(user_id, websocket, True)
                await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"lastSeen": now, "isOnline": is_online}})
                if not was_online:
                    await manager.broadcast_all(json.dumps({"type": "user_online", "userId": user_id}))
                else:
                    await manager.broadcast_all(json.dumps({"type": "user_activity", "userId": user_id, "lastSeen": now.isoformat().replace("+00:00", "Z")}))
                continue

            if event == "inactive":
                was_online, is_online = manager.set_connection_active(user_id, websocket, False)
                await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"isOnline": is_online}})
                if was_online and not is_online:
                    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"lastSeen": 1})
                    last_seen = user.get("lastSeen") if user else None
                    if last_seen and last_seen.tzinfo is None:
                        last_seen = last_seen.replace(tzinfo=timezone.utc)
                    await manager.broadcast_all(json.dumps({
                        "type": "user_offline", "userId": user_id,
                        "lastSeen": last_seen.isoformat().replace("+00:00", "Z") if last_seen else None,
                    }))
                continue

            # ================= TYPING =================
            if event == "typing":
                await manager.send_personal_message(
                    parsed["receiverId"],
                    json.dumps({
                        "type": "typing",
                        "senderId": parsed["senderId"]
                    })
                )
                continue

            # ================= SEEN =================
            if event == "seen":

                messages = await db.messages.find({
                    "senderId": parsed["senderId"],
                    "receiverId": parsed["receiverId"],
                    "seen": False
                }).to_list(None)

                message_ids =[
                    str(msg["_id"])
                    for msg in messages
                ]

                await db.messages.update_many(
                    {
                        "senderId": parsed["senderId"],
                        "receiverId": parsed["receiverId"]
                    },
                    {
                        "$set": { 
                            "seen": True,
                            "status": "seen" }
                    }
                )

                await manager.send_personal_message(
                    parsed["senderId"],
                    json.dumps({
                        "type": "seen_update",
                        "messageIds": message_ids,
                        "from": parsed["receiverId"]
                    })
                )

                continue
             # ================= EDIT MESSAGE =================
            if event == "edit_message":

                message_id = parsed["messageId"]

                msg = await db.messages.find_one({
                    "_id": ObjectId(message_id)
                })

                if not msg:
                    continue

                # SECURITY CHECK
                if msg["senderId"] != user_id:
                    continue

                updated_message =(
                    parsed.get("message") or ""
                ).strip()

                await db.messages.update_one(
                    {"_id": ObjectId(message_id)},
                    {
                        "$set": {
                            "message": updated_message,
                            "edited": True
                        }
                    }
                )

                payload = json.dumps({
                    "type": "message_edited",
                    "messageId": message_id,
                    "message": parsed["message"]
                })

                await manager.send_personal_message(
                    msg["senderId"],
                    payload
                )

                await manager.send_personal_message(
                    msg["receiverId"],
                    payload
                )

                continue

            # ================= DELETE MESSAGE =================
            if event == "delete_message":

                message_id = parsed["messageId"]

                msg = await db.messages.find_one({
                    "_id": ObjectId(message_id)
                })

                if not msg:
                    continue

                # SECURITY CHECK
                if msg["senderId"] != user_id:
                    continue

                await db.messages.update_one(
                    {"_id": ObjectId(message_id)},
                    {
                        "$set": {
                            "deleted": True,
                            "message": ""
                        }
                    }
                )

                payload = json.dumps({
                    "type": "message_deleted",
                    "messageId": message_id
                })

                await manager.send_personal_message(
                    msg["senderId"],
                    payload
                )

                await manager.send_personal_message(
                    msg["receiverId"],
                    payload
                )

                continue

            # ================= SEND MESSAGE =================
            if event == "message":

                #prevent empty message
                message_text = (
                    parsed.get("message") or ""
                ).strip()
                
                image_url = parsed.get("image")
                attachment_url = parsed.get("attachmentUrl")
                media_type = parsed.get("mediaType")
                file_name = parsed.get("fileName")
                voice_message = bool(parsed.get("voiceMessage"))
                raw_duration = parsed.get("durationSeconds")
                duration_seconds = raw_duration if isinstance(raw_duration, (int, float)) and 0 <= raw_duration <= 3600 else None
                
                #prevent empty message
                if not message_text and not image_url and not attachment_url:
                    continue

                now = datetime.now(timezone.utc)    
  
                receiver_online = parsed["receiverId"] in manager.active_connections

                message_doc = {
                    "senderId": parsed["senderId"],
                    "receiverId": parsed["receiverId"],
                    "message": message_text,
                    "image": image_url,
                    "attachmentUrl": attachment_url,
                    "mediaType": media_type,
                    "fileName": file_name,
                    "voiceMessage": voice_message,
                    "durationSeconds": duration_seconds,
                    "createdAt": now,
                    "status": ("delivered" if receiver_online else "sent"),
                    "edited": False,
                    "deleted": False,
                    "seen": False
                
                }

                result = await db.messages.insert_one(message_doc)

                response = {
                "type": "message",
                "data": {
                    "id": str(result.inserted_id),
                    **message_doc,
                    # "senderId": parsed["senderId"],
                    # "receiverId": parsed["receiverId"],
                    # "message": parsed["message"],
                    "createdAt": now.isoformat(),
                    # "status": ("delivered" if receiver_online else "sent"),
                    # "edited": False,
                    # "deleted": False,
                    # "seen": False
                }
            }

            payload = json.dumps(response, default=str)

            await manager.send_personal_message(parsed["receiverId"], payload)
            await manager.send_personal_message(parsed["senderId"], payload)

            continue

    except WebSocketDisconnect:
        print("Client disconnected")

    finally:
        became_offline = manager.disconnect_user(user_id, websocket)
        if became_offline:
            last_seen = datetime.now(timezone.utc)
            await db.users.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": {"isOnline": False, "lastSeen": last_seen}}
            )
            await manager.broadcast_all(json.dumps({
                "type": "user_offline", "userId": user_id,
                "lastSeen": last_seen.isoformat().replace("+00:00", "Z")
            }))

#============Group chat==============
@app.websocket("/ws/group/{room_id}")
async def websocket_group(
    websocket: WebSocket, room_id: str
):
    token = websocket.query_params.get("token")
    try:
        payload = jwt.decode(token or "", SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        ObjectId(user_id)
    except Exception:
        await websocket.close(code=1008)
        return

    try:
        group = await db.groups.find_one({"_id": ObjectId(room_id), "isDeleted": {"$ne": True}})
    except Exception:
        await websocket.close(code=1008)
        return

    if not group or user_id not in group.get("members", []):
        await websocket.close(code=1008)
        return

    await manager.connect_room(room_id, websocket, user_id)

    try:
        while True:
            data = await websocket.receive_text()
            try:
                parsed = json.loads(data)
            except json.JSONDecodeError:
                continue

            event = parsed.get("type")
            sender_id = parsed.get("senderId") or user_id

            if sender_id != user_id:
                continue

            fresh_group = await db.groups.find_one({"_id": ObjectId(room_id), "isDeleted": {"$ne": True}})
            if not fresh_group or user_id not in fresh_group.get("members", []):
                await websocket.close(code=1008)
                break

            if event == "group_typing":
                typing_payload = json.dumps({
                    "type": "group_typing",
                    "groupId": room_id,
                    "senderId": sender_id,
                })
                await manager.broadcast_room(room_id, typing_payload)
                continue

            if event not in ("group_message", "message"):
                continue

            message = (parsed.get("message") or "").strip()
            attachment_url = parsed.get("attachmentUrl")
            media_type = parsed.get("mediaType")
            file_name = parsed.get("fileName")
            voice_message = bool(parsed.get("voiceMessage"))
            raw_duration = parsed.get("durationSeconds")
            duration_seconds = raw_duration if isinstance(raw_duration, (int, float)) and 0 <= raw_duration <= 3600 else None
            if not message and not attachment_url:
                continue

            sender = await db.users.find_one({"_id": ObjectId(sender_id)})
            now = datetime.now(timezone.utc)
            message_doc = {
                "groupId": room_id,
                "senderId": sender_id,
                "senderName": sender.get("name", "") if sender else "",
                "message": message,
                "attachmentUrl": attachment_url,
                "mediaType": media_type,
                "fileName": file_name,
                "voiceMessage": voice_message,
                "durationSeconds": duration_seconds,
                "createdAt": now,
                "edited": False,
                "deleted": False,
                "status": "sent",
            }

            result = await db.group_messages.insert_one(message_doc)

            payload = json.dumps({
                "type": "group_message",
                "groupId": room_id,
                "data": {
                    "id": str(result.inserted_id),
                    "groupId": room_id,
                    "senderId": sender_id,
                    "senderName": message_doc["senderName"],
                    "message": message,
                    "attachmentUrl": attachment_url,
                    "mediaType": media_type,
                    "fileName": file_name,
                    "voiceMessage": voice_message,
                    "durationSeconds": duration_seconds,
                    "createdAt": now.isoformat().replace("+00:00", "Z"),
                    "edited": False,
                    "deleted": False,
                    "status": "sent",
                }
            })

            await manager.broadcast_room(room_id, payload)

            member_ids = fresh_group.get("members", [])
            for member_id in member_ids:
                if member_id != sender_id:
                    await manager.send_personal_message(member_id, payload)

    except WebSocketDisconnect:
        print("Group disconnected")

    finally:
        manager.disconnect_room(room_id, websocket)


@app.get("/")
async def root():

    await db.test.insert_one({
        "message": "mongodb connected"
    })
    return {"message": "MongoDB Connected"}