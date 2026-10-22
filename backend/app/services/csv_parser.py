import io
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict

import pandas as pd


def parse_transactions_csv(csv_bytes: bytes) -> Dict[str, Any]:
    """
    Parses a bank statement CSV upload using Pandas.
    Cleans, normalizes headers, ensures standard columns, and handles data conversion.
    Expected columns: amount, category, description; optional: transaction_date
    (or "date"), type ("debit" default / "credit"), source.
    Amounts must be positive; use the type column to mark money coming in.
    Tracks individual row validation failures and reports them in a structured format.
    """
    csv_file = io.BytesIO(csv_bytes)
    try:
        df = pd.read_csv(csv_file)
    except Exception as e:
        raise ValueError(f"Failed to read CSV file: {str(e)}")

    # Normalize column headers (strip spaces, make lowercase)
    df.columns = [col.strip().lower() for col in df.columns]
    # Accept the common bank-statement header "date" for transaction_date
    if "transaction_date" not in df.columns and "date" in df.columns:
        df = df.rename(columns={"date": "transaction_date"})

    # Required columns check
    required_cols = {"amount", "category", "description"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns in CSV: {', '.join(missing)}")

    imported = []
    errors = []
    failed_count = 0

    for idx, row in df.iterrows():
        row_num = idx + 2  # 1-indexed header + 1-indexed row
        row_errors = []

        # 1. Validate amount
        amount = None
        raw_amount = row.get("amount")
        if pd.isna(raw_amount) or str(raw_amount).strip() == "":
            row_errors.append(
                {"row": row_num, "column": "amount", "error": "Amount is missing"}
            )
        else:
            try:
                # Strip currency signs/commas and convert
                amount_str = (
                    str(raw_amount)
                    .replace("$", "")
                    .replace("₹", "")
                    .replace(",", "")
                    .strip()
                )
                amount = Decimal(amount_str)
                if not amount.is_finite():
                    raise InvalidOperation
                if amount <= 0:
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
                        "error": f"Invalid amount format: {raw_amount}",
                    }
                )

        # 2. Validate category
        category = str(row.get("category", "")).strip()
        if pd.isna(row.get("category")) or not category:
            row_errors.append(
                {"row": row_num, "column": "category", "error": "Category is missing"}
            )

        # 3. Validate description
        description = str(row.get("description", "")).strip()
        if pd.isna(row.get("description")) or not description:
            row_errors.append(
                {
                    "row": row_num,
                    "column": "description",
                    "error": "Description is missing",
                }
            )

        # 4. Check and parse transaction date
        raw_date = row.get("transaction_date")
        if pd.isna(raw_date) or not str(raw_date).strip():
            transaction_date = datetime.utcnow()
        else:
            try:
                transaction_date = pd.to_datetime(raw_date).to_pydatetime()
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

        # Valid row
        raw_source = row.get("source")
        source = "checking" if pd.isna(raw_source) else str(raw_source).strip()
        if not source:
            source = "checking"

        raw_type = row.get("type")
        tx_type = (
            "debit"
            if pd.isna(raw_type) or not str(raw_type).strip()
            else str(raw_type).strip().lower()
        )
        if tx_type not in {"debit", "credit"}:
            errors.append(
                {
                    "row": row_num,
                    "column": "type",
                    "error": f"Type must be 'debit' or 'credit', got: {raw_type}",
                }
            )
            failed_count += 1
            continue

        imported.append(
            {
                "amount": amount,
                "category": category,
                "description": description,
                "transaction_date": transaction_date,
                "source": source,
                "type": tx_type,
            }
        )

    return {"imported": imported, "failed": failed_count, "errors": errors}
