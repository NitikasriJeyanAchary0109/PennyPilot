from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from app.database import get_db
from app.middleware.auth_middleware import require_student
from app.models.models import AuditLog, Goal, Savings, User
from app.schemas.schemas import (
    SavingsCreate,
    SavingsResponse,
    SavingsSummaryResponse,
    SavingsTrendResponse,
    SavingsUpdate,
)
from app.services.ledger import SAVING_SOURCES, sync_goal_status
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
    if savings_data.amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Savings amount must be greater than 0.",
        )

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
        sync_goal_status(db, goal)

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
        norm_source = "round_up" if source == "roundup" else source
        query = query.filter(Savings.source == norm_source)
    if goal_id:
        query = query.filter(Savings.goal_id == goal_id)

    return query.order_by(Savings.created_at.desc(), Savings.id.desc()).all()


@router.get("/trend", response_model=SavingsTrendResponse)
def get_savings_trend(
    weeks: int = Query(4, ge=1, le=26),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """
    Amount deposited (round-ups, manual savings, transfers) in each of the last
    `weeks` 7-day windows, oldest first. Withdrawals are not netted off. Computed
    here so the client only has to draw it.
    """
    today = datetime.utcnow().date()
    window_start = today - timedelta(days=7 * weeks - 1)
    rows = (
        db.query(Savings.amount, Savings.created_at, Savings.source)
        .filter(
            Savings.user_id == current_user.user_id,
            Savings.created_at >= datetime.combine(window_start, datetime.min.time()),
            Savings.source.in_(SAVING_SOURCES),
        )
        .all()
    )

    buckets: List[Dict[str, Any]] = []
    for i in range(weeks):
        start = window_start + timedelta(days=7 * i)
        buckets.append(
            {
                "week_start": start,
                "week_end": start + timedelta(days=6),
                "saved": Decimal("0.00"),
            }
        )
    for amount, created_at, _source in rows:
        index = (created_at.date() - window_start).days // 7
        if 0 <= index < weeks:
            buckets[index]["saved"] += Decimal(str(amount))

    total = sum((b["saved"] for b in buckets), Decimal("0.00"))
    return {"weeks": buckets, "total": total}


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

    if "amount" in update_data and (
        update_data["amount"] is None or update_data["amount"] <= 0
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Savings amount must be greater than 0.",
        )
    if savings_record.source in ("withdrawal", "goal_reallocation"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Withdrawal and reallocation entries can't be edited.",
        )

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
                old_goal.current_amount = max(
                    old_goal.current_amount - old_amount, Decimal("0.00")
                )
                sync_goal_status(db, old_goal)

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
            sync_goal_status(db, new_goal)

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
            goal.current_amount = max(
                goal.current_amount - savings_record.amount, Decimal("0.00")
            )
            sync_goal_status(db, goal)

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
        sync_goal_status(db, goal)

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
