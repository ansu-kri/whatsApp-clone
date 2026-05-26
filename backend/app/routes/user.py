from fastapi import APIRouter, Depends
from app.utils.security import oauth2_scheme
from app.utils.jwt import SECRET_KEY, ALGORITHM
from jose import jwt
from bson import ObjectId
from app.database import db

router = APIRouter()

@router.get("/me")
async def get_me(token: str = Depends(oauth2_scheme)):

    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

    user_id = payload["user_id"]

    current_user = await db.users.find_one({
        "_id": ObjectId(user_id)
    })

    return {
        "id": str(current_user["_id"]),
        "name": current_user["name"],
        "email": current_user["email"],
        "avatar": current_user.get("avatar"),
        "createdAt": (
            current_user["createdAt"].isoformat()
            if "createdAt" in current_user
            else None
        )
    }

# //Get all users
@router.get("/")
async def get_users(token: str = Depends(oauth2_scheme)):

    try:

        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        current_user_id = payload["user_id"]

        users = []

        cursor = db.users.find({
            "_id": {
                "$ne": ObjectId(current_user_id)
            }
        })

        async for user in cursor:

            users.append({
                "id": str(user["_id"]),
                "name": user["name"],
                "email": user["email"],
                "lastSeen": (
                    user["lastSeen"].isoformat()
                    if user.get("lastSeen")
                    else None
                )
            })

        return users

    except Exception as e:
        return {
            "error": str(e)
        }