from decimal import Decimal
from typing import Any, Dict, List

from app.database import get_db
from app.middleware.auth_middleware import require_educator
from app.models.models import ChatHistory, Goal, Transaction, User
from app.schemas.schemas import EducatorAnalyticsResponse
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/educator", tags=["Educator Analytics"])


@router.get("/analytics", response_model=EducatorAnalyticsResponse)
def get_educator_analytics(
    current_user: User = Depends(require_educator), db: Session = Depends(get_db)
):
    """
    Computes aggregated savings and transaction metrics across all students.
    Only accessible by users with the 'educator' role.
    """
    # Count total students
    total_students = (
        db.query(func.count(User.user_id)).filter(User.role == "student").scalar() or 0
    )

    # Sum savings across all students' goals
    total_savings = (
        db.query(func.sum(Goal.current_amount))
        .join(User, Goal.user_id == User.user_id)
        .filter(User.role == "student", Goal.is_deleted == False)
        .scalar()
    )
    total_savings = (
        Decimal(str(total_savings)) if total_savings is not None else Decimal("0.00")
    )

    # Calculate average savings
    average_savings = (
        total_savings / Decimal(str(total_students))
        if total_students > 0
        else Decimal("0.00")
    )

    # Count total student transactions processed
    total_txs = (
        db.query(func.count(Transaction.id))
        .join(User, Transaction.user_id == User.user_id)
        .filter(User.role == "student", Transaction.is_deleted == False)
        .scalar()
        or 0
    )

    # Retrieve recent AI insights / chat questions across all student accounts to observe literacy topics/trends
    recent_insights = (
        db.query(ChatHistory)
        .join(User, ChatHistory.user_id == User.user_id)
        .filter(User.role == "student")
        .order_by(ChatHistory.created_at.desc())
        .limit(5)
        .all()
    )

    return {
        "total_students": total_students,
        "total_savings": total_savings,
        "average_savings_per_student": average_savings,
        "total_transactions_processed": total_txs,
        "recent_insights": recent_insights,
    }


class EducatorOverviewResponse(BaseModel):
    total_students: int
    total_savings: Decimal
    average_savings_per_student: Decimal
    total_transactions_processed: int
    active_goals_count: int


@router.get("/overview", response_model=EducatorOverviewResponse)
def get_educator_overview(
    current_user: User = Depends(require_educator), db: Session = Depends(get_db)
):
    """Retrieves aggregated overview statistics across the entire cohort (no individual student details)."""
    total_students = (
        db.query(func.count(User.user_id)).filter(User.role == "student").scalar() or 0
    )
    total_savings = (
        db.query(func.sum(Goal.current_amount))
        .join(User, Goal.user_id == User.user_id)
        .filter(User.role == "student", Goal.is_deleted == False)
        .scalar()
    )
    total_savings = (
        Decimal(str(total_savings)) if total_savings is not None else Decimal("0.00")
    )
    average_savings = (
        total_savings / Decimal(str(total_students))
        if total_students > 0
        else Decimal("0.00")
    )
    total_txs = (
        db.query(func.count(Transaction.id))
        .join(User, Transaction.user_id == User.user_id)
        .filter(User.role == "student", Transaction.is_deleted == False)
        .scalar()
        or 0
    )
    active_goals = (
        db.query(func.count(Goal.id))
        .join(User, Goal.user_id == User.user_id)
        .filter(
            User.role == "student", Goal.status == "active", Goal.is_deleted == False
        )
        .scalar()
        or 0
    )

    return {
        "total_students": total_students,
        "total_savings": total_savings.quantize(Decimal("0.01")),
        "average_savings_per_student": average_savings.quantize(Decimal("0.01")),
        "total_transactions_processed": total_txs,
        "active_goals_count": active_goals,
    }


class EducatorTrendsResponse(BaseModel):
    total_student_messages_last_30_days: int
    top_categories_discussed: List[Dict[str, Any]]
    average_round_up_amount: Decimal


@router.get("/trends", response_model=EducatorTrendsResponse)
def get_educator_trends(
    current_user: User = Depends(require_educator), db: Session = Depends(get_db)
):
    """Retrieves aggregated cohort-wide trend data without displaying individual data points."""
    # Count chat messages from students
    total_messages = (
        db.query(func.count(ChatHistory.chat_id))
        .join(User, ChatHistory.user_id == User.user_id)
        .filter(User.role == "student")
        .scalar()
        or 0
    )

    # Aggregate top spending categories
    top_cats_query = (
        db.query(Transaction.category, func.count(Transaction.id))
        .join(User, Transaction.user_id == User.user_id)
        .filter(User.role == "student", Transaction.is_deleted == False)
        .group_by(Transaction.category)
        .order_by(func.count(Transaction.id).desc())
        .limit(5)
        .all()
    )

    top_categories = [{"category": row[0], "count": row[1]} for row in top_cats_query]

    # Calculate average round up
    avg_roundup = (
        db.query(func.avg(Transaction.round_up_amount))
        .join(User, Transaction.user_id == User.user_id)
        .filter(
            User.role == "student",
            Transaction.is_round_up_applied == True,
            Transaction.is_deleted == False,
        )
        .scalar()
    )
    avg_roundup = (
        Decimal(str(avg_roundup)) if avg_roundup is not None else Decimal("0.00")
    )

    return {
        "total_student_messages_last_30_days": total_messages,
        "top_categories_discussed": top_categories,
        "average_round_up_amount": avg_roundup.quantize(Decimal("0.01")),
    }
