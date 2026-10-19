from __future__ import annotations

import datetime
import logging
from decimal import Decimal

from app.database import get_db
from app.middleware.auth_middleware import require_student
from app.models.models import Budget, FinancialHealth, Savings, Transaction, User
from app.schemas.schemas import FinancialHealthResponse, StressRequest
from app.services.ai_engine import AIEngineError, call_llama
from app.services.rule_engine import savings_velocity, stress_score
from app.utils.prompts import wellness_prompt
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

logger = logging.getLogger("sparechange_ai.wellness")

router = APIRouter(prefix="", tags=["Financial Wellness"])


def _calculate_wellness_metrics(db: Session, user_id: int, timeframe_days: int):
    # Time boundary
    time_limit = datetime.datetime.utcnow() - datetime.timedelta(days=timeframe_days)

    # 1. Fetch budgets
    budgets = (
        db.query(Budget)
        .filter(Budget.user_id == user_id, Budget.is_deleted == False)
        .all()
    )

    # 2. Fetch transactions within timeframe
    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.is_deleted == False,
            Transaction.transaction_date >= time_limit,
        )
        .all()
    )

    # 3. Fetch savings velocity
    savings_records = db.query(Savings).filter(Savings.user_id == user_id).all()
    monthly_savings = savings_velocity(
        [Decimal(str(record.amount)) for record in savings_records],
        30,
    )

    # 4. Calculate spend velocity (total debits in timeframe)
    spend_velocity = sum(
        (Decimal(str(tx.amount)) for tx in transactions if tx.type == "debit"),
        Decimal("0.00"),
    )

    # 5. Calculate budget overruns
    budget_overruns = 0
    top_overspend_category = None
    max_overspend_amount = Decimal("0.00")

    for budget in budgets:
        # Sum category debits in timeframe
        spent = sum(
            (
                Decimal(str(tx.amount))
                for tx in transactions
                if tx.category == budget.category and tx.type == "debit"
            ),
            Decimal("0.00"),
        )
        if spent > Decimal(str(budget.limit_amount)):
            budget_overruns += 1
            overspend = spent - Decimal(str(budget.limit_amount))
            if overspend > max_overspend_amount:
                max_overspend_amount = overspend
                top_overspend_category = budget.category

    # Compute stress score (0-100)
    score = stress_score(monthly_savings, spend_velocity, budget_overruns)
    health_score = max(100 - score, 0)

    # Assemble reasons list
    reasons = []
    if monthly_savings == 0:
        reasons.append("Savings velocity is currently ₹0/month")
    elif monthly_savings < 1000:
        reasons.append("Low monthly savings velocity relative to spending")

    if budget_overruns > 0:
        reasons.append(
            f"Exceeded budget limit in {budget_overruns} category/categories"
        )

    if spend_velocity > 15000:
        reasons.append("High overall spending volume detected this month")

    suggestions_context = {
        "monthly_savings": float(monthly_savings),
        "budget_overruns": budget_overruns,
    }
    if top_overspend_category:
        suggestions_context["top_overspend"] = top_overspend_category

    return score, health_score, reasons, suggestions_context


@router.get(
    "/wellness/score",
    response_model=FinancialHealthResponse,
    status_code=status.HTTP_200_OK,
)
async def get_wellness_score(
    timeframe_days: int = Query(default=30, ge=1, le=365),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """
    Computes a deterministic stress score and triggers the AI engine to generate
    a personalized wellness narrative advice. Caches the result in the database.
    """
    score, health_score, reasons, suggestions_context = _calculate_wellness_metrics(
        db, current_user.user_id, timeframe_days
    )

    # Build wellness narration
    prompt = wellness_prompt(
        stress_score=score,
        reasons=reasons,
        suggestions_context=suggestions_context,
    )

    try:
        ai_summary = await call_llama(
            system_prompt="You are SpareChange AI, giving friendly, non-judgmental wellness insights.",
            user_prompt=prompt,
        )
    except AIEngineError as exc:
        logger.error("wellness.score | AIEngineError: %s", exc.message)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI wellness scanning is currently offline. Please try again in a moment.",
        ) from exc

    # Cache report in FinancialHealth table
    report = FinancialHealth(
        user_id=current_user.user_id,
        health_score=health_score,
        stress_score=score,
        ai_summary=ai_summary,
        created_at=datetime.datetime.utcnow(),
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return report


@router.post(
    "/wellness/score",
    response_model=FinancialHealthResponse,
    status_code=status.HTTP_200_OK,
)
async def generate_wellness_score_post(
    request: StressRequest,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """
    POST-equivalent endpoint for wellness analysis, supporting JSON-based timeframe configuration.
    """
    return await get_wellness_score(
        timeframe_days=request.timeframe_days,
        current_user=current_user,
        db=db,
    )


@router.post(
    "/stress/",
    response_model=FinancialHealthResponse,
    status_code=status.HTTP_200_OK,
    deprecated=True,
)
async def generate_stress_meter_post_compat(
    request: StressRequest,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """
    POST compatibility endpoint for stress analysis.
    """
    return await get_wellness_score(
        timeframe_days=request.timeframe_days,
        current_user=current_user,
        db=db,
    )


@router.get(
    "/wellness/latest",
    response_model=FinancialHealthResponse,
    status_code=status.HTTP_200_OK,
)
def get_latest_wellness_report(
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """
    Retrieves the most recent cached financial health/stress report for the authenticated user.
    """
    report = (
        db.query(FinancialHealth)
        .filter(FinancialHealth.user_id == current_user.user_id)
        .order_by(FinancialHealth.created_at.desc())
        .first()
    )
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No financial wellness report has been generated yet for this user.",
        )
    return report
