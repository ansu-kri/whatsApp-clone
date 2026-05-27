from fastapi import FastAPI, WebSocket
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

    user_id = websocket.query_params.get("userId")

    if not user_id:
        await websocket.close()
        return

    await manager.connect(user_id, websocket)

    try:

        # ================= ONLINE USERS =================
        await manager.send_personal_message(
            user_id,
            json.dumps({
                "type": "online_list",
                "users": list(manager.active_connections.keys())
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
                
                #prevent empty message
                if not message_text and not image_url:
                    continue

                now = datetime.now(timezone.utc)    
  
                receiver_online = parsed["receiverId"] in manager.active_connections

                message_doc = {
                    "senderId": parsed["senderId"],
                    "receiverId": parsed["receiverId"],
                    "message": message_text,
                    "image": image_url,
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

    except Exception as e:
        print("WebSocket error:", e)

    finally:
        manager.disconnect(user_id, websocket)

        #save last seen
        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {
                "$set": {
                    "lastSeen": datetime.utcnow()
                }
            }
        )

        #Broadcast offline
        await manager.broadcast(json.dumps({
            "type": "user_offline",
            "userId": user_id
        }))

@app.get("/")
async def root():

    await db.test.insert_one({
        "message": "mongodb connected"
    })
    return {"message": "MongoDB Connected"}