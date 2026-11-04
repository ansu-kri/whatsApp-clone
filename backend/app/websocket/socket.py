from fastapi import WebSocket
from typing import Dict, Set, List
import json
from collections import defaultdict

class ConnectionManager:

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.active_users: Set[str] = set()
        self.inactive_connections: Set[WebSocket] = set()

        #group chat rooms
        self.rooms: Dict[str, List[WebSocket]] = defaultdict(list)
        self.room_users: Dict[str, Dict[WebSocket, str]] = defaultdict(dict)

        #========group chat methods========
    async def connect_room(self, room_id: str, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.rooms[room_id].append(websocket)
        self.room_users[room_id][websocket] = user_id
        print(f"User {user_id} joined room {room_id}")

    def disconnect_room(
            self,
            room_id: str,
            websocket: WebSocket
    ):
        if room_id in self.rooms:

            if websocket in self.rooms[room_id]:
                self.rooms[room_id].remove(websocket)
            self.room_users.get(room_id, {}).pop(websocket, None)
            if not self.rooms[room_id]:
                del self.rooms[room_id]
                self.room_users.pop(room_id, None)

        print(f"User left room {room_id}")

    async def disconnect_group_user(self, room_id: str, user_id: str):
        sockets = [ws for ws, member_id in self.room_users.get(room_id, {}).items() if member_id == user_id]
        for websocket in sockets:
            self.disconnect_room(room_id, websocket)
            try:
                await websocket.close(code=1008, reason="Group membership ended")
            except Exception:
                pass

    async def disconnect_group_room(self, room_id: str):
        for websocket in list(self.rooms.get(room_id, [])):
            self.disconnect_room(room_id, websocket)
            try:
                await websocket.close(code=1008, reason="Group was deleted")
            except Exception:
                pass

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
        self.active_users.add(user_id)

        # notify others user is online
        await self.broadcast_all(json.dumps({
            "type": "user_online",
            "userId": user_id
        }))
        
        print(f"{user_id} conneted")


    def set_connection_active(self, user_id: str, websocket: WebSocket, active: bool) -> tuple[bool, bool]:
        was_online = user_id in self.active_users
        if active:
            self.inactive_connections.discard(websocket)
        else:
            self.inactive_connections.add(websocket)
        connections = self.active_connections.get(user_id, set())
        if any(connection not in self.inactive_connections for connection in connections):
            self.active_users.add(user_id)
        else:
            self.active_users.discard(user_id)
        return was_online, user_id in self.active_users

    def disconnect_user(self, user_id: str, websocket: WebSocket) -> bool:
        connections = self.active_connections.get(user_id)
        if not connections:
            return False
        was_online, _ = self.set_connection_active(user_id, websocket, False)
        self.inactive_connections.discard(websocket)
        connections.discard(websocket)
        if not connections:
            del self.active_connections[user_id]
            self.active_users.discard(user_id)
            print(f"{user_id} offline")
            return was_online
        self.set_connection_active(user_id, next(iter(connections)), next(iter(connections)) not in self.inactive_connections)
        return was_online and user_id not in self.active_users

    def is_online(self, user_id: str) -> bool:
        return user_id in self.active_users

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