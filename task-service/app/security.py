import uuid

import jwt
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user_id(credentials: HTTPAuthorizationCredentials | None) -> uuid.UUID:
    """Verify the access JWT locally. This service does not call auth and does not see refresh tokens.

    The helper is copied, not imported, so the two services stay independent.
    A refresh token is an opaque string, so it fails this check and cannot be used here.
    With a shared HMAC secret this service could also sign a token. This project accepts that.
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        # Pin the algorithm so "none" and other algorithms are rejected.
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"])
        return uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token") from None
