from typing import List

from app.database import get_db
from app.models.models import User
from app.schemas.schemas import TokenData
from app.utils.security import decode_access_token
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

# OAuth2PasswordBearer extracts the bearer token from the Authorization header.
# Point it to the login path.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    """
    Decodes the JWT token to authenticate the user.
    Raises credentials exceptions if invalid, expired, or user not found.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    email: str = payload.get("sub")
    role: str = payload.get("role")
    user_id: int = payload.get("user_id")

    if email is None or role is None or user_id is None:
        raise credentials_exception

    token_data = TokenData(email=email, role=role, user_id=user_id)

    user = db.query(User).filter(User.user_id == token_data.user_id).first()
    if user is None:
        raise credentials_exception

    return user


class RoleChecker:
    """
    Dependency class to enforce role-based access control.
    Example usage: current_user: User = Depends(RoleChecker(["student"]))
    """

    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: one of {self.allowed_roles}",
            )
        return current_user


# Conveniences for common requirements
require_student = RoleChecker(["student"])
