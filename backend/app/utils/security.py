from datetime import datetime, timedelta
from typing import Optional
from uuid import uuid4

import bcrypt
from app.config import settings
from jose import JWTError, jwt

# =====================================
# Password Hashing
# =====================================


def get_password_hash(password: str) -> str:
    """Generate bcrypt hash."""
    pwd_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify bcrypt hash."""
    try:
        pwd_bytes = plain_password.encode("utf-8")[:72]
        return bcrypt.checkpw(pwd_bytes, hashed_password.encode("utf-8"))
    except Exception:
        return False


# =====================================
# Access Token
# =====================================


def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None,
):
    payload = data.copy()

    expire = (
        datetime.utcnow() + expires_delta
        if expires_delta
        else datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    payload.update(
        {
            "exp": expire,
            "jti": str(uuid4()),
            "type": "access",
        }
    )

    return jwt.encode(
        payload,
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


# =====================================
# Refresh Token
# =====================================


def create_refresh_token(data: dict):
    payload = data.copy()

    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    payload.update(
        {
            "exp": expire,
            "jti": str(uuid4()),
            "type": "refresh",
        }
    )

    return jwt.encode(
        payload,
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


# =====================================
# Decode JWT
# =====================================


def decode_token(token: str):
    """
    Decode any valid JWT token.
    Returns payload if valid, otherwise None.
    """
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError:
        return None


def decode_access_token(token: str):
    """
    Decode and validate an access token.
    Returns payload if valid access token, otherwise None.
    """
    payload = decode_token(token)

    if payload is None:
        return None

    if payload.get("type") != "access":
        return None

    return payload


def decode_refresh_token(token: str):
    """
    Decode and validate a refresh token.
    Returns payload if valid refresh token, otherwise None.
    """
    payload = decode_token(token)

    if payload is None:
        return None

    if payload.get("type") != "refresh":
        return None

    return payload


# =====================================
# Token Validation
# =====================================


def is_access_token(payload: dict):
    return payload.get("type") == "access"


def is_refresh_token(payload: dict):
    return payload.get("type") == "refresh"
