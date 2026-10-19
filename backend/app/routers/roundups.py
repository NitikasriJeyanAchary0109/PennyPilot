from decimal import Decimal
from typing import List

from app.database import get_db
from app.middleware.auth_middleware import require_student
from app.models.models import Savings, User
from app.schemas.schemas import SavingsResponse
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/roundups", tags=["Round-Ups"])


@router.get("/", response_model=List[SavingsResponse])
def get_roundup_history(
    current_user: User = Depends(require_student), db: Session = Depends(get_db)
):
    """
    Returns the student's complete automated micro-savings history.
    This reads from the Savings table where source is 'roundup'.
    """
    return (
        db.query(Savings)
        .filter(Savings.user_id == current_user.user_id, Savings.source == "roundup")
        .order_by(Savings.date.desc())
        .all()
    )


@router.get("/stats", response_model=dict)
def get_roundup_stats(
    current_user: User = Depends(require_student), db: Session = Depends(get_db)
):
    """
    Returns total accumulated savings and count of round-up triggers for the student.
    """
    stats = (
        db.query(
            func.sum(Savings.amount).label("total_saved"),
            func.count(Savings.save_id).label("count_transactions"),
        )
        .filter(Savings.user_id == current_user.user_id, Savings.source == "roundup")
        .first()
    )

    total_saved = (
        stats.total_saved if stats.total_saved is not None else Decimal("0.00")
    )
    count_transactions = (
        stats.count_transactions if stats.count_transactions is not None else 0
    )

    return {
        "total_saved": total_saved,
        "roundup_transactions_count": count_transactions,
        "currency": "USD",
    }
