import datetime
from decimal import Decimal

from app.database import get_db
from app.middleware.auth_middleware import require_student
from app.models.models import ChatHistory, Goal, User
from app.schemas.schemas import ChatHistoryResponse, ForecastRequest
from app.services.ai_engine import AIEngineError, call_llama
from app.services.rule_engine import (
    calculate_accelerated_savings_options,
    format_accelerated_options,
    goal_forecast,
)
from app.utils.prompts import dream_engine_prompt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

router = APIRouter(prefix="/forecast", tags=["Dream Engine"])


@router.post("/", response_model=ChatHistoryResponse, status_code=status.HTTP_200_OK)
async def forecast_savings(
    request: ForecastRequest,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """
    Simulates a savings timeline for a specific goal using a monthly contribution rate,
    incorporating automated roundups. Caches the forecast in ChatHistory.
    """
    goal = (
        db.query(Goal)
        .filter(
            Goal.id == request.goal_id,
            Goal.user_id == current_user.user_id,
            Goal.is_deleted == False,
        )
        .first()
    )

    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found."
        )

    target = Decimal(str(goal.target_amount))
    current = Decimal(str(goal.current_amount))
    velocity = Decimal(str(request.monthly_contribution))
    forecast_date = goal_forecast(target, current, velocity)

    # Precompute deterministic acceleration options
    accel_options = calculate_accelerated_savings_options(target, current, velocity)
    accel_text = format_accelerated_options(accel_options)

    # Generate prompt and query AI
    prompt = dream_engine_prompt(
        goal_name=goal.title,
        target_amount=target,
        current_amount=current,
        forecast_date=forecast_date,
        velocity=velocity,
        accelerated_options_text=accel_text,
    )

    try:
        ai_forecast = await call_llama(
            system_prompt=(
                "You are Penny Pilot's Dream Engine, describing savings forecasts in plain language. "
                "Strictly adhere to Zero-Arithmetic: only restate precomputed numbers from the prompt, "
                "and never calculate, estimate, project, or invent dates or amounts."
            ),
            user_prompt=prompt,
        )
    except AIEngineError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Dream Engine AI is offline. Try again in a moment.",
        ) from exc

    # Save to ChatHistory
    chat_record = ChatHistory(
        user_id=current_user.user_id,
        question=f"Dream Engine Forecast: Save for goal '{goal.title}' with monthly contribution ₹{request.monthly_contribution:.2f}",
        response=ai_forecast,
        created_at=datetime.datetime.utcnow(),
    )
    db.add(chat_record)
    db.commit()
    db.refresh(chat_record)

    return chat_record
