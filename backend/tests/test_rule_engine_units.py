"""Unit tests for app.services.rule_engine verifying deterministic business logic."""

import datetime
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from app.services.rule_engine import (
    GOAL_UNREACHABLE_DATE,
    apply_roundup_if_eligible,
    budget_status,
    calculate_roundup,
    goal_forecast,
    is_eligible_for_roundup,
    process_transaction,
    remaining_budget,
    savings_summary,
    savings_velocity,
    stress_score,
)


def test_calculate_roundup_paise_tier1():
    # Fractional paise rounds up to next whole rupee
    assert calculate_roundup(Decimal("127.60")) == Decimal("0.40")
    assert calculate_roundup(Decimal("99.01")) == Decimal("0.99")
    assert calculate_roundup(Decimal("0.50")) == Decimal("0.50")


def test_calculate_roundup_whole_rupee_tier2():
    # Whole rupee rounds up to next multiple of 10
    assert calculate_roundup(Decimal("145.00")) == Decimal("5.00")
    assert calculate_roundup(Decimal("140.00")) == Decimal("10.00")
    assert calculate_roundup(Decimal("150.00")) == Decimal("10.00")
    assert calculate_roundup(Decimal("1.00")) == Decimal("9.00")


def test_calculate_roundup_zero_and_negative():
    assert calculate_roundup(Decimal("0.00")) == Decimal("0.00")
    assert calculate_roundup(Decimal("-15.50")) == Decimal("0.00")


def test_is_eligible_for_roundup():
    assert is_eligible_for_roundup(Decimal("25.00")) is True
    assert is_eligible_for_roundup(Decimal("20.00")) is True
    assert is_eligible_for_roundup(Decimal("19.99")) is False
    assert (
        is_eligible_for_roundup(Decimal("50.00"), threshold=Decimal("60.00")) is False
    )


def test_process_transaction():
    assert process_transaction(Decimal("45.00")) == calculate_roundup(Decimal("45.00"))
    assert process_transaction(Decimal("45.25")) == calculate_roundup(Decimal("45.25"))


def test_remaining_budget_and_status():
    assert remaining_budget(Decimal("5000"), Decimal("2000")) == Decimal("3000")
    assert remaining_budget(Decimal("5000"), Decimal("6000")) == Decimal("-1000")

    assert budget_status(Decimal("1000"), Decimal("500")) == "safe"
    assert budget_status(Decimal("1000"), Decimal("700")) == "warning"
    assert budget_status(Decimal("1000"), Decimal("999")) == "warning"
    assert budget_status(Decimal("1000"), Decimal("1000")) == "exceeded"
    assert budget_status(Decimal("1000"), Decimal("1200")) == "exceeded"

    with pytest.raises(ValueError):
        budget_status(Decimal("0"), Decimal("100"))
    with pytest.raises(ValueError):
        budget_status(Decimal("-500"), Decimal("100"))


def test_savings_velocity_and_summary():
    # Empty or zero period
    assert savings_velocity([], 30) == Decimal("0.00")
    assert savings_velocity([Decimal("100")], 0) == Decimal("0.00")
    assert savings_velocity([Decimal("100")], -5) == Decimal("0.00")

    # Regular velocity
    vel = savings_velocity([Decimal("100"), Decimal("200")], 15)
    # Total = 300, daily = 20, monthly = 600
    assert vel == Decimal("600.00")

    # savings_summary
    now = datetime.datetime.utcnow()
    m1 = MagicMock(amount=Decimal("50.00"), source="round_up", created_at=now)
    m2 = MagicMock(amount=Decimal("150.00"), source="manual", created_at=now)
    summary = savings_summary([m1, m2])
    assert summary["total_saved"] == Decimal("200.00")
    assert summary["saved_this_month"] == Decimal("200.00")
    assert summary["saved_via_roundup"] == Decimal("50.00")
    assert summary["saved_via_manual"] == Decimal("150.00")


def test_goal_forecast():
    today = datetime.date.today()
    # Already met
    assert goal_forecast(Decimal("1000"), Decimal("1200"), Decimal("200")) == today
    assert goal_forecast(Decimal("1000"), Decimal("1000"), Decimal("200")) == today

    # Velocity <= 0
    assert (
        goal_forecast(Decimal("1000"), Decimal("500"), Decimal("0"))
        == GOAL_UNREACHABLE_DATE
    )
    assert (
        goal_forecast(Decimal("1000"), Decimal("500"), Decimal("-10"))
        == GOAL_UNREACHABLE_DATE
    )

    # Normal calculation
    # remaining = 500, vel = 500 -> 1 month = 30 days
    projected = goal_forecast(Decimal("1000"), Decimal("500"), Decimal("500"))
    assert projected == today + datetime.timedelta(days=30)


def test_stress_score_scenarios():
    # Low stress: healthy savings (>=3000), low spend, 0 overruns -> 0
    low = stress_score(Decimal("3500"), Decimal("0"), 0)
    assert low == 0

    # Max stress: 0 savings, high spend (>=15000), 5 overruns
    high = stress_score(Decimal("0"), Decimal("20000"), 5)
    assert high == 100

    # Intermediate stress
    med = stress_score(Decimal("1500"), Decimal("7500"), 2)
    assert 20 <= med <= 80


def test_apply_roundup_if_eligible_cases():
    db = MagicMock()
    tx = MagicMock(id=1, user_id=10, amount=Decimal("0.00"))
    goal = MagicMock(id=2, current_amount=Decimal("500.00"))

    # Case 1: zero roundup amount
    res1 = apply_roundup_if_eligible(db, tx, goal, Decimal("100.00"))
    assert res1["success"] is False
    assert "no roundup" in res1["reason"]

    # Case 2: balance below threshold
    tx.amount = Decimal("25.50")  # roundup = 0.50
    res2 = apply_roundup_if_eligible(
        db, tx, goal, Decimal("15.00"), threshold=Decimal("20.00")
    )
    assert res2["success"] is False
    assert "safety threshold" in res2["reason"]

    # Case 3: eligible success
    res3 = apply_roundup_if_eligible(
        db, tx, goal, Decimal("50.00"), threshold=Decimal("20.00")
    )
    assert res3["success"] is True
    assert res3["roundup_amount"] == Decimal("0.50")
    assert goal.current_amount == Decimal("500.50")
    db.add.assert_called_once()
    db.commit.assert_called_once()
