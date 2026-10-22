"""
Negotiator Router — POST /negotiator/evaluate

Asks "should I make this purchase?" by combining rule-engine budget/goal math
with an LLM explanation, then persisting the recommendation.

Architecture contract
---------------------
- Rule Engine FIRST: budget_status() and goal_impact() are computed before any
  AI call. The LLM only narrates numbers it receives — it never calculates them.
- On AIEngineError the endpoint raises HTTP 503. No mocked/fallback advice.
- READS from Goal, Budget, FinancialHealth, Savings tables (read-only).
- WRITES only to the recommendations store (see persistence note below).

Persistence note
----------------
The existing AIRecommendation ORM model requires a budget_id FK (Budget table),
so it cannot be written directly by user_id alone without a prior Budget row.

# TODO: confirm with Member 1 — we need either:
#   (a) A new standalone NegotiatorLog table  (user_id, rec_type, input_json, response, created_at)
#   (b) Or relax the budget_id FK to nullable on AIRecommendation
# Until then, recommendations are persisted to ChatHistory (same user_id link,
# already proven working) with a "negotiator:" prefix so they're queryable.
"""

from __future__ import annotations

import datetime
import logging
from decimal import Decimal
from typing import Literal, Optional

from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.models import (
    AIRecommendation,
    Budget,
    Goal,
    Transaction,
    User,
)
from app.services.ai_engine import AIEngineError, call_llama
from app.services.ledger import calculate_spent_amount, recent_savings_amounts
from app.services.rule_engine import (
    GOAL_UNREACHABLE_DATE,
    goal_forecast,
    savings_velocity,
)
from app.services.rule_engine import (
    budget_status as compute_budget_status,
)
from app.utils.prompts import negotiator_prompt, pause_subscription_prompt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

logger = logging.getLogger("pennypilot.negotiator")

router = APIRouter(prefix="/negotiator", tags=["AI Negotiator"])

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class EvaluateRequest(BaseModel):
    """Request body for POST /negotiator/evaluate."""

    price: Decimal = Field(
        ...,
        gt=0,
        description="Purchase price in INR. Must be positive.",
    )
    category: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Spending category, e.g. 'Electronics', 'Food'.",
    )
    description: str = Field(
        ...,
        min_length=1,
        max_length=300,
        description="Item or merchant name, e.g. 'boAt Airdopes 141'.",
    )
    kind: Literal["purchase", "pause"] = Field(
        "purchase",
        description=(
            "'purchase' evaluates spending `price` once; 'pause' evaluates "
            "redirecting a monthly subscription of `price` into savings."
        ),
    )


class EvaluateResponse(BaseModel):
    """Response for POST /negotiator/evaluate."""

    advice: str = Field(..., description="LLM-generated purchase advice.")
    budget_status: str = Field(
        ..., description="'safe' | 'warning' | 'exceeded' | 'no_budget'"
    )
    goal_impact: str = Field(..., description="Plain-text estimate of goal delay.")


class SubscriptionItem(BaseModel):
    id: str
    name: str
    merchant: str
    amount: Decimal
    billing_date: str
    last_charged: datetime.date
    category: str
    pausable: bool = True
    status: str = "active"
    auto_tracked: bool = True
    annual_cost: Decimal


class SyncSubscriptionsResponse(BaseModel):
    message: str
    synced_count: int
    subscriptions: list[SubscriptionItem]


# Merchants recognised as subscriptions when they appear in the student's own
# transactions. These are matchers only — no amounts or dates are assumed.
KNOWN_SUBSCRIPTIONS = [
    {"id": "sub-spotify", "name": "Spotify Premium", "merchant": "Spotify"},
    {"id": "sub-amazon", "name": "Amazon Prime", "merchant": "Amazon Prime"},
    {"id": "sub-netflix", "name": "Netflix", "merchant": "Netflix"},
    {"id": "sub-youtube", "name": "YouTube Premium", "merchant": "YouTube"},
    {"id": "sub-hotstar", "name": "Disney+ Hotstar", "merchant": "Hotstar"},
]


# ---------------------------------------------------------------------------
# Helper — compute goal impact string (pure, called before AI)
# ---------------------------------------------------------------------------


def _primary_goal(user_id: int, db: Session) -> Optional[Goal]:
    """The active goal with the highest saved amount (most progressed)."""
    goals = (
        db.query(Goal)
        .filter(
            Goal.user_id == user_id,
            Goal.status == "active",
            Goal.is_deleted == False,
        )
        .all()
    )
    if not goals:
        return None
    return max(goals, key=lambda g: Decimal(str(g.current_amount)))


def _compute_goal_impact(
    price: Decimal,
    user_id: int,
    db: Session,
) -> str:
    """
    Compute a plain-text description of how `price` would delay the user's
    most-progressed active goal, using rule_engine functions.

    Returns a human-readable string like "delays 'Laptop' goal by ~12 days"
    or "no active goals set" — suitable for insertion directly into the prompt.
    """
    # Fetch primary goal (highest progress ratio — most emotionally salient)
    primary_goal = _primary_goal(user_id, db)
    if primary_goal is None:
        return "no active savings goals set"

    # Last-30-days savings velocity
    velocity = savings_velocity(recent_savings_amounts(db, user_id, 30), 30)

    target = Decimal(str(primary_goal.target_amount))
    current = Decimal(str(primary_goal.current_amount))

    # Current forecast
    current_date = goal_forecast(target, current, velocity)

    # Hypothetical forecast if money were spent instead of saved
    # (i.e. the purchase removes `price` from current savings)
    hypothetical_saved = max(current - price, Decimal("0"))
    new_date = goal_forecast(target, hypothetical_saved, velocity)

    # Format impact
    goal_name = primary_goal.title

    if current_date >= datetime.date(9999, 1, 1):
        # Already unreachable — spending doesn't make it worse in a meaningful way
        return f"'{goal_name}' goal has no projected date yet (savings rate too low)"

    if new_date >= datetime.date(9999, 1, 1):
        return (
            f"spending ₹{price:.0f} would deplete savings and make "
            f"'{goal_name}' goal unreachable at current velocity"
        )

    delay_days = (new_date - current_date).days
    if delay_days <= 0:
        return f"no meaningful delay to '{goal_name}' goal (purchase is small relative to savings)"

    if delay_days < 30:
        return f"delays '{goal_name}' goal by ~{delay_days} day{'s' if delay_days != 1 else ''}"
    else:
        delay_months = round(delay_days / 30, 1)
        return f"delays '{goal_name}' goal by ~{delay_months} month{'s' if delay_months != 1.0 else ''}"


# ---------------------------------------------------------------------------
# Helper — compute budget status for the purchase category
# ---------------------------------------------------------------------------


def _compute_budget_status(
    price: Decimal,
    category: str,
    user_id: int,
    db: Session,
    include_price: bool = True,
) -> str:
    """
    Look up the Budget row for this category for the user and compute status,
    including this hypothetical purchase when `include_price` is set.

    Returns "no_budget" when the student has no budget for the category — an
    absent budget is not the same thing as a healthy one.
    """
    budget_row: Optional[Budget] = (
        db.query(Budget)
        .filter(
            Budget.user_id == user_id,
            func.lower(Budget.category) == category.strip().lower(),
            Budget.is_deleted == False,
        )
        .first()
    )
    if not budget_row:
        return "no_budget"

    spent = calculate_spent_amount(
        db, user_id, budget_row.category, budget_row.period, budget_row.start_date
    )
    projected_spent = spent + price if include_price else spent
    limit = Decimal(str(budget_row.limit_amount))

    return compute_budget_status(limit, projected_spent)


def _compute_pause_impact(monthly_amount: Decimal, user_id: int, db: Session) -> str:
    """
    How much sooner the primary goal is reached if `monthly_amount` is
    redirected into savings every month. Both dates come from rule_engine.
    """
    goal = _primary_goal(user_id, db)
    if goal is None:
        return "no active savings goals set, so there is no goal to speed up"

    velocity = savings_velocity(recent_savings_amounts(db, user_id, 30), 30)
    target = Decimal(str(goal.target_amount))
    current = Decimal(str(goal.current_amount))

    base_date = goal_forecast(target, current, velocity)
    new_date = goal_forecast(target, current, velocity + monthly_amount)

    if new_date is None or new_date >= GOAL_UNREACHABLE_DATE:
        return f"'{goal.title}' goal still has no projected date"
    if base_date is None or base_date >= GOAL_UNREACHABLE_DATE:
        return (
            f"'{goal.title}' goal currently has no projected date; redirecting "
            f"₹{monthly_amount:.0f}/month would give it one: "
            f"{new_date.strftime('%B %Y')}"
        )
    days_sooner = (base_date - new_date).days
    if days_sooner <= 0:
        return f"no meaningful change to the '{goal.title}' goal date"
    return (
        f"reaches '{goal.title}' goal about {days_sooner} day"
        f"{'s' if days_sooner != 1 else ''} sooner"
    )


# ---------------------------------------------------------------------------
# POST /api/negotiator/evaluate
# ---------------------------------------------------------------------------


@router.post(
    "/evaluate",
    response_model=EvaluateResponse,
    status_code=status.HTTP_200_OK,
    summary="Evaluate a potential purchase",
    description=(
        "Given a price, category, and description, returns LLM-generated "
        "advice on whether the student should make the purchase, informed by "
        "their current budget status and the delay it would cause to their "
        "active savings goal."
    ),
)
async def evaluate_purchase(
    request: EvaluateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EvaluateResponse:
    """
    Flow
    ----
    1. Rule Engine — compute budget_status (with purchase included).
    2. Rule Engine — compute goal_impact (days/months delayed).
    3. Prompt builder — assemble negotiator_prompt() with computed values.
    4. AI Engine — call_llama() for practical advice.
    5. Persist to AIRecommendation.
    6. Return { advice, budget_status, goal_impact }.
    """
    uid = current_user.user_id
    logger.info(
        "negotiator.evaluate | user_id=%d price=₹%s category=%r description=%r",
        uid,
        request.price,
        request.category,
        request.description,
    )

    # ── 1 & 2: Rule Engine computations (no LLM) ──────────────────────────
    is_pause = request.kind == "pause"
    bstatus = _compute_budget_status(
        price=request.price,
        category=request.category,
        user_id=uid,
        db=db,
        include_price=not is_pause,
    )
    gimpact = (
        _compute_pause_impact(request.price, uid, db)
        if is_pause
        else _compute_goal_impact(price=request.price, user_id=uid, db=db)
    )

    logger.info(
        "negotiator.evaluate | user_id=%d budget_status=%r goal_impact=%r",
        uid,
        bstatus,
        gimpact,
    )

    # ── 3: Build prompt ───────────────────────────────────────────────────
    prompt_builder = pause_subscription_prompt if is_pause else negotiator_prompt
    prompt = prompt_builder(
        price=request.price,
        category=request.category,
        description=request.description,
        budget_status=bstatus,
        goal_impact=gimpact,
    )

    # ── 4: LLM call (raises AIEngineError on failure) ────────────────────
    try:
        advice = await call_llama(
            system_prompt=(
                "You are Penny Pilot, a financial coach for college students. "
                "Give concise, practical, non-preachy purchase advice."
            ),
            user_prompt=prompt,
        )
    except AIEngineError as exc:
        logger.error(
            "negotiator.evaluate | user_id=%d | AIEngineError: %s",
            uid,
            exc.message,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "The AI negotiator is temporarily unavailable. "
                "Your data is safe — please try again in a moment."
            ),
        ) from exc

    # ── 5: Persist recommendation ─────────────────────────────────────────
    input_dict = {
        "price": str(request.price),
        "category": request.category,
        "description": request.description,
        "budget_status": bstatus,
        "goal_impact": gimpact,
        "kind": request.kind,
    }

    # Find matching budget if exists
    budget_row = (
        db.query(Budget)
        .filter(
            Budget.user_id == uid,
            func.lower(Budget.category) == request.category.strip().lower(),
            Budget.is_deleted == False,
        )
        .first()
    )
    bid = budget_row.id if budget_row else None

    rec_entry = AIRecommendation(
        budget_id=bid,
        user_id=uid,
        rec_type="negotiator",
        content=advice,
        input_context=input_dict,
    )
    db.add(rec_entry)
    db.commit()
    db.refresh(rec_entry)

    logger.info(
        "negotiator.evaluate | user_id=%d rec_id=%d — saved",
        uid,
        rec_entry.rec_id,
    )

    # ── 6: Return structured response ────────────────────────────────────
    return EvaluateResponse(
        advice=advice,
        budget_status=bstatus,
        goal_impact=gimpact,
    )


# ---------------------------------------------------------------------------
# Subscription detection (read-only, derived from the student's own transactions)
# ---------------------------------------------------------------------------


def _ordinal(day: int) -> str:
    if 10 <= day % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    return f"{day}{suffix}"


def _detect_subscriptions(user_id: int, db: Session) -> list[SubscriptionItem]:
    """
    Subscriptions found in the student's transactions: charges from known
    streaming / music merchants, plus anything categorised as a subscription.
    One entry per merchant, using the most recent charge. Nothing is invented —
    a student with no such transactions gets an empty list.
    """
    debits = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.is_deleted == False,
            Transaction.type == "debit",
        )
        .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
        .all()
    )

    found: dict[str, SubscriptionItem] = {}
    for tx in debits:  # newest first → first hit per merchant is the latest charge
        merchant_text = (tx.merchant or "").lower()
        description_text = (tx.description or "").lower()
        known = next(
            (
                k
                for k in KNOWN_SUBSCRIPTIONS
                if k["merchant"].lower() in merchant_text
                or k["merchant"].lower() in description_text
            ),
            None,
        )
        category = (tx.category or "").lower()
        looks_like_sub = "subscrip" in category or "streaming" in category

        if known:
            key, name, merchant = known["id"], known["name"], known["merchant"]
        elif looks_like_sub:
            merchant = (tx.merchant or tx.description or "Subscription").strip()
            key, name = f"sub-{merchant.lower().replace(' ', '-')}", merchant
        else:
            continue

        if key in found:
            continue

        amount = Decimal(str(tx.amount))
        charged = tx.transaction_date
        found[key] = SubscriptionItem(
            id=key,
            name=name,
            merchant=merchant,
            amount=amount,
            billing_date=f"around the {_ordinal(charged.day)} of each month",
            last_charged=charged.date(),
            category=tx.category or "Subscriptions",
            annual_cost=amount * 12,
        )
    return list(found.values())


@router.get(
    "/subscriptions",
    response_model=list[SubscriptionItem],
    status_code=status.HTTP_200_OK,
    summary="List subscriptions found in your transactions",
)
def get_tracked_subscriptions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SubscriptionItem]:
    """Subscriptions detected from the student's own transaction history."""
    return _detect_subscriptions(current_user.user_id, db)


@router.post(
    "/subscriptions/sync",
    response_model=SyncSubscriptionsResponse,
    status_code=status.HTTP_200_OK,
    summary="Re-scan transactions for subscriptions",
)
def sync_subscriptions_api(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SyncSubscriptionsResponse:
    """
    Re-scans the student's transactions for subscriptions. This is read-only:
    there is no bank / UPI feed, so nothing is imported or created. To get more
    subscriptions listed, log or import the charges as transactions.
    """
    subs = _detect_subscriptions(current_user.user_id, db)
    if subs:
        message = f"Found {len(subs)} subscription{'s' if len(subs) != 1 else ''} in your transactions."
    else:
        message = (
            "No subscription charges found in your transactions yet. Log or "
            "import them (e.g. a Netflix or Spotify payment) and they'll appear here."
        )
    return SyncSubscriptionsResponse(
        message=message, synced_count=len(subs), subscriptions=subs
    )
