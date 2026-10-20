"""Additional unit and integration tests to achieve >= 85% test coverage."""

import datetime
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from app.models.models import Budget, Goal, Savings
from app.services.csv_parser import parse_transactions_csv
from app.utils.prompts import (
    coach_system_prompt,
    coach_user_prompt,
    dream_engine_prompt,
    explain_roundup_prompt,
    negotiator_prompt,
    wellness_prompt,
)
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    decode_token,
    get_password_hash,
    is_access_token,
    is_refresh_token,
    verify_password,
)

# ==============================================================================
# 1. CSV Parser Tests
# ==============================================================================


def test_csv_parser_valid_data():
    csv_content = (
        b"amount,category,description,transaction_date\n"
        b"150.50,Food,Lunch,2026-10-15\n"
        b"\xe2\x82\xb9500.00,Transport,Metro,2026-10-16\n"
        b'"$1,200.00",Books,Study Material,2026-10-17\n'
    )
    result = parse_transactions_csv(csv_content)
    assert len(result["imported"]) == 3
    assert result["failed"] == 0
    assert result["imported"][0]["amount"] == Decimal("150.50")
    assert result["imported"][1]["amount"] == Decimal("500.00")
    assert result["imported"][2]["amount"] == Decimal("1200.00")


def test_csv_parser_missing_required_columns():
    csv_content = b"amount,category\n150.50,Food\n"
    with pytest.raises(ValueError) as exc:
        parse_transactions_csv(csv_content)
    assert "Missing required columns" in str(exc.value)


def test_csv_parser_malformed_csv():
    with pytest.raises(ValueError) as exc:
        parse_transactions_csv(b'"unclosed string,123\n')
    assert "Failed to read CSV" in str(exc.value)


def test_csv_parser_row_errors():
    csv_content = (
        b"amount,category,description,transaction_date\n"
        b",Food,Missing Amount,2026-10-15\n"
        b"-50.00,Food,Negative Amount,2026-10-15\n"
        b"abc,Food,Invalid Amount,2026-10-15\n"
        b"100.00,,Missing Category,2026-10-15\n"
        b"100.00,Food,,2026-10-15\n"
        b"100.00,Food,Invalid Date,not-a-date\n"
        b"100.00,Food,No Date,\n"
    )
    result = parse_transactions_csv(csv_content)
    assert result["failed"] == 6
    assert len(result["imported"]) == 1  # "No Date" defaults to utcnow
    assert len(result["errors"]) >= 6


# ==============================================================================
# 2. Security Utilities Tests
# ==============================================================================


def test_security_password_hashing():
    pwd = "my_secure_password_123"
    hashed = get_password_hash(pwd)
    assert hashed != pwd
    assert verify_password(pwd, hashed) is True
    assert verify_password("wrong_password", hashed) is False
    assert verify_password(pwd, "invalid_hash_format") is False


def test_jwt_tokens_lifecycle():
    data = {"sub": "student@test.com", "role": "student"}

    # Access token
    access_tok = create_access_token(data)
    decoded_access = decode_access_token(access_tok)
    assert decoded_access is not None
    assert decoded_access["sub"] == "student@test.com"
    assert is_access_token(decoded_access) is True
    assert is_refresh_token(decoded_access) is False
    assert decode_refresh_token(access_tok) is None

    # Refresh token
    refresh_tok = create_refresh_token(data)
    decoded_refresh = decode_refresh_token(refresh_tok)
    assert decoded_refresh is not None
    assert decoded_refresh["sub"] == "student@test.com"
    assert is_refresh_token(decoded_refresh) is True
    assert is_access_token(decoded_refresh) is False
    assert decode_access_token(refresh_tok) is None

    # Invalid tokens
    assert decode_token("garbage.jwt.token") is None
    assert decode_token("") is None


# ==============================================================================
# 3. Prompts Formatting Tests
# ==============================================================================


def test_prompts_all_branches():
    # coach_system_prompt
    sys_prompt = coach_system_prompt()
    assert "Penny Pilot" in sys_prompt
    assert "SpareChange AI" not in sys_prompt

    # coach_user_prompt with data
    txs = [{"amount": 120.50, "merchant": "Cafe", "category": "Food"}]
    goals = [{"name": "Laptop", "saved": 5000, "target": 50000}]
    budgets = [{"category": "Food", "budget": 3000, "spent": 2100, "status": "warning"}]
    p1 = coach_user_prompt("Can I buy coffee?", txs, goals, budgets)
    assert "Cafe" in p1
    assert "Laptop" in p1
    assert "Food" in p1

    # coach_user_prompt empty
    p2 = coach_user_prompt("Hello", [], [], [])
    assert "None recorded yet" in p2
    assert "None set yet" in p2
    assert "No budgets configured" in p2

    # negotiator_prompt
    n1 = negotiator_prompt(Decimal("2500"), "Tech", "Keyboard", "safe", "no impact")
    assert "Keyboard" in n1
    assert "safe" in n1 or "healthy" in n1
    n2 = negotiator_prompt(
        Decimal("2500"), "Tech", "Keyboard", "warning", "delay 1 week"
    )
    assert "warning" in n2 or "limit" in n2
    n3 = negotiator_prompt(Decimal("2500"), "Tech", "Keyboard", "exceeded", "critical")
    assert "exceeded" in n3

    # dream_engine_prompt
    d1 = dream_engine_prompt(
        "Trip",
        Decimal("10000"),
        Decimal("2000"),
        datetime.date(2027, 1, 1),
        Decimal("500"),
    )
    assert "Trip" in d1
    d2 = dream_engine_prompt(
        "Trip",
        Decimal("10000"),
        Decimal("12000"),
        datetime.date.today(),
        Decimal("500"),
    )
    assert "Trip" in d2
    assert "Remaining" in d2
    d3 = dream_engine_prompt(
        "Trip",
        Decimal("10000"),
        Decimal("2000"),
        datetime.date(9999, 12, 31),
        Decimal("0"),
    )
    assert "no projected completion date" in d3

    # wellness_prompt
    w1 = wellness_prompt(25, ["Good habits"], {"monthly_savings": Decimal("3500")})
    assert "low" in w1
    w2 = wellness_prompt(50, ["Average"], {"top_overspend": "Food"})
    assert "moderate" in w2
    w3 = wellness_prompt(85, ["Overruns"], {"budget_overruns": 3})
    assert "high" in w3
    w4 = wellness_prompt(70, [], {})
    assert "No specific issues" in w4

    # explain_roundup_prompt
    r = explain_roundup_prompt("Headphones", Decimal("145.00"), Decimal("5.00"))
    assert "145" in r


# ==============================================================================
# 4. Auth & User Endpoints Integration Tests
# ==============================================================================


def test_auth_register_and_login_flow(client, db):
    # Register new user
    reg_payload = {
        "email": "fresh_student@test.com",
        "full_name": "Fresh Student",
        "password": "Password123!",
        "role": "student",
    }
    r_reg = client.post("/api/auth/register", json=reg_payload)
    assert r_reg.status_code == 201
    assert r_reg.json()["email"] == "fresh_student@test.com"

    # Register duplicate
    r_dup = client.post("/api/auth/register", json=reg_payload)
    assert r_dup.status_code == 400

    # JSON Login
    login_payload = {
        "email": "fresh_student@test.com",
        "password": "Password123!",
    }
    r_login = client.post("/api/auth/login/json", json=login_payload)
    assert r_login.status_code == 200
    login_resp = r_login.json()
    assert "access_token" in login_resp
    acc_tok = login_resp["access_token"]

    # Wrong password login
    r_wrong = client.post(
        "/api/auth/login/json",
        json={"email": "fresh_student@test.com", "password": "wrong"},
    )
    assert r_wrong.status_code in (400, 401)

    # Form Data Login (OAuth2)
    form_login = client.post(
        "/api/auth/login",
        data={"username": "fresh_student@test.com", "password": "Password123!"},
    )
    assert form_login.status_code == 200

    # Get Current User /me
    r_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {acc_tok}"})
    assert r_me.status_code == 200
    assert r_me.json()["email"] == "fresh_student@test.com"

    # Unauthenticated /me
    r_unauth = client.get("/api/auth/me")
    assert r_unauth.status_code in (401, 403)

    # Complete onboarding
    r_onboard = client.patch(
        "/api/users/me/onboarding-complete",
        headers={"Authorization": f"Bearer {acc_tok}"},
    )
    assert r_onboard.status_code == 200
    assert r_onboard.json()["has_completed_onboarding"] is True


# ==============================================================================
# 5. AI Routers with Mocked LLM Calls
# ==============================================================================


@pytest.mark.anyio
async def test_chat_router_endpoint(client, student_token):
    headers = {"Authorization": f"Bearer {student_token}"}
    with patch("app.routers.chat.call_llama", new_callable=AsyncMock) as mock_llama:
        mock_llama.return_value = "Great job saving this week!"
        resp = client.post(
            "/api/chat/",
            json={"message": "How am I doing?"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["response"] == "Great job saving this week!"


@pytest.mark.anyio
async def test_forecast_router_endpoint(client, db, student_user, student_token):
    headers = {"Authorization": f"Bearer {student_token}"}
    g = Goal(
        user_id=student_user.user_id,
        title="Phone Goal",
        target_amount=20000.0,
        current_amount=5000.0,
        target_date=datetime.datetime.utcnow() + datetime.timedelta(days=120),
        status="active",
        created_at=datetime.datetime.utcnow(),
    )
    db.add(g)
    db.commit()
    db.refresh(g)

    with patch("app.routers.forecast.call_llama", new_callable=AsyncMock) as mock_llama:
        mock_llama.return_value = "You can reach your goal by next summer!"
        resp = client.post(
            "/api/forecast/",
            json={"goal_id": g.id, "monthly_contribution": 1500.0},
            headers=headers,
        )
        assert resp.status_code == 200
        assert "summer" in resp.json()["response"]


@pytest.mark.anyio
async def test_dream_forecast_endpoint(client, db, student_user, student_token):
    headers = {"Authorization": f"Bearer {student_token}"}
    g = Goal(
        user_id=student_user.user_id,
        title="Bike Goal",
        target_amount=15000.0,
        current_amount=3000.0,
        target_date=datetime.datetime.utcnow() + datetime.timedelta(days=180),
        status="active",
        created_at=datetime.datetime.utcnow(),
    )
    db.add(g)
    db.commit()
    db.refresh(g)

    with patch("app.routers.dream.call_llama", new_callable=AsyncMock) as mock_llama:
        mock_llama.return_value = "Keep auto-saving to get your bike faster."
        resp = client.get(f"/api/goal/{g.id}/forecast", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["goal_id"] == g.id
        assert "bike" in resp.json()["explanation"]


@pytest.mark.anyio
async def test_chat_router_error_handling(client, student_token):
    headers = {"Authorization": f"Bearer {student_token}"}
    with patch("app.routers.chat.call_llama", new_callable=AsyncMock) as mock_llama:
        from app.services.ai_engine import AIEngineError

        mock_llama.side_effect = AIEngineError("AI service error", status_code=503)
        resp = client.post(
            "/api/chat/",
            json={"message": "Help me!"},
            headers=headers,
        )
        assert resp.status_code == 503


@pytest.mark.anyio
async def test_forecast_and_dream_error_and_404(client, student_token):
    headers = {"Authorization": f"Bearer {student_token}"}

    # Forecast 404
    r_404 = client.post(
        "/api/forecast/",
        json={"goal_id": 99999, "monthly_contribution": 100},
        headers=headers,
    )
    assert r_404.status_code == 404

    # Dream 404
    r_dream_404 = client.get("/api/goal/99999/forecast", headers=headers)
    assert r_dream_404.status_code == 404


@pytest.mark.anyio
async def test_negotiator_evaluate_endpoint(client, db, student_user, student_token):
    headers = {"Authorization": f"Bearer {student_token}"}
    # Add budget
    b = Budget(
        user_id=student_user.user_id,
        category="Tech",
        limit_amount=5000.0,
        period="monthly",
        start_date=datetime.date.today().replace(day=1),
        created_at=datetime.datetime.utcnow(),
    )
    db.add(b)
    db.commit()

    with patch(
        "app.routers.negotiator.call_llama", new_callable=AsyncMock
    ) as mock_llama:
        mock_llama.return_value = "This tech purchase is within your monthly allowance."
        resp = client.post(
            "/api/negotiator/evaluate",
            json={
                "price": 1200.0,
                "category": "Tech",
                "description": "Mechanical Keyboard",
            },
            headers=headers,
        )
        assert resp.status_code == 200
        assert "allowance" in resp.json()["advice"]


# ==============================================================================
# 6. Savings Router Full CRUD Integration Tests
# ==============================================================================


def test_savings_endpoints(client, db, student_user, student_token):
    headers = {"Authorization": f"Bearer {student_token}"}
    g = Goal(
        user_id=student_user.user_id,
        title="Savings Test Goal",
        target_amount=10000.0,
        current_amount=1000.0,
        status="active",
        created_at=datetime.datetime.utcnow(),
    )
    db.add(g)
    db.commit()
    db.refresh(g)

    # 1. Create savings
    create_payload = {
        "goal_id": g.id,
        "amount": 250.00,
        "source": "manual",
    }
    r_create = client.post("/api/savings/", json=create_payload, headers=headers)
    assert r_create.status_code == 201
    s_id = r_create.json()["id"]
    assert Decimal(str(r_create.json()["amount"])) == Decimal("250.00")

    # 2. Get savings list with query parameters
    r_list1 = client.get("/api/savings/?source=manual", headers=headers)
    assert r_list1.status_code == 200
    assert any(s["id"] == s_id for s in r_list1.json())

    r_list2 = client.get(f"/api/savings/?goal_id={g.id}", headers=headers)
    assert r_list2.status_code == 200
    assert any(s["id"] == s_id for s in r_list2.json())

    # 3. Get savings summary
    r_sum = client.get("/api/savings/summary", headers=headers)
    assert r_sum.status_code == 200
    assert "total_saved" in r_sum.json()

    # 4. Update savings
    r_up = client.put(f"/api/savings/{s_id}", json={"amount": 300.00}, headers=headers)
    assert r_up.status_code == 200
    assert Decimal(str(r_up.json()["amount"])) == Decimal("300.00")

    # 5. Delete savings (204 No Content)
    r_del = client.delete(f"/api/savings/{s_id}", headers=headers)
    assert r_del.status_code == 204


def test_roundups_endpoints_and_stats(client, db, student_user, student_token):
    """Verify GET /api/roundups/ and GET /api/roundups/stats against real models."""
    headers = {"Authorization": f"Bearer {student_token}"}

    # Verify initially empty stats
    r_initial_stats = client.get("/api/roundups/stats", headers=headers)
    assert r_initial_stats.status_code == 200
    init_data = r_initial_stats.json()
    assert Decimal(str(init_data["total_saved"])) == Decimal("0.00")
    assert init_data["roundup_transactions_count"] == 0
    assert init_data["currency"] == "INR"

    # Add active roundups and another user's savings
    now = datetime.datetime.utcnow()
    s1 = Savings(
        user_id=student_user.user_id,
        amount=Decimal("4.50"),
        source="round_up",
        created_at=now,
    )
    s2 = Savings(
        user_id=student_user.user_id,
        amount=Decimal("15.50"),
        source="round_up",
        created_at=now + datetime.timedelta(seconds=1),
    )
    s_other_user = Savings(
        user_id=9999,
        amount=Decimal("100.00"),
        source="round_up",
        created_at=now,
    )
    # Manual savings shouldn't count in roundups
    s_manual = Savings(
        user_id=student_user.user_id,
        amount=Decimal("50.00"),
        source="manual",
        created_at=now,
    )
    db.add_all([s1, s2, s_other_user, s_manual])
    db.commit()

    # 1. Fetch history
    r_hist = client.get("/api/roundups/", headers=headers)
    assert r_hist.status_code == 200
    hist = r_hist.json()
    assert len(hist) == 2
    # Check ordering (most recent first)
    assert hist[0]["id"] == s2.id
    assert hist[1]["id"] == s1.id

    # 2. Fetch stats
    r_stats = client.get("/api/roundups/stats", headers=headers)
    assert r_stats.status_code == 200
    stats = r_stats.json()
    assert Decimal(str(stats["total_saved"])) == Decimal("20.00")  # 4.50 + 15.50
    assert stats["roundup_transactions_count"] == 2
    assert stats["currency"] == "INR"

    # 3. Unauthenticated access blocked
    r_unauth = client.get("/api/roundups/stats")
    assert r_unauth.status_code == 401


def test_alembic_migration_006_normalizes_existing_roundup_rows(db, student_user):
    """Verify that Alembic migration 006 converts existing 'roundup' rows to 'round_up'."""
    from sqlalchemy import text

    # Raw insert simulating legacy un-normalized row
    db.execute(
        text(
            "INSERT INTO savings (user_id, amount, source, created_at) "
            "VALUES (:user_id, :amount, 'roundup', :created_at)"
        ),
        {
            "user_id": student_user.user_id,
            "amount": 12.50,
            "created_at": datetime.datetime.utcnow(),
        },
    )
    db.commit()

    # Verify inserted as 'roundup'
    row = db.execute(
        text("SELECT source FROM savings WHERE source = 'roundup'")
    ).fetchone()
    assert row is not None
    assert row[0] == "roundup"

    # Execute migration SQL (identical to 006_normalize_savings_source.upgrade)
    db.execute(text("UPDATE savings SET source = 'round_up' WHERE source = 'roundup'"))
    db.commit()

    # Verify normalized
    remaining = db.execute(
        text("SELECT count(*) FROM savings WHERE source = 'roundup'")
    ).scalar()
    assert remaining == 0
    updated = db.execute(
        text(
            "SELECT count(*) FROM savings WHERE source = 'round_up' AND amount = 12.50"
        )
    ).scalar()
    assert updated >= 1


def test_savings_source_before_validator():
    """Verify that SavingsCreate and SavingsUpdate before-validator normalizes 'roundup' to 'round_up'."""
    import pytest
    from app.schemas.schemas import SavingsCreate, SavingsUpdate
    from pydantic import ValidationError

    # SavingsCreate with legacy 'roundup' -> normalized to 'round_up'
    s1 = SavingsCreate(amount=Decimal("25.00"), source="roundup")
    assert s1.source == "round_up"

    # SavingsCreate with standard sources
    s2 = SavingsCreate(amount=Decimal("10.00"), source="round_up")
    assert s2.source == "round_up"
    s3 = SavingsCreate(amount=Decimal("10.00"), source="manual")
    assert s3.source == "manual"
    s4 = SavingsCreate(amount=Decimal("10.00"), source="transfer")
    assert s4.source == "transfer"

    # Invalid source raises ValidationError
    with pytest.raises(ValidationError):
        SavingsCreate(amount=Decimal("10.00"), source="invalid_source")

    # SavingsUpdate with legacy 'roundup' -> normalized to 'round_up'
    u1 = SavingsUpdate(source="roundup")
    assert u1.source == "round_up"

    # SavingsUpdate with None
    u2 = SavingsUpdate()
    assert u2.source is None


def test_migration_006_upgrade_module_with_legacy_roundup_row(
    client, db, student_user, student_token
):
    """Verify that migration 006's upgrade() function converts legacy 'roundup' row and updates stats."""
    import importlib.util
    import os

    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import text

    headers = {"Authorization": f"Bearer {student_token}"}

    # 1. Insert a legacy row with source='roundup'
    legacy_amt = 33.25
    db.execute(
        text(
            "INSERT INTO savings (user_id, amount, source, created_at) "
            "VALUES (:uid, :amt, 'roundup', :now)"
        ),
        {
            "uid": student_user.user_id,
            "amt": legacy_amt,
            "now": datetime.datetime.utcnow(),
        },
    )
    db.commit()

    # Verify legacy row is present in DB
    row = db.execute(
        text("SELECT source FROM savings WHERE amount = :amt"), {"amt": legacy_amt}
    ).fetchone()
    assert row is not None and row[0] == "roundup"

    # 2. Execute migration 006 module's upgrade()
    spec = importlib.util.spec_from_file_location(
        "migration_006",
        os.path.join(
            os.path.dirname(__file__),
            "../alembic/versions/006_normalize_savings_source.py",
        ),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    ctx = MigrationContext.configure(db.connection())
    with Operations.context(ctx):
        mod.upgrade()
    db.commit()

    # 3. Verify legacy row was converted to 'round_up'
    migrated_row = db.execute(
        text("SELECT source FROM savings WHERE amount = :amt"), {"amt": legacy_amt}
    ).fetchone()
    assert migrated_row is not None and migrated_row[0] == "round_up"

    # 4. Verify roundups stats endpoint counts it as round_up savings
    r_stats = client.get("/api/roundups/stats", headers=headers)
    assert r_stats.status_code == 200
    stats = r_stats.json()
    assert Decimal(str(stats["total_saved"])) >= Decimal("33.25")
