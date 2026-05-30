from fastapi import APIRouter, HTTPException,Depends
from fastapi.security import OAuth2PasswordRequestForm
from app.database import db
from passlib.context import CryptContext
from app.utils.jwt import create_access_token
from datetime import datetime, timezone
from bson import ObjectId
from app.middleware.authMiddleware import verify_token

router = APIRouter()

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

@router.post("/signup")
async def signup(data: dict):

    existing_user = await db.users.find_one({
        "email": data["email"]
    })

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already exists"
        )

    hashed_password = pwd_context.hash(
        data["password"]
    )

    user = {
        "name": data["name"],
        "email": data["email"],
        "password": hashed_password,
        "createdAt": datetime.now(timezone.utc),
        "avatar": ""
    }

    await db.users.insert_one(user)

    return {
        "message": "User Created"
    }

@router.post("/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends()
):

    user = await db.users.find_one({
        "email": form_data.username
    })

    if not user:
        raise HTTPException(
            status_code=400,
            detail="Invalid email"
        )

    verify_password = pwd_context.verify(
        form_data.password,
        user["password"]
    )

    if not verify_password:
        raise HTTPException(
            status_code=400,
            detail="Invalid password"
        )
    
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"isOnline": True}}
    )

    token = create_access_token({
        "user_id": str(user["_id"]),
        "email": user["email"]
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(user["_id"]),
            "name": user["name"],
            "createdAt": (
                user["createdAt"].isoformat()
                if "createdAt" in user
                else None
            )
        }
    }

# //Logout
@router.post("/logout") 
async def logout(current_user: dict = Depends(verify_token)):
    await db.users.update_one(
        {"_id": ObjectId(current_user["user_id"])},
        {
            "$set": {
                "isOnline": False,
                "lastSeen": datetime.now(timezone.utc)
            }
        }
    )
    return {"message": "Logged out successfully"}



    # @router.post("/login")
# async def login(data: dict):

#     user = await db.users.find_one({
#         "email": data["email"]
#     })

#     if not user:
#         raise HTTPException(
#             status_code=400,
#             detail="Invalid email"
#         )

#     verify_password = pwd_context.verify(
#         data["password"],
#         user["password"]
#     )

#     if not verify_password:
#         raise HTTPException(
#             status_code=400,
#             detail="Invalid password"
#         )

#     token = create_access_token({
#         "user_id": str(user["_id"]),
#         "email": user["email"]
#     })

#     return {
#         "token": token,
#         "user": {
#             "id": str(user["_id"]),
#             "name": user["name"],
#             "email": user["email"]
#         }
#     }