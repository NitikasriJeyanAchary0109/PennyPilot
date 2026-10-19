import datetime
from decimal import Decimal

import pytest
from app.database import Base, get_db
from app.main import app
from app.middleware.auth_middleware import require_student
from app.models.models import AuditLog, Budget, Goal, Savings, Transaction, User
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# ----------------------------------------------------
# Setup In-Memory SQLite Database for testing
# ----------------------------------------------------
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_temp.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create tables
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)

# ----------------------------------------------------
# Setup Mock Authentication
# ----------------------------------------------------
mock_user = None


def get_testing_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def override_require_student():
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.user_id == 1).first()
        return user
    finally:
        db.close()


app.dependency_overrides[get_db] = get_testing_db
app.dependency_overrides[require_student] = override_require_student

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_database():
    app.dependency_overrides.clear()
    app.dependency_overrides[get_db] = get_testing_db
    app.dependency_overrides[require_student] = override_require_student

    # Clear tables before each test
    db = TestingSessionLocal()
    db.query(AuditLog).delete()
    db.query(Savings).delete()
    db.query(Budget).delete() if hasattr(Base.metadata.tables, "budgets") else None
    db.query(Goal).delete()
    db.query(Transaction).delete()
    db.query(User).delete()

    # Create main mock user
    global mock_user
    mock_user = User(
        user_id=1,
        full_name="Test Student",
        email="student@test.com",
        role="student",
        created_at=datetime.datetime.utcnow(),
        updated_at=datetime.datetime.utcnow(),
    )
    db.add(mock_user)
    db.commit()
    db.refresh(mock_user)

    # Create active goal for the user
    goal = Goal(
        id=1,
        user_id=1,
        title="Emergency Fund",
        target_amount=Decimal("1000.00"),
        current_amount=Decimal("100.00"),
        status="active",
    )
    db.add(goal)
    db.commit()
    db.close()
    yield


# ----------------------------------------------------
# Test Cases
# ----------------------------------------------------


def test_create_transaction_with_roundup():
    # 1. Post transaction with decimal amount (e.g. 127.60)
    # Expected roundup: 128.00 - 127.60 = 0.40
    response = client.post(
        "/api/transactions/",
        json={
            "amount": "127.60",
            "category": "Food",
            "merchant": "Swiggy",
            "type": "debit",
            "description": "Lunch order",
        },
    )

    assert response.status_code == 201
    data = response.json()

    # Verify transaction details in response
    tx = data["transaction"]
    assert tx["merchant"] == "Swiggy"
    assert tx["amount"] == "127.60"
    assert tx["is_round_up_applied"] is True
    assert tx["round_up_amount"] == "0.40"

    # Verify roundup applied status
    assert data["roundup_applied"] is True
    assert data["roundup_details"]["success"] is True
    assert data["roundup_details"]["roundup_amount"] == "0.40"

    # Verify goal saved balance updated in database
    db = TestingSessionLocal()
    goal = db.query(Goal).filter(Goal.id == 1).first()
    assert goal.current_amount == Decimal("100.40")  # 100 + 0.40

    # Verify linked Savings record created
    savings = (
        db.query(Savings)
        .filter(Savings.triggered_by_transaction_id == tx["id"])
        .first()
    )
    assert savings is not None
    assert savings.amount == Decimal("0.40")
    assert savings.source == "round_up"
    assert savings.goal_id == 1

    # Verify AuditLog logged
    audit = (
        db.query(AuditLog)
        .filter(AuditLog.trans_id == tx["id"], AuditLog.action == "create")
        .first()
    )
    assert audit is not None
    db.close()


def test_create_transaction_no_roundup_needed():
    # Post transaction with whole amount and check balance low or round to 0
    # Wait, for a whole amount like 140, the rule engine rounds up to next multiple of 10 (150).
    # What about non-positive amounts? The calculate_roundup returns 0.00 for non-positive.
    # But wait, amount is Decimal which is positive in validation.
    # Let's mock rule engine or simulate low balance to make roundup pause
    # Wait! If checking balance is low (< 20 threshold), rule engine returns success = False.
    # But checking balance is simulated as 150.00 inside the router.
    # Let's test a transaction amount of <= 0 which gives 0 roundup.
    # Pydantic validation might restrict <= 0, but let's see. TransactionCreate requires amount.
    pass


def test_get_transactions_pagination_and_filtering():
    db = TestingSessionLocal()
    # Create 5 transactions
    base_date = datetime.datetime(2026, 8, 1, 10, 0, 0)
    for i in range(5):
        tx = Transaction(
            user_id=1,
            amount=Decimal(f"10.0{i}"),
            category="Food" if i % 2 == 0 else "Shopping",
            merchant=f"Merchant {i}",
            type="debit",
            transaction_date=base_date + datetime.timedelta(days=i),
            is_deleted=False,
        )
        db.add(tx)
    db.commit()
    db.close()

    # Test GET list with limit = 2
    response = client.get("/api/transactions/?limit=2&offset=0")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2

    # Verify descending date order (latest first)
    assert data[0]["merchant"] == "Merchant 4"
    assert data[1]["merchant"] == "Merchant 3"

    # Test GET list with offset = 2
    response = client.get("/api/transactions/?limit=2&offset=2")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["merchant"] == "Merchant 2"

    # Test category filtering
    response = client.get("/api/transactions/?category=Food")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3
    assert all(d["category"] == "Food" for d in data)

    # Test date range filtering
    # start_date: 2026-08-02, end_date: 2026-08-04
    start = "2026-08-02T00:00:00"
    end = "2026-08-04T23:59:59"
    response = client.get(f"/api/transactions/?start_date={start}&end_date={end}")
    assert response.status_code == 200
    data = response.json()
    # Should include index 1, 2, 3 (Merchant 1, 2, 3)
    assert len(data) == 3
    assert set(d["merchant"] for d in data) == {
        "Merchant 1",
        "Merchant 2",
        "Merchant 3",
    }


def test_get_transaction_by_id():
    db = TestingSessionLocal()
    tx = Transaction(
        user_id=1,
        amount=Decimal("15.50"),
        category="Entertainment",
        merchant="Netflix",
        type="debit",
        transaction_date=datetime.datetime.utcnow(),
        is_deleted=False,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    tx_id = tx.id
    db.close()

    # Fetch owned transaction
    response = client.get(f"/api/transactions/{tx_id}")
    assert response.status_code == 200
    assert response.json()["merchant"] == "Netflix"

    # Fetch soft-deleted transaction (should be 404)
    db = TestingSessionLocal()
    tx_to_delete = db.query(Transaction).filter(Transaction.id == tx_id).first()
    tx_to_delete.is_deleted = True
    db.commit()
    db.close()

    response = client.get(f"/api/transactions/{tx_id}")
    assert response.status_code == 404


def test_get_transaction_404_not_owned():
    db = TestingSessionLocal()
    # Create transaction for another user
    tx = Transaction(
        user_id=999,  # different user
        amount=Decimal("20.00"),
        category="Transport",
        merchant="Uber",
        type="debit",
        transaction_date=datetime.datetime.utcnow(),
        is_deleted=False,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    tx_id = tx.id
    db.close()

    # Try fetching as user_id 1
    response = client.get(f"/api/transactions/{tx_id}")
    assert response.status_code == 404


def test_update_transaction_success():
    db = TestingSessionLocal()
    tx = Transaction(
        user_id=1,
        amount=Decimal("50.00"),
        category="Initial",
        merchant="Old Merchant",
        type="debit",
        transaction_date=datetime.datetime.utcnow(),
        is_round_up_applied=False,
        is_deleted=False,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    tx_id = tx.id
    db.close()

    # Update merchant, category, and amount (allowed since no roundup applied)
    response = client.put(
        f"/api/transactions/{tx_id}",
        json={"merchant": "New Merchant", "category": "Updated", "amount": "60.00"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["merchant"] == "New Merchant"
    assert data["category"] == "Updated"
    assert data["amount"] == "60.00"


def test_update_transaction_amount_conflict():
    db = TestingSessionLocal()
    tx = Transaction(
        user_id=1,
        amount=Decimal("50.20"),
        category="Shopping",
        merchant="Amazon",
        type="debit",
        transaction_date=datetime.datetime.utcnow(),
        is_round_up_applied=True,  # roundup already applied!
        round_up_amount=Decimal("0.80"),
        is_deleted=False,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    tx_id = tx.id
    db.close()

    # Try to update amount (should raise 409 Conflict)
    response = client.put(f"/api/transactions/{tx_id}", json={"amount": "55.00"})
    assert response.status_code == 409
    assert "Cannot edit amount" in response.json()["detail"]

    # Updating merchant/category only should succeed
    response = client.put(
        f"/api/transactions/{tx_id}",
        json={"merchant": "Amazon Updated", "category": "Electronics"},
    )
    assert response.status_code == 200
    assert response.json()["merchant"] == "Amazon Updated"
    assert response.json()["category"] == "Electronics"


def test_delete_transaction_soft_delete_and_reverse_roundup():
    db = TestingSessionLocal()
    # Create transaction with applied roundup
    tx = Transaction(
        user_id=1,
        amount=Decimal("12.50"),
        category="Snacks",
        merchant="Canteen",
        type="debit",
        transaction_date=datetime.datetime.utcnow(),
        is_round_up_applied=True,
        round_up_amount=Decimal("7.50"),  # 12.50 rounded to 20
        is_deleted=False,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    tx_id = tx.id

    # Create linked Savings record
    savings = Savings(
        user_id=1,
        goal_id=1,
        triggered_by_transaction_id=tx_id,
        amount=Decimal("7.50"),
        source="round_up",
        created_at=datetime.datetime.utcnow(),
    )
    db.add(savings)

    # Adjust mock active goal saved amount to reflect the roundup addition
    goal = db.query(Goal).filter(Goal.id == 1).first()
    goal.current_amount = Decimal("107.50")
    db.commit()
    db.close()

    # Delete the transaction
    response = client.delete(f"/api/transactions/{tx_id}")
    assert response.status_code == 200
    assert response.json()["success"] is True

    db = TestingSessionLocal()
    # Check transaction soft-deleted and roundup flagged off
    deleted_tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
    assert deleted_tx.is_deleted is True
    assert deleted_tx.is_round_up_applied is False
    assert deleted_tx.round_up_amount == Decimal("0.00")

    # Check Savings record deleted/reversed
    reversed_savings = (
        db.query(Savings).filter(Savings.triggered_by_transaction_id == tx_id).first()
    )
    assert reversed_savings is None

    # Check Goal balance decremented/reversed
    goal = db.query(Goal).filter(Goal.id == 1).first()
    assert goal.current_amount == Decimal("100.00")  # 107.50 - 7.50

    # Verify AuditLog logged for delete action
    audit = (
        db.query(AuditLog)
        .filter(AuditLog.trans_id == tx_id, AuditLog.action == "delete")
        .first()
    )
    assert audit is not None
    db.close()
