from datetime import datetime
from typing import List, Optional

from app.database import get_db
from app.middleware.auth_middleware import require_student
from app.models.models import AuditLog, Goal, Savings, User
from app.schemas.schemas import (
    SavingsCreate,
    SavingsResponse,
    SavingsSummaryResponse,
    SavingsUpdate,
)
from app.services.rule_engine import savings_summary
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

router = APIRouter(prefix="/savings", tags=["Savings"])


@router.post("/", response_model=SavingsResponse, status_code=status.HTTP_201_CREATED)
def create_savings(
    savings_data: SavingsCreate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    if savings_data.goal_id is not None:
        goal = (
            db.query(Goal)
            .filter(
                Goal.id == savings_data.goal_id,
                Goal.user_id == current_user.user_id,
                Goal.is_deleted == False,
            )
            .with_for_update()
            .first()
        )

        if not goal:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Goal not found or does not belong to the user.",
            )

        goal.current_amount += savings_data.amount

    db_savings = Savings(
        user_id=current_user.user_id,
        goal_id=savings_data.goal_id,
        amount=savings_data.amount,
        source=savings_data.source,
    )
    db.add(db_savings)
    db.commit()
    db.refresh(db_savings)
    return db_savings


@router.get("/", response_model=List[SavingsResponse])
def get_savings(
    source: Optional[str] = Query(None),
    goal_id: Optional[int] = Query(None),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    query = db.query(Savings).filter(Savings.user_id == current_user.user_id)
    if source:
        query = query.filter(Savings.source == source)
    if goal_id:
        query = query.filter(Savings.goal_id == goal_id)

    return query.all()


@router.get("/summary", response_model=SavingsSummaryResponse)
def get_savings_summary(
    current_user: User = Depends(require_student), db: Session = Depends(get_db)
):
    savings_list = (
        db.query(Savings).filter(Savings.user_id == current_user.user_id).all()
    )
    summary_dict = savings_summary(savings_list)
    return summary_dict


@router.put("/{savings_id}", response_model=SavingsResponse)
def update_savings(
    savings_id: int,
    savings_update: SavingsUpdate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    savings_record = (
        db.query(Savings)
        .filter(Savings.id == savings_id, Savings.user_id == current_user.user_id)
        .with_for_update()
        .first()
    )

    if not savings_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Savings record not found."
        )

    # Calculate what changes
    update_data = savings_update.model_dump(exclude_unset=True)

    old_goal_id = savings_record.goal_id
    new_goal_id = update_data.get("goal_id", old_goal_id)

    old_amount = savings_record.amount
    new_amount = update_data.get("amount", old_amount)

    # If goal_id or amount changes, we need to adjust balances atomically
    if old_goal_id != new_goal_id or old_amount != new_amount:
        # Subtract from old goal
        if old_goal_id is not None:
            old_goal = (
                db.query(Goal)
                .filter(Goal.id == old_goal_id, Goal.user_id == current_user.user_id)
                .with_for_update()
                .first()
            )
            if old_goal:
                old_goal.current_amount -= old_amount

        # Add to new goal
        if new_goal_id is not None:
            new_goal = (
                db.query(Goal)
                .filter(
                    Goal.id == new_goal_id,
                    Goal.user_id == current_user.user_id,
                    Goal.is_deleted == False,
                )
                .with_for_update()
                .first()
            )
            if not new_goal:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="New goal not found or does not belong to the user.",
                )
            new_goal.current_amount += new_amount

    # Apply updates
    for key, value in update_data.items():
        setattr(savings_record, key, value)

    db.commit()
    db.refresh(savings_record)
    return savings_record


@router.delete("/{savings_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_savings(
    savings_id: int,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    savings_record = (
        db.query(Savings)
        .filter(Savings.id == savings_id, Savings.user_id == current_user.user_id)
        .with_for_update()
        .first()
    )

    if not savings_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Savings record not found."
        )

    if savings_record.goal_id is not None:
        goal = (
            db.query(Goal)
            .filter(
                Goal.id == savings_record.goal_id, Goal.user_id == current_user.user_id
            )
            .with_for_update()
            .first()
        )

        if goal:
            goal.current_amount -= savings_record.amount

    db.delete(savings_record)
    db.commit()
    return None


@router.post(
    "/manual", response_model=SavingsResponse, status_code=status.HTTP_201_CREATED
)
def create_manual_savings(
    savings_data: SavingsCreate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Manually add savings towards a goal, logging it in the database and audit logs."""
    if savings_data.amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Savings amount must be greater than 0.",
        )

    # Force manual source
    savings_data.source = "manual"

    goal = None
    if savings_data.goal_id is not None:
        goal = (
            db.query(Goal)
            .filter(
                Goal.id == savings_data.goal_id,
                Goal.user_id == current_user.user_id,
                Goal.is_deleted == False,
            )
            .with_for_update()
            .first()
        )

        if not goal:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Goal not found or access denied.",
            )

        goal.current_amount += savings_data.amount

    db_savings = Savings(
        user_id=current_user.user_id,
        goal_id=savings_data.goal_id,
        amount=savings_data.amount,
        source="manual",
        created_at=datetime.utcnow(),
    )
    db.add(db_savings)
    db.commit()
    db.refresh(db_savings)

    # Write AuditLog for Savings
    savings_audit = AuditLog(
        user_id=current_user.user_id,
        action="create",
        entity_type="savings",
        entity_id=db_savings.id,
        performed_by=f"user_{current_user.user_id}",
        timestamp=datetime.utcnow(),
    )
    db.add(savings_audit)

    # Write AuditLog for Goal modification
    if goal:
        goal_audit = AuditLog(
            user_id=current_user.user_id,
            action="update",
            entity_type="goal",
            entity_id=goal.id,
            performed_by=f"user_{current_user.user_id}",
            timestamp=datetime.utcnow(),
            metadata_json={
                "amount_added": float(savings_data.amount),
                "new_total": float(goal.current_amount),
            },
        )
        db.add(goal_audit)

    db.commit()
    return db_savings
