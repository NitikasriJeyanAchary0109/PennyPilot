import asyncio
import logging
from collections import Counter
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
from app.services.ledger import (
    check_budget_alert,
    estimate_checking_balance,
    pick_roundup_goal,
    sync_goal_status,
)
from app.services.rule_engine import apply_roundup_if_eligible
from app.utils.prompts import explain_roundup_prompt
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi import Query as FastAPIQuery
from sqlalchemy import or_
from sqlalchemy.orm import Session

logger = logging.getLogger("pennypilot.transactions")

router = APIRouter(prefix="/transactions", tags=["Transactions"])

# The roundup explanation is a nicety; never let a slow LLM hold up a purchase.
_EXPLANATION_TIMEOUT_SECONDS = 8.0
MAX_UPLOAD_BYTES = 2 * 1024 * 1024


def _import_key(when: datetime, amount, description, tx_type: str) -> tuple:
    """Identity used to recognise a transaction that was already imported."""
    return (
        when.date(),
        Decimal(str(amount)).quantize(Decimal("0.01")),
        (description or "").strip().lower(),
        tx_type,
    )


@router.get("/", response_model=List[TransactionResponse])
def get_my_transactions(
    limit: int = FastAPIQuery(20, ge=1, le=200),
    offset: int = FastAPIQuery(0, ge=0),
    category: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    has_roundup: Optional[bool] = FastAPIQuery(
        None, description="Only transactions that generated a round-up"
    ),
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
    if has_roundup is True:
        query = query.filter(Transaction.is_round_up_applied == True)
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


async def _roundup_explanation(transaction: Transaction, goal) -> tuple:
    """
    One-sentence explanation of a round-up.

    Tries the LLM briefly; otherwise falls back to a factual sentence assembled
    from the real figures (clearly labelled "template", never presented as AI).
    """
    description = transaction.description or transaction.merchant
    prompt = explain_roundup_prompt(
        transaction_desc=description,
        transaction_amount=transaction.amount,
        roundup_amount=transaction.round_up_amount,
    )
    try:
        text = await asyncio.wait_for(
            call_llama(
                system_prompt="You are Penny Pilot, explaining transaction roundups in one sentence.",
                user_prompt=prompt,
            ),
            timeout=_EXPLANATION_TIMEOUT_SECONDS,
        )
        return text, "ai"
    except Exception as exc:  # AIEngineError, timeout, anything else
        logger.warning("roundup explanation unavailable: %s", type(exc).__name__)
        return (
            f"₹{Decimal(str(transaction.round_up_amount)):.2f} from your "
            f"₹{Decimal(str(transaction.amount)):.2f} purchase at {description} "
            f"was saved toward “{goal.title}”.",
            "template",
        )


async def record_transaction(
    db: Session,
    current_user: User,
    transaction_data: TransactionCreate,
    source: str = "manual",
) -> dict:
    """
    Save a transaction for `current_user` and run the standard pipeline:
    audit log, round-up into the active goal, budget alert.

    Shared by manual entry and the bank simulation so both behave identically.
    `source` records where the row came from.
    """
    # Create the transaction
    db_transaction = Transaction(
        user_id=current_user.user_id,
        amount=transaction_data.amount,
        category=transaction_data.category,
        merchant=transaction_data.merchant,
        type=transaction_data.type,
        transaction_date=transaction_data.transaction_date or datetime.utcnow(),
        description=transaction_data.description or transaction_data.merchant,
        source=source,
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
        user_id=current_user.user_id,
        action="create",
        performed_by=f"user_{current_user.user_id}",
        timestamp=datetime.utcnow(),
    )
    db.add(audit)
    db.commit()

    roundup_result = None
    roundup_applied = False

    # Round-ups only apply to real spending (debits) and only when the student
    # has an active goal to receive them.
    active_goal = (
        pick_roundup_goal(db, current_user.user_id)
        if transaction_data.apply_roundup and db_transaction.type == "debit"
        else None
    )

    if active_goal:
        roundup_result = apply_roundup_if_eligible(
            db=db,
            transaction=db_transaction,
            goal=active_goal,
            checking_balance=estimate_checking_balance(db, current_user.user_id),
        )

        if roundup_result.get("success"):
            roundup_applied = True
            db_transaction.is_round_up_applied = True
            db_transaction.round_up_amount = roundup_result.get(
                "roundup_amount", Decimal("0.00")
            )
            sync_goal_status(db, active_goal)
            db.commit()
            db.refresh(db_transaction)

            roundup_result["explanation"], roundup_result["explanation_source"] = (
                await _roundup_explanation(db_transaction, active_goal)
            )

    if db_transaction.type == "debit":
        check_budget_alert(db, current_user.user_id, db_transaction.category)

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
            "source": db_transaction.source,
            "created_at": db_transaction.created_at,
            "is_deleted": db_transaction.is_deleted,
        },
        "roundup_applied": roundup_applied,
        "roundup_details": roundup_result,
    }


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
    return await record_transaction(db, current_user, transaction_data, "manual")


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
                    sync_goal_status(db, goal)
            db.delete(savings_record)

        tx.is_round_up_applied = False
        tx.round_up_amount = Decimal("0.00")

    # Soft delete
    tx.is_deleted = True

    # Log delete audit record
    audit = AuditLog(
        trans_id=tx.id,
        user_id=current_user.user_id,
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
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are supported.",
        )

    try:
        content = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="CSV file is too large (max 2 MB).",
            )
        parse_res = parse_transactions_csv(content)
    except HTTPException:
        raise
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
    duplicates_skipped = 0
    total_roundup = Decimal("0.00")

    # Re-importing a statement must not double-count it: rows that match an
    # existing transaction (same day, amount, description and direction) are
    # skipped. Matching is by count, so genuinely repeated rows inside one file
    # are still kept.
    existing = Counter(
        _import_key(t.transaction_date, t.amount, t.description or t.merchant, t.type)
        for t in db.query(Transaction).filter(
            Transaction.user_id == current_user.user_id,
            Transaction.is_deleted == False,
        )
    )

    # Round-ups go to the oldest active goal (if any)
    active_goal = pick_roundup_goal(db, current_user.user_id)

    # The whole file is one transaction: either every row is saved or none is.
    try:
        for tx in parsed_txs:
            tx_type = tx.get("type") or "debit"
            key = _import_key(
                tx["transaction_date"], tx["amount"], tx["description"], tx_type
            )
            if existing[key] > 0:
                existing[key] -= 1
                duplicates_skipped += 1
                continue

            db_tx = Transaction(
                user_id=current_user.user_id,
                amount=tx["amount"],
                category=tx["category"],
                merchant=tx.get("merchant") or tx["description"],
                type=tx_type,
                transaction_date=tx["transaction_date"],
                description=tx["description"],
                source="csv_import",
                is_round_up_applied=False,
                round_up_amount=Decimal("0.00"),
                is_deleted=False,
            )
            db.add(db_tx)
            db.flush()  # assigns the id; autoflush is off, so flush explicitly
            inserted_count += 1

            db.add(
                AuditLog(
                    trans_id=db_tx.id,
                    user_id=current_user.user_id,
                    action="import_csv",
                    performed_by=f"user_{current_user.user_id}",
                    timestamp=datetime.utcnow(),
                )
            )

            if active_goal and db_tx.type == "debit":
                roundup_res = apply_roundup_if_eligible(
                    db=db,
                    transaction=db_tx,
                    goal=active_goal,
                    checking_balance=estimate_checking_balance(
                        db, current_user.user_id
                    ),
                    commit=False,
                )
                if roundup_res.get("success"):
                    roundup_count += 1
                    amt = roundup_res.get("roundup_amount", Decimal("0.00"))
                    total_roundup += amt
                    db_tx.is_round_up_applied = True
                    db_tx.round_up_amount = amt
                    sync_goal_status(db, active_goal, commit=False)
                    if active_goal.status != "active":
                        # Goal just completed — later rows go to the next one.
                        db.flush()
                        active_goal = pick_roundup_goal(db, current_user.user_id)
            db.flush()
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The import failed and nothing was saved. Please try again.",
        )

    return {
        "success": True,
        "message": f"Successfully imported {inserted_count} transactions.",
        "imported_count": inserted_count,
        "roundups_triggered": roundup_count,
        "total_roundup_saved": total_roundup,
        "failed_count": failed_count,
        "duplicates_skipped": duplicates_skipped,
        "errors": errors,
    }
