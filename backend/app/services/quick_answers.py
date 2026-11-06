"""
Instant answers for the questions students ask most.

"How much have I saved?", "How is my goal going?", "Which budgets am I close to?"
and "What subscriptions do I have?" don't need a language model: the answer is a
handful of figures the backend already computes. Answering them directly is
instant (the local model can take 20–40 s on a modest machine) and can't
hallucinate, because every number comes straight from the database.

Matching is deliberately conservative. A question with a qualifier — a month, a
merchant ("on Swiggy"), a period ("last week"), a request for advice ("how can I
reach it faster?") — is NOT answered here, because a canned answer would quietly
ignore the qualifier. Those go to the model as before.
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Optional

from app.models.models import Budget, Goal, Savings, User
from app.services.ledger import (
    calculate_spent_amount,
    recent_savings_amounts,
)
from app.services.rule_engine import (
    GOAL_UNREACHABLE_DATE,
    budget_status,
    goal_forecast,
    savings_summary,
    savings_velocity,
)
from sqlalchemy.orm import Session

MAX_QUESTION_LENGTH = 100

_MONTHS = (
    "january february march april may june july august september october "
    "november december jan feb mar apr jun jul aug sep sept oct nov dec"
).split()
# Anything that narrows the question beyond "overall, right now".
_QUALIFIER = re.compile(
    r"\b("
    + "|".join(_MONTHS)
    + r"|last|past|previous|yesterday|today|week|weekly|year|"
    r"since|between|before|after|for|toward|towards|compared|vs|versus)\b|\b(on|at) \w+|\d",
    re.IGNORECASE,
)
# A request for guidance, not a status report.
_ADVICE = re.compile(
    r"\b(tips?|advice|ways?|suggest\w*|recommend\w*|improve|faster|sooner|should i|"
    r"how (can|could|do|to|should)|help me|what if|why)\b",
    re.IGNORECASE,
)

_SAVED = re.compile(
    r"\b(how much|what)\b.{0,30}\b(saved|savings)\b|\btotal (saved|savings)\b|\bmy savings\b",
    re.IGNORECASE,
)
_GOAL = re.compile(
    r"\bgoals?\b.*\b(going|doing|progress|status|close|reach|done|far)\b|"
    r"\b(progress|status|how far|how close)\b.*\bgoals?\b|\bwhen will i (reach|hit|finish)\b",
    re.IGNORECASE,
)
_BUDGET = re.compile(
    r"\bbudgets?\b.*\b(left|remaining|status|over|exceed\w*|close|doing|going)\b|"
    r"\b(how am i|how are my|which)\b.*\bbudgets?\b",
    re.IGNORECASE,
)
_SUBSCRIPTIONS = re.compile(
    r"\b(what|which|how many|how much|list|do i have|am i paying)\b.*\bsubscriptions?\b|"
    r"\bmy subscriptions?\b",
    re.IGNORECASE,
)


def detect_intent(message: str) -> Optional[str]:
    """Which instant answer applies to `message`, or None (ask the model)."""
    text = message.strip()
    if not text or len(text) > MAX_QUESTION_LENGTH:
        return None
    if _QUALIFIER.search(text) or _ADVICE.search(text):
        return None
    for intent, pattern in (
        ("saved", _SAVED),
        ("goals", _GOAL),
        ("budgets", _BUDGET),
        ("subscriptions", _SUBSCRIPTIONS),
    ):
        if pattern.search(text):
            return intent
    return None


def _rupees(value) -> str:
    return f"₹{Decimal(str(value)):,.2f}"


def _answer_saved(db: Session, user: User) -> str:
    rows = db.query(Savings).filter(Savings.user_id == user.user_id).all()
    summary = savings_summary(rows)
    if not rows:
        return (
            "You haven't saved anything yet. Round-ups start with your next "
            "purchase, and you can add money to a goal yourself at any time."
        )
    return (
        f"You've saved {_rupees(summary['total_saved'])} in total, "
        f"{_rupees(summary['saved_this_month'])} of it this month. "
        f"{_rupees(summary['saved_via_roundup'])} came from round-ups and "
        f"{_rupees(summary['saved_via_manual'])} from deposits you made."
    )


def _answer_goals(db: Session, user: User) -> str:
    goals = (
        db.query(Goal)
        .filter(
            Goal.user_id == user.user_id,
            Goal.status == "active",
            Goal.is_deleted == False,
        )
        .order_by(Goal.created_at.asc(), Goal.id.asc())
        .limit(3)
        .all()
    )
    if not goals:
        return "You don't have an active goal yet. Create one from the Goals tab."

    lines = []
    for goal in goals:
        target = Decimal(str(goal.target_amount))
        saved = Decimal(str(goal.current_amount))
        percent = (saved / target * 100).quantize(Decimal("0.1")) if target > 0 else 0
        velocity = savings_velocity(
            recent_savings_amounts(db, user.user_id, 30, goal_id=goal.id), 30
        )
        date = goal_forecast(target, saved, velocity)
        if date is None or date >= GOAL_UNREACHABLE_DATE:
            when = "there isn't enough recent saving to project a finish date yet"
        else:
            when = f"at your current pace you'd finish around {date.strftime('%B %Y')}"
        lines.append(
            f"“{goal.title}”: {_rupees(saved)} of {_rupees(target)} ({percent}%) — {when}."
        )
    return "\n".join(lines)


_BUDGET_WORDS = {
    "safe": "on track",
    "warning": "getting close to the limit",
    "exceeded": "over the limit",
}


def _answer_budgets(db: Session, user: User) -> str:
    budgets = (
        db.query(Budget)
        .filter(Budget.user_id == user.user_id, Budget.is_deleted == False)
        .order_by(Budget.created_at.asc())
        .all()
    )
    if not budgets:
        return (
            "You haven't set any budgets yet. The Spending Habits screen can create "
            "them from your typical month in one tap."
        )
    lines = []
    for budget in budgets:
        limit = Decimal(str(budget.limit_amount))
        spent = calculate_spent_amount(
            db, user.user_id, budget.category, budget.period, budget.start_date
        )
        lines.append(
            f"{budget.category}: {_rupees(spent)} of {_rupees(limit)} this {budget.period.replace('ly', '')}"
            f" — {_BUDGET_WORDS[budget_status(limit, spent)]}."
        )
    return "\n".join(lines)


def _answer_subscriptions(db: Session, user: User) -> str:
    from app.routers.negotiator import _detect_subscriptions

    subs = _detect_subscriptions(user.user_id, db)
    if not subs:
        return (
            "I don't see any subscription charges in your transactions yet. "
            "Import a statement or log a payment and they'll show up."
        )
    monthly = sum((Decimal(str(s.amount)) for s in subs), Decimal("0"))
    listing = ", ".join(f"{s.name} {_rupees(s.amount)}" for s in subs)
    count = len(subs)
    return (
        f"I found {count} subscription{'s' if count != 1 else ''} in your transactions, "
        f"about {_rupees(monthly)} a month if each is monthly: {listing}."
    )


_ANSWERS = {
    "saved": _answer_saved,
    "goals": _answer_goals,
    "budgets": _answer_budgets,
    "subscriptions": _answer_subscriptions,
}


def quick_answer(db: Session, user: User, message: str) -> Optional[str]:
    """The instant answer for `message`, or None when the model should handle it."""
    intent = detect_intent(message)
    if intent is None:
        return None
    return _ANSWERS[intent](db, user)
