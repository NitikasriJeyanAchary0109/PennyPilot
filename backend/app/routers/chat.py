import datetime

from app.database import get_db
from app.middleware.auth_middleware import require_student
from app.models.models import ChatHistory, User
from app.routers.coach import _load_context
from app.schemas.schemas import ChatHistoryResponse, ChatRequest
from app.services.ai_engine import AIEngineError, call_llama, user_facing_error
from app.utils.prompts import coach_system_prompt, coach_user_prompt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

router = APIRouter(prefix="/chat", tags=["AI Coach"])


@router.post("/", response_model=ChatHistoryResponse, status_code=status.HTTP_200_OK)
async def chat_with_coach(
    request: ChatRequest,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """
    Interacts with the AI Financial Coach.
    Builds context from recent transactions, savings goals, and budgets, then invokes the AI model.
    Logs conversation to the ChatHistory table.
    """
    # 1. Load context
    recent_transactions, goals, budgets = _load_context(current_user.user_id, db)

    # 2. Build prompts
    sys_prompt = coach_system_prompt()
    user_prompt = coach_user_prompt(
        message=request.message,
        recent_transactions=recent_transactions,
        goals=goals,
        budgets=budgets,
    )

    # 3. Call LLM (raises AIEngineError on failure)
    try:
        ai_reply = await call_llama(
            system_prompt=sys_prompt,
            user_prompt=user_prompt,
        )
    except AIEngineError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=user_facing_error(
                exc, "The AI coach is temporarily offline. Try again in a moment."
            ),
        ) from exc

    # 4. Save to ChatHistory
    chat_record = ChatHistory(
        user_id=current_user.user_id,
        question=request.message,
        response=ai_reply,
        created_at=datetime.datetime.utcnow(),
    )
    db.add(chat_record)
    db.commit()
    db.refresh(chat_record)

    return chat_record
