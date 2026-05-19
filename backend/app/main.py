from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from app.database import db
from app.routes.auth import router as authRouter
from app.routes.user import router as userRouter
from app.websocket.socket import manager
from app.routes.message import ( router as messageRouter )
import json
from datetime import datetime, timezone

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
            "seen": False
        })

        missed = []

        async for m in cursor:
            m["_id"] = str(m["_id"])

            if "createdAt" in m and isinstance(m["createdAt"], datetime):
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

            try:
                data = await websocket.receive_text()
                parsed_data = json.loads(data)

                event_type = parsed_data.get("type")

                # ================= MESSAGE =================
                if event_type == "message":

                    now = datetime.utcnow()

                    receiver_online = manager.is_online(parsed_data["receiverId"])

                    message_data = {
                        "senderId": parsed_data["senderId"],
                        "receiverId": parsed_data["receiverId"],
                        "message": parsed_data["message"],
                        "createdAt": now,
                        "seen": False,
                        "status": "delivered" if receiver_online else "sent"
                    }

                    await db.messages.insert_one(message_data)

                    response = json.dumps({
                        "type": "message",
                        "data": {
                            "senderId": parsed_data["senderId"],
                            "receiverId": parsed_data["receiverId"],
                            "message": parsed_data["message"],
                            "createdAt": now.isoformat(),
                            "status": message_data["status"]
                        }
                    })

                    await manager.send_personal_message(
                        parsed_data["receiverId"],
                        response
                    )

                    await manager.send_personal_message(
                        parsed_data["senderId"],
                        response
                    )

                # ================= TYPING =================
                elif event_type == "typing":
                    await manager.send_personal_message(
                        parsed_data["receiverId"],
                        json.dumps({
                            "type": "typing",
                            "senderId": parsed_data["senderId"]
                        })
                    )

                # ================= SEEN =================
                if event_type == "seen":

                    await db.messages.update_many(
                        {
                            "senderId": parsed_data["senderId"],
                            "receiverId": parsed_data["receiverId"],
                            "seen": False
                        },
                        {
                            "$set": {
                                "seen": True,
                                "status": "seen"
                            }
                        }
                    )

                    await manager.send_personal_message(
                        parsed_data["senderId"],
                        json.dumps({
                            "type": "seen_update",
                            "from": parsed_data["receiverId"]
                        })
                    )

            except Exception as e:
                print("❌ WebSocket loop error:", e)
                break

    except Exception as e:
        print("❌ WebSocket outer error:", e)

    finally:
        manager.disconnect(user_id, websocket)

        await manager.broadcast(
            json.dumps({
                "type": "user_offline",
                "userId": user_id
            })
        )

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
            m["_id"] = str(m["_id"])

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
                        "from": parsed["receiverId"]
                    })
                )

                continue

            # ================= SEND MESSAGE =================
            now = datetime.now(timezone.utc)

            receiver_online = parsed["receiverId"] in manager.active_connections

            message_doc = {
                "senderId": parsed["senderId"],
                "receiverId": parsed["receiverId"],
                "message": parsed["message"],
                "createdAt": now,
                "status": "delivered" if receiver_online else "sent"
            }

            await db.messages.insert_one(message_doc)

            response = {
                "type": "message",
                "data": {
                    "senderId": parsed["senderId"],
                    "receiverId": parsed["receiverId"],
                    "message": parsed["message"],
                    "createdAt": now.isoformat(),
                    "status": "delivered" if receiver_online else "sent"
                }
            }

            payload = json.dumps(response)

            await manager.send_personal_message(parsed["receiverId"], payload)
            await manager.send_personal_message(parsed["senderId"], payload)

    except Exception as e:
        print("WebSocket error:", e)

    finally:
        manager.disconnect(user_id, websocket)

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