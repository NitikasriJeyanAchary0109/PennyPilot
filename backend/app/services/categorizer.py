"""
Keyword-based categorisation of bank-statement narrations.

Bank exports (HDFC, ICICI, SBI, UPI apps…) carry a free-text narration such as
"UPI-SWIGGY-swiggy@icici-4021…" and no category. This module assigns one using a
small, transparent rule table — no model, no network, same input → same output.
Anything it doesn't recognise becomes "Other" (money in becomes "Income"), and
the student can always correct a category afterwards.
"""

from __future__ import annotations

import re
from typing import Optional, Tuple

# (category, merchant label, keywords). Order matters: first match wins.
_RULES = [
    ("Subscriptions", "Netflix", ("netflix",)),
    ("Subscriptions", "Spotify", ("spotify",)),
    ("Subscriptions", "Amazon Prime", ("amazon prime", "primevideo", "prime video")),
    ("Subscriptions", "YouTube", ("youtube",)),
    ("Subscriptions", "Hotstar", ("hotstar",)),
    ("Subscriptions", "Apple", ("apple.com/bill", "itunes")),
    ("Subscriptions", "Google Play", ("google play", "googleplay")),
    ("Food", "Swiggy", ("swiggy",)),
    ("Food", "Zomato", ("zomato",)),
    ("Food", "Dominos", ("dominos", "domino's")),
    ("Food", "McDonalds", ("mcdonald",)),
    ("Food", "KFC", ("kfc",)),
    ("Food", "Starbucks", ("starbucks",)),
    ("Food", "Blinkit", ("blinkit",)),
    ("Food", "BigBasket", ("bigbasket",)),
    ("Food", "Zepto", ("zepto",)),
    ("Food", None, ("restaurant", "cafe", "canteen", "mess ", "bakery", "juice")),
    ("Transport", "Uber", ("uber",)),
    ("Transport", "Ola", ("olacabs", " ola ", "ola-", "ola*")),
    ("Transport", "Rapido", ("rapido",)),
    ("Transport", "IRCTC", ("irctc",)),
    ("Transport", "RedBus", ("redbus",)),
    ("Transport", None, ("metro", "fuel", "petrol", "diesel", "fastag")),
    ("Shopping", "Amazon", ("amazon", "amzn")),
    ("Shopping", "Flipkart", ("flipkart",)),
    ("Shopping", "Myntra", ("myntra",)),
    ("Shopping", "Ajio", ("ajio",)),
    ("Shopping", "Meesho", ("meesho",)),
    ("Entertainment", "BookMyShow", ("bookmyshow",)),
    ("Entertainment", None, ("pvr", "inox", "steam", "playstation", "cinema")),
    ("Education", "Udemy", ("udemy",)),
    ("Education", "Coursera", ("coursera",)),
    (
        "Education",
        None,
        ("tuition", "college", "university", "exam fee", "stationery", "bookstore"),
    ),
    ("Bills & Utilities", "Jio", ("jio",)),
    ("Bills & Utilities", "Airtel", ("airtel",)),
    ("Bills & Utilities", "Vodafone", ("vodafone", "vi prepaid")),
    ("Bills & Utilities", None, ("electricity", "broadband", "wifi", "recharge")),
    ("Health", None, ("pharmacy", "apollo", "medplus", "hospital", "clinic")),
    ("Rent", None, ("rent", "hostel", "pg fee")),
]

# Transfer prefixes that say how money moved, not who it went to.
_PREFIX = re.compile(r"^(upi|pos|imps|neft|rtgs|ach|nach|atm|bil|ecom)[\s\-/*:]+", re.I)


def clean_narration(narration: str) -> str:
    """Readable merchant text from a raw narration (best effort)."""
    text = _PREFIX.sub("", narration.strip())
    # Drop the trailing reference numbers / UPI handles banks append.
    text = re.split(r"[-/@]", text)[0].strip()
    text = re.sub(r"\s+", " ", text)
    return text[:100] or narration.strip()[:100]


def categorize(narration: str, tx_type: str = "debit") -> Tuple[str, Optional[str]]:
    """Return (category, merchant_label_or_None) for a bank narration."""
    haystack = f" {narration.lower()} "

    if tx_type == "credit":
        # Money in is income whatever the narration says (family transfer,
        # stipend, refund…); the student can recategorise a refund if needed.
        return "Income", None

    for category, merchant, keywords in _RULES:
        if any(keyword in haystack for keyword in keywords):
            return category, merchant
    return "Other", None
