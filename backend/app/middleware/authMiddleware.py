from fastapi import Header, HTTPException
from jose import jwt

SECRET_KEY = "SECRET123"

ALGORITHM = "HS256"

async def verify_token(
    authorization: str = Header(None)
):

    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Token missing"
        )

    parts = authorization.split(" ")
    if len(parts) != 2:
        raise HTTPException(status_code=401, detail="Invalid auth header")
    token = parts[1]

    try:

        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        return payload

    except:
        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )