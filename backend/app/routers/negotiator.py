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
from typing import Optional

from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.models import (
    AIRecommendation,
    Budget,
    Goal,
    Savings,
    User,
)
from app.services.ai_engine import AIEngineError, call_llama
from app.services.rule_engine import (
    budget_status as compute_budget_status,
)
from app.services.rule_engine import (
    goal_forecast,
    savings_velocity,
)
from app.utils.prompts import negotiator_prompt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
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


class EvaluateResponse(BaseModel):
    """Response for POST /negotiator/evaluate."""

    advice: str = Field(..., description="LLM-generated purchase advice.")
    budget_status: str = Field(..., description="'safe' | 'warning' | 'exceeded'")
    goal_impact: str = Field(..., description="Plain-text estimate of goal delay.")


# ---------------------------------------------------------------------------
# Helper — compute goal impact string (pure, called before AI)
# ---------------------------------------------------------------------------


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
    goals = (
        db.query(Goal).filter(Goal.user_id == user_id, Goal.status == "active").all()
    )
    if not goals:
        return "no active savings goals set"

    # Pick the goal with the highest absolute saved amount
    primary_goal: Goal = max(goals, key=lambda g: g.current_amount)

    # Get last-30-days savings velocity
    recent_savings_rows = (
        db.query(Savings)
        .filter(Savings.user_id == user_id)
        .order_by(Savings.created_at.desc())
        .limit(60)
        .all()
    )
    past_amounts = [Decimal(str(s.amount)) for s in recent_savings_rows]
    velocity = savings_velocity(past_amounts, period_days=30)

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
) -> str:
    """
    Look up the Budget row for this category for the user and compute status
    including this hypothetical purchase.

    Falls back to "safe" if no budget row exists for the category.
    """
    budget_row: Optional[Budget] = (
        db.query(Budget)
        .filter(
            Budget.user_id == user_id,
            Budget.category == category,
            Budget.is_deleted == False,
        )
        .first()
    )
    if not budget_row:
        return "safe"  # category not budgeted

    from app.routers.budgets import calculate_spent_amount

    # Simulate adding the purchase to current spend
    spent = calculate_spent_amount(
        db, user_id, category, budget_row.period, budget_row.start_date
    )
    projected_spent = spent + price
    limit = Decimal(str(budget_row.limit_amount))

    return compute_budget_status(limit, projected_spent)


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
    bstatus = _compute_budget_status(
        price=request.price,
        category=request.category,
        user_id=uid,
        db=db,
    )
    gimpact = _compute_goal_impact(
        price=request.price,
        user_id=uid,
        db=db,
    )

    logger.info(
        "negotiator.evaluate | user_id=%d budget_status=%r goal_impact=%r",
        uid,
        bstatus,
        gimpact,
    )

    # ── 3: Build prompt ───────────────────────────────────────────────────
    prompt = negotiator_prompt(
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
    }

    # Find matching budget if exists
    budget_row = (
        db.query(Budget)
        .filter(
            Budget.user_id == uid,
            Budget.category == request.category,
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
