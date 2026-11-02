import os
from datetime import datetime, timezone

from bson import ObjectId
from dotenv import load_dotenv
from fastapi.testclient import TestClient
from pymongo import MongoClient

from app.main import app
from app.utils.jwt import create_access_token

load_dotenv()
sync_db = MongoClient(os.getenv("MONGO_URL"))[os.getenv("DATABASE_NAME")]


def seed():
    suffix = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    ids = {}
    for key, name in {
        "creator": "Creator",
        "member": "Member",
        "outsider": "Outsider",
        "extra": "Extra",
    }.items():
        result = sync_db.users.insert_one({
            "name": name,
            "email": f"{key}_{suffix}@test.com",
            "password": "x",
            "createdAt": datetime.now(timezone.utc),
            "avatar": "",
        })
        ids[key] = str(result.inserted_id)
    return ids


def cleanup(ids, group_id):
    sync_db.users.delete_many({"_id": {"$in": [ObjectId(v) for v in ids.values()]}})
    if group_id:
        sync_db.groups.delete_one({"_id": ObjectId(group_id)})
        sync_db.group_messages.delete_many({"groupId": group_id})
        sync_db.messages.delete_many({"groupId": group_id})


def auth_header(user_id, email):
    token = create_access_token({"user_id": user_id, "email": email})
    return {"Authorization": f"Bearer {token}"}


def main():
    ids = seed()
    group_id = None
    failures = []

    def check(cond, msg):
        if not cond:
            failures.append(msg)
            print("FAIL:", msg)
        else:
            print("OK:", msg)

    try:
        client = TestClient(app)
        creator = auth_header(ids["creator"], "c@test.com")
        member = auth_header(ids["member"], "m@test.com")
        outsider = auth_header(ids["outsider"], "o@test.com")

        unauth = client.post("/api/group/create", json={"name": "NoAuth", "members": [ids["member"]]})
        check(unauth.status_code == 401, "create group requires auth")

        bad = client.post(
            "/api/group/create",
            json={"name": "   ", "members": [ids["member"]], "createdBy": ids["creator"]},
            headers=creator,
        )
        check(bad.status_code == 400, "empty group name rejected")

        created = client.post(
            "/api/group/create",
            json={
                "name": "Weekend Plans",
                "members": [ids["member"]],
                "groupImage": "http://example.com/g.png",
                "createdBy": ids["creator"],
            },
            headers=creator,
        )
        check(created.status_code == 200, f"create group status {created.status_code} {created.text}")
        body = created.json()
        group_id = body.get("groupId")
        check(bool(group_id), "create returns groupId")
        check(body.get("group", {}).get("name") == "Weekend Plans", "create returns group name")
        member_ids = [m["id"] for m in body.get("group", {}).get("members", [])]
        check(ids["creator"] in member_ids and ids["member"] in member_ids, "creator and members saved")

        groups = client.get(f"/api/group/user/{ids['creator']}", headers=creator)
        check(groups.status_code == 200, "fetch own groups")
        check(any(g["id"] == group_id for g in groups.json()), "created group listed for creator")

        forbidden = client.get(f"/api/group/user/{ids['creator']}", headers=member)
        check(forbidden.status_code == 403, "cannot fetch another user's groups")

        outsider_groups = client.get(f"/api/group/user/{ids['outsider']}", headers=outsider)
        check(outsider_groups.status_code == 200 and outsider_groups.json() == [], "outsider has no groups")

        added = client.post(
            f"/api/group/{group_id}/members",
            json={"memberIds": [ids["extra"]]},
            headers=creator,
        )
        check(added.status_code == 200, "creator can add members")
        check(ids["extra"] in [m["id"] for m in added.json()["members"]], "extra member present")

        add_denied = client.post(
            f"/api/group/{group_id}/members",
            json={"memberIds": [ids["outsider"]]},
            headers=member,
        )
        check(add_denied.status_code == 403, "non-creator cannot add members")

        history_empty = client.get(f"/api/group/messages/{group_id}", headers=creator)
        check(history_empty.status_code == 200 and history_empty.json() == [], "no messages yet")

        history_denied = client.get(f"/api/group/messages/{group_id}", headers=outsider)
        check(history_denied.status_code == 403, "non-member cannot read group messages")

        sent = client.post(
            f"/api/group/{group_id}/messages",
            json={"message": "hello group"},
            headers=member,
        )
        check(sent.status_code == 200, "member can send REST group message")

        history = client.get(f"/api/group/messages/{group_id}", headers=creator)
        msgs = history.json()
        check(len(msgs) == 1 and msgs[0]["message"] == "hello group", "group message persisted and reloaded")
        check(msgs[0]["groupId"] == group_id, "saved message uses groupId")

        private_leak = sync_db.messages.find_one({"groupId": group_id})
        check(private_leak is None, "group messages are not stored in private messages collection")

        with client.websocket_connect(
            f"/ws/group/{group_id}?userId={ids['creator']}"
        ) as ws:
            ws.send_json({
                "type": "group_message",
                "senderId": ids["creator"],
                "message": "from socket",
            })
            payload = ws.receive_json()
            check(payload.get("type") == "group_message", "websocket broadcasts group_message")
            check(payload.get("data", {}).get("message") == "from socket", "websocket payload has message")
            check(payload.get("groupId") == group_id, "websocket payload uses groupId not only roomId")

        reloaded = client.get(f"/api/group/messages/{group_id}", headers=member)
        texts = [m["message"] for m in reloaded.json()]
        check("from socket" in texts, "websocket message still available after fetch (refresh)")

        try:
            with client.websocket_connect(
                f"/ws/group/{group_id}?userId={ids['outsider']}"
            ) as ws:
                ws.receive_json()
            check(False, "outsider websocket should be rejected")
        except Exception:
            check(True, "outsider websocket connection rejected")

        removed = client.delete(
            f"/api/group/{group_id}/members/{ids['extra']}",
            headers=creator,
        )
        check(removed.status_code == 200, "creator can remove members")
        check(ids["extra"] not in [m["id"] for m in removed.json()["members"]], "removed member gone")

        left = client.delete(
            f"/api/group/{group_id}/members/{ids['member']}",
            headers=member,
        )
        check(left.status_code == 200, "member can leave group")

    finally:
        cleanup(ids, group_id)

    if failures:
        raise SystemExit(f"{len(failures)} failure(s)")
    print("ALL GROUP TESTS PASSED")


if __name__ == "__main__":
    main()
