import datetime
from decimal import Decimal

import pytest
from app.database import Base, get_db
from app.main import app
from app.middleware.auth_middleware import require_student
from app.models.models import Budget, Goal, Savings, Transaction, User
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_calculations.db"
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
    db.query(Savings).delete()
    db.query(Budget).delete()
    db.query(Goal).delete()
    db.query(Transaction).delete()
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


def test_net_savings_rate_and_stress_score_endpoints():
    db = TestingSessionLocal()
    db.add(
        Transaction(
            user_id=1,
            amount=Decimal("100.00"),
            category="Income",
            merchant="Salary",
            type="credit",
            transaction_date=datetime.datetime(2026, 8, 1, 9, 0, 0),
            is_deleted=False,
        )
    )
    db.add(
        Transaction(
            user_id=1,
            amount=Decimal("50.00"),
            category="Food",
            merchant="Cafe",
            type="debit",
            transaction_date=datetime.datetime(2026, 8, 2, 12, 0, 0),
            is_deleted=False,
        )
    )
    db.add(
        Budget(
            user_id=1,
            category="Food",
            limit_amount=Decimal("40.00"),
            period="monthly",
            start_date=datetime.datetime(2026, 8, 1, 0, 0, 0),
        )
    )
    db.add(
        Savings(
            user_id=1,
            goal_id=None,
            amount=Decimal("20.00"),
            source="manual",
        )
    )
    db.commit()
    db.close()

    net_response = client.get("/api/calculations/net-savings-rate")
    assert net_response.status_code == 200
    net_payload = net_response.json()
    assert net_payload["total_saved"] == "20.00"
    assert net_payload["total_income"] == "100.00"
    assert net_payload["total_spend"] == "50.00"
    assert net_payload["net_savings_rate"] == "0.20"

    stress_response = client.get("/api/calculations/stress-score")
    assert stress_response.status_code == 200
    stress_payload = stress_response.json()
    assert stress_payload["budget_overruns"] == 1
    assert 0 <= stress_payload["stress_score"] <= 100


def test_round_up_projection_and_goal_feasibility_endpoints():
    db = TestingSessionLocal()
    db.add(
        Transaction(
            user_id=1,
            amount=Decimal("127.60"),
            category="Food",
            merchant="Lunch",
            type="debit",
            transaction_date=datetime.datetime(2026, 8, 1, 12, 0, 0),
            is_deleted=False,
        )
    )
    db.add(
        Transaction(
            user_id=1,
            amount=Decimal("145.00"),
            category="Shopping",
            merchant="Books",
            type="debit",
            transaction_date=datetime.datetime(2026, 8, 8, 18, 0, 0),
            is_deleted=False,
        )
    )
    db.add(
        Goal(
            id=1,
            user_id=1,
            title="Emergency Fund",
            target_amount=Decimal("1000.00"),
            current_amount=Decimal("100.00"),
            target_date=datetime.datetime(2026, 12, 31, 0, 0, 0),
            status="active",
        )
    )
    db.add(
        Savings(
            user_id=1,
            goal_id=1,
            amount=Decimal("50.00"),
            source="manual",
        )
    )
    db.commit()
    db.close()

    projection_response = client.get("/api/calculations/round-up-projection?months=3")
    assert projection_response.status_code == 200
    projection_payload = projection_response.json()
    assert projection_payload["months"] == 3
    assert projection_payload["projected_roundup_savings"] != "0.00"

    feasibility_response = client.get("/api/calculations/goal-feasibility/1")
    assert feasibility_response.status_code == 200
    feasibility_payload = feasibility_response.json()
    assert feasibility_payload["status"] in {"ahead", "on-track", "behind"}
    assert feasibility_payload["required_weekly_savings"] != "0.00"
