"""
Advisor Router — POST /advisor/ask

Educational money-basics Q&A. It deliberately does NOT recommend products or
quote returns: the assistant has no market data and Penny Pilot is not a
licensed advisor. On AI failure it raises 503 — no canned answers.
"""

from __future__ import annotations

import logging

from app.middleware.auth_middleware import get_current_user
from app.models.models import User
from app.services.ai_engine import AIEngineError, call_llama, user_facing_error
from app.utils.prompts import (
    ADVISOR_DISCLAIMER,
    advisor_system_prompt,
    advisor_user_prompt,
)
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

logger = logging.getLogger("pennypilot.advisor")

router = APIRouter(prefix="/advisor", tags=["AI Advisor"])


class AdvisorRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)


class AdvisorResponse(BaseModel):
    response: str
    disclaimer: str


@router.post("/ask", response_model=AdvisorResponse)
async def ask_advisor(
    payload: AdvisorRequest,
    current_user: User = Depends(get_current_user),
) -> AdvisorResponse:
    try:
        answer = await call_llama(
            system_prompt=advisor_system_prompt(),
            user_prompt=advisor_user_prompt(payload.question.strip()),
        )
    except AIEngineError as exc:
        logger.error(
            "advisor.ask | user_id=%d | AIEngineError: %s",
            current_user.user_id,
            exc.message,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=user_facing_error(
                exc,
                "The money-basics assistant is temporarily unavailable. Try again in a moment.",
            ),
        ) from exc

    return AdvisorResponse(response=answer, disclaimer=ADVISOR_DISCLAIMER)
