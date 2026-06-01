from fastapi import APIRouter
from app.database import db
from bson import ObjectId

router = APIRouter()

@router.post("/create")
async def create_group(data:dict):

    user_id = data["createdBy"] 

    members = data["members"]

    if user_id not in members:
        members.append(user_id)

    group = {
        "name": data["name"],
        "members": members,
        "groupImage": data.get(
            "groupImage"
        )
    }

    result = await db.groups.insert_one(group)

    return {
        "groupId": str(result.inserted_id)
    }

@router.get("/{user_id}")
async def get_user_group(user_id: str):
    
    groups = await db.groups.find({
        "members": user_id
    }).to_list(None)

    result =[]

    for group in groups:
        members = await db.users.find({
            "_id": {"$in": [ObjectId(m) for m in group["members"]]}
        }).to_list(None)

        result.append({
            "id": str(group["_id"]),
            "name": group["name"],
            "groupImage": group.get("groupImage"),
            "members": [
                {
                    "id": str(m["_id"]),
                    "name": m["name"],
                    "avatar": m.get("avatar")
                }
                for m in members
            ]
        })
    
    return result