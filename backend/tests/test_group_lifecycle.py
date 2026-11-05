import os
import sys
import uuid
import unittest
from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId
from dotenv import load_dotenv
from fastapi.testclient import TestClient
from pymongo import MongoClient
from starlette.websockets import WebSocketDisconnect

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app
from app.utils.jwt import create_access_token

load_dotenv()
sync_db = MongoClient(os.getenv("MONGO_URL"))[os.getenv("DATABASE_NAME")]


class GroupLifecycleIntegrationTest(unittest.TestCase):
    def test_leave_admin_succession_delete_and_live_access_revocation(self):
        suffix = uuid.uuid4().hex
        names = ["Admin", "Member", "Target", "Removed"]
        docs = [{"name": name, "email": f"{name.lower()}-{suffix}@test.com", "password": "unused", "avatar": "", "createdAt": datetime.now(timezone.utc)} for name in names]
        ids = [sync_db.users.insert_one(doc).inserted_id for doc in docs]
        ids = [str(value) for value in ids]
        tokens = [create_access_token({"user_id": user_id, "email": doc["email"]}) for user_id, doc in zip(ids, docs)]
        headers = [{"Authorization": f"Bearer {token}"} for token in tokens]
        group_id = None
        with TestClient(app) as client:
            try:
                image_upload = client.post("/api/upload/?purpose=group-avatar", headers=headers[0], files={"file": ("group.jpg", b"\xff\xd8\xffgroup-image", "image/jpeg")})
                attachment_upload = client.post("/api/upload/?purpose=attachment", headers=headers[0], files={"file": ("attachment.jpg", b"\xff\xd8\xffgroup-attachment", "image/jpeg")})
                self.assertEqual(image_upload.status_code, 200, image_upload.text)
                self.assertEqual(attachment_upload.status_code, 200, attachment_upload.text)
                image_url = image_upload.json()["mediaUrl"]
                attachment_url = attachment_upload.json()["mediaUrl"]
                created = client.post("/api/group/create", headers=headers[0], json={"name": f"Lifecycle {suffix}", "members": ids[1:], "createdBy": ids[0], "groupImage": image_url})
                self.assertEqual(created.status_code, 200, created.text)
                group_id = created.json()["groupId"]
                self.assertEqual(created.json()["group"]["admins"], [ids[0]])

                self.assertEqual(client.delete(f"/api/group/{group_id}", headers=headers[1]).status_code, 403)
                self.assertEqual(client.delete(f"/api/group/{group_id}/members/{ids[2]}", headers=headers[1]).status_code, 403)

                sent = client.post(f"/api/group/{group_id}/messages", headers=headers[1], json={"message": "kept history"})
                self.assertEqual(sent.status_code, 200, sent.text)
                self.assertEqual(client.get(f"/api/group/messages/{group_id}", headers=headers[1]).status_code, 200)

                with client.websocket_connect(f"/ws/group/{group_id}?token={tokens[0]}") as admin_socket:
                    with client.websocket_connect(f"/ws/group/{group_id}?token={tokens[1]}") as member_socket:
                        removed = client.delete(f"/api/group/{group_id}/members/{ids[3]}", headers=headers[0])
                        self.assertEqual(removed.status_code, 200, removed.text)
                        self.assertNotIn(ids[3], [member["id"] for member in removed.json()["members"]])
                        self.assertEqual(admin_socket.receive_json()["type"], "group_members_updated")
                        self.assertEqual(admin_socket.receive_json()["type"], "group_system_event")
                        self.assertEqual(member_socket.receive_json()["type"], "group_members_updated")
                        self.assertEqual(member_socket.receive_json()["type"], "group_system_event")

                        admin_socket.send_json({"type": "group_typing", "groupId": group_id, "active": True})
                        typing_started = member_socket.receive_json()
                        self.assertEqual(typing_started["type"], "group_typing")
                        self.assertEqual(typing_started["groupId"], group_id)
                        self.assertEqual(typing_started["senderId"], ids[0])
                        self.assertEqual(typing_started["senderName"], names[0])
                        self.assertTrue(typing_started["active"])
                        self.assertEqual(admin_socket.receive_json()["type"], "group_typing")
                        admin_socket.send_json({"type": "group_typing", "groupId": group_id, "active": False})
                        typing_stopped = member_socket.receive_json()
                        self.assertEqual(typing_stopped["type"], "group_typing")
                        self.assertFalse(typing_stopped["active"])
                        self.assertEqual(admin_socket.receive_json()["type"], "group_typing")

                        admin_socket.send_json({"type": "group_message", "senderId": ids[0], "attachmentUrl": attachment_url, "mediaType": "image/jpeg", "fileName": "attachment.jpg"})
                        attachment_message = admin_socket.receive_json()
                        self.assertEqual(attachment_message["type"], "group_message")
                        self.assertEqual(member_socket.receive_json()["type"], "group_message")
                        self.assertEqual(client.get(attachment_url, headers=headers[1]).status_code, 200)
                        self.assertEqual(client.get(image_url, headers=headers[1]).status_code, 200)

                        left = client.delete(f"/api/group/{group_id}/members/me", headers=headers[1])
                        self.assertEqual(left.status_code, 200, left.text)
                        self.assertEqual(admin_socket.receive_json()["type"], "group_members_updated")
                        left_event = admin_socket.receive_json()
                        self.assertEqual(left_event["type"], "group_system_event")
                        self.assertEqual(left_event["event"], "member_left")
                        self.assertIn("left the group", left_event["message"])
                        self.assertEqual(member_socket.receive_json()["type"], "group_members_updated")
                        self.assertEqual(member_socket.receive_json()["event"], "member_left")
                        with self.assertRaises((WebSocketDisconnect, RuntimeError)):
                            member_socket.receive_json()

                self.assertEqual(client.get(f"/api/group/messages/{group_id}", headers=headers[1]).status_code, 403)
                self.assertEqual(client.post(f"/api/group/{group_id}/messages", headers=headers[1], json={"message": "not allowed"}).status_code, 403)
                self.assertEqual(client.get(f"/api/group/user/{ids[1]}", headers=headers[1]).json(), [])

                # The last admin can leave; the remaining member becomes admin.
                creator_leave = client.delete(f"/api/group/{group_id}/members/me", headers=headers[0])
                self.assertEqual(creator_leave.status_code, 200, creator_leave.text)
                promoted_groups = client.get(f"/api/group/user/{ids[2]}", headers=headers[2]).json()
                self.assertEqual(len(promoted_groups), 1)
                self.assertEqual(promoted_groups[0]["admins"], [ids[2]])
                self.assertTrue(next(m for m in promoted_groups[0]["members"] if m["id"] == ids[2])["isAdmin"])
                self.assertEqual(client.get(f"/api/group/messages/{group_id}", headers=headers[0]).status_code, 403)

                # Two live tabs receive deletion and are both disconnected.
                with client.websocket_connect(f"/ws/group/{group_id}?token={tokens[2]}") as tab_one:
                    with client.websocket_connect(f"/ws/group/{group_id}?token={tokens[2]}") as tab_two:
                        deleted = client.delete(f"/api/group/{group_id}", headers=headers[2])
                        self.assertEqual(deleted.status_code, 200, deleted.text)
                        self.assertEqual(tab_one.receive_json()["type"], "group_deleted")
                        self.assertEqual(tab_two.receive_json()["type"], "group_deleted")

                self.assertEqual(client.get(f"/api/group/messages/{group_id}", headers=headers[2]).status_code, 404)
                self.assertEqual(client.get(f"/api/group/user/{ids[2]}", headers=headers[2]).json(), [])
                self.assertTrue(sync_db.groups.find_one({"_id": ObjectId(group_id)})["isDeleted"])
                self.assertEqual(sync_db.group_messages.count_documents({"groupId": group_id}), 2)
                self.assertEqual(client.get(attachment_url, headers=headers[2]).status_code, 403)
                self.assertEqual(client.get(image_url, headers=headers[2]).status_code, 403)
            finally:
                if group_id:
                    sync_db.group_messages.delete_many({"groupId": group_id})
                    sync_db.groups.delete_one({"_id": ObjectId(group_id)})
                uploads = list(sync_db.uploads.find({"ownerId": {"$in": ids}, "purpose": {"$in": ["group-avatar", "attachment"]}}))
                for upload in uploads:
                    Path(upload["path"]).unlink(missing_ok=True)
                sync_db.uploads.delete_many({"ownerId": {"$in": ids}, "purpose": {"$in": ["group-avatar", "attachment"]}})
                sync_db.users.delete_many({"_id": {"$in": [ObjectId(user_id) for user_id in ids]}})


def tearDownModule():
    sync_db.client.close()


if __name__ == "__main__":
    unittest.main()

