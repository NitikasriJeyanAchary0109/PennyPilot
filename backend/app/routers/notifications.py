from datetime import datetime
from typing import List

from app.database import get_db
from app.middleware.auth_middleware import require_student
from app.models.models import Notification, User
from app.schemas.schemas import NotificationResponse
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/", response_model=List[NotificationResponse])
def get_notifications(
    current_user: User = Depends(require_student), db: Session = Depends(get_db)
):
    """Retrieve all notifications for the authenticated student, sorted newest first."""
    notifications = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.user_id)
        .order_by(Notification.created_at.desc())
        .all()
    )
    return notifications


@router.patch("/{notif_id}/read", response_model=NotificationResponse)
def mark_notification_as_read(
    notif_id: int,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Mark a specific notification as read."""
    notification = (
        db.query(Notification)
        .filter(
            Notification.notif_id == notif_id,
            Notification.user_id == current_user.user_id,
        )
        .first()
    )
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found."
        )

    notification.status = "read"
    notification.read_at = datetime.utcnow()
    db.commit()
    db.refresh(notification)
    return notification
