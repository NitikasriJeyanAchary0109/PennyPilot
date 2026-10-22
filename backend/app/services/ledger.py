"""
Ledger helpers — DB-backed queries shared by several routers.

rule_engine.py stays free of database I/O; anything that needs to read the
user's transactions / savings / goals to feed a rule_engine function lives here.
Every figure returned is derived from the user's own rows — nothing is assumed
or simulated.
"""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import List, Optional, Tuple

from app.models.models import Budget, Goal, Notification, Savings, Transaction
from sqlalchemy import func
from sqlalchemy.orm import Session

VELOCITY_WINDOW_DAYS = 30

# Savings.source values that represent money the student actually set aside.
# "withdrawal" and "goal_reallocation" move existing savings around and must not
# count towards the savings rate.
SAVING_SOURCES = ("round_up", "manual", "transfer")


# ---------------------------------------------------------------------------
# Savings velocity inputs
# ---------------------------------------------------------------------------
def recent_savings_amounts(
    db: Session,
    user_id: int,
    days: int = VELOCITY_WINDOW_DAYS,
    goal_id: Optional[int] = None,
) -> List[Decimal]:
    """Individual positive savings deposits made in the last `days` days."""
    since = datetime.datetime.utcnow() - datetime.timedelta(days=days)
    query = db.query(Savings.amount).filter(
        Savings.user_id == user_id,
        Savings.created_at >= since,
        Savings.source.in_(SAVING_SOURCES),
        Savings.amount > 0,
    )
    if goal_id is not None:
        query = query.filter(Savings.goal_id == goal_id)
    return [Decimal(str(row[0])) for row in query.all()]


def recent_debit_total(
    db: Session, user_id: int, days: int = VELOCITY_WINDOW_DAYS
) -> Decimal:
    """Total debit spend in the last `days` days."""
    since = datetime.datetime.utcnow() - datetime.timedelta(days=days)
    total = (
        db.query(func.sum(Transaction.amount))
        .filter(
            Transaction.user_id == user_id,
            Transaction.is_deleted == False,
            Transaction.type == "debit",
            Transaction.transaction_date >= since,
        )
        .scalar()
    )
    return Decimal(str(total)) if total is not None else Decimal("0.00")


# ---------------------------------------------------------------------------
# Goals
# ---------------------------------------------------------------------------
def pick_roundup_goal(db: Session, user_id: int) -> Optional[Goal]:
    """The goal that receives round-ups: oldest active, non-deleted goal."""
    return (
        db.query(Goal)
        .filter(
            Goal.user_id == user_id,
            Goal.status == "active",
            Goal.is_deleted == False,
        )
        .order_by(Goal.created_at.asc(), Goal.id.asc())
        .first()
    )


def sync_goal_status(db: Session, goal: Goal) -> None:
    """Flip a goal between active/completed after its balance changed."""
    if goal.is_deleted or goal.status == "abandoned":
        return
    target = Decimal(str(goal.target_amount))
    current = Decimal(str(goal.current_amount))
    if goal.status == "active" and current >= target:
        goal.status = "completed"
        notify(
            db,
            goal.user_id,
            "goal_completed",
            "Goal reached 🎉",
            f"You've fully funded “{goal.title}”. Nice work!",
        )
    elif goal.status == "completed" and current < target:
        goal.status = "active"


# ---------------------------------------------------------------------------
# Checking-balance estimate for the round-up safety threshold
# ---------------------------------------------------------------------------
def estimate_checking_balance(db: Session, user_id: int) -> Optional[Decimal]:
    """
    Balance implied by the user's own records:
        credits − debits − money moved into savings.

    Returns None when the user has recorded no income at all — in that case the
    balance is simply unknown (no bank connection exists) and the caller must
    not pretend otherwise.
    """
    credit_count = (
        db.query(func.count(Transaction.id))
        .filter(
            Transaction.user_id == user_id,
            Transaction.is_deleted == False,
            Transaction.type == "credit",
        )
        .scalar()
    )
    if not credit_count:
        return None

    def _sum(query) -> Decimal:
        value = query.scalar()
        return Decimal(str(value)) if value is not None else Decimal("0.00")

    base = db.query(func.sum(Transaction.amount)).filter(
        Transaction.user_id == user_id, Transaction.is_deleted == False
    )
    credits = _sum(base.filter(Transaction.type == "credit"))
    debits = _sum(base.filter(Transaction.type == "debit"))
    saved = _sum(
        db.query(func.sum(Savings.amount)).filter(
            Savings.user_id == user_id,
            Savings.source.in_(SAVING_SOURCES + ("withdrawal",)),
        )
    )
    return credits - debits - saved


# ---------------------------------------------------------------------------
# Budgets
# ---------------------------------------------------------------------------
def get_period_bounds(
    period: str,
    anchor: Optional[datetime.datetime] = None,
    now: Optional[datetime.datetime] = None,
) -> Tuple[datetime.datetime, datetime.datetime]:
    """
    Bounds of the budget period that contains `now`.

    monthly → the calendar month containing `now`.
    weekly  → the 7-day window containing `now`, with windows anchored on the
              budget's start date.
    """
    if period not in {"weekly", "monthly"}:
        raise ValueError("period must be either weekly or monthly")

    now = now or datetime.datetime.utcnow()

    if period == "monthly":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        next_month = (start + datetime.timedelta(days=32)).replace(day=1)
        return start, next_month - datetime.timedelta(microseconds=1)

    anchor_day = (anchor or now).replace(hour=0, minute=0, second=0, microsecond=0)
    days_since = max((now.date() - anchor_day.date()).days, 0)
    start = anchor_day + datetime.timedelta(days=(days_since // 7) * 7)
    return start, start + datetime.timedelta(days=7) - datetime.timedelta(
        microseconds=1
    )


def calculate_spent_amount(
    db: Session,
    user_id: int,
    category: str,
    period: str,
    start_date: Optional[datetime.datetime] = None,
    now: Optional[datetime.datetime] = None,
) -> Decimal:
    """Debit spend in `category` during the current budget period."""
    start, end = get_period_bounds(period, start_date, now)
    total = (
        db.query(func.sum(Transaction.amount))
        .filter(
            Transaction.user_id == user_id,
            func.lower(Transaction.category) == category.strip().lower(),
            Transaction.type == "debit",
            Transaction.is_deleted == False,
            Transaction.transaction_date >= start,
            Transaction.transaction_date <= end,
        )
        .scalar()
    )
    return Decimal(str(total)) if total is not None else Decimal("0.00")


def check_budget_alert(db: Session, user_id: int, category: str) -> None:
    """Create a notification when a debit pushes a budget over its limit."""
    budget = (
        db.query(Budget)
        .filter(
            Budget.user_id == user_id,
            func.lower(Budget.category) == category.strip().lower(),
            Budget.is_deleted == False,
        )
        .first()
    )
    if not budget:
        return
    spent = calculate_spent_amount(
        db, user_id, budget.category, budget.period, budget.start_date
    )
    limit = Decimal(str(budget.limit_amount))
    if spent > limit:
        notify(
            db,
            user_id,
            "budget_exceeded",
            f"{budget.category} budget exceeded",
            f"You've spent ₹{spent:.2f} against your ₹{limit:.2f} "
            f"{budget.period} {budget.category} limit.",
        )


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
def notify(
    db: Session,
    user_id: int,
    notif_type: str,
    title: str,
    message: str,
) -> Optional[Notification]:
    """Persist a notification unless an identical unread one already exists."""
    duplicate = (
        db.query(Notification.notif_id)
        .filter(
            Notification.user_id == user_id,
            Notification.type == notif_type,
            Notification.title == title,
            Notification.message == message,
            Notification.status == "unread",
        )
        .first()
    )
    if duplicate:
        return None
    notification = Notification(
        user_id=user_id,
        type=notif_type,
        title=title,
        message=message,
        status="unread",
        created_at=datetime.datetime.utcnow(),
    )
    db.add(notification)
    db.commit()
    return notification
