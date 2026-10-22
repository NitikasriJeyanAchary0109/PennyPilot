"""
Rule Engine — pure deterministic business logic for Penny Pilot.

Architecture contract
---------------------
- NEVER calls the LLM, imports ai_service, or makes any network/DB I/O.
- All money arithmetic uses Decimal (never float) to avoid floating-point drift.
- DB objects (Transaction, Goal, Savings) may be accepted as parameters from
  callers (routers / apply_roundup_if_eligible), but this file does NOT fetch
  them from the database itself.
- Every public function must be independently unit-testable with plain Python values.
"""

from __future__ import annotations

import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal, Optional

# ---------------------------------------------------------------------------
# Budget-status thresholds (adjust here; reflected everywhere automatically)
# ---------------------------------------------------------------------------
BUDGET_WARNING_THRESHOLD = Decimal("0.70")  # 70 % spent  → warning
BUDGET_EXCEEDED_THRESHOLD = Decimal("1.00")  # 100 % spent → exceeded

# ---------------------------------------------------------------------------
# Stress-score weights (must sum to 1.0 conceptually; see stress_score docs)
# ---------------------------------------------------------------------------
STRESS_WEIGHT_SAVINGS_RATE = Decimal("0.40")  # 40 % — how much you're saving
STRESS_WEIGHT_SPEND_VELOCITY = Decimal("0.40")  # 40 % — how fast you're spending
STRESS_WEIGHT_OVERRUNS = Decimal("0.20")  # 20 % — how often you bust a budget

# Sentinel date returned when goal completion cannot be predicted (velocity == 0)
GOAL_UNREACHABLE_DATE = datetime.date(9999, 12, 31)

# Minimum account balance required before a roundup is swept
DEFAULT_ROUNDUP_THRESHOLD = Decimal("20.00")


# ===========================================================================
# 1. ROUNDUP LOGIC
# ===========================================================================


def calculate_roundup(amount: Decimal) -> Decimal:
    """
    Return the rupee-paise difference between *amount* and the next savings
    milestone, following Penny Pilot's two-tier rounding rule:

    Tier 1 — amount has paise (fractional rupees):
        Round up to the next whole rupee.
        e.g. ₹127.60 → next whole rupee is ₹128 → roundup = ₹0.40
             ₹99.01  → ₹100 → roundup = ₹0.99

    Tier 2 — amount is already a whole rupee (no paise):
        Round up to the next multiple of 10.
        e.g. ₹145 → next multiple-of-10 is ₹150 → roundup = ₹5
             ₹140 → ₹150 → roundup = ₹10
             ₹150 → ₹160 → roundup = ₹10  (exact multiple goes to next one)

    Rationale: For digital UPI-style transactions amounts are usually whole
    rupees, so a ₹1 roundup would be negligible. Rounding to the nearest ₹10
    makes the auto-save feel meaningful without being painful.  Teams can swap
    this rule (e.g. always-to-next-100) by editing ONLY this function.

    Args:
        amount: Transaction amount in INR (must be ≥ 0).

    Returns:
        Roundup amount as Decimal with 2 decimal places. Returns Decimal('0.00')
        for non-positive amounts.
    """
    if amount <= Decimal("0"):
        return Decimal("0.00")

    # Separate rupees and paise
    rupees = int(amount)
    paise = amount - Decimal(rupees)

    if paise > Decimal("0"):
        # Tier 1: round up to next whole rupee
        next_milestone = Decimal(rupees + 1)
    else:
        # Tier 2: round up to next multiple of 10
        # math.ceil on integer division gives us the next multiple cleanly
        next_milestone = Decimal(((rupees // 10) + 1) * 10)

    roundup = next_milestone - amount
    return roundup.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def is_eligible_for_roundup(
    current_balance: Decimal,
    threshold: Decimal = DEFAULT_ROUNDUP_THRESHOLD,
) -> bool:
    """
    Return True if the account has enough buffer to absorb a roundup sweep.

    We never sweep if the post-roundup balance would drop below `threshold`
    (default ₹20), protecting the student from accidental overdraft.

    Args:
        current_balance: Current checking-account balance.
        threshold:       Minimum safe balance. Configurable per-user in future.
    """
    return current_balance >= threshold


def process_transaction(transaction_amount: Decimal) -> Decimal:
    """
    Given a transaction amount, return the savings amount that should be moved
    to the user's active savings goal.

    This is a thin orchestration wrapper so routers never call calculate_roundup
    directly — keeping the call graph explicit and easy to mock in tests.

    Args:
        transaction_amount: Gross spend amount from the transaction record.

    Returns:
        Decimal savings amount (₹0.00 if amount is non-positive).
    """
    return calculate_roundup(transaction_amount)


# ===========================================================================
# 2. BUDGET LOGIC
# ===========================================================================


def remaining_budget(budget: Decimal, spent: Decimal) -> Decimal:
    """
    Return how much budget headroom remains.

    Args:
        budget: Total allocated budget for the period (e.g. ₹5000/month).
        spent:  Amount already spent within that period.

    Returns:
        Remaining amount. Can be negative if the budget is exceeded.
    """
    return budget - spent


def budget_status(
    budget: Decimal,
    spent: Decimal,
) -> Literal["safe", "warning", "exceeded"]:
    """
    Classify the current spend relative to the allocated budget.

    Thresholds (defined as module-level constants; adjust there to propagate):
        < 70  % spent  →  "safe"
        70–100 % spent →  "warning"
        > 100 % spent  →  "exceeded"

    Args:
        budget: Total allocated budget (must be > 0 to avoid division by zero).
        spent:  Amount spent so far.

    Returns:
        One of "safe", "warning", or "exceeded".

    Raises:
        ValueError: If budget is zero or negative (undefined percentage).
    """
    if budget <= Decimal("0"):
        raise ValueError(f"budget must be positive; got {budget!r}")

    ratio = spent / budget

    if ratio >= BUDGET_EXCEEDED_THRESHOLD:
        return "exceeded"
    elif ratio >= BUDGET_WARNING_THRESHOLD:
        return "warning"
    else:
        return "safe"


# ===========================================================================
# 3. SAVINGS VELOCITY
# ===========================================================================


def savings_velocity(
    past_savings: list[Decimal],
    period_days: int,
) -> Decimal:
    """
    Compute the average *monthly* savings rate from a list of individual
    savings events recorded over `period_days` days.

    Formula:
        daily_rate   = sum(past_savings) / period_days
        monthly_rate = daily_rate × 30

    Args:
        past_savings: List of individual save amounts over the observation window.
        period_days:  Number of calendar days the list covers (must be > 0).

    Returns:
        Projected monthly savings as a Decimal rounded to 2 dp.
        Returns Decimal('0.00') if past_savings is empty or period_days ≤ 0.
    """
    if not past_savings or period_days <= 0:
        return Decimal("0.00")

    total = sum(past_savings, Decimal("0.00"))
    daily_rate = total / Decimal(period_days)
    monthly_rate = daily_rate * Decimal("30")
    return monthly_rate.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def savings_summary(savings_list) -> dict:
    import datetime

    now = datetime.datetime.utcnow()
    this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total = Decimal("0.00")
    this_month_total = Decimal("0.00")
    roundup_total = Decimal("0.00")
    manual_total = Decimal("0.00")

    for s in savings_list:
        total += s.amount
        if getattr(s, "created_at", None) and s.created_at >= this_month:
            this_month_total += s.amount

        if s.source == "round_up":
            roundup_total += s.amount
        elif s.source == "manual":
            manual_total += s.amount

    return {
        "total_saved": total,
        "saved_this_month": this_month_total,
        "saved_via_roundup": roundup_total,
        "saved_via_manual": manual_total,
    }


# ===========================================================================
# 4. GOAL FORECAST
# ===========================================================================


def goal_forecast(
    target_amount: Decimal,
    current_amount: Decimal,
    velocity: Decimal,
) -> Optional[datetime.date]:
    """
    Project the calendar date on which the student will reach their savings goal.

    Formula:
        remaining        = target_amount - current_amount
        months_needed    = remaining / velocity
        projected_date   = today + months_needed × 30 days

    Edge cases:
        - velocity == 0  → return GOAL_UNREACHABLE_DATE (9999-12-31) sentinel.
          Callers should treat this as "cannot predict; encourage saving."
        - remaining ≤ 0  → goal already met; return today's date.

    Args:
        target_amount:  Total rupees needed to complete the goal.
        current_amount: Rupees already saved toward the goal.
        velocity:       Monthly savings rate from savings_velocity().

    Returns:
        datetime.date of projected completion, or GOAL_UNREACHABLE_DATE.
    """
    remaining = target_amount - current_amount

    if remaining <= Decimal("0"):
        return datetime.date.today()

    if velocity <= Decimal("0"):
        return GOAL_UNREACHABLE_DATE

    months_needed = remaining / velocity
    days_needed = int(months_needed * Decimal("30"))
    try:
        projected_date = datetime.date.today() + datetime.timedelta(days=days_needed)
        if projected_date >= GOAL_UNREACHABLE_DATE:
            return GOAL_UNREACHABLE_DATE
        return projected_date
    except (OverflowError, ValueError):
        return GOAL_UNREACHABLE_DATE


def calculate_accelerated_savings_options(
    target_amount: Decimal,
    current_amount: Decimal,
    base_velocity: Decimal,
    increments: Optional[list[Decimal]] = None,
) -> list[dict]:
    """
    Precompute deterministic accelerated savings options showing how extra
    monthly contributions bring goal completion dates closer.

    Ensures that any timeline acceleration or monthly bump figures
    shown to the user (or discussed by the LLM) are computed here deterministically
    via Decimal math, adhering to the Zero-Arithmetic Contract.

    Args:
        target_amount:  Total goal cost in INR.
        current_amount: Current amount saved in INR.
        base_velocity:  Current monthly savings rate in INR.
        increments:     List of extra monthly contribution increments to evaluate.
                        Defaults to [₹250, ₹500, ₹1000].

    Returns:
        List of dicts, each containing:
          - extra_monthly: Decimal
          - new_velocity: Decimal
          - projected_date: Optional[datetime.date]
          - months_saved: int (0 if baseline was already unreachable or already met)
    """
    remaining = target_amount - current_amount
    if remaining <= Decimal("0"):
        return []

    if increments is None:
        increments = [Decimal("250.00"), Decimal("500.00"), Decimal("1000.00")]

    base_date = goal_forecast(target_amount, current_amount, base_velocity)

    results = []
    for inc in increments:
        if inc <= Decimal("0"):
            continue
        effective_vel = max(base_velocity, Decimal("0")) + inc
        new_date = goal_forecast(target_amount, current_amount, effective_vel)

        if base_date is None or base_date >= GOAL_UNREACHABLE_DATE:
            # Baseline was unreachable; extra savings makes it reachable
            months_saved = 0
        elif new_date is not None and base_date is not None and new_date < base_date:
            days_diff = (base_date - new_date).days
            months_saved = max(0, days_diff // 30)
        else:
            months_saved = 0

        results.append(
            {
                "extra_monthly": inc,
                "new_velocity": effective_vel,
                "projected_date": new_date,
                "months_saved": months_saved,
            }
        )

    return results


def format_accelerated_options(options: list[dict]) -> str:
    """
    Format precomputed acceleration options into a deterministic string block
    ready for direct insertion into LLM prompts.

    Args:
        options: List of scenario dicts from calculate_accelerated_savings_options.

    Returns:
        Formatted multi-line scenario string.
    """
    if not options:
        return "Accelerated savings options: None (goal is already met or no valid increments)."

    lines = ["Accelerated savings options (precomputed):"]
    for opt in options:
        extra = opt["extra_monthly"]
        new_vel = opt["new_velocity"]
        p_date = opt["projected_date"]
        months_saved = opt["months_saved"]

        date_str = (
            p_date.strftime("%B %Y")
            if p_date and p_date < GOAL_UNREACHABLE_DATE
            else "unreachable"
        )
        if months_saved > 0:
            lines.append(
                f"  • Save an extra ₹{extra:.0f}/month (total ₹{new_vel:.0f}/month): reach goal by {date_str} ({months_saved} months sooner)"
            )
        else:
            lines.append(
                f"  • Save an extra ₹{extra:.0f}/month (total ₹{new_vel:.0f}/month): reach goal by {date_str}"
            )

    return "\n".join(lines)


# ===========================================================================
# 5. STRESS SCORE
# ===========================================================================


def stress_score(
    savings_rate: Decimal,
    spend_velocity: Decimal,
    budget_overruns: int,
) -> int:
    """
    Compute a 0-100 financial stress score. Higher = more stressed.

    Scoring model
    -------------
    Three independent sub-scores (each 0-100) are weighted and combined:

        A. Savings deficit score (weight 40 %)
           Based on how low the savings rate is relative to a healthy benchmark
           of ₹3 000/month. Student saving ₹0 scores 100; saving ₹3 000+ scores 0.

        B. Spend velocity score (weight 40 %)
           Based on how high monthly spend is relative to a "comfortable" cap
           of ₹15 000/month. Spending ₹0 scores 0; spending ₹15 000+ scores 100.

        C. Budget overrun score (weight 20 %)
           Each overrun adds 20 stress points, capped at 100.
           (5 or more overruns in the period = maximum stress from this factor.)

    Benchmarks (HEALTHY_MONTHLY_SAVINGS, COMFORTABLE_SPEND_CAP) are defined
    as named constants below so the formula is transparent and adjustable.

    Weights are defined as module-level STRESS_WEIGHT_* constants above.

    Args:
        savings_rate:    Monthly savings amount (from savings_velocity()).
        spend_velocity:  Monthly spend amount (same units / period).
        budget_overruns: Number of budget categories exceeded this period.

    Returns:
        Integer stress score in range [0, 100].
    """
    # --- Benchmarks (tweak these to recalibrate without touching the formula) ---
    HEALTHY_MONTHLY_SAVINGS = Decimal("3000")  # ₹3 000/month = low-stress savings
    COMFORTABLE_SPEND_CAP = Decimal("15000")  # ₹15 000/month = low-stress spend

    # A: Savings deficit — inverse of savings rate relative to healthy benchmark
    if savings_rate >= HEALTHY_MONTHLY_SAVINGS:
        score_a = Decimal("0")
    else:
        score_a = (Decimal("1") - savings_rate / HEALTHY_MONTHLY_SAVINGS) * Decimal(
            "100"
        )

    # B: Spend velocity — proportional to comfortable cap
    if spend_velocity <= Decimal("0"):
        score_b = Decimal("0")
    else:
        score_b = min(
            spend_velocity / COMFORTABLE_SPEND_CAP * Decimal("100"), Decimal("100")
        )

    # C: Budget overruns — 20 pts each, capped at 100
    score_c = min(Decimal(budget_overruns) * Decimal("20"), Decimal("100"))

    # Weighted composite
    composite = (
        score_a * STRESS_WEIGHT_SAVINGS_RATE
        + score_b * STRESS_WEIGHT_SPEND_VELOCITY
        + score_c * STRESS_WEIGHT_OVERRUNS
    )

    return int(composite.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


# ===========================================================================
# Legacy compatibility shim
# NOTE: apply_roundup_if_eligible originally lived here and called call_ai().
#       The AI call has been moved to the router layer (routers/roundups.py).
#       This stub is kept so Member 1's router imports don't break.
#       TODO: Confirm with Member 1 — remove this once routers/roundups.py is
#             updated to call ai_engine.py directly for the explanation.
# ===========================================================================

try:
    from sqlalchemy.orm import Session  # noqa: F401  (kept for type hints below)

    # Models are imported lazily inside the function to avoid circular imports
    # if rule_engine is imported before the ORM is initialised.
    _SQLALCHEMY_AVAILABLE = True
except ImportError:
    _SQLALCHEMY_AVAILABLE = False


def apply_roundup_if_eligible(
    db,
    transaction,
    goal,
    checking_balance: Optional[Decimal],
    threshold: Decimal = DEFAULT_ROUNDUP_THRESHOLD,
) -> dict:
    """
    Orchestration helper kept for backward-compatibility with routers/roundups.py.

    Evaluates roundup eligibility, applies the roundup to goal.saved, persists a
    Savings record, and returns a structured result dict.  The AI explanation that
    used to be generated here should now be requested by the *caller* (router layer)
    via ai_engine.py — keeping this function free of LLM I/O.

    Args:
        db:               SQLAlchemy session (provided by the router via Depends).
        transaction:      ORM Transaction object (must have .amount, .user_id,
                          .description, .merchant attributes).
        goal:             ORM Goal object (must have .saved mutable attribute).
        checking_balance: Current account balance for the eligibility check, or
                          None when the balance is unknown (the student has not
                          recorded any income) — the safety check is then skipped
                          rather than judged against an invented number.
        threshold:        Minimum safe balance before roundup is paused.

    Returns:
        dict with keys: success, reason (if failed), save_id, roundup_amount,
        new_goal_amount.  No AI explanation — caller must fetch that separately.
    """
    import datetime as _dt  # local import to keep module-level namespace clean

    roundup_amount = calculate_roundup(Decimal(str(transaction.amount)))

    if roundup_amount == Decimal("0.00"):
        return {
            "success": False,
            "reason": "Transaction amount rounded to a milestone; no roundup generated.",
            "roundup_amount": Decimal("0.00"),
        }

    if checking_balance is not None and not is_eligible_for_roundup(
        checking_balance, threshold
    ):
        return {
            "success": False,
            "reason": (
                f"Account balance (₹{checking_balance:.2f}) is below the "
                f"safety threshold (₹{threshold:.2f}). Roundup paused."
            ),
            "roundup_amount": Decimal("0.00"),
        }

    # --- Mutate ORM objects (side-effects owned by the caller's session) ---
    goal.current_amount += roundup_amount

    # Import model lazily to avoid circular-import at module load time
    from app.models.models import Savings  # type: ignore[import]

    save_record = Savings(
        user_id=transaction.user_id,
        goal_id=goal.id,
        triggered_by_transaction_id=transaction.id,
        amount=roundup_amount,
        source="round_up",
        created_at=_dt.datetime.utcnow(),
    )
    db.add(save_record)
    db.commit()
    db.refresh(save_record)

    return {
        "success": True,
        "save_id": save_record.id,
        "roundup_amount": roundup_amount,
        "new_goal_amount": goal.current_amount,
        # AI explanation deliberately excluded — caller must request it from ai_engine.py
    }


# ===========================================================================
# QUICK SANITY CHECKS  (run: python -m app.services.rule_engine)
# ===========================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("Penny Pilot — Rule Engine sanity checks")
    print("=" * 60)

    # --- calculate_roundup ---
    print("\n[calculate_roundup]")
    cases = [
        ("₹127.60", Decimal("127.60")),
        ("₹145.00", Decimal("145.00")),
        ("₹140.00", Decimal("140.00")),
        ("₹150.00", Decimal("150.00")),
        ("₹99.01", Decimal("99.01")),
        ("₹0.00", Decimal("0.00")),
        ("₹10.00", Decimal("10.00")),
    ]
    for label, val in cases:
        print(f"  {label:>12}  →  roundup = ₹{calculate_roundup(val)}")

    # --- process_transaction ---
    print("\n[process_transaction]")
    print(f"  ₹127.60 tx → save ₹{process_transaction(Decimal('127.60'))}")

    # --- remaining_budget / budget_status ---
    print("\n[remaining_budget / budget_status]")
    tests = [(5000, 2000), (5000, 3700), (5000, 5200)]
    for bgt, spnt in tests:
        rem = remaining_budget(Decimal(bgt), Decimal(spnt))
        sts = budget_status(Decimal(bgt), Decimal(spnt))
        print(f"  budget=₹{bgt}, spent=₹{spnt}  →  remaining=₹{rem}, status={sts!r}")

    # --- savings_velocity ---
    print("\n[savings_velocity]")
    saves = [Decimal("150"), Decimal("200"), Decimal("75"), Decimal("300")]
    vel = savings_velocity(saves, period_days=30)
    print(f"  saves={saves} over 30 days  →  velocity=₹{vel}/month")

    # --- goal_forecast ---
    print("\n[goal_forecast]")
    print(
        f"  target=₹10000, saved=₹2000, velocity=₹{vel}/month  →  {goal_forecast(Decimal('10000'), Decimal('2000'), vel)}"
    )
    print(
        f"  velocity=₹0 (unreachable)  →  {goal_forecast(Decimal('10000'), Decimal('0'), Decimal('0'))}"
    )
    print(
        f"  already met               →  {goal_forecast(Decimal('500'), Decimal('600'), Decimal('300'))}"
    )

    # --- stress_score ---
    print("\n[stress_score]")
    scenarios = [
        ("Low stress", Decimal("4000"), Decimal("8000"), 0),
        ("Medium stress", Decimal("1500"), Decimal("12000"), 2),
        ("High stress", Decimal("0"), Decimal("18000"), 5),
    ]
    for label, sv, sp, ovr in scenarios:
        score = stress_score(sv, sp, ovr)
        print(
            f"  {label:>14}: savings=₹{sv}/mo, spend=₹{sp}/mo, overruns={ovr}  →  stress={score}/100"
        )

    print("\n✅  All checks complete.")
