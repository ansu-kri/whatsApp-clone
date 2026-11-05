import os
import sys
import unittest
from pathlib import Path
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi.testclient import TestClient
from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.utils.jwt import create_access_token

load_dotenv()
database = MongoClient(os.getenv("MONGO_URL"))[os.getenv("DATABASE_NAME")]


def read_until(socket, event_type):
    while True:
        event = socket.receive_json()
        if event.get("type") == event_type:
            return event


class RealtimeTypingIntegrationTest(unittest.TestCase):
    def test_private_typing_is_scoped_explicit_and_aggregated_across_tabs(self):
        suffix = uuid.uuid4().hex
        users = [
            {"name": f"Typing {suffix}", "email": f"typing-{suffix}@test.com", "password": "unused", "avatar": "", "createdAt": datetime.now(timezone.utc)},
            {"name": f"Receiver {suffix}", "email": f"receiver-{suffix}@test.com", "password": "unused", "avatar": "", "createdAt": datetime.now(timezone.utc)},
        ]
        ids = [database.users.insert_one(user).inserted_id for user in users]
        sender_id, receiver_id = map(str, ids)
        tokens = [create_access_token({"user_id": str(uid), "email": user["email"]}) for uid, user in zip(ids, users)]
        try:
            with TestClient(app) as client:
                with client.websocket_connect(f"/ws/chat?token={tokens[1]}") as receiver:
                    read_until(receiver, "sync_messages")
                    with client.websocket_connect(f"/ws/chat?token={tokens[0]}") as sender_one:
                        read_until(sender_one, "sync_messages")
                        read_until(receiver, "user_online")
                        with client.websocket_connect(f"/ws/chat?token={tokens[0]}") as sender_two:
                            read_until(sender_two, "sync_messages")
                            sender_one.send_json({"type": "typing", "receiverId": receiver_id, "active": True})
                            started = read_until(receiver, "typing")
                            self.assertEqual(started["senderId"], sender_id)
                            self.assertEqual(started["receiverId"], receiver_id)
                            self.assertEqual(started["senderName"], users[0]["name"])
                            self.assertTrue(started["active"])

                            sender_two.send_json({"type": "typing", "receiverId": receiver_id, "active": True})
                            sender_one.send_json({"type": "typing", "receiverId": receiver_id, "active": False})
                            sender_two.send_json({"type": "typing", "receiverId": receiver_id, "active": False})
                            stopped = read_until(receiver, "typing")
                            self.assertEqual(stopped["senderId"], sender_id)
                            self.assertFalse(stopped["active"])
        finally:
            database.users.delete_many({"_id": {"$in": ids}})


if __name__ == "__main__":
    unittest.main()
