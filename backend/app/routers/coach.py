"""
Coach Router — POST /coach/chat and GET /coach/history endpoints for the
SpareChange AI Financial Coach feature.

Architecture contract
---------------------
- Reads financial context (transactions, goals, budgets) via read-only ORM
  queries. NEVER writes to Transaction, Budget, Goal, or Savings tables.
- Numeric context is assembled from raw ORM data into plain dicts BEFORE
  being handed to the prompt builder — no arithmetic inside the AI call.
- Prompt assembly → ai_engine.call_llama() → ChatHistory write is the only
  allowed write path in this router.
- On AIEngineError, raises HTTP 503 with a user-friendly message. NEVER
  returns a hardcoded or mocked AI response.
"""

from __future__ import annotations

import datetime
import logging
from typing import List

from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.models import (
    Budget,
    ChatHistory,
    Goal,
    Transaction,
    User,
)
from app.services.ai_engine import AIEngineError, call_llama
from app.utils.prompts import coach_system_prompt, coach_user_prompt
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

logger = logging.getLogger("sparechange_ai.coach")

router = APIRouter(prefix="/coach", tags=["AI Coach"])

# ---------------------------------------------------------------------------
# Context-loading constants
# ---------------------------------------------------------------------------
_MAX_RECENT_TX = 5  # how many recent transactions to send in context
_MAX_GOALS = 5  # goal count cap to keep prompt short
_MAX_BUDGETS = 5  # budget count cap to keep prompt short


# ===========================================================================
# Pydantic schemas (local — extend global schemas.py when Member 1 is ready)
# ===========================================================================


class CoachChatRequest(BaseModel):
    """Request body for POST /coach/chat."""

    message: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="The student's message to the financial coach.",
    )


class CoachChatResponse(BaseModel):
    """Response for a single coach chat turn."""

    chat_id: int
    user_id: int
    question: str
    response: str
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class CoachHistoryResponse(BaseModel):
    """Paginated chat history response."""

    page: int
    page_size: int
    total: int
    items: List[CoachChatResponse]


# Resolve forward references for Pydantic v2
CoachHistoryResponse.model_rebuild()


# ===========================================================================
# Helper — load context dicts from DB (read-only)
# ===========================================================================


def _load_context(user_id: int, db: Session) -> tuple[list, list, list]:
    """
    Fetch and serialise recent transactions, active goals, and budgets for a
    given user into plain dicts suitable for prompt building.

    Returns:
        (recent_transactions, goals, budgets) — each a list of dicts.
    """
    # --- Recent transactions (debit only — spending context) ---
    tx_rows = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.type == "debit",
            Transaction.is_deleted == False,
        )
        .order_by(Transaction.transaction_date.desc())
        .limit(_MAX_RECENT_TX)
        .all()
    )
    recent_transactions = [
        {
            "merchant": t.merchant,
            "amount": float(t.amount),
            "category": t.category,
        }
        for t in tx_rows
    ]

    # --- Active goals ---
    goal_rows = (
        db.query(Goal)
        .filter(Goal.user_id == user_id, Goal.status == "active")
        .limit(_MAX_GOALS)
        .all()
    )
    goals = [
        {
            "name": g.title,
            "target": float(g.target_amount),
            "saved": float(g.current_amount),
        }
        for g in goal_rows
    ]

    # --- Budgets directly by user_id ---
    budget_rows = (
        db.query(Budget)
        .filter(Budget.user_id == user_id, Budget.is_deleted == False)
        .limit(_MAX_BUDGETS)
        .all()
    )
    budgets: list = []
    from decimal import Decimal

    from app.routers.budgets import calculate_spent_amount
    from app.services.rule_engine import budget_status as _budget_status

    for b in budget_rows:
        spent = calculate_spent_amount(db, user_id, b.category, b.period, b.start_date)
        budgets.append(
            {
                "category": b.category,
                "budget": float(b.limit_amount),
                "spent": float(spent),
                "status": _budget_status(
                    Decimal(str(b.limit_amount)),
                    Decimal(str(spent)),
                ),
            }
        )

    return recent_transactions, goals, budgets


# ===========================================================================
# POST /api/coach/chat
# ===========================================================================


@router.post(
    "/chat",
    response_model=CoachChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Chat with the AI Financial Coach",
    description=(
        "Send a free-form message to the AI Financial Coach. "
        "The coach receives the student's recent transactions, savings goals, "
        "and budget status as context, and replies with personalised, "
        "non-judgmental financial advice."
    ),
)
async def chat_with_coach(
    request: CoachChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CoachChatResponse:
    """
    Flow
    ----
    1. Load context (transactions, goals, budgets) — read-only ORM queries.
    2. Build system + user prompts via utils.prompts.
    3. Call ai_engine.call_llama() — raises AIEngineError on failure.
    4. Persist both turns to ChatHistory.
    5. Return the AI reply.
    """
    logger.info(
        "coach.chat | user_id=%d message_len=%d",
        current_user.user_id,
        len(request.message),
    )

    # --- 1. Load context ---
    recent_transactions, goals, budgets = _load_context(current_user.user_id, db)

    # --- 2. Build prompts ---
    sys_prompt = coach_system_prompt()
    user_prompt = coach_user_prompt(
        message=request.message,
        recent_transactions=recent_transactions,
        goals=goals,
        budgets=budgets,
    )

    # --- 3. Call LLM (raises AIEngineError on any failure) ---
    try:
        ai_reply = await call_llama(
            system_prompt=sys_prompt,
            user_prompt=user_prompt,
        )
    except AIEngineError as exc:
        logger.error(
            "coach.chat | user_id=%d | AIEngineError: %s",
            current_user.user_id,
            exc.message,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "The AI coach is temporarily unavailable. "
                "Your data is safe — please try again in a moment."
            ),
        ) from exc

    # --- 4. Persist to ChatHistory ---
    record = ChatHistory(
        user_id=current_user.user_id,
        question=request.message,
        response=ai_reply,
        created_at=datetime.datetime.utcnow(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    logger.info(
        "coach.chat | user_id=%d chat_id=%d — saved successfully",
        current_user.user_id,
        record.chat_id,
    )

    # --- 5. Return ---
    return record  # type: ignore[return-value]  # Pydantic from_attributes handles ORM→schema


# ===========================================================================
# GET /api/coach/history
# ===========================================================================


@router.get(
    "/history",
    response_model=CoachHistoryResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve paginated chat history",
    description=(
        "Returns the authenticated student's chat history with the AI coach, "
        "sorted most-recent first. Use `page` and `page_size` to paginate."
    ),
)
async def get_chat_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)."),
    page_size: int = Query(
        default=20,
        ge=1,
        le=100,
        description="Number of records per page (max 100).",
    ),
) -> CoachHistoryResponse:
    """
    Paginated chat history for the current authenticated user.

    Records are returned most-recent first (ORDER BY created_at DESC).
    Empty history returns an empty `items` list — not a 404.
    """
    logger.info(
        "coach.history | user_id=%d page=%d page_size=%d",
        current_user.user_id,
        page,
        page_size,
    )

    base_query = (
        db.query(ChatHistory)
        .filter(ChatHistory.user_id == current_user.user_id)
        .order_by(ChatHistory.created_at.desc())
    )

    total = base_query.count()
    offset = (page - 1) * page_size
    items = base_query.offset(offset).limit(page_size).all()

    return CoachHistoryResponse(
        page=page,
        page_size=page_size,
        total=total,
        items=items,  # type: ignore[arg-type]  # ORM → Pydantic via from_attributes
    )
