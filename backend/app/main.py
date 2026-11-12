from fastapi import FastAPI, WebSocket,WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.database import db
from app.routes.auth import router as authRouter
from app.routes.user import router as userRouter
from app.websocket.socket import manager
from app.routes.message import ( router as messageRouter )
import json
import asyncio
from datetime import datetime, timezone
from bson import ObjectId
from app.routes.upload import router as uploadRouter
from app.routes.group import router as groupRouter
from app.routes.notifications import router as notificationsRouter
from app.routes.calls import router as callsRouter
from app.middleware.authMiddleware import SECRET_KEY, ALGORITHM
from app.utils.notifications import create_notification
from jose import jwt

app = FastAPI()

active_calls = {}
user_active_call = {}

async def expire_connecting_call(call_id: str):
    await asyncio.sleep(30)
    call = active_calls.get(call_id)
    if call and call.get("status") == "connecting":
        now = datetime.now(timezone.utc)
        call["status"] = "failed"
        await db.calls.update_one({"_id": ObjectId(call_id)}, {"$set": {"status": "failed", "endTime": now, "duration": 0}})
        payload = json.dumps({"type": "call_ended", "callId": call_id, "status": "failed"})
        await manager.send_personal_message(call["callerId"], payload)
        await manager.send_personal_message(call["receiverId"], payload)
        active_calls.pop(call_id, None)
        user_active_call.pop(call["callerId"], None)
        user_active_call.pop(call["receiverId"], None)


async def expire_call(call_id: str):
    await asyncio.sleep(40)
    call = active_calls.get(call_id)
    if call and call.get("status") == "ringing":
        call["status"] = "missed"
        ended = datetime.now(timezone.utc)
        await db.calls.update_one({"_id": ObjectId(call_id)}, {"$set": {"status": "missed", "endTime": ended, "duration": 0}})
        await create_notification(call["receiverId"], call["callerId"], f"missed_call:{call_id}", f"Missed {call['callType']} call", "private", call["callerId"], "call")
        await manager.send_personal_message(call["callerId"], json.dumps({"type": "call_ended", "callId": call_id, "status": "missed"}))
        await manager.send_personal_message(call["receiverId"], json.dumps({"type": "call_ended", "callId": call_id, "status": "missed"}))
        active_calls.pop(call_id, None)
        user_active_call.pop(call["callerId"], None)
        user_active_call.pop(call["receiverId"], None)

@app.on_event("startup")
async def ensure_notification_indexes():
    await db.notifications.create_index([("userId", 1), ("eventId", 1)], unique=True)
    await db.calls.create_index([("callerId", 1), ("createdAt", -1)])
    await db.calls.create_index([("receiverId", 1), ("createdAt", -1)])

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

app.include_router(notificationsRouter, prefix="/api/notifications")
app.include_router(callsRouter, prefix="/api/calls")

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

            # ================= AUTHENTICATED CALL SIGNALING =================
            if event == "call_start":
                receiver_id = parsed.get("receiverId")
                call_type = parsed.get("callType")
                try:
                    ObjectId(receiver_id)
                except Exception:
                    continue
                if call_type not in ("audio", "video") or receiver_id == user_id:
                    continue
                receiver = await db.users.find_one({"_id": ObjectId(receiver_id)}, {"_id": 1, "name": 1})
                if not receiver:
                    continue
                if user_id in user_active_call or receiver_id in user_active_call:
                    await manager.send_personal_message(user_id, json.dumps({"type": "call_failed", "reason": "busy"}))
                    continue
                call_id = str(ObjectId())
                now = datetime.now(timezone.utc)
                call = {"_id": ObjectId(call_id), "callerId": user_id, "receiverId": receiver_id, "callType": call_type, "status": "ringing", "createdAt": now, "startTime": None, "endTime": None, "duration": 0}
                active_calls[call_id] = call
                user_active_call[user_id] = call_id
                user_active_call[receiver_id] = call_id
                try:
                    await db.calls.insert_one(call)
                except Exception:
                    active_calls.pop(call_id, None)
                    user_active_call.pop(user_id, None)
                    user_active_call.pop(receiver_id, None)
                    await manager.send_personal_message(user_id, json.dumps({"type": "call_failed", "reason": "Call storage is unavailable."}))
                    continue
                if receiver_id not in manager.active_users:
                    await db.calls.update_one({"_id": ObjectId(call_id)}, {"$set": {"status": "missed", "endTime": now}})
                    await create_notification(receiver_id, user_id, f"missed_call:{call_id}", f"Missed {call_type} call", "private", user_id, "call")
                    active_calls.pop(call_id, None)
                    user_active_call.pop(user_id, None)
                    user_active_call.pop(receiver_id, None)
                    await manager.send_personal_message(user_id, json.dumps({"type": "call_failed", "callId": call_id, "reason": "offline"}))
                    continue
                await manager.send_personal_message(user_id, json.dumps({"type": "call_ringing", "call": {"callId": call_id, "callerId": user_id, "receiverId": receiver_id, "callType": call_type, "status": "ringing"}}))
                await manager.send_personal_message(receiver_id, json.dumps({"type": "call_incoming", "call": {"callId": call_id, "callerId": user_id, "receiverId": receiver_id, "callType": call_type, "status": "ringing"}}))
                asyncio.create_task(expire_call(call_id))
                continue

            if event in ("call_accept", "call_end", "call_offer", "call_answer", "call_ice"):
                call_id = parsed.get("callId")
                call = active_calls.get(call_id or "")
                if not call or user_id not in (call["callerId"], call["receiverId"]):
                    continue
                other_id = call["receiverId"] if user_id == call["callerId"] else call["callerId"]
                if event == "call_accept":
                    if user_id != call["receiverId"] or call["status"] != "ringing":
                        continue
                    now = datetime.now(timezone.utc)
                    call["status"] = "connecting"
                    call["startTime"] = now
                    await db.calls.update_one({"_id": ObjectId(call_id)}, {"$set": {"status": "connecting", "startTime": now}})
                    await manager.send_personal_message(call["callerId"], json.dumps({"type": "call_accepted", "callId": call_id}))
                    asyncio.create_task(expire_connecting_call(call_id))
                    continue
                if event == "call_end":
                    status = parsed.get("status")
                    if status not in ("rejected", "cancelled", "ended", "failed"):
                        status = "ended"
                    now = datetime.now(timezone.utc)
                    start = call.get("startTime")
                    duration = max(0, int((now - start).total_seconds())) if start else 0
                    call["status"] = status
                    await db.calls.update_one({"_id": ObjectId(call_id)}, {"$set": {"status": status, "endTime": now, "duration": duration}})
                    payload = json.dumps({"type": "call_ended", "callId": call_id, "status": status})
                    await manager.send_personal_message(other_id, payload)
                    active_calls.pop(call_id, None)
                    user_active_call.pop(call["callerId"], None)
                    user_active_call.pop(call["receiverId"], None)
                    continue
                if call["status"] not in ("connecting", "connected"):
                    continue
                if event == "call_offer":
                    offer = parsed.get("offer")
                    if user_id != call["callerId"] or not isinstance(offer, dict) or offer.get("type") != "offer":
                        continue
                    await manager.send_personal_message(other_id, json.dumps({"type": "call_offer", "callId": call_id, "offer": offer}))
                elif event == "call_answer":
                    answer = parsed.get("answer")
                    if user_id != call["receiverId"] or not isinstance(answer, dict) or answer.get("type") != "answer":
                        continue
                    call["status"] = "connected"
                    await db.calls.update_one({"_id": ObjectId(call_id)}, {"$set": {"status": "connected"}})
                    await manager.send_personal_message(other_id, json.dumps({"type": "call_answer", "callId": call_id, "answer": answer}))
                elif event == "call_ice":
                    candidate = parsed.get("candidate")
                    if isinstance(candidate, dict):
                        await manager.send_personal_message(other_id, json.dumps({"type": "call_ice", "callId": call_id, "candidate": candidate}))
                continue
            # ================= PRIVATE TYPING =================
            if event == "typing":
                receiver_id = parsed.get("receiverId")
                active = parsed.get("active", True) is True
                try:
                    ObjectId(receiver_id)
                except Exception:
                    continue
                if receiver_id == user_id or not await db.users.find_one({"_id": ObjectId(receiver_id)}, {"_id": 1}):
                    continue
                changed = manager.set_private_typing(user_id, receiver_id, websocket, active)
                if changed:
                    sender = await db.users.find_one({"_id": ObjectId(user_id)}, {"name": 1})
                    await manager.send_personal_message(receiver_id, json.dumps({
                        "type": "typing", "senderId": user_id,
                        "receiverId": receiver_id,
                        "senderName": sender.get("name", "Someone") if sender else "Someone",
                        "active": active,
                    }))
                continue

            # ================= SEEN =================
            if event == "seen":
                sender_id = parsed.get("senderId")
                if parsed.get("receiverId") != user_id or not sender_id:
                    continue
                messages = await db.messages.find({
                    "senderId": sender_id,
                    "receiverId": user_id,
                    "seen": {"$ne": True},
                }).to_list(None)
                message_ids = [str(msg["_id"]) for msg in messages]
                await db.messages.update_many(
                    {"senderId": sender_id, "receiverId": user_id},
                    {"$set": {"seen": True, "status": "seen"}},
                )
                await db.notifications.update_many(
                    {"userId": user_id, "conversationType": "private", "conversationId": sender_id, "read": {"$ne": True}},
                    {"$set": {"read": True}},
                )
                await manager.send_personal_message(user_id, json.dumps({"type": "notifications_read", "conversationId": sender_id}))
                await manager.send_personal_message(
                    sender_id,
                    json.dumps({"type": "seen_update", "messageIds": message_ids, "from": user_id}),
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
                receiver_id = parsed.get("receiverId")
                if parsed.get("senderId") != user_id or not receiver_id or receiver_id == user_id:
                    continue
                try:
                    receiver_object_id = ObjectId(receiver_id)
                except Exception:
                    continue
                if not await db.users.find_one({"_id": receiver_object_id}, {"_id": 1}):
                    continue
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
  
                receiver_online = receiver_id in manager.active_connections

                message_doc = {
                    "senderId": parsed["senderId"],
                    "receiverId": receiver_id,
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

            await manager.send_personal_message(receiver_id, payload)
            await manager.send_personal_message(user_id, payload)
            await create_notification(
                receiver_id, user_id, f"private_message:{result.inserted_id}",
                message_text or (file_name or "Shared a file"), "private", user_id,
            )
            continue

    except WebSocketDisconnect:
        print("Client disconnected")

    finally:
        stopped_receivers = manager.clear_private_typing(user_id, websocket)
        if stopped_receivers:
            sender = await db.users.find_one({"_id": ObjectId(user_id)}, {"name": 1})
            stop_event = json.dumps({
                "type": "typing", "senderId": user_id,
                "senderName": sender.get("name", "Someone") if sender else "Someone",
                "active": False,
            })
            for receiver_id in stopped_receivers:
                payload = {**json.loads(stop_event), "receiverId": receiver_id}
                await manager.send_personal_message(receiver_id, json.dumps(payload))
        became_offline = manager.disconnect_user(user_id, websocket)
        if became_offline:
            call_id = user_active_call.get(user_id)
            call = active_calls.get(call_id or "")
            if call:
                now = datetime.now(timezone.utc)
                terminal = ("missed" if call["receiverId"] == user_id else "cancelled") if call.get("status") == "ringing" else "ended"
                start = call.get("startTime")
                duration = max(0, int((now - start).total_seconds())) if start else 0
                call["status"] = terminal
                await db.calls.update_one({"_id": ObjectId(call_id)}, {"$set": {"status": terminal, "endTime": now, "duration": duration}})
                other = call["receiverId"] if call["callerId"] == user_id else call["callerId"]
                await manager.send_personal_message(other, json.dumps({"type": "call_ended", "callId": call_id, "status": terminal}))
                active_calls.pop(call_id, None)
                user_active_call.pop(call["callerId"], None)
                user_active_call.pop(call["receiverId"], None)
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
                active = parsed.get("active", True) is True
                changed = manager.set_group_typing(room_id, user_id, websocket, active)
                if changed:
                    sender = await db.users.find_one({"_id": ObjectId(user_id)}, {"name": 1})
                    typing_payload = json.dumps({
                        "type": "group_typing", "groupId": room_id,
                        "senderId": user_id,
                        "senderName": sender.get("name", "Someone") if sender else "Someone",
                        "active": active,
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
                    await create_notification(
                        member_id, sender_id, f"group_message:{result.inserted_id}:{member_id}",
                        message or (file_name or "Shared a file"), "group", room_id,
                    )

    except WebSocketDisconnect:
        print("Group disconnected")

    finally:
        if manager.clear_group_typing(room_id, user_id, websocket):
            await manager.broadcast_room(room_id, json.dumps({
                "type": "group_typing", "groupId": room_id,
                "senderId": user_id, "active": False,
            }))
        manager.disconnect_room(room_id, websocket)


@app.get("/")
async def root():

    await db.test.insert_one({
        "message": "mongodb connected"
    })
    return {"message": "MongoDB Connected"}
