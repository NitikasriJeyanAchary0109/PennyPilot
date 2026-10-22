from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from app.database import get_db
from app.middleware.auth_middleware import require_student
from app.models.models import AuditLog, Goal, Savings, User
from app.schemas.schemas import (
    GoalCreate,
    GoalDetailResponse,
    GoalListItem,
    GoalResponse,
    GoalUpdate,
    GoalWithdrawRequest,
    GoalWithdrawResponse,
)
from app.services.ledger import notify, recent_savings_amounts, sync_goal_status
from app.services.rule_engine import (
    GOAL_UNREACHABLE_DATE,
    goal_forecast,
    savings_velocity,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/goals", tags=["Goals"])


def _progress_percentage(goal: Goal) -> float:
    target = Decimal(str(goal.target_amount))
    if target <= 0:
        return 0.0
    pct = float((Decimal(str(goal.current_amount)) / target) * 100)
    return max(min(pct, 100.0), 0.0)


def _forecast_or_none(target: Decimal, current: Decimal, velocity: Decimal):
    """Projected completion date, or None when it can't be predicted."""
    projected = goal_forecast(target, current, velocity)
    if projected is None or projected >= GOAL_UNREACHABLE_DATE:
        return None
    return projected


@router.get("/", response_model=List[GoalListItem])
def get_goals(
    status: Optional[str] = Query(
        None, description="Filter by status (active/completed/abandoned)"
    ),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Get all savings goals for the current student."""
    query = db.query(Goal).filter(
        Goal.user_id == current_user.user_id, Goal.is_deleted == False
    )
    if status:
        query = query.filter(Goal.status == status)
    goals = query.order_by(Goal.created_at.asc(), Goal.id.asc()).all()
    return [
        {
            **GoalResponse.model_validate(g).model_dump(),
            "progress_percentage": _progress_percentage(g),
        }
        for g in goals
    ]


@router.post("/", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
def create_goal(
    goal_data: GoalCreate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Create a new savings goal."""
    if goal_data.target_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="target_amount must be greater than 0.",
        )
    if goal_data.target_date and goal_data.target_date <= datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="target_date must be in the future.",
        )

    db_goal = Goal(
        user_id=current_user.user_id,
        title=goal_data.title,
        target_amount=goal_data.target_amount,
        current_amount=0.00,
        target_date=goal_data.target_date,
        status="active",
    )
    db.add(db_goal)
    db.commit()
    db.refresh(db_goal)

    # Write AuditLog
    audit = AuditLog(
        user_id=current_user.user_id,
        action="create",
        entity_type="goal",
        entity_id=db_goal.id,
        performed_by=f"user_{current_user.user_id}",
        timestamp=datetime.utcnow(),
    )
    db.add(audit)
    db.commit()

    return db_goal


def compute_goal_details(goal: Goal, db: Session) -> dict:
    """Helper to compute progress and projection."""
    velocity = savings_velocity(
        recent_savings_amounts(db, goal.user_id, 30, goal_id=goal.id), 30
    )
    projected_date = _forecast_or_none(
        Decimal(str(goal.target_amount)), Decimal(str(goal.current_amount)), velocity
    )

    return {
        "id": goal.id,
        "user_id": goal.user_id,
        "title": goal.title,
        "target_amount": goal.target_amount,
        "current_amount": goal.current_amount,
        "target_date": goal.target_date,
        "status": goal.status,
        "created_at": goal.created_at,
        "is_deleted": goal.is_deleted,
        "progress_percentage": _progress_percentage(goal),
        "projected_completion_date": projected_date,
    }


@router.get("/{goal_id}", response_model=GoalDetailResponse)
def get_goal_by_id(
    goal_id: int,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Retrieve specific goal details with progress and projection."""
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found."
        )

    return compute_goal_details(goal, db)


@router.put("/{goal_id}", response_model=GoalDetailResponse)
def update_goal(
    goal_id: int,
    goal_update: GoalUpdate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Update details of an existing goal."""
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found."
        )

    if goal_update.target_amount is not None and goal_update.target_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="target_amount must be greater than 0.",
        )

    if goal_update.target_date and goal_update.target_date <= datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="target_date must be in the future.",
        )

    # Apply updates
    update_data = goal_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(goal, key, value)

    sync_goal_status(db, goal)
    db.commit()
    db.refresh(goal)

    # Write AuditLog
    audit = AuditLog(
        user_id=current_user.user_id,
        action="update",
        entity_type="goal",
        entity_id=goal.id,
        performed_by=f"user_{current_user.user_id}",
        timestamp=datetime.utcnow(),
    )
    db.add(audit)
    db.commit()

    return compute_goal_details(goal, db)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(
    goal_id: int,
    force: bool = False,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Delete a savings goal."""
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found."
        )

    if goal.current_amount > 0:
        if not force:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot delete goal with saved funds unless force=true.",
            )
        else:
            # Reallocate back to general Savings
            reallocation = Savings(
                user_id=goal.user_id,
                goal_id=None,
                amount=goal.current_amount,
                source="goal_reallocation",
                created_at=datetime.utcnow(),
            )
            db.add(reallocation)
            goal.current_amount = 0

    goal.is_deleted = True
    goal.status = "abandoned"
    db.commit()

    # Write AuditLog
    audit = AuditLog(
        user_id=current_user.user_id,
        action="delete",
        entity_type="goal",
        entity_id=goal.id,
        performed_by=f"user_{current_user.user_id}",
        timestamp=datetime.utcnow(),
    )
    db.add(audit)
    db.commit()

    return None


@router.post("/{goal_id}/withdraw", response_model=GoalWithdrawResponse)
def withdraw_from_goal(
    goal_id: int,
    payload: GoalWithdrawRequest,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """
    Release money from a goal's saved balance.

    This updates Penny Pilot's records (goal balance + a negative ledger entry);
    it does not move money in a bank account.
    """
    goal = (
        db.query(Goal)
        .filter(
            Goal.id == goal_id,
            Goal.user_id == current_user.user_id,
            Goal.is_deleted == False,
        )
        .with_for_update()
        .first()
    )
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found."
        )

    balance = Decimal(str(goal.current_amount))
    if payload.amount > balance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You can withdraw at most ₹{balance:.2f} from this goal.",
        )

    goal.current_amount = balance - payload.amount
    db.add(
        Savings(
            user_id=current_user.user_id,
            goal_id=goal.id,
            amount=-payload.amount,
            source="withdrawal",
            created_at=datetime.utcnow(),
        )
    )
    sync_goal_status(db, goal)
    db.add(
        AuditLog(
            user_id=current_user.user_id,
            action="withdraw",
            entity_type="goal",
            entity_id=goal.id,
            performed_by=f"user_{current_user.user_id}",
            timestamp=datetime.utcnow(),
            metadata_json={
                "amount": float(payload.amount),
                "reason": payload.reason,
                "new_balance": float(goal.current_amount),
            },
        )
    )
    db.commit()
    db.refresh(goal)

    notify(
        db,
        current_user.user_id,
        "withdrawal",
        "Withdrawal recorded",
        f"₹{payload.amount:.2f} was released from “{goal.title}”.",
    )

    return GoalWithdrawResponse(
        success=True,
        withdrawn=payload.amount,
        remaining=Decimal(str(goal.current_amount)),
        goal_status=goal.status,
        message=(
            f"₹{payload.amount:.2f} released from “{goal.title}”. "
            "This is recorded in Penny Pilot; move the money in your bank yourself."
        ),
    )


class GoalForecastResponse(BaseModel):
    goal_name: str
    target_amount: Decimal
    current_amount: Decimal
    forecast_date: Optional[date]
    velocity: Decimal
    narrative: str


@router.patch("/{goal_id}", response_model=GoalDetailResponse)
def patch_goal(
    goal_id: int,
    goal_update: GoalUpdate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """PATCH update details of an existing goal."""
    return update_goal(goal_id, goal_update, current_user, db)


@router.get("/{goal_id}/forecast", response_model=GoalForecastResponse)
async def get_goal_forecast(
    goal_id: int,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Exposes the Dream Engine plain language narration and timeline projection for a goal."""
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found."
        )

    # 1. Fetch velocity (from last 30 days savings into this goal)
    velocity = savings_velocity(
        recent_savings_amounts(db, current_user.user_id, 30, goal_id=goal.id), 30
    )

    # 2. Get forecast date (raw value, with sentinel, goes to the prompt builder)
    target = Decimal(str(goal.target_amount))
    current = Decimal(str(goal.current_amount))
    forecast_date = goal_forecast(target, current, velocity)

    # 3. Call AI narration
    from app.services.ai_engine import AIEngineError, call_llama
    from app.services.rule_engine import (
        calculate_accelerated_savings_options,
        format_accelerated_options,
    )
    from app.utils.prompts import dream_engine_prompt

    accel_options = calculate_accelerated_savings_options(target, current, velocity)
    accel_text = format_accelerated_options(accel_options)

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

    # 4. Save to ChatHistory
    from app.models.models import ChatHistory

    chat_record = ChatHistory(
        user_id=current_user.user_id,
        question=f"dream_engine: forecast for goal {goal.title}",
        response=ai_forecast,
        created_at=datetime.utcnow(),
    )
    db.add(chat_record)
    db.commit()

    return GoalForecastResponse(
        goal_name=goal.title,
        target_amount=target,
        current_amount=current,
        forecast_date=(
            None
            if forecast_date is None or forecast_date >= GOAL_UNREACHABLE_DATE
            else forecast_date
        ),
        velocity=velocity,
        narrative=ai_forecast,
    )
