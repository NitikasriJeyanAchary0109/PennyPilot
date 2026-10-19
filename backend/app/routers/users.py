from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.models import User
from app.schemas.schemas import UserResponse
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/users", tags=["Users"])


@router.patch("/me/onboarding-complete", response_model=UserResponse)
def complete_onboarding(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Persist completion so subsequent sign-ins bypass onboarding."""
    current_user.has_completed_onboarding = True
    db.commit()
    db.refresh(current_user)
    return current_user
