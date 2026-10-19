import datetime

import pytest
from app.database import Base, get_db
from app.main import app
from app.middleware.auth_middleware import require_educator, require_student
from app.models.models import (
    AuditLog,
    Budget,
    ChatHistory,
    Goal,
    Notification,
    Savings,
    Transaction,
    User,
)
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_new_features.db"
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


def override_require_educator():
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.user_id == 2).first()
        if user is None:
            user = User(
                user_id=2,
                full_name="Test Educator",
                email="educator@test.com",
                role="educator",
                created_at=datetime.datetime.utcnow(),
                updated_at=datetime.datetime.utcnow(),
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        return user
    finally:
        db.close()


client = TestClient(app)


@pytest.fixture(autouse=True)
def mock_ai(monkeypatch):
    async def mock_call_llama(system_prompt, user_prompt):
        return "Mocked AI Response: Keep saving and limit unnecessary expenditures."

    # Patch module level imports
    monkeypatch.setattr("app.routers.wellness.call_llama", mock_call_llama)
    monkeypatch.setattr("app.routers.forecast.call_llama", mock_call_llama)
    monkeypatch.setattr("app.routers.chat.call_llama", mock_call_llama)
    monkeypatch.setattr("app.routers.transactions.call_llama", mock_call_llama)
    # Patch the service directly for runtime imports inside functions (like goals.py)
    monkeypatch.setattr("app.services.ai_engine.call_llama", mock_call_llama)


@pytest.fixture(autouse=True)
def setup_database():
    app.dependency_overrides.clear()
    app.dependency_overrides[get_db] = get_testing_db
    app.dependency_overrides[require_student] = override_require_student
    app.dependency_overrides[require_educator] = override_require_educator

    db = TestingSessionLocal()
    # Clean tables
    db.query(AuditLog).delete()
    db.query(Transaction).delete()
    db.query(Savings).delete()
    db.query(Notification).delete()
    db.query(ChatHistory).delete()
    db.query(Budget).delete()
    db.query(Goal).delete()
    db.commit()
    db.close()
    yield


def test_auth_google():
    # Test POST /api/auth/google
    response = client.post(
        "/api/auth/google",
        json={
            "email": "googleuser@test.com",
            "full_name": "Google User",
            "oauth_id": "123456789",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["role"] == "student"


def test_wellness_and_stress():
    # Test GET /api/wellness/score
    response = client.get("/api/wellness/score")
    assert response.status_code == 200
    data = response.json()
    assert "health_score" in data
    assert "stress_score" in data
    assert "ai_summary" in data
    assert "Mocked AI Response" in data["ai_summary"]

    # Test POST /api/wellness/score
    response = client.post("/api/wellness/score", json={"timeframe_days": 30})
    assert response.status_code == 200
    assert response.json()["stress_score"] is not None

    # Test compatibility POST /api/stress/
    response = client.post("/api/stress/", json={"timeframe_days": 15})
    assert response.status_code == 200
    assert response.json()["stress_score"] is not None


def test_goals_patch_and_forecast():
    db = TestingSessionLocal()
    # Insert test goal
    db_goal = Goal(
        user_id=1,
        title="Emergency Fund",
        target_amount=1000.00,
        current_amount=200.00,
        status="active",
    )
    db.add(db_goal)
    db.commit()
    db.refresh(db_goal)
    goal_id = db_goal.id
    db.close()

    # Test PATCH /api/goals/{id}
    response = client.patch(f"/api/goals/{goal_id}", json={"target_amount": 1200.00})
    assert response.status_code == 200
    assert float(response.json()["target_amount"]) == 1200.00

    # Test GET /api/goals/{id}/forecast
    response = client.get(f"/api/goals/{goal_id}/forecast")
    assert response.status_code == 200
    data = response.json()
    assert data["goal_name"] == "Emergency Fund"
    assert "Mocked AI Response" in data["narrative"]


def test_budgets_status():
    db = TestingSessionLocal()
    # Insert test budget
    db_budget = Budget(
        user_id=1,
        category="Food",
        limit_amount=500.00,
        period="monthly",
        is_deleted=False,
    )
    db.add(db_budget)
    db.commit()
    db.close()

    # Test GET /api/budgets/status
    response = client.get("/api/budgets/status")
    assert response.status_code == 200
    data = response.json()
    assert float(data["total_budgeted"]) == 500.00
    assert len(data["budgets"]) == 1


def test_savings_manual_and_audit():
    db = TestingSessionLocal()
    # Insert test goal
    db_goal = Goal(
        user_id=1,
        title="Laptop Fund",
        target_amount=1500.00,
        current_amount=300.00,
        status="active",
    )
    db.add(db_goal)
    db.commit()
    goal_id = db_goal.id
    db.close()

    # Test POST /api/savings/manual
    response = client.post(
        "/api/savings/manual",
        json={"amount": 150.00, "goal_id": goal_id, "source": "manual"},
    )
    assert response.status_code == 201
    assert float(response.json()["amount"]) == 150.00

    # Check audit log was created
    db = TestingSessionLocal()
    audits = db.query(AuditLog).all()
    assert len(audits) >= 2
    goal_audit = any(a.entity_type == "goal" for a in audits)
    savings_audit = any(a.entity_type == "savings" for a in audits)
    assert goal_audit is True
    assert savings_audit is True
    db.close()


def test_notifications():
    db = TestingSessionLocal()
    # Insert notification
    db_notif = Notification(
        user_id=1,
        title="Alert",
        message="Your budget is over limit",
        status="unread",
        created_at=datetime.datetime.utcnow(),
    )
    db.add(db_notif)
    db.commit()
    notif_id = db_notif.notif_id
    db.close()

    # Test GET /api/notifications
    response = client.get("/api/notifications/")
    assert response.status_code == 200
    assert len(response.json()) == 1

    # Test PATCH /api/notifications/{id}/read
    response = client.patch(f"/api/notifications/{notif_id}/read")
    assert response.status_code == 200
    assert response.json()["status"] == "read"


def test_educator_overview_trends():
    db = TestingSessionLocal()
    # Ensure there is a student and some data
    std = db.query(User).filter(User.user_id == 1).first()
    if std is None:
        std = User(
            user_id=1,
            full_name="Test Student",
            email="student@test.com",
            role="student",
        )
        db.add(std)

    db_goal = Goal(
        user_id=1,
        title="Holiday",
        target_amount=1000.00,
        current_amount=200.00,
        status="active",
    )
    db.add(db_goal)
    db.commit()
    db.close()

    # Test GET /api/educator/overview
    response = client.get("/api/educator/overview")
    assert response.status_code == 200
    data = response.json()
    assert data["total_students"] >= 1
    assert float(data["total_savings"]) >= 200.00

    # Test GET /api/educator/trends
    response = client.get("/api/educator/trends")
    assert response.status_code == 200
