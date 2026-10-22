"""
Bank sandbox — POST /bank/simulate

There is no live bank connection. This endpoint stands in for one: it creates
the transaction a bank feed could plausibly deliver next (from the student's own
spending history) and pushes it through exactly the same pipeline as a manually
logged purchase (round-up, budget alert, audit). The row is labelled
source="bank_simulation".
"""

from __future__ import annotations

from app.config import settings
from app.database import get_db
from app.middleware.auth_middleware import require_student
from app.models.models import Transaction, User
from app.routers.transactions import record_transaction
from app.schemas.schemas import TransactionCreate
from app.services.bank_sim import pick_simulated_purchase
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

router = APIRouter(prefix="/bank", tags=["Bank Sandbox"])

# Look at the most recent debits only — recent habits predict the next purchase.
HISTORY_LIMIT = 200


@router.post("/simulate", status_code=status.HTTP_201_CREATED)
async def simulate_bank_transaction(
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    if not settings.BANK_SIMULATION_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bank simulation is disabled on this server.",
        )

    history = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.user_id,
            Transaction.is_deleted == False,
            Transaction.type == "debit",
            Transaction.source != "bank_simulation",  # don't learn from our own output
        )
        .order_by(Transaction.transaction_date.desc())
        .limit(HISTORY_LIMIT)
        .all()
    )
    purchase = pick_simulated_purchase(
        [
            {"merchant": t.merchant, "category": t.category, "amount": t.amount}
            for t in history
        ]
    )
    if purchase is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "There's no spending history to base a simulation on yet. "
                "Import a bank statement first."
            ),
        )

    result = await record_transaction(
        db,
        current_user,
        TransactionCreate(
            amount=purchase["amount"],
            category=purchase["category"],
            merchant=purchase["merchant"],
            type="debit",
            description=purchase["merchant"],
        ),
        source="bank_simulation",
    )
    result["simulated"] = True
    result["based_on_purchases"] = purchase["based_on_purchases"]
    return result
