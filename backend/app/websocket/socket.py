from fastapi import WebSocket
from typing import Dict, Set
import json

class ConnectionManager:

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()

        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()

        self.active_connections[user_id].add(websocket)

        # notify others user is online
        await self.broadcast(json.dumps({
            "type": "user_online",
            "userId": user_id
        }))


    def disconnect(self, user_id: str, websocket: WebSocket):
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)

            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

                # optional: notify offline
                # asyncio.create_task(self.broadcast(...))

    def is_online(self, user_id: str) -> bool:
        return user_id in self.active_connections

    async def send_personal_message(self, receiver_id: str, message: str):
        sockets = self.active_connections.get(receiver_id)

        if not sockets:
            return

        dead_sockets = set()

        for ws in sockets:
            try:
                await ws.send_text(message)
            except:
                dead_sockets.add(ws)

        for ws in dead_sockets:
            sockets.discard(ws)

        if not sockets:
            self.active_connections.pop(receiver_id, None)

    async def broadcast(self, message: str):
        """Send message to all connected users"""
        for sockets in self.active_connections.values():
            for ws in sockets:
                try:
                    await ws.send_text(message)
                except:
                    pass

manager = ConnectionManager()                
















# from fastapi import WebSocket

# class ConnectionManager:

#     def __init__(self):
#         self.active_connections = []

#     async def connect(self, websocket: WebSocket):
#         await websocket.accept()
#         self.active_connections.append(websocket)

#     def disconnect(self, websocket: WebSocket):
#         if websocket in self.active_connections:
#             self.active_connections.remove(websocket)

#     async def broadcast(self, message: str):
#         for connection in self.active_connections:
#             await connection.send_text(message)

# manager = ConnectionManager()