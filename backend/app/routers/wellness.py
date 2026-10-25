from __future__ import annotations

import asyncio
import datetime
import logging
from decimal import Decimal

from app.database import get_db
from app.middleware.auth_middleware import require_student
from app.models.models import Budget, FinancialHealth, User
from app.schemas.schemas import FinancialHealthResponse, StressRequest
from app.services.ai_engine import call_llama
from app.services.ledger import (
    calculate_spent_amount,
    recent_debit_total,
    recent_savings_amounts,
)
from app.services.rule_engine import savings_velocity, stress_score
from app.utils.prompts import wellness_prompt
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

logger = logging.getLogger("pennypilot.wellness")

# Wording thresholds used only to explain the score (the score itself comes from
# rule_engine.stress_score).
LOW_SAVINGS_THRESHOLD = Decimal("1000")
HIGH_SPEND_THRESHOLD = Decimal("15000")
# A stored narrative is reused only while the underlying score is unchanged and
# the report is this fresh.
NARRATIVE_REUSE_WINDOW = datetime.timedelta(hours=1)
AI_NARRATION_TIMEOUT_SECONDS = 20.0

router = APIRouter(prefix="", tags=["Financial Wellness"])


def _calculate_wellness_metrics(db: Session, user_id: int, timeframe_days: int):
    # 1. Fetch budgets
    budgets = (
        db.query(Budget)
        .filter(Budget.user_id == user_id, Budget.is_deleted == False)
        .all()
    )

    # 2. Savings rate: deposits inside the timeframe, scaled to a month
    monthly_savings = savings_velocity(
        recent_savings_amounts(db, user_id, timeframe_days), timeframe_days
    )

    # 3. Spend rate: debits inside the timeframe, scaled to a month
    spend_in_window = recent_debit_total(db, user_id, timeframe_days)
    spend_velocity = (
        spend_in_window / Decimal(timeframe_days) * Decimal("30")
    ).quantize(Decimal("0.01"))

    # 4. Budget overruns in each budget's current period
    budget_overruns = 0
    top_overspend_category = None
    max_overspend_amount = Decimal("0.00")

    for budget in budgets:
        spent = calculate_spent_amount(
            db, user_id, budget.category, budget.period, budget.start_date
        )
        limit = Decimal(str(budget.limit_amount))
        if spent > limit:
            budget_overruns += 1
            overspend = spent - limit
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
    elif monthly_savings < LOW_SAVINGS_THRESHOLD:
        reasons.append("Low monthly savings velocity relative to spending")

    if budget_overruns > 0:
        reasons.append(
            f"Exceeded budget limit in {budget_overruns} category/categories"
        )

    if spend_velocity > HIGH_SPEND_THRESHOLD:
        reasons.append("High overall spending volume detected this month")

    suggestions_context = {
        "monthly_savings": float(monthly_savings),
        "budget_overruns": budget_overruns,
    }
    if top_overspend_category:
        suggestions_context["top_overspend"] = top_overspend_category

    return score, health_score, reasons, suggestions_context


def _factual_summary(health_score: int, reasons: list) -> str:
    """Plain statement assembled from the computed result (no AI involved)."""
    if reasons:
        return (
            f"Your financial wellness score is {health_score}/100. "
            + "; ".join(reasons)
            + "."
        )
    return (
        f"Your financial wellness score is {health_score}/100. "
        "No savings, spending or budget risk factors were found in this period."
    )


def _report_for(db: Session, user_id: int, timeframe_days: int):
    """
    The wellness report for the current numbers — without waiting for any AI.

    The score, health score and a plain factual summary are computed and stored
    straight away. A stored report is reused while the score is unchanged and it is
    fresh, so an AI narration written earlier is kept (summary_source == "ai").
    """
    score, health_score, reasons, suggestions_context = _calculate_wellness_metrics(
        db, user_id, timeframe_days
    )
    recent = (
        db.query(FinancialHealth)
        .filter(
            FinancialHealth.user_id == user_id,
            FinancialHealth.stress_score == score,
            FinancialHealth.created_at
            >= datetime.datetime.utcnow() - NARRATIVE_REUSE_WINDOW,
        )
        .order_by(FinancialHealth.created_at.desc())
        .first()
    )
    if recent:
        return recent, score, reasons, suggestions_context

    report = FinancialHealth(
        user_id=user_id,
        health_score=health_score,
        stress_score=score,
        ai_summary=_factual_summary(health_score, reasons),
        summary_source="factual",
        created_at=datetime.datetime.utcnow(),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report, score, reasons, suggestions_context


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
    Deterministic wellness / stress score, returned immediately.

    `ai_summary` is a plain statement of the computed result unless an AI
    narration for this exact score already exists (`summary_source == "ai"`).
    To get the friendlier AI version, call POST /wellness/narrate/{report_id} —
    it can take a while with a local model, so it is kept off this fast path.
    """
    report, *_ = _report_for(db, current_user.user_id, timeframe_days)
    return report


@router.post(
    "/wellness/narrate/{report_id}",
    response_model=FinancialHealthResponse,
    status_code=status.HTTP_200_OK,
)
async def narrate_wellness_report(
    report_id: int,
    timeframe_days: int = Query(default=30, ge=1, le=365),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """
    Replace a report's plain summary with the AI's narration, if the model can
    provide one (within AI_NARRATION_TIMEOUT_SECONDS, with every figure in it
    taken from the data). On any failure the plain summary stays and the report
    is returned unchanged — the caller can tell by `summary_source`.
    """
    report = (
        db.query(FinancialHealth)
        .filter(
            FinancialHealth.report_id == report_id,
            FinancialHealth.user_id == current_user.user_id,
        )
        .first()
    )
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found."
        )
    if report.summary_source == "ai":
        return report

    score, _health, reasons, suggestions_context = _calculate_wellness_metrics(
        db, current_user.user_id, timeframe_days
    )
    if score != report.stress_score:
        return report  # the numbers moved on; narrating them would be misleading

    prompt = wellness_prompt(
        stress_score=score, reasons=reasons, suggestions_context=suggestions_context
    )
    try:
        narration = await asyncio.wait_for(
            call_llama(
                system_prompt="You are Penny Pilot, giving friendly, non-judgmental wellness insights.",
                user_prompt=prompt,
            ),
            timeout=AI_NARRATION_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        logger.warning(
            "wellness.narrate | AI narration unavailable: %s", type(exc).__name__
        )
        return report

    report.ai_summary = narration
    report.summary_source = "ai"
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
