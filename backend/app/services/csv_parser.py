import io
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Optional

import pandas as pd
from app.services.categorizer import categorize, clean_narration

# Header spellings used by Penny Pilot's own template and by common bank exports
# (HDFC "Narration / Withdrawal Amt. / Deposit Amt.", ICICI "Transaction Remarks",
# SBI "Debit / Credit"…). Keys are matched after lower-casing and stripping
# punctuation.
_ALIASES = {
    "transaction_date": (
        "transaction date",
        "txn date",
        "date",
        "value date",
        "value dt",
        "posting date",
    ),
    "description": (
        "description",
        "narration",
        "particulars",
        "transaction remarks",
        "remarks",
        "details",
    ),
    "amount": ("amount", "transaction amount", "txn amount"),
    "debit": ("debit", "withdrawal", "withdrawal amt", "debit amount", "dr"),
    "credit": ("credit", "deposit", "deposit amt", "credit amount", "cr"),
    "type": ("type", "dr cr", "debit credit", "txn type"),
    "category": ("category",),
    "merchant": ("merchant", "payee"),
}

_CURRENCY_NOISE = re.compile(r"(₹|\$|rs\.?|inr|,|\s)", re.I)


def _normalise_header(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(name).lower()).strip()


def _canonical_columns(columns) -> Dict[str, str]:
    """Map each raw column name to its canonical name (first match wins)."""
    lookup: Dict[str, str] = {}
    for canonical, aliases in _ALIASES.items():
        for alias in aliases:
            lookup.setdefault(alias, canonical)
    mapping: Dict[str, str] = {}
    taken = set()
    for raw in columns:
        found = lookup.get(_normalise_header(raw))
        if found and found not in taken:
            mapping[raw] = found
            taken.add(found)
        else:
            mapping[raw] = _normalise_header(raw).replace(" ", "_")
    return mapping


def _parse_amount(raw: Any) -> Optional[Decimal]:
    """Decimal from "1,200.50", "₹500", "Rs. 45" … or None when blank."""
    if raw is None or pd.isna(raw) or str(raw).strip() == "":
        return None
    amount = Decimal(_CURRENCY_NOISE.sub("", str(raw)))
    if not amount.is_finite():
        raise InvalidOperation
    return amount


def _blank(value: Any) -> bool:
    return value is None or pd.isna(value) or str(value).strip() == ""


def parse_transactions_csv(csv_bytes: bytes) -> Dict[str, Any]:
    """
    Parse a transaction CSV: Penny Pilot's template or a bank statement export.

    Accepted layouts
    ----------------
    * template:  amount, category, description [, transaction_date, type, merchant]
    * bank:      date, narration/description, and either one `amount` column or
                 separate debit/withdrawal and credit/deposit columns. A
                 `category` column is optional — when it is missing the category
                 (and a merchant label) is inferred from the narration.
    * type is "debit" (default) or "credit"; amounts must be positive.

    Dates are read day-first (Indian bank format) unless ISO (2026-10-02).
    Row-level problems are collected in `errors`; valid rows are still imported.
    """
    try:
        df = pd.read_csv(io.BytesIO(csv_bytes), dtype=str, keep_default_na=False)
    except Exception as e:
        raise ValueError(f"Failed to read CSV file: {str(e)}")

    df = df.rename(columns=_canonical_columns(df.columns))
    columns = set(df.columns)

    has_amount = "amount" in columns or ("debit" in columns or "credit" in columns)
    missing = []
    if not has_amount:
        missing.append("amount")
    if "description" not in columns:
        missing.append("description")
    if missing:
        raise ValueError(f"Missing required columns in CSV: {', '.join(missing)}")

    imported = []
    errors = []
    failed_count = 0

    for idx, row in df.iterrows():
        row_num = idx + 2  # 1-indexed header + 1-indexed row
        row_errors = []

        # 1. Amount and direction ------------------------------------------
        amount: Optional[Decimal] = None
        tx_type: Optional[str] = None
        try:
            if "amount" in columns and not _blank(row.get("amount")):
                amount = _parse_amount(row.get("amount"))
            else:
                debit = _parse_amount(row.get("debit")) if "debit" in columns else None
                credit = (
                    _parse_amount(row.get("credit")) if "credit" in columns else None
                )
                if debit and debit > 0:
                    amount, tx_type = debit, "debit"
                elif credit and credit > 0:
                    amount, tx_type = credit, "credit"

            if amount is None:
                row_errors.append(
                    {"row": row_num, "column": "amount", "error": "Amount is missing"}
                )
            elif amount <= 0:
                row_errors.append(
                    {
                        "row": row_num,
                        "column": "amount",
                        "error": "Amount must be positive",
                    }
                )
        except (ValueError, InvalidOperation):
            row_errors.append(
                {
                    "row": row_num,
                    "column": "amount",
                    "error": f"Invalid amount format: {row.get('amount') or row.get('debit') or row.get('credit')}",
                }
            )

        # 2. Direction (explicit column wins over what the amount columns said)
        raw_type = row.get("type") if "type" in columns else None
        if not _blank(raw_type):
            normalised = str(raw_type).strip().lower()
            normalised = {"dr": "debit", "cr": "credit"}.get(normalised, normalised)
            if normalised not in {"debit", "credit"}:
                row_errors.append(
                    {
                        "row": row_num,
                        "column": "type",
                        "error": f"Type must be 'debit' or 'credit', got: {raw_type}",
                    }
                )
            else:
                tx_type = normalised
        tx_type = tx_type or "debit"

        # 3. Description ------------------------------------------------------
        description = str(row.get("description", "")).strip()
        if not description:
            row_errors.append(
                {
                    "row": row_num,
                    "column": "description",
                    "error": "Description is missing",
                }
            )

        # 4. Category: given, or inferred from the narration -----------------
        merchant_hint: Optional[str] = None
        if "category" in columns:
            category = str(row.get("category", "")).strip()
            if not category:
                row_errors.append(
                    {
                        "row": row_num,
                        "column": "category",
                        "error": "Category is missing",
                    }
                )
        elif description:
            category, merchant_hint = categorize(description, tx_type)
        else:
            category = ""

        # 5. Date -----------------------------------------------------------
        transaction_date = datetime.utcnow()
        raw_date = (
            row.get("transaction_date") if "transaction_date" in columns else None
        )
        if not _blank(raw_date):
            try:
                transaction_date = pd.to_datetime(
                    str(raw_date).strip(), dayfirst=True
                ).to_pydatetime()
            except Exception:
                row_errors.append(
                    {
                        "row": row_num,
                        "column": "transaction_date",
                        "error": f"Invalid date format: {raw_date}",
                    }
                )

        if row_errors:
            errors.extend(row_errors)
            failed_count += 1
            continue

        merchant = None
        if "merchant" in columns and not _blank(row.get("merchant")):
            merchant = str(row.get("merchant")).strip()
        merchant = merchant or merchant_hint or clean_narration(description)

        raw_source = row.get("source") if "source" in columns else None
        imported.append(
            {
                "amount": amount,
                "category": category,
                "description": description,
                "merchant": merchant,
                "transaction_date": transaction_date,
                "source": "checking" if _blank(raw_source) else str(raw_source).strip(),
                "type": tx_type,
            }
        )

    return {"imported": imported, "failed": failed_count, "errors": errors}
