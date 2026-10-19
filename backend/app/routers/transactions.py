from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from app.database import get_db
from app.middleware.auth_middleware import require_student
from app.models.models import AuditLog, Goal, Savings, Transaction, User
from app.schemas.schemas import (
    TransactionCreate,
    TransactionResponse,
    TransactionUpdate,
)
from app.services.ai_engine import call_llama
from app.services.csv_parser import parse_transactions_csv
from app.services.rule_engine import apply_roundup_if_eligible
from app.utils.prompts import explain_roundup_prompt
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi import Query as FastAPIQuery
from sqlalchemy import or_
from sqlalchemy.orm import Session

router = APIRouter(prefix="/transactions", tags=["Transactions"])


@router.get("/", response_model=List[TransactionResponse])
def get_my_transactions(
    limit: int = 20,
    offset: int = 0,
    category: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    search: Optional[str] = FastAPIQuery(
        None, description="Search text in description or merchant"
    ),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """
    Retrieves all transactions for the authenticated student, paginated and filtered.
    Excludes soft-deleted transactions.
    """
    query = db.query(Transaction).filter(
        Transaction.user_id == current_user.user_id, Transaction.is_deleted == False
    )
    if category:
        query = query.filter(Transaction.category == category)
    if start_date:
        query = query.filter(Transaction.transaction_date >= start_date)
    if end_date:
        query = query.filter(Transaction.transaction_date <= end_date)
    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            or_(
                Transaction.description.ilike(search_filter),
                Transaction.merchant.ilike(search_filter),
            )
        )

    return (
        query.order_by(Transaction.transaction_date.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.post("/", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    transaction_data: TransactionCreate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """
    Creates a new transaction for the authenticated student.
    Triggers automated roundups and logs audits.
    """
    # Create the transaction
    db_transaction = Transaction(
        user_id=current_user.user_id,
        amount=transaction_data.amount,
        category=transaction_data.category,
        merchant=transaction_data.merchant or "Unknown Merchant",
        type=transaction_data.type or "debit",
        transaction_date=transaction_data.transaction_date or datetime.utcnow(),
        description=transaction_data.description or transaction_data.merchant,
        is_round_up_applied=False,
        round_up_amount=Decimal("0.00"),
        is_deleted=False,
    )
    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)

    # 1. Log transaction audit record
    audit = AuditLog(
        trans_id=db_transaction.id,
        action="create",
        performed_by=f"user_{current_user.user_id}",
        timestamp=datetime.utcnow(),
    )
    db.add(audit)
    db.commit()

    # Search for user's active goal to deposit roundups
    active_goal = (
        db.query(Goal)
        .filter(Goal.user_id == current_user.user_id, Goal.status == "active")
        .first()
    )
    if not active_goal:
        active_goal = (
            db.query(Goal).filter(Goal.user_id == current_user.user_id).first()
        )

    roundup_result = None
    roundup_applied = False
    explanation = None

    if active_goal:
        simulated_checking_balance = Decimal("150.00")

        roundup_result = apply_roundup_if_eligible(
            db=db,
            transaction=db_transaction,
            goal=active_goal,
            checking_balance=simulated_checking_balance,
        )

        if roundup_result.get("success"):
            roundup_applied = True
            db_transaction.is_round_up_applied = True
            db_transaction.round_up_amount = roundup_result.get(
                "roundup_amount", Decimal("0.00")
            )
            db.commit()
            db.refresh(db_transaction)

            # Generate AI explanation
            prompt = explain_roundup_prompt(
                transaction_desc=db_transaction.description or db_transaction.merchant,
                transaction_amount=db_transaction.amount,
                roundup_amount=db_transaction.round_up_amount,
            )
            try:
                explanation = await call_llama(
                    system_prompt="You are Penny Pilot, explaining transaction roundups in one sentence.",
                    user_prompt=prompt,
                )
            except Exception:
                explanation = "Automated micro-savings help build long-term savings habits without feeling the pinch."

            roundup_result["explanation"] = explanation

    return {
        "transaction": {
            "id": db_transaction.id,
            "user_id": db_transaction.user_id,
            "amount": db_transaction.amount,
            "category": db_transaction.category,
            "merchant": db_transaction.merchant,
            "type": db_transaction.type,
            "transaction_date": db_transaction.transaction_date,
            "description": db_transaction.description,
            "round_up_amount": db_transaction.round_up_amount,
            "is_round_up_applied": db_transaction.is_round_up_applied,
            "created_at": db_transaction.created_at,
            "is_deleted": db_transaction.is_deleted,
        },
        "roundup_applied": roundup_applied,
        "roundup_details": roundup_result,
    }


@router.get("/{id}", response_model=TransactionResponse)
def get_transaction_by_id(
    id: int,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Fetch one transaction, 404 if not found, soft-deleted, or not owned by user."""
    tx = (
        db.query(Transaction)
        .filter(
            Transaction.id == id,
            Transaction.user_id == current_user.user_id,
            Transaction.is_deleted == False,
        )
        .first()
    )

    if not tx:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found or access denied.",
        )
    return tx


@router.put("/{id}", response_model=TransactionResponse)
def update_transaction(
    id: int,
    transaction_update: TransactionUpdate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """
    Update editable fields (merchant, category).
    Do not allow amount edits after round-up has already generated a linked savings record — return 409 in that case.
    """
    tx = (
        db.query(Transaction)
        .filter(
            Transaction.id == id,
            Transaction.user_id == current_user.user_id,
            Transaction.is_deleted == False,
        )
        .first()
    )

    if not tx:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found or access denied.",
        )

    # Check amount edit constraint
    if transaction_update.amount is not None and transaction_update.amount != tx.amount:
        if tx.is_round_up_applied:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot edit amount because a round-up savings record has already been applied.",
            )
        tx.amount = transaction_update.amount

    if transaction_update.merchant is not None:
        tx.merchant = transaction_update.merchant
    if transaction_update.category is not None:
        tx.category = transaction_update.category

    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/{id}", status_code=status.HTTP_200_OK)
def delete_transaction(
    id: int,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """
    Soft-delete transaction and reverse any linked round-up savings entry.
    """
    tx = (
        db.query(Transaction)
        .filter(
            Transaction.id == id,
            Transaction.user_id == current_user.user_id,
            Transaction.is_deleted == False,
        )
        .first()
    )

    if not tx:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found or access denied.",
        )

    # Reverse any linked round-up savings entry
    if tx.is_round_up_applied:
        savings_record = (
            db.query(Savings)
            .filter(
                Savings.triggered_by_transaction_id == tx.id,
                Savings.source == "round_up",
            )
            .first()
        )

        if savings_record:
            if savings_record.goal_id:
                goal = (
                    db.query(Goal)
                    .filter(
                        Goal.id == savings_record.goal_id,
                        Goal.user_id == current_user.user_id,
                    )
                    .first()
                )
                if goal:
                    goal.current_amount -= savings_record.amount
                    if goal.current_amount < 0:
                        goal.current_amount = Decimal("0.00")
            db.delete(savings_record)

        tx.is_round_up_applied = False
        tx.round_up_amount = Decimal("0.00")

    # Soft delete
    tx.is_deleted = True

    # Log delete audit record
    audit = AuditLog(
        trans_id=tx.id,
        action="delete",
        performed_by=f"user_{current_user.user_id}",
        timestamp=datetime.utcnow(),
    )
    db.add(audit)

    db.commit()
    return {
        "success": True,
        "message": "Transaction soft-deleted and round-up reversed successfully.",
    }


@router.post("/upload", response_model=dict)
async def upload_bank_statement(
    file: UploadFile = File(...),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Uploads a CSV statement, parses transactions, and logs audit logs."""
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are supported.",
        )

    try:
        content = await file.read()
        parse_res = parse_transactions_csv(content)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"CSV parsing error: {str(e)}",
        )

    parsed_txs = parse_res["imported"]
    failed_count = parse_res["failed"]
    errors = parse_res["errors"]

    inserted_count = 0
    roundup_count = 0
    total_roundup = Decimal("0.00")

    # Fetch active goal
    active_goal = (
        db.query(Goal)
        .filter(Goal.user_id == current_user.user_id, Goal.status == "active")
        .first()
    )
    if not active_goal:
        active_goal = (
            db.query(Goal).filter(Goal.user_id == current_user.user_id).first()
        )

    for tx in parsed_txs:
        db_tx = Transaction(
            user_id=current_user.user_id,
            amount=tx["amount"],
            category=tx["category"],
            merchant=tx.get("merchant") or tx["description"],
            type=tx.get("type", "debit"),
            transaction_date=tx["transaction_date"],
            description=tx["description"],
            is_round_up_applied=False,
            round_up_amount=Decimal("0.00"),
            is_deleted=False,
        )
        db.add(db_tx)
        db.commit()
        db.refresh(db_tx)
        inserted_count += 1

        # Log transaction audit record
        audit = AuditLog(
            trans_id=db_tx.id,
            action="import_csv",
            performed_by=f"user_{current_user.user_id}",
            timestamp=datetime.utcnow(),
        )
        db.add(audit)
        db.commit()

        if active_goal:
            roundup_res = apply_roundup_if_eligible(
                db=db,
                transaction=db_tx,
                goal=active_goal,
                checking_balance=Decimal("150.00"),
            )
            if roundup_res.get("success"):
                roundup_count += 1
                amt = roundup_res.get("roundup_amount", Decimal("0.00"))
                total_roundup += amt
                db_tx.is_round_up_applied = True
                db_tx.round_up_amount = amt
                db.commit()

    return {
        "success": True,
        "message": f"Successfully imported {inserted_count} transactions.",
        "roundups_triggered": roundup_count,
        "total_roundup_saved": total_roundup,
        "failed_count": failed_count,
        "errors": errors,
    }
