import datetime
from decimal import Decimal

import pytest
from app.database import Base, get_db
from app.main import app
from app.middleware.auth_middleware import require_student
from app.models.models import Budget, Transaction, User
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_budgets.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)


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
        if user is None:
            user = User(
                user_id=1,
                full_name="Test Student",
                email="student@test.com",
                role="student",
                created_at=datetime.datetime.utcnow(),
                updated_at=datetime.datetime.utcnow(),
            )
            db.add(user)
            db.commit()
            db.refresh(user)
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

    db = TestingSessionLocal()
    db.query(Transaction).delete()
    db.query(Budget).delete()
    db.query(User).delete()

    user = User(
        user_id=1,
        full_name="Test Student",
        email="student@test.com",
        role="student",
        created_at=datetime.datetime.utcnow(),
        updated_at=datetime.datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    yield


def test_create_and_list_budgets_with_spending_summary():
    response = client.post(
        "/api/budgets/",
        json={
            "category": "Food",
            "limit_amount": "100.00",
            "period": "monthly",
            "start_date": "2026-08-01T00:00:00",
        },
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["category"] == "Food"
    assert payload["limit_amount"] == "100.00"
    assert payload["spent_amount"] == "0.00"
    assert payload["remaining_amount"] == "100.00"

    db = TestingSessionLocal()
    tx = Transaction(
        user_id=1,
        amount=Decimal("20.00"),
        category="Food",
        merchant="Cafe",
        type="debit",
        transaction_date=datetime.datetime(2026, 8, 2, 10, 0, 0),
        is_deleted=False,
    )
    db.add(tx)
    db.commit()
    db.close()

    list_response = client.get("/api/budgets/")
    assert list_response.status_code == 200
    budgets = list_response.json()
    assert len(budgets) == 1
    assert budgets[0]["spent_amount"] == "20.00"
    assert budgets[0]["remaining_amount"] == "80.00"


def test_duplicate_active_budget_returns_conflict():
    first = client.post(
        "/api/budgets/",
        json={
            "category": "Travel",
            "limit_amount": "50.00",
            "period": "weekly",
            "start_date": "2026-08-01T00:00:00",
        },
    )
    assert first.status_code == 201

    duplicate = client.post(
        "/api/budgets/",
        json={
            "category": "Travel",
            "limit_amount": "70.00",
            "period": "weekly",
            "start_date": "2026-08-01T00:00:00",
        },
    )
    assert duplicate.status_code == 409


def test_get_single_budget_and_update_and_delete_soft_delete():
    create_response = client.post(
        "/api/budgets/",
        json={
            "category": "Groceries",
            "limit_amount": "120.00",
            "period": "monthly",
            "start_date": "2026-08-01T00:00:00",
        },
    )
    budget_id = create_response.json()["id"]

    db = TestingSessionLocal()
    tx = Transaction(
        user_id=1,
        amount=Decimal("130.00"),
        category="Groceries",
        merchant="Whole Foods",
        type="debit",
        transaction_date=datetime.datetime(2026, 8, 5, 9, 0, 0),
        is_deleted=False,
    )
    db.add(tx)
    db.commit()
    db.close()

    single_response = client.get(f"/api/budgets/{budget_id}")
    assert single_response.status_code == 200
    assert single_response.json()["spent_amount"] == "130.00"
    assert single_response.json()["is_over_limit"] is True

    update_response = client.put(
        f"/api/budgets/{budget_id}",
        json={"limit_amount": "150.00", "period": "weekly"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["limit_amount"] == "150.00"
    assert update_response.json()["period"] == "weekly"

    delete_response = client.delete(f"/api/budgets/{budget_id}")
    assert delete_response.status_code == 204

    deleted_response = client.get(f"/api/budgets/{budget_id}")
    assert deleted_response.status_code == 404
