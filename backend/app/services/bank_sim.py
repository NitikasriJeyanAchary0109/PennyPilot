"""
Bank-feed simulation.

Penny Pilot has no real bank connection. To let a student see the full flow —
a payment arrives, it is rounded up, a budget may trip — this module invents the
*next* transaction a bank feed might deliver, using only that student's own past
debits: a merchant they actually use, charged at an amount close to what they
have actually paid there. Nothing here is real money; the resulting row is
stored with source="bank_simulation" so the app can label it.
"""

from __future__ import annotations

import random
from decimal import ROUND_HALF_UP, Decimal
from typing import Dict, List, Optional

# A simulated charge varies by up to this fraction around a past amount.
AMOUNT_JITTER = Decimal("0.10")
MIN_AMOUNT = Decimal("1.00")


def pick_simulated_purchase(
    past_debits: List[dict], rng: Optional[random.Random] = None
) -> Optional[Dict]:
    """
    Choose a plausible next purchase from the student's history.

    `past_debits`: dicts with `merchant`, `category`, `amount` (Decimal).
    Merchants are chosen in proportion to how often they were used; the amount is
    one of that merchant's past amounts, nudged by ±AMOUNT_JITTER unless the
    merchant has only ever charged one fixed amount. Returns None
    when there is no history to base it on.
    """
    if not past_debits:
        return None
    rng = rng or random.Random()

    by_merchant: Dict[str, List[dict]] = {}
    for row in past_debits:
        by_merchant.setdefault(row["merchant"].strip().lower(), []).append(row)

    merchants = list(by_merchant.values())
    weights = [len(rows) for rows in merchants]
    rows = rng.choices(merchants, weights=weights, k=1)[0]

    base = rng.choice(rows)
    amount = Decimal(str(base["amount"]))
    # A merchant that has always charged the same amount (a subscription, a fixed
    # fee) charges that amount again; only variable spending is nudged.
    if len({Decimal(str(r["amount"])) for r in rows}) > 1:
        jitter = Decimal(str(rng.uniform(-float(AMOUNT_JITTER), float(AMOUNT_JITTER))))
        amount = amount * (Decimal("1") + jitter)
    amount = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    return {
        "merchant": base["merchant"],
        "category": base["category"],
        "amount": max(amount, MIN_AMOUNT),
        "based_on_purchases": len(rows),
    }
