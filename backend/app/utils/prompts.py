"""
Prompts Utility — central repository for all LLM prompt-builder functions used
across the AI Engine, keeping natural-language templates out of business-logic
modules and making them easy to version, test, and localise independently.

Architecture contract
---------------------
- Every function in this module is a PURE function: takes typed Python values
  (str, Decimal, date, list, dict) already computed by rule_engine.py, and
  returns a formatted prompt string.  No I/O, no DB access, no arithmetic.
- Functions MUST NOT compute financial values themselves.  If a number is needed
  in a prompt, the caller (router or ai_engine.py) is responsible for computing
  it via rule_engine.py BEFORE calling the builder.
- All functions return plain str — no JSON, no HTML, no markdown wrappers.
- Target: system + user prompt combined should stay under ~200 words to keep
  Llama3 latency low and responses focused.

Naming convention
-----------------
  <feature>_system_prompt()  — persona/role instruction for the LLM's system turn
  <feature>_prompt(...)      — user turn, includes real data injected by callers

No placeholders, no "lorem ipsum", no demo text is ever acceptable in a prompt
returned by these functions — callers must supply real data.
"""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Optional

# ===========================================================================
# 1. FINANCIAL COACH
# ===========================================================================


def coach_system_prompt() -> str:
    """
    Return the system-turn persona for the AI Financial Coach.

    Called once per chat session; kept separate so routers can cache it and
    send it as the system message without re-building on every turn.
    """
    return (
        "You are Penny Pilot, a friendly financial coach for college students. "
        "Explain ideas in simple, plain language — no jargon. "
        "Never recommend risky behaviour: no crypto speculation, no payday loans, "
        "no gambling, no get-rich-quick schemes. "
        "Focus on sustainable saving habits and encouragement, not judgment. "
        "Be warm and concise — keep replies under 4 sentences unless the student "
        "asks for detail."
    )


def coach_user_prompt(
    message: str,
    recent_transactions: list,
    goals: list,
    budgets: list,
) -> str:
    """
    Build the user-turn prompt for the AI Financial Coach.

    The caller must supply pre-fetched, pre-formatted data.  This function only
    formats it into a compact context block — it does no filtering or arithmetic.

    Args:
        message:             The student's raw chat message.
        recent_transactions: List of dicts, e.g.
                             [{"merchant": "Zomato", "amount": 145, "category": "Food"}]
                             Pass the last 5 at most to keep the prompt short.
        goals:               List of dicts, e.g.
                             [{"name": "New Laptop", "target": 45000, "saved": 12000}]
        budgets:             List of dicts, e.g.
                             [{"category": "Food", "budget": 3000, "spent": 2100, "status": "warning"}]

    Returns:
        Formatted user-turn prompt string.
    """
    # --- Recent transactions block ---
    if recent_transactions:
        tx_lines = "\n".join(
            f"  • ₹{t.get('amount', '?')} at {t.get('merchant', 'Unknown')} "
            f"({t.get('category', '—')})"
            for t in recent_transactions
        )
        tx_block = f"Recent transactions:\n{tx_lines}"
    else:
        tx_block = "Recent transactions: None recorded yet."

    # --- Goals block ---
    if goals:
        goal_lines = "\n".join(
            f"  • {g.get('name', 'Goal')}: "
            f"₹{g.get('saved', 0)} saved of ₹{g.get('target', 0)}"
            for g in goals
        )
        goal_block = f"Savings goals:\n{goal_lines}"
    else:
        goal_block = "Savings goals: None set yet."

    # --- Budget block ---
    if budgets:
        budget_lines = "\n".join(
            f"  • {b.get('category', '—')}: "
            f"₹{b.get('spent', 0)} of ₹{b.get('budget', 0)} "
            f"[{b.get('status', '?').upper()}]"
            for b in budgets
        )
        budget_block = f"Budget status:\n{budget_lines}"
    else:
        budget_block = "Budget status: No budgets configured."

    return (
        f'Student\'s message: "{message}"\n\n'
        f"{tx_block}\n\n"
        f"{goal_block}\n\n"
        f"{budget_block}\n\n"
        "Please respond to the student's message using their financial context above. "
        "Be direct and encouraging. Do not repeat all the numbers back — just use "
        "them to inform your advice."
    )


# ===========================================================================
# 2. PURCHASE NEGOTIATOR
# ===========================================================================


def negotiator_prompt(
    price: Decimal,
    category: str,
    description: str,
    budget_status: str,
    goal_impact: str,
) -> str:
    """
    Build the full prompt (system + user combined) for the Purchase Negotiator.

    The negotiator does NOT have a separate system prompt — it is a single
    focused query, so system context is embedded in this one string for brevity.

    Args:
        price:         Purchase price in INR (pre-computed by caller).
        category:      Spending category, e.g. "Food", "Electronics".
        description:   Item or merchant name, e.g. "AirPods Pro".
        budget_status: One of "safe", "warning", "exceeded" from rule_engine.
        goal_impact:   Plain-text summary of how this purchase affects goal
                       progress, e.g. "delays Laptop goal by ~3 weeks".
                       Caller must compute this via rule_engine before passing.

    Returns:
        Single prompt string combining context and the negotiation question.
    """
    status_note = {
        "safe": "their budget is currently healthy",
        "warning": "they are approaching their budget limit",
        "exceeded": "they have already exceeded their budget this period",
    }.get(budget_status, f"budget status is {budget_status!r}")

    return (
        "You are Penny Pilot, a realistic and supportive financial friend "
        "for a college student. Give practical, non-preachy advice in 2-3 sentences.\n\n"
        f"The student wants to buy: {description} ({category}) — ₹{price:.2f}\n"
        f"Budget situation: {status_note}.\n"
        f"Goal impact: {goal_impact}\n\n"
        "Should they make this purchase now, wait, or find an alternative? "
        "Be honest but kind. No moral lectures."
    )


# ===========================================================================
# 3. DREAM ENGINE (Goal Forecast)
# ===========================================================================


def dream_engine_prompt(
    goal_name: str,
    target_amount: Decimal,
    current_amount: Decimal,
    forecast_date: Optional[datetime.date],
    velocity: Decimal,
    accelerated_options_text: Optional[str] = None,
) -> str:
    """
    Build the prompt for the Dream Engine goal-forecast explainer.

    The forecast_date and velocity are pre-computed by rule_engine.goal_forecast()
    and rule_engine.savings_velocity() respectively — this function only formats
    them into encouraging language for the LLM to narrate.

    Args:
        goal_name:                Student's goal label, e.g. "New Laptop".
        target_amount:            Total amount needed (INR).
        current_amount:           Amount already saved (INR).
        forecast_date:            Projected completion date from rule_engine, or None /
                                  date(9999,12,31) if velocity is zero.
        velocity:                 Monthly savings rate in INR from rule_engine.
        accelerated_options_text: Pre-formatted text of deterministic scenario
                                  options computed by rule_engine.

    Returns:
        Prompt string for the AI narration.
    """
    remaining = target_amount - current_amount

    if forecast_date is None or forecast_date >= datetime.date(9999, 1, 1):
        timeline_line = (
            "At their current savings rate of ₹0/month, "
            "the goal has no projected completion date."
        )
    else:
        timeline_line = (
            f"At their current savings rate of ₹{velocity:.0f}/month, "
            f"they are projected to reach this goal by "
            f"{forecast_date.strftime('%B %Y')}."
        )

    options_block = (
        f"\n\n{accelerated_options_text}" if accelerated_options_text else ""
    )

    return (
        "You are Penny Pilot. Motivate this college student about their savings goal "
        "in 3 sentences or fewer. Be upbeat and specific — use ONLY the precomputed numbers provided below.\n\n"
        f"Goal: {goal_name}\n"
        f"Target: ₹{target_amount:.0f} | Saved so far: ₹{current_amount:.0f} "
        f"| Remaining: ₹{remaining:.0f}\n"
        f"{timeline_line}"
        f"{options_block}\n\n"
        "ZERO-ARITHMETIC RULES:\n"
        "1. Do NOT calculate, estimate, add, subtract, project, or invent ANY numbers or dates.\n"
        "2. Only restate the precomputed figures provided in the context above.\n"
        "3. If accelerated options are provided above, you may encourage the student by citing "
        "ONE of those exact precomputed scenarios verbatim."
    )


# ===========================================================================
# 4. FINANCIAL WELLNESS (Stress Score)
# ===========================================================================


def wellness_prompt(
    stress_score: int,
    reasons: list[str],
    suggestions_context: dict,
) -> str:
    """
    Build the prompt for the Financial Wellness stress-score narrator.

    The stress_score is pre-computed by rule_engine.stress_score().
    The reasons list contains plain-text labels identifying contributing factors
    (e.g. ["Low savings rate", "2 budget overruns this month"]) — the caller
    derives these from rule_engine outputs before calling this function.

    Args:
        stress_score:        Integer 0-100 from rule_engine.stress_score().
        reasons:             List of 1-3 short strings naming the main drivers.
        suggestions_context: Dict of optional context to help the LLM give
                             grounded suggestions, e.g.:
                             {"monthly_savings": 500, "top_overspend": "Food"}
                             Caller populates this from rule_engine data.

    Returns:
        Prompt string for the AI wellness narrative.
    """
    # Determine band label so the LLM narrates at the right register
    if stress_score <= 30:
        band = "low (you're doing well)"
    elif stress_score <= 65:
        band = "moderate (some areas need attention)"
    else:
        band = "high (action recommended)"

    reason_block = (
        "\n".join(f"  • {r}" for r in reasons)
        if reasons
        else "  • No specific issues identified."
    )

    # Compact context lines from suggestions_context (caller-supplied, optional keys)
    ctx_lines = []
    if "monthly_savings" in suggestions_context:
        ctx_lines.append(
            f"Current monthly savings: ₹{suggestions_context['monthly_savings']:.0f}"
        )
    if "top_overspend" in suggestions_context:
        ctx_lines.append(
            f"Highest overspend category: {suggestions_context['top_overspend']}"
        )
    if "budget_overruns" in suggestions_context:
        ctx_lines.append(
            f"Budget categories exceeded: {suggestions_context['budget_overruns']}"
        )
    ctx_block = "\n".join(ctx_lines) if ctx_lines else ""

    return (
        "You are Penny Pilot. Explain this college student's financial stress score "
        "in plain, friendly language — 3-4 sentences max. "
        "This is a FINANCIAL wellness score, not a mental-health assessment. "
        "Do not use clinical or medical language.\n\n"
        f"Stress score: {stress_score}/100 — {band}\n"
        f"Main contributing factors:\n{reason_block}\n"
        + (f"\nAdditional context:\n{ctx_block}\n" if ctx_block else "")
        + "\nExplain what the score means, why these factors matter for the student's "
        "financial health, and give 2-3 small, specific, actionable suggestions to "
        "improve it. Keep the tone encouraging, not alarming."
    )


def explain_roundup_prompt(
    transaction_desc: str,
    transaction_amount: Decimal,
    roundup_amount: Decimal,
) -> str:
    """
    Build the prompt for explaining transaction roundups.
    """
    return (
        f"The student spent ₹{transaction_amount:.2f} on '{transaction_desc}'. "
        f"A micro-saving roundup of ₹{roundup_amount:.2f} was automatically directed to their savings goal. "
        f"Provide a friendly, one-sentence explanation of why this micro-saving is beneficial for their long-term financial habits."
    )
