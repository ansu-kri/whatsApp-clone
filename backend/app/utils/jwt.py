from jose import jwt
from datetime import datetime, timedelta, timezone

SECRET_KEY = "SECRET123"

ALGORITHM = "HS256"

def create_access_token(data:dict):

    to_encode = data.copy()

    expire = datetime.now(timezone.utc) + timedelta(days=7)

    to_encode.update({
        "exp": expire
    })

    encoded_jwt = jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm = ALGORITHM
    )

    return encoded_jwt