from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional

from app.database import get_db
from app.middleware.auth_middleware import require_student
from app.models.models import Budget, Goal, Savings, Transaction, User
from app.services.ledger import (
    calculate_spent_amount,
    recent_debit_total,
    recent_savings_amounts,
)
from app.services.rule_engine import savings_velocity, stress_score
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

# Round-up projections average the last few months of actual round-up deposits.
ROUNDUP_LOOKBACK_DAYS = 90

router = APIRouter(prefix="/calculations", tags=["Calculations"])


def _money(value: Decimal) -> str:
    return format(value.quantize(Decimal("0.01")), ".2f")


@router.get("/net-savings-rate")
def get_net_savings_rate(
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    query = db.query(Transaction).filter(
        Transaction.user_id == current_user.user_id,
        Transaction.is_deleted == False,
    )
    if start_date:
        query = query.filter(Transaction.transaction_date >= start_date)
    if end_date:
        query = query.filter(Transaction.transaction_date <= end_date)

    transactions = query.all()

    total_income = sum(
        (Decimal(str(tx.amount)) for tx in transactions if tx.type == "credit"),
        Decimal("0.00"),
    )
    total_spend = sum(
        (Decimal(str(tx.amount)) for tx in transactions if tx.type == "debit"),
        Decimal("0.00"),
    )

    savings_query = db.query(Savings).filter(Savings.user_id == current_user.user_id)
    if start_date:
        savings_query = savings_query.filter(Savings.created_at >= start_date)
    if end_date:
        savings_query = savings_query.filter(Savings.created_at <= end_date)
    savings_records = savings_query.all()
    total_saved = sum(
        (Decimal(str(record.amount)) for record in savings_records), Decimal("0.00")
    )

    if total_income > 0:
        net_savings_rate = total_saved / total_income
    elif total_spend > 0:
        net_savings_rate = total_saved / total_spend
    else:
        net_savings_rate = Decimal("0.00")

    return {
        "total_saved": _money(total_saved),
        "total_income": _money(total_income),
        "total_spend": _money(total_spend),
        "net_savings_rate": _money(net_savings_rate),
    }


@router.get("/round-up-projection")
def get_round_up_projection(
    months: int = Query(default=3, ge=1, le=24),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """
    Projects future round-up savings from the student's *actual* round-up
    deposits: average monthly round-up over the last 90 days (or since their
    first round-up, if that's more recent) × `months`.
    """
    now = datetime.utcnow()
    since = now - timedelta(days=ROUNDUP_LOOKBACK_DAYS)
    rows = (
        db.query(Savings.amount, Savings.created_at)
        .filter(
            Savings.user_id == current_user.user_id,
            Savings.source == "round_up",
            Savings.created_at >= since,
        )
        .all()
    )

    if rows:
        total = sum((Decimal(str(r[0])) for r in rows), Decimal("0.00"))
        first = min(r[1] for r in rows)
        observed_days = max((now - first).days, 1)
        months_observed = max(Decimal(observed_days) / Decimal("30"), Decimal("1"))
        avg_monthly_roundup = total / months_observed
    else:
        avg_monthly_roundup = Decimal("0.00")

    projected = avg_monthly_roundup * Decimal(months)

    return {
        "months": months,
        "average_monthly_roundup": _money(avg_monthly_roundup),
        "projected_roundup_savings": _money(projected),
    }


@router.get("/stress-score")
def get_stress_score(
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Stress score from the last 30 days of savings, spending and budgets."""
    budgets = (
        db.query(Budget)
        .filter(Budget.user_id == current_user.user_id, Budget.is_deleted == False)
        .all()
    )
    goal_count = (
        db.query(func.count(Goal.id))
        .filter(Goal.user_id == current_user.user_id, Goal.is_deleted == False)
        .scalar()
    )

    monthly_savings = savings_velocity(
        recent_savings_amounts(db, current_user.user_id, 30), 30
    )
    monthly_spend = recent_debit_total(db, current_user.user_id, 30)

    budget_overruns = 0
    for budget in budgets:
        spent = calculate_spent_amount(
            db,
            current_user.user_id,
            budget.category,
            budget.period,
            budget.start_date,
        )
        if spent > Decimal(str(budget.limit_amount)):
            budget_overruns += 1

    score = stress_score(monthly_savings, monthly_spend, budget_overruns)

    return {
        "stress_score": score,
        "monthly_savings": _money(monthly_savings),
        "monthly_spend": _money(monthly_spend),
        "budget_overruns": budget_overruns,
        "goal_count": goal_count,
    }


@router.get("/goal-feasibility/{goal_id}")
def get_goal_feasibility(
    goal_id: int,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    goal = (
        db.query(Goal)
        .filter(
            Goal.id == goal_id,
            Goal.user_id == current_user.user_id,
            Goal.is_deleted == False,
        )
        .first()
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    if not goal.target_date:
        raise HTTPException(status_code=400, detail="Goal target_date is required")

    monthly_savings = savings_velocity(
        recent_savings_amounts(db, current_user.user_id, 30, goal_id=goal.id), 30
    )

    remaining = Decimal(str(goal.target_amount)) - Decimal(str(goal.current_amount))
    if remaining <= Decimal("0"):
        return {
            "goal_id": goal.id,
            "status": "ahead",
            "required_weekly_savings": "0.00",
            "remaining_amount": _money(remaining),
        }

    days_remaining = (goal.target_date.date() - datetime.utcnow().date()).days
    if days_remaining <= 0:
        required_weekly_savings = remaining
    else:
        required_weekly_savings = remaining / Decimal(days_remaining // 7 or 1)

    if monthly_savings > Decimal("0"):
        weekly_rate = monthly_savings / Decimal("4.33")
    else:
        weekly_rate = Decimal("0.00")

    if weekly_rate >= required_weekly_savings:
        status = "ahead"
    elif weekly_rate + Decimal("0.01") >= required_weekly_savings:
        status = "on-track"
    else:
        status = "behind"

    return {
        "goal_id": goal.id,
        "status": status,
        "required_weekly_savings": _money(required_weekly_savings),
        "remaining_amount": _money(remaining),
        "current_weekly_savings_rate": _money(weekly_rate),
    }
