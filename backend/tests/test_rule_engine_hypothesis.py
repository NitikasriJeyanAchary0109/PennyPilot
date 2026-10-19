"""Hypothesis property-based tests for the Rule Engine.

Validates core mathematical invariants:
1. Roundups are never negative under any transaction amount.
2. Budget ceilings and status transitions are strictly respected.
3. Deltas and arithmetic scaling remain consistent.
"""

from decimal import Decimal

import hypothesis.strategies as st
from app.services.rule_engine import (
    BUDGET_EXCEEDED_THRESHOLD,
    BUDGET_WARNING_THRESHOLD,
    GOAL_UNREACHABLE_DATE,
    budget_status,
    calculate_roundup,
    goal_forecast,
    process_transaction,
    remaining_budget,
    savings_velocity,
    stress_score,
)
from hypothesis import given

# Strategy for realistic rupee amounts (two decimal places)
st_rupee_amount = st.decimals(
    min_value=Decimal("-1000.00"),
    max_value=Decimal("1000000.00"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

st_positive_amount = st.decimals(
    min_value=Decimal("0.01"),
    max_value=Decimal("500000.00"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

st_budget = st.decimals(
    min_value=Decimal("1.00"),
    max_value=Decimal("500000.00"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

st_spent = st.decimals(
    min_value=Decimal("0.00"),
    max_value=Decimal("1000000.00"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)


# ---------------------------------------------------------------------------
# 1. ROUNDUP INVARIANTS: NEVER NEGATIVE & REACHES MILESTONE
# ---------------------------------------------------------------------------


@given(amount=st_rupee_amount)
def test_property_roundups_never_negative(amount: Decimal):
    """Property 1: calculate_roundup must NEVER return a negative Decimal."""
    roundup = calculate_roundup(amount)
    assert isinstance(roundup, Decimal)
    assert roundup >= Decimal("0.00"), f"Negative roundup {roundup} for amount {amount}"
    assert roundup.as_tuple().exponent == -2  # Always 2 decimal places


@given(amount=st_positive_amount)
def test_property_roundup_milestone_alignment(amount: Decimal):
    """Property: The transaction amount + roundup must reach an exact milestone."""
    roundup = calculate_roundup(amount)
    total = amount + roundup

    # Total must have zero paise (integer rupees)
    assert total % Decimal("1.00") == Decimal("0.00")

    # If the original amount had no paise (e.g. ₹150), total must be next multiple of 10
    paise = amount - Decimal(int(amount))
    if paise == Decimal("0"):
        assert total % Decimal("10.00") == Decimal("0.00")
        assert roundup > Decimal("0.00")
        assert roundup <= Decimal("10.00")
    else:
        # If original amount had paise, roundup rounds up to the next integer rupee (< ₹1.00)
        assert roundup > Decimal("0.00")
        assert roundup < Decimal("1.00")


@given(amount=st_rupee_amount)
def test_property_process_transaction_equals_calculate_roundup(amount: Decimal):
    """process_transaction wrapper must match calculate_roundup identically."""
    assert process_transaction(amount) == calculate_roundup(amount)


# ---------------------------------------------------------------------------
# 2. BUDGET INVARIANTS: CEILINGS RESPECTED
# ---------------------------------------------------------------------------


@given(budget=st_budget, spent=st_spent)
def test_property_budget_ceilings_respected(budget: Decimal, spent: Decimal):
    """Property 2: Budget status transitions must strictly obey thresholds."""
    status = budget_status(budget, spent)
    ratio = spent / budget

    if ratio >= BUDGET_EXCEEDED_THRESHOLD:
        assert status == "exceeded"
    elif ratio >= BUDGET_WARNING_THRESHOLD:
        assert status == "warning"
    else:
        assert status == "safe"

    # Headroom invariant
    headroom = remaining_budget(budget, spent)
    assert headroom == (budget - spent)
    if spent > budget:
        assert headroom < Decimal("0.00")
    elif spent < budget:
        assert headroom > Decimal("0.00")
    else:
        assert headroom == Decimal("0.00")


# ---------------------------------------------------------------------------
# 3. DELTA CONSISTENCY INVARIANTS
# ---------------------------------------------------------------------------


@given(
    budget=st_budget,
    spent=st_spent,
    delta=st.decimals(
        min_value=Decimal("-10000.00"),
        max_value=Decimal("10000.00"),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    ),
)
def test_property_budget_delta_consistency(
    budget: Decimal, spent: Decimal, delta: Decimal
):
    """Property 3: Shifting spend by delta shifts remaining budget by -delta exactly."""
    initial_remaining = remaining_budget(budget, spent)
    new_remaining = remaining_budget(budget, spent + delta)
    assert new_remaining == initial_remaining - delta


@given(
    target=st.decimals(
        min_value=Decimal("100.00"), max_value=Decimal("500000.00"), places=2
    ),
    current=st.decimals(
        min_value=Decimal("0.00"), max_value=Decimal("100.00"), places=2
    ),
    v1=st.decimals(min_value=Decimal("100.00"), max_value=Decimal("5000.00"), places=2),
    v2_delta=st.decimals(
        min_value=Decimal("1.00"), max_value=Decimal("5000.00"), places=2
    ),
)
def test_property_forecast_velocity_monotonicity(
    target: Decimal, current: Decimal, v1: Decimal, v2_delta: Decimal
):
    """Property: Increasing savings velocity never delays the goal completion date."""
    v2 = v1 + v2_delta  # v2 > v1
    date1 = goal_forecast(target, current, v1)
    date2 = goal_forecast(target, current, v2)

    assert date1 is not None and date2 is not None
    assert date1 != GOAL_UNREACHABLE_DATE
    assert date2 != GOAL_UNREACHABLE_DATE
    # Higher velocity must achieve the goal on the same day or earlier
    assert date2 <= date1


@given(
    amounts=st.lists(
        st.decimals(min_value=Decimal("0.01"), max_value=Decimal("1000.00"), places=2),
        min_size=1,
        max_size=50,
    ),
    period_days=st.integers(min_value=1, max_value=365),
)
def test_property_savings_velocity_scaling(amounts: list[Decimal], period_days: int):
    """Property: Velocity scales linearly with doubled contributions (within rounding)."""
    v1 = savings_velocity(amounts, period_days)
    doubled_amounts = [a * Decimal("2") for a in amounts]
    v2 = savings_velocity(doubled_amounts, period_days)

    assert abs(v2 - (v1 * Decimal("2"))) <= Decimal("0.02")


@given(
    savings_rate=st.decimals(
        min_value=Decimal("0.00"), max_value=Decimal("50000.00"), places=2
    ),
    spend_velocity=st.decimals(
        min_value=Decimal("0.00"), max_value=Decimal("100000.00"), places=2
    ),
    overruns=st.integers(min_value=0, max_value=20),
)
def test_property_stress_score_bounds(
    savings_rate: Decimal, spend_velocity: Decimal, overruns: int
):
    """Property: Financial stress score must always lie within [0, 100]."""
    score = stress_score(savings_rate, spend_velocity, overruns)
    assert 0 <= score <= 100
