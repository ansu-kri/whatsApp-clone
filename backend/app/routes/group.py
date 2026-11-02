from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.database import db
from app.middleware.authMiddleware import verify_token

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
    group = await db.groups.find_one({"_id": _as_object_id(group_id, "group id")})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


def _require_member(group: dict, user_id: str) -> None:
    if user_id not in group.get("members", []):
        raise HTTPException(
            status_code=403,
            detail="You are not a member of this group",
        )


def _serialize_group(group: dict, members: List[dict]) -> dict:
    return {
        "id": str(group["_id"]),
        "name": group.get("name", ""),
        "groupImage": group.get("groupImage") or "",
        "createdBy": group.get("createdBy"),
        "members": members,
    }


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

    groups = await db.groups.find({"members": current_user_id}).to_list(None)

    result = []
    for group in groups:
        members = await _serialize_members(group.get("members", []))
        result.append(_serialize_group(group, members))

    return result


@router.post("/{group_id}/members")
async def add_group_members(
    group_id: str,
    data: AddMembersRequest,
    payload: dict = Depends(verify_token),
):
    current_user_id = _user_id_from_token(payload)
    group = await _get_group_or_404(group_id)
    _require_member(group, current_user_id)

    if group.get("createdBy") != current_user_id:
        raise HTTPException(
            status_code=403,
            detail="Only the group creator can add members",
        )

    new_ids = _valid_id_strings(data.memberIds)
    existing = set(group.get("members", []))
    to_add = [member_id for member_id in new_ids if member_id not in existing]

    if not to_add:
        members = await _serialize_members(group.get("members", []))
        return _serialize_group(group, members)

    users = await db.users.find(
        {"_id": {"$in": [ObjectId(m) for m in to_add]}}
    ).to_list(None)
    if len(users) != len(to_add):
        raise HTTPException(status_code=400, detail="One or more members do not exist")

    await db.groups.update_one(
        {"_id": group["_id"]},
        {"$addToSet": {"members": {"$each": to_add}}},
    )

    updated = await _get_group_or_404(group_id)
    members = await _serialize_members(updated.get("members", []))
    return _serialize_group(updated, members)


@router.delete("/{group_id}/members/{member_id}")
async def remove_group_member(
    group_id: str,
    member_id: str,
    payload: dict = Depends(verify_token),
):
    current_user_id = _user_id_from_token(payload)
    group = await _get_group_or_404(group_id)
    _require_member(group, current_user_id)
    _as_object_id(member_id, "member id")

    creator_id = group.get("createdBy")
    is_creator = current_user_id == creator_id
    is_leaving = current_user_id == member_id

    if not is_creator and not is_leaving:
        raise HTTPException(
            status_code=403,
            detail="Only the group creator can remove other members",
        )

    if member_id not in group.get("members", []):
        raise HTTPException(status_code=404, detail="User is not a group member")

    if member_id == creator_id and len(group.get("members", [])) > 1 and not is_leaving:
        raise HTTPException(
            status_code=400,
            detail="The group creator cannot be removed while other members remain",
        )

    await db.groups.update_one(
        {"_id": group["_id"]},
        {"$pull": {"members": member_id}},
    )

    updated = await db.groups.find_one({"_id": group["_id"]})
    if not updated or not updated.get("members"):
        return {"id": group_id, "removed": True, "members": []}

    members = await _serialize_members(updated.get("members", []))
    return _serialize_group(updated, members)


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
