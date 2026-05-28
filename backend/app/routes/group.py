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