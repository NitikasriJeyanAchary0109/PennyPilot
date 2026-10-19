from datetime import datetime
from decimal import Decimal
from typing import Optional

from app.database import get_db
from app.middleware.auth_middleware import require_student
from app.models.models import Budget, Goal, Savings, Transaction, User
from app.services.rule_engine import calculate_roundup, savings_velocity, stress_score
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

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
    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.user_id,
            Transaction.is_deleted == False,
        )
        .all()
    )

    # Simple linear projection:
    # projected_roundup_savings = average_monthly_roundup × months
    # where average_monthly_roundup is estimated from the user's historical
    # transaction volume over all available transactions.
    monthly_roundup_total = Decimal("0.00")
    for tx in transactions:
        monthly_roundup_total += calculate_roundup(Decimal(str(tx.amount)))

    if transactions:
        avg_monthly_roundup = monthly_roundup_total / Decimal(len(transactions))
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
    budgets = (
        db.query(Budget)
        .filter(Budget.user_id == current_user.user_id, Budget.is_deleted == False)
        .all()
    )
    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.user_id,
            Transaction.is_deleted == False,
        )
        .all()
    )
    goals = (
        db.query(Goal)
        .filter(Goal.user_id == current_user.user_id, Goal.is_deleted == False)
        .all()
    )

    savings_records = (
        db.query(Savings).filter(Savings.user_id == current_user.user_id).all()
    )
    monthly_savings = savings_velocity(
        [Decimal(str(record.amount)) for record in savings_records],
        30,
    )

    spend_velocity = sum(
        (Decimal(str(tx.amount)) for tx in transactions if tx.type == "debit"),
        Decimal("0.00"),
    )
    budget_overruns = 0
    for budget in budgets:
        spent = sum(
            (
                Decimal(str(tx.amount))
                for tx in transactions
                if tx.category == budget.category and tx.type == "debit"
            ),
            Decimal("0.00"),
        )
        if spent > Decimal(str(budget.limit_amount)):
            budget_overruns += 1

    score = stress_score(monthly_savings, spend_velocity, budget_overruns)

    return {
        "stress_score": score,
        "monthly_savings": _money(monthly_savings),
        "monthly_spend": _money(spend_velocity),
        "budget_overruns": budget_overruns,
        "goal_count": len(goals),
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

    savings_records = (
        db.query(Savings).filter(Savings.user_id == current_user.user_id).all()
    )
    monthly_savings = savings_velocity(
        [Decimal(str(record.amount)) for record in savings_records], 30
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
