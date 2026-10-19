"""Regression tests verifying the Zero-Arithmetic Contract across all prompt builders.

Contract Rule:
The LLM never calculates; all numeric figures (currency amounts, dates, velocity,
stress scores, remaining headroom, and accelerated scenarios) must be precomputed
deterministically in Python before entering prompts.
Prompt builders are pure formatters. Every financial number appearing in a prompt
must originate directly from precomputed input arguments.
"""

import datetime
import re
from decimal import Decimal
from typing import Set

from app.services.rule_engine import (
    calculate_accelerated_savings_options,
    format_accelerated_options,
)
from app.utils.prompts import (
    coach_system_prompt,
    coach_user_prompt,
    dream_engine_prompt,
    explain_roundup_prompt,
    negotiator_prompt,
    wellness_prompt,
)

# Standard template constants (sentence length limits, rule indexes, percentage/scale bases)
ALLOWED_TEMPLATE_CONSTANTS = {
    Decimal("1"),
    Decimal("2"),
    Decimal("3"),
    Decimal("4"),
    Decimal("5"),  # transaction lookback count mention if any
    Decimal("100"),  # stress score denominator (/100)
    Decimal("9999"),  # sentinel year if formatted
}


def extract_numbers_from_text(text: str) -> Set[Decimal]:
    """Extract all integer and floating-point numbers from a string as Decimals."""
    # Matches patterns like ₹145, ₹1,200.50, 45000, 3.14, 250
    # Clean commas inside numbers
    cleaned = text.replace(",", "")
    matches = re.findall(r"\b\d+(?:\.\d+)?\b", cleaned)
    numbers = set()
    for m in matches:
        try:
            numbers.add(Decimal(m))
        except Exception:
            pass
    return numbers


def test_coach_system_prompt_has_no_financial_numbers():
    prompt = coach_system_prompt()
    numbers = extract_numbers_from_text(prompt)
    # Only sentence count limit '4' should be present
    assert numbers.issubset(ALLOWED_TEMPLATE_CONSTANTS)


def test_coach_user_prompt_numbers_all_precomputed():
    recent_transactions = [
        {"merchant": "Cafe Day", "amount": 185, "category": "Food"},
        {"merchant": "Bookstore", "amount": 620, "category": "Education"},
    ]
    goals = [
        {"name": "Laptop", "target": 55000, "saved": 14200},
    ]
    budgets = [
        {"category": "Food", "budget": 4500, "spent": 3100, "status": "warning"},
    ]

    expected_inputs = {
        Decimal("185"),
        Decimal("620"),
        Decimal("55000"),
        Decimal("14200"),
        Decimal("4500"),
        Decimal("3100"),
    }

    prompt = coach_user_prompt(
        message="Can I afford a new headphone for 2500?",
        recent_transactions=recent_transactions,
        goals=goals,
        budgets=budgets,
    )

    found_numbers = extract_numbers_from_text(prompt)
    # The message itself has 2500
    expected_all = expected_inputs | {Decimal("2500")} | ALLOWED_TEMPLATE_CONSTANTS
    unexpected = found_numbers - expected_all
    assert not unexpected, f"Unexpected numbers in coach prompt: {unexpected}"


def test_negotiator_prompt_numbers_all_precomputed():
    price = Decimal("3499.00")
    expected_inputs = {price, Decimal("3499")}

    prompt = negotiator_prompt(
        price=price,
        category="Electronics",
        description="Noise Cancelling Headphones",
        budget_status="warning",
        goal_impact="delays Laptop goal by ~3 weeks",
    )

    found_numbers = extract_numbers_from_text(prompt)
    # In addition to price, goal_impact mentions 3 weeks
    expected_all = expected_inputs | {Decimal("3")} | ALLOWED_TEMPLATE_CONSTANTS
    unexpected = found_numbers - expected_all
    assert not unexpected, f"Unexpected numbers in negotiator prompt: {unexpected}"


def test_dream_engine_prompt_numbers_all_precomputed():
    target = Decimal("40000.00")
    current = Decimal("15000.00")
    velocity = Decimal("1250.00")
    remaining = target - current  # 25000
    forecast_date = datetime.date(2027, 8, 1)

    accel_options = calculate_accelerated_savings_options(
        target, current, velocity, increments=[Decimal("250.00"), Decimal("500.00")]
    )
    accel_text = format_accelerated_options(accel_options)

    prompt = dream_engine_prompt(
        goal_name="Electric Scooter",
        target_amount=target,
        current_amount=current,
        forecast_date=forecast_date,
        velocity=velocity,
        accelerated_options_text=accel_text,
    )

    # Gather all precomputed numbers
    expected_precomputed = {
        Decimal("40000"),
        Decimal("15000"),
        remaining,
        Decimal("1250"),  # velocity
        Decimal("2027"),  # year
        Decimal("250"),  # increment 1
        Decimal("1500"),  # new velocity 1
        Decimal("500"),  # increment 2
        Decimal("1750"),  # new velocity 2
    }
    for opt in accel_options:
        expected_precomputed.add(Decimal(opt["months_saved"]))
        if opt["projected_date"]:
            expected_precomputed.add(Decimal(opt["projected_date"].year))

    found_numbers = extract_numbers_from_text(prompt)
    unexpected = found_numbers - (expected_precomputed | ALLOWED_TEMPLATE_CONSTANTS)
    assert not unexpected, f"Unexpected numbers in dream prompt: {unexpected}"


def test_wellness_prompt_numbers_all_precomputed():
    stress = 42
    reasons = ["Low savings rate", "2 budget overruns this month"]
    suggestions_context = {
        "monthly_savings": Decimal("850.00"),
        "top_overspend": "Dining",
        "budget_overruns": 2,
    }

    expected_inputs = {
        Decimal("42"),
        Decimal("850"),
        Decimal("2"),
    }

    prompt = wellness_prompt(stress, reasons, suggestions_context)
    found_numbers = extract_numbers_from_text(prompt)
    unexpected = found_numbers - (expected_inputs | ALLOWED_TEMPLATE_CONSTANTS)
    assert not unexpected, f"Unexpected numbers in wellness prompt: {unexpected}"


def test_explain_roundup_prompt_numbers_all_precomputed():
    tx_amt = Decimal("142.50")
    roundup = Decimal("0.50")

    prompt = explain_roundup_prompt("Groceries", tx_amt, roundup)
    found_numbers = extract_numbers_from_text(prompt)
    expected_inputs = {tx_amt, roundup}
    unexpected = found_numbers - (expected_inputs | ALLOWED_TEMPLATE_CONSTANTS)
    assert not unexpected, f"Unexpected numbers in roundup prompt: {unexpected}"
