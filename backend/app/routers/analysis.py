"""
Spending analysis — GET /analysis/spending

Summarises the student's past transactions (typically an imported bank
statement): income vs spend, where the money goes, recurring charges, and what
round-ups could add up to. All figures come from rule_engine.spending_profile.
"""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import List, Optional

from app.database import get_db
from app.middleware.auth_middleware import require_student
from app.models.models import Transaction, User
from app.services.rule_engine import spending_profile
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/analysis", tags=["Spending Analysis"])


class CategoryBreakdown(BaseModel):
    category: str
    total: Decimal
    monthly_average: Decimal
    share_percent: Decimal
    suggested_budget: Decimal


class RecurringMerchant(BaseModel):
    merchant: str
    category: str
    typical_amount: Decimal
    months_seen: int


class LargestPurchase(BaseModel):
    merchant: str
    category: str
    amount: Decimal
    date: datetime.date


class SpendingProfile(BaseModel):
    has_data: bool
    period_start: Optional[datetime.date] = None
    period_end: Optional[datetime.date] = None
    months_covered: int = 0
    transaction_count: int = 0
    total_income: Decimal = Decimal("0.00")
    total_spend: Decimal = Decimal("0.00")
    average_monthly_income: Decimal = Decimal("0.00")
    average_monthly_spend: Decimal = Decimal("0.00")
    average_monthly_net: Decimal = Decimal("0.00")
    spend_to_income_percent: Optional[Decimal] = None
    top_categories: List[CategoryBreakdown] = []
    recurring_merchants: List[RecurringMerchant] = []
    weekend_spend_percent: Decimal = Decimal("0.0")
    largest_purchase: Optional[LargestPurchase] = None
    estimated_monthly_roundup: Decimal = Decimal("0.00")


@router.get("/spending", response_model=SpendingProfile)
def get_spending_profile(
    months: int = Query(12, ge=1, le=36, description="How far back to look"),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    since = datetime.datetime.utcnow() - datetime.timedelta(days=31 * months)
    rows = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.user_id,
            Transaction.is_deleted == False,
            Transaction.transaction_date >= since,
            # Simulated rows are not past behaviour; leave them out of the analysis.
            Transaction.source != "bank_simulation",
        )
        .all()
    )
    return spending_profile(
        [
            {
                "date": t.transaction_date,
                "amount": Decimal(str(t.amount)),
                "type": t.type,
                "category": t.category,
                "merchant": t.merchant,
            }
            for t in rows
        ]
    )
