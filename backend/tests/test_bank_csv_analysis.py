"""Bank-statement import, spending-behaviour analysis and the bank simulation."""

import datetime
import pathlib
import random
from decimal import Decimal

import pytest
from app.models.models import Goal, Notification, Savings, Transaction
from app.services.bank_sim import pick_simulated_purchase
from app.services.categorizer import categorize, clean_narration
from app.services.csv_parser import parse_transactions_csv
from app.services.rule_engine import spending_profile

SAMPLE = (
    pathlib.Path(__file__).resolve().parents[2]
    / "docs"
    / "samples"
    / "bank_statement_sample.csv"
)


@pytest.fixture
def headers(student_token):
    return {"Authorization": f"Bearer {student_token}"}


@pytest.fixture(autouse=True)
def no_llm(monkeypatch):
    from app.services.ai_engine import AIEngineError

    async def failing(*args, **kwargs):
        raise AIEngineError("offline in tests")

    monkeypatch.setattr("app.routers.transactions.call_llama", failing)


def upload_sample(client, headers, content=None):
    content = content if content is not None else SAMPLE.read_bytes()
    return client.post(
        "/api/transactions/upload",
        files={"file": ("statement.csv", content, "text/csv")},
        headers=headers,
    )


# ------------------------------------------------------------- categoriser
@pytest.mark.parametrize(
    "narration, tx_type, expected",
    [
        ("UPI-SWIGGY-swiggy@icici-5070378921", "debit", ("Food", "Swiggy")),
        ("UPI-UBER INDIA-uber@axis-1234", "debit", ("Transport", "Uber")),
        (
            "UPI-NETFLIX-netflix@icici-SUBSCRIPTION",
            "debit",
            ("Subscriptions", "Netflix"),
        ),
        ("AMZN Pay India", "debit", ("Shopping", "Amazon")),
        ("UPI-ARJUN K-arjun@oksbi-SPLIT DINNER", "debit", ("Other", None)),
        ("UPI-PAPA TRANSFER-papa@okhdfc-ALLOWANCE", "credit", ("Income", None)),
    ],
)
def test_categorize(narration, tx_type, expected):
    assert categorize(narration, tx_type) == expected


def test_clean_narration_drops_transfer_prefix_and_references():
    assert clean_narration("UPI-HOSTEL MESS-messfee@ybl-MESS FEE") == "HOSTEL MESS"
    assert clean_narration("POS DELHI METRO RECHARGE") == "DELHI METRO RECHARGE"


# ----------------------------------------------------------- bank CSV parser
def test_parser_reads_a_real_bank_layout():
    result = parse_transactions_csv(SAMPLE.read_bytes())
    assert result["failed"] == 0
    assert len(result["imported"]) == 81

    first = result["imported"][0]
    assert first["type"] == "credit" and first["amount"] == Decimal("12000.00")
    assert first["transaction_date"] == datetime.datetime(2026, 8, 1)  # day-first

    swiggy = next(t for t in result["imported"] if "SWIGGY" in t["description"])
    assert (swiggy["category"], swiggy["merchant"], swiggy["type"]) == (
        "Food",
        "Swiggy",
        "debit",
    )


def test_parser_handles_split_columns_symbols_and_dr_cr_aliases():
    csv = (
        b"Txn Date,Particulars,Debit,Credit\n"
        b'05-10-2026,UPI-ZOMATO-z@hdfc-99,"\xe2\x82\xb91,250.50",\n'
        b"06-10-2026,Stipend,,8000\n"
        b",No date row,Rs. 40,\n"
        b"07-10-2026,Empty amounts,,\n"
    )
    result = parse_transactions_csv(csv)
    rows = result["imported"]
    assert [(r["type"], r["amount"]) for r in rows[:2]] == [
        ("debit", Decimal("1250.50")),
        ("credit", Decimal("8000")),
    ]
    assert rows[1]["category"] == "Income"
    assert result["failed"] == 1  # the row with no amount at all
    assert result["errors"][0]["column"] == "amount"


def test_parser_still_rejects_files_without_the_essentials():
    with pytest.raises(ValueError, match="Missing required columns"):
        parse_transactions_csv(b"date,amount\n2026-10-01,5\n")


# ------------------------------------------------- import + provenance (API)
def test_importing_a_bank_statement_labels_rows_as_csv_import(
    client, db, student_user, headers
):
    res = upload_sample(client, headers)
    assert res.status_code == 200 and res.json()["imported_count"] == 81
    assert {t.source for t in db.query(Transaction).all()} == {"csv_import"}
    again = upload_sample(client, headers).json()
    assert again["imported_count"] == 0 and again["duplicates_skipped"] == 81


# ------------------------------------------------------------ analysis (unit)
def d(day, amount, kind="debit", category="Food", merchant="Cafe", month=10):
    return {
        "date": datetime.datetime(2026, month, day, 12, 0),
        "amount": Decimal(str(amount)),
        "type": kind,
        "category": category,
        "merchant": merchant,
    }


def test_spending_profile_with_no_history():
    assert spending_profile([]) == {"has_data": False}


def test_spending_profile_numbers():
    rows = [
        d(1, 10000, "credit", "Income", "Allowance", month=9),
        d(1, 10000, "credit", "Income", "Allowance", month=10),
        d(3, 120, category="Food", merchant="Swiggy", month=9),
        d(4, 130, category="Food", merchant="Swiggy", month=10),  # Sun? weekday below
        d(5, 900, category="Shopping", merchant="Amazon", month=10),
        d(12, 649, category="Subscriptions", merchant="Netflix", month=9),
        d(12, 649, category="Subscriptions", merchant="Netflix", month=10),
    ]
    p = spending_profile(rows)

    assert p["months_covered"] == 2
    assert p["total_income"] == Decimal("20000.00")
    assert p["total_spend"] == Decimal("2448.00")
    assert p["average_monthly_income"] == Decimal("10000.00")
    assert p["average_monthly_spend"] == Decimal("1224.00")
    assert p["average_monthly_net"] == Decimal("8776.00")
    assert p["spend_to_income_percent"] == Decimal("12.2")

    top = p["top_categories"][0]
    assert (top["category"], top["total"]) == ("Subscriptions", Decimal("1298.00"))
    assert top["monthly_average"] == Decimal("649.00")
    assert top["suggested_budget"] == Decimal("650.00")  # rounded up to ₹50
    assert top["share_percent"] == Decimal("53.0")

    merchants = {r["merchant"]: r for r in p["recurring_merchants"]}
    assert set(merchants) == {"Netflix", "Swiggy"}  # Amazon only appears once
    assert merchants["Netflix"]["typical_amount"] == Decimal("649.00")

    assert p["largest_purchase"]["merchant"] == "Amazon"
    # Round-ups on 120, 130, 900, 649, 649 are 10 + 10 + 10 + 0.. computed by the engine
    assert p["estimated_monthly_roundup"] > 0


def test_recurring_requires_similar_amounts():
    rows = [
        d(2, 100, merchant="Cafe", month=9),
        d(2, 400, merchant="Cafe", month=10),  # 4x: not a steady charge
    ]
    assert spending_profile(rows)["recurring_merchants"] == []


# ------------------------------------------------------- analysis (endpoint)
def test_analysis_endpoint_on_the_sample_statement(client, db, student_user, headers):
    empty = client.get("/api/analysis/spending", headers=headers).json()
    assert empty["has_data"] is False

    upload_sample(client, headers)
    body = client.get("/api/analysis/spending?months=36", headers=headers).json()
    assert body["has_data"] is True
    assert body["months_covered"] == 3
    assert Decimal(str(body["average_monthly_income"])) == Decimal("12000.00")
    assert body["top_categories"][0]["category"] == "Food"
    names = {r["merchant"] for r in body["recurring_merchants"]}
    assert {"Netflix", "Spotify"} <= names
    assert Decimal(str(body["estimated_monthly_roundup"])) > 0


def test_analysis_ignores_simulated_rows(client, db, student_user, headers):
    upload_sample(client, headers)
    before = client.get("/api/analysis/spending?months=36", headers=headers).json()
    client.post("/api/bank/simulate", headers=headers)
    after = client.get("/api/analysis/spending?months=36", headers=headers).json()
    assert before["transaction_count"] == after["transaction_count"]


# --------------------------------------------------------------- simulation
def test_pick_simulated_purchase_uses_only_the_students_history():
    history = [
        {"merchant": "Swiggy", "category": "Food", "amount": Decimal("200")},
        {"merchant": "Swiggy", "category": "Food", "amount": Decimal("300")},
        {"merchant": "Uber", "category": "Transport", "amount": Decimal("100")},
    ]
    seen = set()
    for seed in range(60):
        pick = pick_simulated_purchase(history, random.Random(seed))
        seen.add(pick["merchant"])
        base = [h["amount"] for h in history if h["merchant"] == pick["merchant"]]
        assert (
            min(base) * Decimal("0.89") <= pick["amount"] <= max(base) * Decimal("1.11")
        )
        assert pick["amount"].as_tuple().exponent == -2
    assert seen == {"Swiggy", "Uber"}
    assert pick_simulated_purchase([]) is None


def test_fixed_price_merchants_are_charged_the_same_amount_again():
    history = [
        {"merchant": "Netflix", "category": "Subscriptions", "amount": Decimal("649")}
    ] * 3
    for seed in range(20):
        pick = pick_simulated_purchase(history, random.Random(seed))
        assert pick["amount"] == Decimal("649")


def test_pick_is_deterministic_for_a_seed():
    history = [{"merchant": "A", "category": "Food", "amount": Decimal("50")}] * 3
    assert pick_simulated_purchase(
        history, random.Random(1)
    ) == pick_simulated_purchase(history, random.Random(1))


def test_simulation_needs_history(client, headers):
    res = client.post("/api/bank/simulate", headers=headers)
    assert res.status_code == 409
    assert "Import a bank statement" in res.json()["detail"]


def test_simulation_runs_the_normal_pipeline(client, db, student_user, headers):
    upload_sample(client, headers)
    goal = Goal(
        user_id=student_user.user_id,
        title="Laptop",
        target_amount=Decimal("100000"),
        current_amount=Decimal("0"),
        status="active",
    )
    db.add(goal)
    db.commit()
    imported_roundups = db.query(Savings).count()

    res = client.post("/api/bank/simulate", headers=headers)
    assert res.status_code == 201
    body = res.json()
    assert body["simulated"] is True
    tx = body["transaction"]
    assert tx["source"] == "bank_simulation"
    assert tx["type"] == "debit"
    assert tx["description"] == tx["merchant"]

    known_merchants = {
        t.merchant for t in db.query(Transaction).filter_by(source="csv_import")
    }
    assert tx["merchant"] in known_merchants

    # Same pipeline as a manual purchase: round-ups are never zero for a positive
    # amount, so one lands in the goal and is stored against the new transaction.
    assert body["roundup_applied"] is True
    assert db.query(Savings).count() == imported_roundups + 1
    assert Decimal(str(tx["round_up_amount"])) > 0


def test_simulation_learns_only_from_real_history(client, db, student_user, headers):
    upload_sample(client, headers)
    for _ in range(5):
        client.post("/api/bank/simulate", headers=headers)
    merchants = {
        t.merchant for t in db.query(Transaction).filter_by(source="bank_simulation")
    }
    real = {t.merchant for t in db.query(Transaction).filter_by(source="csv_import")}
    assert merchants <= real


def test_simulation_can_trip_a_budget_alert(client, db, student_user, headers):
    from app.models.models import Budget

    upload_sample(client, headers)
    # A ₹1 budget on every spending category guarantees the next debit exceeds it.
    for category in {t.category for t in db.query(Transaction).filter_by(type="debit")}:
        db.add(
            Budget(
                user_id=student_user.user_id,
                category=category,
                limit_amount=Decimal("1.00"),
                period="monthly",
                start_date=datetime.datetime.utcnow(),
            )
        )
    db.commit()
    client.post("/api/bank/simulate", headers=headers)
    assert db.query(Notification).filter_by(type="budget_exceeded").count() == 1


def test_simulation_can_be_switched_off(client, headers, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "BANK_SIMULATION_ENABLED", False)
    assert client.post("/api/bank/simulate", headers=headers).status_code == 404
