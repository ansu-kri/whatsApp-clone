from fastapi import WebSocket
from typing import Dict, Set, List
import json
from collections import defaultdict

class ConnectionManager:

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}

        #group chat rooms
        self.rooms: Dict[str, List[WebSocket]] = defaultdict(list)

        #========group chat methods========
    async def connect_room(
            self,
            room_id: str,
            websocket: WebSocket
    ):
        await websocket.accept()
        self.rooms[room_id].append(websocket)
        print(f"User joined room {room_id}")

    def disconnect_room(
            self,
            room_id: str,
            websocket: WebSocket
    ):
        if room_id in self.rooms:

            if websocket in self.rooms[room_id]:
                self.rooms[room_id].remove(websocket)
            
            #remove empty room
            if not self.rooms[room_id]:
                del self.rooms[room_id]

        print(f"User left room {room_id}")

    async def broadcast_room(
            self,
            room_id: str,
            message: str
    ):
        if room_id not in self.rooms:
            return
        dead_sockets = []

        for connection in self.rooms[room_id]:
            try:
                await connection.send_text(message)

            except:
                dead_sockets.append(connection)

        #cleanup dead sockets
        for ws in dead_sockets:
            self.rooms[room_id].remove(ws)
        
     #=======Personal chat methods========
    async def connect_user(self, user_id: str, websocket: WebSocket):
        await websocket.accept()

        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()

        self.active_connections[user_id].add(websocket)

        # notify others user is online
        await self.broadcast_all(json.dumps({
            "type": "user_online",
            "userId": user_id
        }))
        
        print(f"{user_id} conneted")


    def disconnect_user(self, user_id: str, websocket: WebSocket):
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)

            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

                print(f"{user_id} offline")

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

    async def broadcast_all(self, message: str):
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