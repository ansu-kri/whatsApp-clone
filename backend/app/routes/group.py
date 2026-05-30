from fastapi import APIRouter
from app.database import db

router = APIRouter()

@router.post("/create")
async def create_group(data:dict):

    group = {
        "name": data["name"],
        "members": data["members"],
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

    return [
        {
            "id": str(group["_id"]),
            "name": group["name"],
            "members": group["members"],
            "groupImage": group.get("groupImage")
        }
        for group in groups
    ]