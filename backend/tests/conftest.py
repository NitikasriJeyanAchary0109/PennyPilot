"""Shared pytest fixtures for the backend test suite."""

import datetime

import pytest
from app.database import Base, get_db
from app.main import app
from app.models.models import User
from app.utils.security import create_access_token, get_password_hash
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Use in-memory SQLite with StaticPool so all connections share the same memory DB
TEST_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

import app.database as app_db
import app.main as app_main

app_db.engine = engine
app_main.engine = engine


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db):
    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def student_user(db):
    user = db.query(User).filter(User.email == "student_fixt@test.com").first()
    if not user:
        user = User(
            full_name="Student Fixture",
            email="student_fixt@test.com",
            password_hash=get_password_hash("password123"),
            role="student",
            created_at=datetime.datetime.utcnow(),
            updated_at=datetime.datetime.utcnow(),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@pytest.fixture
def student_token(student_user):
    return create_access_token(
        data={
            "sub": student_user.email,
            "role": student_user.role,
            "user_id": student_user.user_id,
        }
    )



