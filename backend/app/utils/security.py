import hashlib
import secrets
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


def decode_token(token: str, verify_exp: bool = True):
    """
    Decode any valid JWT token.
    Returns payload if valid, otherwise None.

    `verify_exp=False` still verifies the signature; it is only for actions that
    must work with an expired access token, such as logging out.
    """
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": verify_exp},
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
# Opaque refresh tokens
# =====================================


def generate_refresh_token() -> str:
    """Random, unguessable refresh token (the server only stores its hash)."""
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    """SHA-256 is enough for a 384-bit random secret (no need for bcrypt)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# =====================================
# Token Validation
# =====================================


def is_access_token(payload: dict):
    return payload.get("type") == "access"


def is_refresh_token(payload: dict):
    return payload.get("type") == "refresh"
