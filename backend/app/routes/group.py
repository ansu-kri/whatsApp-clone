from datetime import datetime, timezone
import json
from typing import List, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.database import db
from app.middleware.authMiddleware import verify_token
from app.websocket.socket import manager

router = APIRouter(
    dependencies=[Depends(verify_token)]
)


class CreateGroupRequest(BaseModel):
    name: str = Field(..., min_length=1)
    members: List[str] = Field(default_factory=list)
    groupImage: Optional[str] = None
    createdBy: Optional[str] = None


class AddMembersRequest(BaseModel):
    memberIds: List[str] = Field(..., min_length=1)


class SendGroupMessageRequest(BaseModel):
    message: str = Field(..., min_length=1)


def _user_id_from_token(payload: dict) -> str:
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user_id


def _as_object_id(value: str, label: str = "id") -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")


def _valid_id_strings(raw_ids: List[str]) -> List[str]:
    unique = []
    seen = set()
    for item in raw_ids:
        if not item or item in seen:
            continue
        _as_object_id(item, "member id")
        seen.add(item)
        unique.append(item)
    return unique


async def _serialize_members(member_ids: List[str]) -> List[dict]:
    object_ids = []
    for member_id in member_ids:
        try:
            object_ids.append(ObjectId(member_id))
        except (InvalidId, TypeError):
            continue

    if not object_ids:
        return []

    users = await db.users.find({"_id": {"$in": object_ids}}).to_list(None)
    return [
        {
            "id": str(user["_id"]),
            "name": user.get("name", ""),
            "avatar": user.get("avatar") or "",
        }
        for user in users
    ]


async def _get_group_or_404(group_id: str) -> dict:
    group = await db.groups.find_one({"_id": _as_object_id(group_id, "group id"), "isDeleted": {"$ne": True}})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


def _require_member(group: dict, user_id: str) -> None:
    if user_id not in group.get("members", []):
        raise HTTPException(
            status_code=403,
            detail="You are not a member of this group",
        )


def _admin_ids(group: dict) -> List[str]:
    admins = group.get("admins")
    if isinstance(admins, list):
        return [admin for admin in admins if admin in group.get("members", [])]
    creator = group.get("createdBy")
    return [creator] if creator in group.get("members", []) else []


def _require_admin(group: dict, user_id: str) -> None:
    if user_id not in _admin_ids(group):
        raise HTTPException(status_code=403, detail="Only group admins can perform this action")


def _serialize_group(group: dict, members: List[dict]) -> dict:
    admins = _admin_ids(group)
    for member in members:
        member["isAdmin"] = member["id"] in admins
    return {
        "id": str(group["_id"]), "name": group.get("name", ""),
        "groupImage": group.get("groupImage") or "",
        "createdBy": group.get("createdBy"), "admins": admins, "members": members,
    }


async def _broadcast_group_change(group_id: str, old_members: List[str], group: dict, system_event: dict) -> dict:
    members = await _serialize_members(group.get("members", []))
    serialized = _serialize_group(group, members)
    update = json.dumps({"type": "group_members_updated", "groupId": group_id, "group": serialized})
    event = json.dumps({"type": "group_system_event", "groupId": group_id, **system_event})
    await manager.broadcast_room(group_id, update)
    await manager.broadcast_room(group_id, event)
    for user_id in set(old_members + group.get("members", [])):
        await manager.send_personal_message(user_id, update)
        await manager.send_personal_message(user_id, event)
    return serialized


def _serialize_group_message(msg: dict) -> dict:
    created_at = msg.get("createdAt")
    if created_at and getattr(created_at, "tzinfo", None) is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    group_id = msg.get("groupId") or msg.get("roomId")

    return {
        "id": str(msg["_id"]),
        "senderId": msg.get("senderId"),
        "senderName": msg.get("senderName", ""),
        "groupId": group_id,
        "message": msg.get("message", ""),
        "attachmentUrl": msg.get("attachmentUrl"),
        "mediaType": msg.get("mediaType"),
        "fileName": msg.get("fileName"),
        "voiceMessage": msg.get("voiceMessage", False),
        "durationSeconds": msg.get("durationSeconds"),
        "createdAt": (
            created_at.isoformat().replace("+00:00", "Z")
            if created_at
            else None
        ),
        "edited": msg.get("edited", False),
        "deleted": msg.get("deleted", False),
        "status": msg.get("status", "sent"),
    }


@router.post("/create")
async def create_group(
    data: CreateGroupRequest,
    payload: dict = Depends(verify_token),
):
    user_id = _user_id_from_token(payload)
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name is required")

    if data.createdBy and data.createdBy != user_id:
        raise HTTPException(
            status_code=403,
            detail="createdBy must match the logged-in user",
        )

    members = _valid_id_strings(data.members)
    if user_id not in members:
        members.append(user_id)

    if len(members) < 2:
        raise HTTPException(
            status_code=400,
            detail="A group needs at least one other member",
        )

    existing_users = await db.users.find(
        {"_id": {"$in": [ObjectId(m) for m in members]}}
    ).to_list(None)
    if len(existing_users) != len(members):
        raise HTTPException(status_code=400, detail="One or more members do not exist")

    group = {
        "name": name,
        "members": members,
        "groupImage": data.groupImage or "",
        "createdBy": user_id,
        "admins": [user_id],
        "createdAt": datetime.now(timezone.utc),
    }

    result = await db.groups.insert_one(group)
    serialized_members = await _serialize_members(members)

    return {
        "groupId": str(result.inserted_id),
        "group": _serialize_group(
            {**group, "_id": result.inserted_id},
            serialized_members,
        ),
    }


@router.get("/user/{user_id}")
async def get_user_group(
    user_id: str,
    payload: dict = Depends(verify_token),
):
    current_user_id = _user_id_from_token(payload)
    if user_id != current_user_id:
        raise HTTPException(
            status_code=403,
            detail="You can only fetch your own groups",
        )

    groups = await db.groups.find({"members": current_user_id, "isDeleted": {"$ne": True}}).to_list(None)

    result = []
    for group in groups:
        members = await _serialize_members(group.get("members", []))
        result.append(_serialize_group(group, members))

    return result


@router.post("/{group_id}/members")
async def add_group_members(group_id: str, data: AddMembersRequest, payload: dict = Depends(verify_token)):
    current_user_id = _user_id_from_token(payload)
    group = await _get_group_or_404(group_id)
    _require_member(group, current_user_id)
    _require_admin(group, current_user_id)
    new_ids = _valid_id_strings(data.memberIds)
    old_members = list(group.get("members", []))
    to_add = [member_id for member_id in new_ids if member_id not in old_members]
    if not to_add:
        return _serialize_group(group, await _serialize_members(old_members))
    users = await db.users.find({"_id": {"$in": [ObjectId(member_id) for member_id in to_add]}}).to_list(None)
    if len(users) != len(to_add):
        raise HTTPException(status_code=400, detail="One or more members do not exist")
    await db.groups.update_one({"_id": group["_id"], "isDeleted": {"$ne": True}}, {"$addToSet": {"members": {"$each": to_add}}})
    updated = await _get_group_or_404(group_id)
    await _broadcast_group_change(group_id, old_members, updated, {
        "event": "member_added", "memberIds": to_add, "actorId": current_user_id,
        "message": "A member was added to the group.",
    })
    return _serialize_group(updated, await _serialize_members(updated.get("members", [])))


async def _change_group_membership(group_id: str, actor_id: str, member_id: str) -> dict:
    group = await _get_group_or_404(group_id)
    _require_member(group, actor_id)
    _as_object_id(member_id, "member id")
    is_self_leave = actor_id == member_id
    if not is_self_leave:
        _require_admin(group, actor_id)
    old_members = list(group.get("members", []))
    if member_id not in old_members:
        raise HTTPException(status_code=404, detail="User is not a group member")
    member = await db.users.find_one({"_id": ObjectId(member_id)}, {"name": 1})
    remaining = [item for item in old_members if item != member_id]
    admins = [item for item in _admin_ids(group) if item != member_id and item in remaining]
    if remaining and not admins:
        admins = [remaining[0]]
    created_by = group.get("createdBy")
    if created_by not in remaining:
        created_by = admins[0] if admins else None
    changes = {"members": remaining, "admins": admins, "createdBy": created_by}
    if not remaining:
        changes.update({"isDeleted": True, "deletedAt": datetime.now(timezone.utc)})
    await db.groups.update_one({"_id": group["_id"], "isDeleted": {"$ne": True}, "members": member_id}, {"$set": changes})
    updated = await db.groups.find_one({"_id": group["_id"]})
    if not updated:
        raise HTTPException(status_code=404, detail="Group not found")
    action = "member_left" if is_self_leave else "member_removed"
    await _broadcast_group_change(group_id, old_members, updated, {
        "event": action, "memberId": member_id,
        "memberName": member.get("name", "A member") if member else "A member",
        "actorId": actor_id,
        "message": f"{member.get('name', 'A member') if member else 'A member'} {'left the group' if is_self_leave else 'was removed from the group'}.",
    })
    if updated.get("isDeleted"):
        deletion = json.dumps({"type": "group_deleted", "groupId": group_id, "deletedBy": actor_id})
        await manager.broadcast_room(group_id, deletion)
        for user_id in old_members:
            await manager.send_personal_message(user_id, deletion)
        await manager.disconnect_group_room(group_id)
    else:
        await manager.disconnect_group_user(group_id, member_id)
    return _serialize_group(updated, await _serialize_members(updated.get("members", [])))


@router.delete("/{group_id}/members/me")
async def leave_group(group_id: str, payload: dict = Depends(verify_token)):
    current_user_id = _user_id_from_token(payload)
    return await _change_group_membership(group_id, current_user_id, current_user_id)


@router.delete("/{group_id}/members/{member_id}")
async def remove_group_member(group_id: str, member_id: str, payload: dict = Depends(verify_token)):
    current_user_id = _user_id_from_token(payload)
    return await _change_group_membership(group_id, current_user_id, member_id)


@router.delete("/{group_id}")
async def delete_group(group_id: str, payload: dict = Depends(verify_token)):
    current_user_id = _user_id_from_token(payload)
    group = await _get_group_or_404(group_id)
    _require_member(group, current_user_id)
    _require_admin(group, current_user_id)
    now = datetime.now(timezone.utc)
    result = await db.groups.update_one({"_id": group["_id"], "isDeleted": {"$ne": True}}, {"$set": {"isDeleted": True, "deletedAt": now, "deletedBy": current_user_id}})
    if not result.modified_count:
        raise HTTPException(status_code=404, detail="Group not found")
    event = json.dumps({"type": "group_deleted", "groupId": group_id, "deletedBy": current_user_id})
    await manager.broadcast_room(group_id, event)
    for member_id in group.get("members", []):
        await manager.send_personal_message(member_id, event)
    await manager.disconnect_group_room(group_id)
    return {"id": group_id, "deleted": True}


@router.get("/messages/{groupId}")
async def get_group_messages(
    groupId: str,
    payload: dict = Depends(verify_token),
):
    current_user_id = _user_id_from_token(payload)
    group = await _get_group_or_404(groupId)
    _require_member(group, current_user_id)

    messages = await db.group_messages.find(
        {
            "$or": [
                {"groupId": groupId},
                {"roomId": groupId},
            ]
        }
    ).sort("createdAt", 1).to_list(None)

    return [_serialize_group_message(msg) for msg in messages]


@router.post("/{group_id}/messages")
async def send_group_message(
    group_id: str,
    data: SendGroupMessageRequest,
    payload: dict = Depends(verify_token),
):
    current_user_id = _user_id_from_token(payload)
    group = await _get_group_or_404(group_id)
    _require_member(group, current_user_id)

    text = data.message.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    sender = await db.users.find_one({"_id": ObjectId(current_user_id)})
    now = datetime.now(timezone.utc)
    message_doc = {
        "groupId": group_id,
        "senderId": current_user_id,
        "senderName": sender.get("name", "") if sender else "",
        "message": text,
        "createdAt": now,
        "edited": False,
        "deleted": False,
        "status": "sent",
    }
    result = await db.group_messages.insert_one(message_doc)
    message_doc["_id"] = result.inserted_id
    return _serialize_group_message(message_doc)
