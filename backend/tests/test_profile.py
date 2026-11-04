import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId
from dotenv import load_dotenv
from fastapi.testclient import TestClient
from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.utils.jwt import create_access_token

load_dotenv()
sync_db = MongoClient(os.getenv("MONGO_URL"))[os.getenv("DATABASE_NAME")]


def accounts():
    suffix = uuid.uuid4().hex
    docs = [
        {"name": f"Profile A {suffix}", "email": f"profile-a-{suffix}@test.com", "password": "unused", "avatar": "", "createdAt": datetime.now(timezone.utc)},
        {"name": f"Profile B {suffix}", "email": f"profile-b-{suffix}@test.com", "password": "unused", "avatar": "", "createdAt": datetime.now(timezone.utc)},
    ]
    ids = [sync_db.users.insert_one(doc).inserted_id for doc in docs]
    tokens = [create_access_token({"user_id": str(uid), "email": doc["email"]}) for uid, doc in zip(ids, docs)]
    result = {"ids": ids, "docs": docs, "tokens": tokens, "suffix": suffix}
    try:
        yield result
    finally:
        uploads = list(sync_db.uploads.find({"ownerId": {"$in": [str(uid) for uid in ids]}, "purpose": "profile-avatar"}))
        for upload in uploads:
            Path(upload["path"]).unlink(missing_ok=True)
        sync_db.uploads.delete_many({"ownerId": {"$in": [str(uid) for uid in ids]}, "purpose": "profile-avatar"})
        sync_db.users.delete_many({"_id": {"$in": ids}})


def header(token):
    return {"Authorization": f"Bearer {token}"}


def _run_profile_and_presence_flows(accounts):
    with TestClient(app) as client:
        first, second = accounts["tokens"]
        email = f"anshu-{accounts['suffix']}@test.com"
        own = client.patch("/api/user/me", headers=header(first), json={"name": "Anshu Kumari", "email": email, "avatar": ""})
        assert own.status_code == 200 and own.json()["name"] == "Anshu Kumari" and own.json()["email"] == email
        invalid = client.patch("/api/user/me", headers=header(first), json={"name": "Profile A", "email": "not-an-email", "avatar": ""})
        duplicate = client.patch("/api/user/me", headers=header(first), json={"name": "Profile A", "email": accounts["docs"][1]["email"], "avatar": ""})
        assert invalid.status_code == 422 and duplicate.status_code == 409
        uploaded = client.post("/api/upload/?purpose=profile-avatar", headers=header(first), files={"file": ("avatar.jpg", b"\xff\xd8\xffprofile-image", "image/jpeg")})
        assert uploaded.status_code == 200
        avatar = uploaded.json()["mediaUrl"]
        saved = client.patch("/api/user/me", headers=header(first), json={"name": "Anshu Kumari", "email": email, "avatar": avatar})
        assert saved.status_code == 200 and saved.json()["avatar"] == avatar
        denied = client.patch("/api/user/me", headers=header(second), json={"name": "Profile B", "email": accounts["docs"][1]["email"], "avatar": avatar})
        assert denied.status_code == 403
        assert client.get("/api/user/me", headers=header(first)).json()["avatar"] == avatar
        assert client.get("/api/user/me", headers=header(second)).json()["avatar"] == ""
        assert client.get(avatar, headers=header(second)).status_code == 200
        users = client.get("/api/user", headers=header(second)).json()
        assert all(user["id"] != str(accounts["ids"][1]) for user in users)
        assert next(user for user in users if user["id"] == str(accounts["ids"][0]))["avatar"] == avatar
        uid = accounts["ids"][0]
        with client.websocket_connect(f"/ws/chat?token={first}") as ws:
            event = ws.receive_json()
            while event.get("type") != "sync_messages": event = ws.receive_json()
            ws.send_json({"type": "activity"})
            activity = ws.receive_json()
            assert activity["type"] == "user_activity" and activity["userId"] == str(uid)
            assert activity["lastSeen"].endswith("Z")
            stored = sync_db.users.find_one({"_id": uid})
            last_seen = stored["lastSeen"].replace(tzinfo=timezone.utc)
            assert (datetime.now(timezone.utc) - last_seen).total_seconds() < 10
            assert stored["isOnline"] is True
            ws.send_json({"type": "inactive"})
            inactive = ws.receive_json()
            assert inactive["type"] == "user_offline"
            stored = sync_db.users.find_one({"_id": uid})
            assert stored["isOnline"] is False
            assert stored["lastSeen"].replace(tzinfo=timezone.utc) == last_seen


class ProfileIntegrationTest(unittest.TestCase):
    def test_profile_and_presence_flows(self):
        fixture = accounts()
        data = next(fixture)
        try:
            _run_profile_and_presence_flows(data)
        finally:
            fixture.close()


if __name__ == "__main__":
    unittest.main()


def tearDownModule():
    sync_db.client.close()
