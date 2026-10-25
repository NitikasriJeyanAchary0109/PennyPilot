"""
Output guard for LLM replies: no number the model was not given.

Penny Pilot's rule is that the model only *phrases* figures that code computed.
Prompts are built that way, but a language model can still volunteer a
percentage, a total or a date of its own ("…an additional 1% of your daily
spending…"). This module checks the reply: every number in it must already
appear in the text the model was sent. It never computes anything — it only
compares what the model wrote with what it was given.

Known limits (deliberate, to keep the check simple and predictable): it looks at
digits and "<number-word> percent" phrases, not other spelled-out quantities
("a couple of weeks"), and it cannot tell whether a *given* number is used
correctly — only that it was given.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Iterable, List, Set

# 1,200.50  ·  ₹45  ·  3.5  ·  2027   (not part of a word like "COVID19" or a version "1.2.3")
_NUMBER = re.compile(r"(?<![\w.])\d[\d,]*(?:\.\d+)?(?![\w])")
# "1." / "2)" at the start of a line is list numbering, not a figure.
_LIST_MARKER = re.compile(r"^\s*\d+[.)]\s", re.MULTILINE)

_WORD_NUMBERS = (
    "one two three four five six seven eight nine ten eleven twelve thirteen fourteen "
    "fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty "
    "seventy eighty ninety hundred"
).split()
# "one percent", "twenty per cent" — spelled-out percentages are still figures.
_WORD_PERCENT = re.compile(
    r"\b("
    + "|".join(_WORD_NUMBERS)
    + r")(?:[\s-]+(?:"
    + "|".join(_WORD_NUMBERS)
    + r"))*"
    r"\s+(?:percent|per\s?cent)\b",
    re.IGNORECASE,
)


def _to_decimal(token: str) -> Decimal:
    return Decimal(token.replace(",", ""))


def extract_numbers(text: str) -> Set[Decimal]:
    """All numeric values written as digits in `text` (list markers ignored)."""
    cleaned = _LIST_MARKER.sub("", text)
    found: Set[Decimal] = set()
    for token in _NUMBER.findall(cleaned):
        try:
            found.add(_to_decimal(token))
        except InvalidOperation:
            continue
    return found


def ungrounded_figures(reply: str, supplied: Iterable[str]) -> List[str]:
    """
    Figures in `reply` that do not appear in any of the `supplied` texts.

    Returns human-readable offenders (empty list = the reply is grounded).
    """
    allowed: Set[Decimal] = set()
    for text in supplied:
        allowed |= extract_numbers(text)

    # format(..., "f") avoids scientific notation (Decimal("250").normalize() is 2.5E+2).
    offenders = [
        format(n.normalize(), "f") for n in sorted(extract_numbers(reply) - allowed)
    ]
    offenders += [m.group(0) for m in _WORD_PERCENT.finditer(reply)]
    return offenders
