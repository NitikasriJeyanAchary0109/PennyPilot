"""Regression tests for the issues found in the full-codebase audit."""

import datetime
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from app.models.models import (
    Budget,
    FinancialHealth,
    Goal,
    Notification,
    Savings,
    Transaction,
)

NOW = datetime.datetime.utcnow().replace(microsecond=0)


@pytest.fixture
def headers(student_token):
    return {"Authorization": f"Bearer {student_token}"}


@pytest.fixture(autouse=True)
def no_llm(monkeypatch):
    """Never reach a real Ollama: make every LLM call fail fast and visibly."""
    from app.services.ai_engine import AIEngineError

    async def failing(*args, **kwargs):
        raise AIEngineError("offline in tests")

    for target in (
        "app.routers.transactions.call_llama",
        "app.routers.wellness.call_llama",
        "app.routers.advisor.call_llama",
        "app.routers.negotiator.call_llama",
        "app.routers.chat.call_llama",
        "app.routers.coach.call_llama",
        "app.services.ai_engine.call_llama",
    ):
        monkeypatch.setattr(target, failing)


def make_goal(db, user, **kw):
    values = dict(
        user_id=user.user_id,
        title="Laptop",
        target_amount=Decimal("1000.00"),
        current_amount=Decimal("0.00"),
        status="active",
        created_at=NOW,
    )
    values.update(kw)
    goal = Goal(**values)
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


def post_tx(client, headers, **kw):
    payload = dict(amount=12.5, category="Food", merchant="Cafe", type="debit")
    payload.update(kw)
    return client.post("/api/transactions/", json=payload, headers=headers)


# --------------------------------------------------------------------- auth
def test_register_requires_strong_password_and_normalises_email(client):
    short = client.post(
        "/api/auth/register",
        json={"full_name": "A B", "email": "a@b.com", "password": "short"},
    )
    assert short.status_code == 422
    missing = client.post(
        "/api/auth/register", json={"full_name": "A B", "email": "a@b.com"}
    )
    assert missing.status_code == 400

    ok = client.post(
        "/api/auth/register",
        json={"full_name": "A B", "email": "Mixed@Case.com", "password": "longenough1"},
    )
    assert ok.status_code == 201
    assert ok.json()["email"] == "mixed@case.com"

    # Login is case-insensitive and duplicates are caught regardless of case.
    login = client.post(
        "/api/auth/login/json",
        json={"email": "MIXED@case.COM", "password": "longenough1"},
    )
    assert login.status_code == 200
    dup = client.post(
        "/api/auth/register",
        json={"full_name": "A B", "email": "mixed@CASE.com", "password": "longenough1"},
    )
    assert dup.status_code == 400


def test_production_refuses_default_jwt_secret():
    from app.config import Settings, assert_production_ready

    with pytest.raises(RuntimeError):
        assert_production_ready(
            Settings(ENVIRONMENT="production", JWT_SECRET="dev-secret-key")
        )
    assert_production_ready(Settings(ENVIRONMENT="production", JWT_SECRET="x" * 40))
    assert_production_ready(Settings(ENVIRONMENT="development"))


# ------------------------------------------------------------- transactions
def test_transaction_validation(client, headers):
    assert post_tx(client, headers, amount=-5).status_code == 422
    assert post_tx(client, headers, amount=0).status_code == 422
    assert post_tx(client, headers, type="expense").status_code == 422
    assert post_tx(client, headers, merchant="   ").status_code == 422
    assert (
        client.get("/api/transactions/?limit=100000", headers=headers).status_code
        == 422
    )


def test_credit_transactions_never_generate_roundups(client, db, student_user, headers):
    goal = make_goal(db, student_user)
    res = post_tx(client, headers, amount=1234.5, type="credit", category="Income")
    assert res.status_code == 201
    assert res.json()["roundup_applied"] is False
    db.refresh(goal)
    assert goal.current_amount == Decimal("0.00")


def test_onboarding_baseline_entries_can_skip_roundups(
    client, db, student_user, headers
):
    goal = make_goal(db, student_user)
    res = post_tx(client, headers, amount=8000, category="Rent", apply_roundup=False)
    assert res.json()["roundup_applied"] is False
    db.refresh(goal)
    assert goal.current_amount == Decimal("0.00")


def test_roundups_never_go_to_deleted_or_completed_goals(
    client, db, student_user, headers
):
    make_goal(db, student_user, title="Gone", is_deleted=True, status="abandoned")
    make_goal(
        db,
        student_user,
        title="Done",
        status="completed",
        current_amount=Decimal("1000.00"),
    )
    res = post_tx(client, headers, amount=12.5)
    assert res.json()["roundup_applied"] is False
    assert db.query(Savings).count() == 0


def test_roundup_explanation_is_labelled_template_when_ai_is_down(
    client, db, student_user, headers
):
    make_goal(db, student_user)
    res = post_tx(client, headers, amount=12.5, merchant="Campus Cafe")
    details = res.json()["roundup_details"]
    assert res.json()["roundup_applied"] is True
    assert details["explanation_source"] == "template"
    assert "Campus Cafe" in details["explanation"]
    assert "0.50" in details["explanation"]


def test_roundup_safety_check_uses_real_balance_when_income_is_recorded(
    client, db, student_user, headers
):
    make_goal(db, student_user)
    # Income of ₹100, then a ₹95.5 purchase leaves ₹4.50: below the ₹20 threshold.
    post_tx(
        client,
        headers,
        amount=100,
        type="credit",
        category="Income",
        merchant="Allowance",
    )
    res = post_tx(client, headers, amount=95.5)
    assert res.json()["roundup_applied"] is False
    assert "below the safety threshold" in res.json()["roundup_details"]["reason"]


def test_goal_completes_and_notifies_when_roundup_fills_it(
    client, db, student_user, headers
):
    goal = make_goal(db, student_user, target_amount=Decimal("0.50"))
    post_tx(client, headers, amount=12.5)
    db.refresh(goal)
    assert goal.status == "completed"
    assert db.query(Notification).filter_by(type="goal_completed").count() == 1


def test_budget_alert_notification_on_overspend(client, db, student_user, headers):
    db.add(
        Budget(
            user_id=student_user.user_id,
            category="Food",
            limit_amount=Decimal("100.00"),
            period="monthly",
            start_date=NOW,
        )
    )
    db.commit()
    post_tx(client, headers, amount=150, category="food")  # case-insensitive match
    notes = db.query(Notification).filter_by(type="budget_exceeded").all()
    assert len(notes) == 1
    assert notes[0].status == "unread"


def test_csv_upload_accepts_date_header_and_type_column(
    client, db, student_user, headers
):
    csv = (
        b"date,description,amount,category,type\n"
        b"2026-10-01,Allowance,5000,Income,credit\n"
        b"2026-10-02,Lunch,120.50,Food,debit\n"
        b"2026-10-03,Bad,10,Food,refund\n"
    )
    res = client.post(
        "/api/transactions/upload",
        files={"file": ("STATEMENT.CSV", csv, "text/csv")},
        headers=headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["failed_count"] == 1
    types = {t.description: t.type for t in db.query(Transaction).all()}
    assert types == {"Allowance": "credit", "Lunch": "debit"}


def test_csv_upload_rejects_oversized_files(client, headers):
    big = b"amount,category,description\n" + b"1,Food,x\n" * (300 * 1024)
    res = client.post(
        "/api/transactions/upload",
        files={"file": ("big.csv", big, "text/csv")},
        headers=headers,
    )
    assert res.status_code == 413


def test_transactions_filter_has_roundup(client, db, student_user, headers):
    make_goal(db, student_user)
    post_tx(client, headers, amount=12.5)  # round-up applied
    post_tx(client, headers, amount=20.5, type="credit", category="Income")
    res = client.get("/api/transactions/?has_roundup=true", headers=headers)
    assert [t["is_round_up_applied"] for t in res.json()] == [True]


# ------------------------------------------------------------------- goals
def test_goal_list_includes_progress_and_orders_by_creation(
    client, db, student_user, headers
):
    make_goal(db, student_user, title="First", current_amount=Decimal("250.00"))
    make_goal(
        db, student_user, title="Second", created_at=NOW + datetime.timedelta(seconds=5)
    )
    res = client.get("/api/goals/", headers=headers)
    assert [g["title"] for g in res.json()] == ["First", "Second"]
    assert res.json()[0]["progress_percentage"] == 25.0


def test_goal_without_savings_history_has_no_projected_date(
    client, db, student_user, headers
):
    goal = make_goal(db, student_user)
    detail = client.get(f"/api/goals/{goal.id}", headers=headers).json()
    # Previously this leaked the 9999-12-31 sentinel to the UI.
    assert detail["projected_completion_date"] is None


def test_goal_update_cannot_overwrite_saved_balance(client, db, student_user, headers):
    goal = make_goal(db, student_user, current_amount=Decimal("100.00"))
    res = client.put(
        f"/api/goals/{goal.id}",
        json={"title": "Renamed", "current_amount": 999999},
        headers=headers,
    )
    assert res.status_code == 200
    db.refresh(goal)
    assert goal.title == "Renamed"
    assert goal.current_amount == Decimal("100.00")


def test_goal_withdrawal_updates_balance_and_ledger(client, db, student_user, headers):
    goal = make_goal(db, student_user, current_amount=Decimal("300.00"))
    res = client.post(
        f"/api/goals/{goal.id}/withdraw",
        json={"amount": 120, "reason": "medical"},
        headers=headers,
    )
    assert res.status_code == 200
    assert Decimal(str(res.json()["remaining"])) == Decimal("180.00")
    db.refresh(goal)
    assert goal.current_amount == Decimal("180.00")
    row = db.query(Savings).one()
    assert row.source == "withdrawal" and row.amount == Decimal("-120.00")

    # Ledger endpoints still serialise these rows (previously a 500).
    assert client.get("/api/savings/", headers=headers).status_code == 200
    summary = client.get("/api/savings/summary", headers=headers).json()
    assert Decimal(str(summary["total_saved"])) == Decimal("-120.00")


def test_goal_withdrawal_validation(client, db, student_user, headers):
    goal = make_goal(db, student_user, current_amount=Decimal("50.00"))
    too_much = client.post(
        f"/api/goals/{goal.id}/withdraw",
        json={"amount": 51, "reason": "x"},
        headers=headers,
    )
    assert too_much.status_code == 400
    zero = client.post(
        f"/api/goals/{goal.id}/withdraw",
        json={"amount": 0, "reason": "x"},
        headers=headers,
    )
    assert zero.status_code == 422
    missing = client.post(
        "/api/goals/9999/withdraw", json={"amount": 1, "reason": "x"}, headers=headers
    )
    assert missing.status_code == 404


def test_withdrawals_do_not_reduce_the_savings_rate(client, db, student_user, headers):
    from app.services.ledger import recent_savings_amounts

    goal = make_goal(db, student_user, current_amount=Decimal("300.00"))
    db.add(
        Savings(
            user_id=student_user.user_id,
            goal_id=goal.id,
            amount=Decimal("40"),
            source="manual",
            created_at=NOW,
        )
    )
    db.commit()
    client.post(
        f"/api/goals/{goal.id}/withdraw",
        json={"amount": 100, "reason": "x"},
        headers=headers,
    )
    assert recent_savings_amounts(db, student_user.user_id) == [Decimal("40.00")]


def test_force_deleting_a_goal_keeps_the_ledger_readable(
    client, db, student_user, headers
):
    goal = make_goal(db, student_user, current_amount=Decimal("80.00"))
    assert (
        client.delete(f"/api/goals/{goal.id}?force=true", headers=headers).status_code
        == 204
    )
    # The reallocation row used a source the response model rejected → 500.
    res = client.get("/api/savings/", headers=headers)
    assert res.status_code == 200
    assert res.json()[0]["source"] == "goal_reallocation"


# ----------------------------------------------------------------- savings
def test_savings_deposit_validation_and_floor(client, db, student_user, headers):
    goal = make_goal(db, student_user)
    bad = client.post(
        "/api/savings/",
        json={"amount": -50, "source": "manual", "goal_id": goal.id},
        headers=headers,
    )
    assert bad.status_code == 400
    # Clients can't forge ledger-internal sources.
    forged = client.post(
        "/api/savings/", json={"amount": 5, "source": "withdrawal"}, headers=headers
    )
    assert forged.status_code == 422

    ok = client.post(
        "/api/savings/",
        json={"amount": 30, "source": "manual", "goal_id": goal.id},
        headers=headers,
    )
    sid = ok.json()["id"]
    db.query(Goal).filter_by(id=goal.id).update({"current_amount": Decimal("10.00")})
    db.commit()
    assert client.delete(f"/api/savings/{sid}", headers=headers).status_code == 204
    db.refresh(goal)
    assert goal.current_amount == Decimal("0.00")  # never negative


def test_savings_trend_buckets_by_week(client, db, student_user, headers):
    db.add_all(
        [
            Savings(
                user_id=student_user.user_id,
                amount=Decimal("10"),
                source="manual",
                created_at=NOW,
            ),
            Savings(
                user_id=student_user.user_id,
                amount=Decimal("5"),
                source="round_up",
                created_at=NOW - datetime.timedelta(days=8),
            ),
            Savings(
                user_id=student_user.user_id,
                amount=Decimal("-99"),
                source="withdrawal",
                created_at=NOW,
            ),
        ]
    )
    db.commit()
    res = client.get("/api/savings/trend?weeks=4", headers=headers).json()
    assert len(res["weeks"]) == 4
    assert [Decimal(str(w["saved"])) for w in res["weeks"]] == [
        Decimal("0"),
        Decimal("0"),
        Decimal("5"),
        Decimal("10"),
    ]
    assert Decimal(str(res["total"])) == Decimal("15")


# ----------------------------------------------------------------- budgets
def test_budget_tracks_current_period_and_only_debits(
    client, db, student_user, headers
):
    created_long_ago = NOW - datetime.timedelta(days=75)
    db.add(
        Budget(
            user_id=student_user.user_id,
            category="Food",
            limit_amount=Decimal("500"),
            period="monthly",
            start_date=created_long_ago,
        )
    )
    db.add_all(
        [
            # Old month: must not count towards this month's budget.
            Transaction(
                user_id=student_user.user_id,
                amount=Decimal("400"),
                category="Food",
                merchant="Old",
                type="debit",
                transaction_date=created_long_ago,
            ),
            # Income in the same category must not count as spend.
            Transaction(
                user_id=student_user.user_id,
                amount=Decimal("900"),
                category="Food",
                merchant="Refund",
                type="credit",
                transaction_date=NOW,
            ),
            Transaction(
                user_id=student_user.user_id,
                amount=Decimal("60"),
                category="food",
                merchant="Now",
                type="debit",
                transaction_date=NOW,
            ),
        ]
    )
    db.commit()
    budget = client.get("/api/budgets/", headers=headers).json()[0]
    assert Decimal(str(budget["spent_amount"])) == Decimal("60.00")
    assert budget["is_over_limit"] is False


def test_weekly_period_bounds_roll_forward():
    from app.services.ledger import get_period_bounds

    anchor = datetime.datetime(2026, 8, 1, 15, 30)  # a Saturday
    start, end = get_period_bounds(
        "weekly", anchor, now=datetime.datetime(2026, 8, 20, 9, 0)
    )
    assert start == datetime.datetime(2026, 8, 15)
    assert end == datetime.datetime(2026, 8, 22) - datetime.timedelta(microseconds=1)
    start, end = get_period_bounds(
        "monthly", anchor, now=datetime.datetime(2026, 12, 31, 23, 0)
    )
    assert start == datetime.datetime(2026, 12, 1)
    assert end.month == 12 and end.day == 31


def test_budget_category_duplicates_are_case_insensitive(client, headers):
    first = client.post(
        "/api/budgets/",
        json={"category": "Food", "limit_amount": "100"},
        headers=headers,
    )
    assert first.status_code == 201
    dup = client.post(
        "/api/budgets/",
        json={"category": " food ", "limit_amount": "100"},
        headers=headers,
    )
    assert dup.status_code == 409


# ------------------------------------------------------------ calculations
def test_stress_score_uses_last_30_days_only(client, db, student_user, headers):
    old = NOW - datetime.timedelta(days=200)
    db.add_all(
        [
            Savings(
                user_id=student_user.user_id,
                amount=Decimal("9000"),
                source="manual",
                created_at=old,
            ),
            Transaction(
                user_id=student_user.user_id,
                amount=Decimal("90000"),
                category="Food",
                merchant="Old",
                type="debit",
                transaction_date=old,
            ),
        ]
    )
    db.commit()
    body = client.get("/api/calculations/stress-score", headers=headers).json()
    assert body["monthly_savings"] == "0.00"
    assert body["monthly_spend"] == "0.00"


def test_roundup_projection_uses_actual_roundups(client, db, student_user, headers):
    db.add(
        Savings(
            user_id=student_user.user_id,
            amount=Decimal("30"),
            source="round_up",
            created_at=NOW - datetime.timedelta(days=10),
        )
    )
    db.commit()
    body = client.get(
        "/api/calculations/round-up-projection?months=2", headers=headers
    ).json()
    assert body["average_monthly_roundup"] == "30.00"
    assert body["projected_roundup_savings"] == "60.00"


# ---------------------------------------------------------------- wellness
def test_wellness_fallback_is_factual_not_invented(client, headers):
    res = client.get("/api/wellness/score", headers=headers)
    assert res.status_code == 200
    summary = res.json()["ai_summary"]
    assert "stable" not in summary and "micro-savings are actively" not in summary
    assert "Savings velocity is currently ₹0/month" in summary


def test_wellness_narrative_reused_only_when_score_unchanged(
    client, db, student_user, headers
):
    first = client.get("/api/wellness/score", headers=headers).json()
    again = client.get("/api/wellness/score", headers=headers).json()
    assert again["report_id"] == first["report_id"]

    db.add(
        Savings(
            user_id=student_user.user_id,
            amount=Decimal("5000"),
            source="manual",
            created_at=NOW,
        )
    )
    db.commit()
    changed = client.get("/api/wellness/score", headers=headers).json()
    assert changed["report_id"] != first["report_id"]
    assert db.query(FinancialHealth).count() == 2


# ----------------------------------------------------------- notifications
def test_notifications_mark_all_read(client, db, student_user, headers):
    for i in range(3):
        db.add(
            Notification(
                user_id=student_user.user_id, type="x", title=f"t{i}", message="m"
            )
        )
    db.commit()
    res = client.post("/api/notifications/read-all", headers=headers)
    assert res.json() == {"updated": 3}
    assert all(
        n["status"] == "read"
        for n in client.get("/api/notifications/", headers=headers).json()
    )


# ----------------------------------------------------------------- advisor
def test_advisor_returns_education_with_disclaimer(client, headers):
    with patch("app.routers.advisor.call_llama", new_callable=AsyncMock) as llama:
        llama.return_value = "An index fund holds many companies at once."
        res = client.post(
            "/api/advisor/ask",
            json={"question": "What is an index fund?"},
            headers=headers,
        )
    assert res.status_code == 200
    assert "not personalised investment advice" in res.json()["disclaimer"]
    system_prompt = llama.call_args.kwargs["system_prompt"]
    assert "never recommend a specific fund" in system_prompt


def test_advisor_never_fabricates_when_ai_is_down(client, headers):
    res = client.post(
        "/api/advisor/ask", json={"question": "Best fund?"}, headers=headers
    )
    assert res.status_code == 503


def test_chat_message_length_is_bounded(client, headers):
    assert (
        client.post(
            "/api/chat/", json={"message": "x" * 1001}, headers=headers
        ).status_code
        == 422
    )
    assert (
        client.post("/api/chat/", json={"message": ""}, headers=headers).status_code
        == 422
    )


def test_coach_history_hides_internal_forecast_rows(client, db, student_user, headers):
    from app.models.models import ChatHistory

    db.add_all(
        [
            ChatHistory(user_id=student_user.user_id, question="hello", response="hi"),
            ChatHistory(
                user_id=student_user.user_id,
                question="dream_engine: forecast for goal X",
                response="cached",
            ),
            ChatHistory(
                user_id=student_user.user_id,
                question="Dream Engine Forecast: Save for goal 'X'",
                response="cached",
            ),
        ]
    )
    db.commit()
    items = client.get("/api/coach/history", headers=headers).json()["items"]
    assert [i["question"] for i in items] == ["hello"]


# ------------------------------------------------- sessions & rate limiting
@pytest.fixture(autouse=True)
def _reset_login_limiter():
    from app.utils.rate_limit import login_limiter

    login_limiter.clear()
    yield
    login_limiter.clear()


def _register_and_login(client, email="sess@test.com"):
    client.post(
        "/api/auth/register",
        json={"full_name": "Sess Ion", "email": email, "password": "longenough1"},
    )
    res = client.post(
        "/api/auth/login/json", json={"email": email, "password": "longenough1"}
    )
    assert res.status_code == 200
    return res.json()["access_token"]


def test_logout_revokes_only_the_presented_token(client, db):
    from app.models.models import UserSession

    first = _register_and_login(client)
    second = _register_and_login(client)  # second device, same user
    auth = lambda t: {"Authorization": f"Bearer {t}"}  # noqa: E731

    assert client.get("/api/auth/me", headers=auth(first)).status_code == 200
    assert client.post("/api/auth/logout", headers=auth(first)).status_code == 204

    assert client.get("/api/auth/me", headers=auth(first)).status_code == 401
    assert client.get("/api/auth/me", headers=auth(second)).status_code == 200
    revoked = db.query(UserSession).filter(UserSession.revoked_at.isnot(None)).count()
    assert revoked == 1
    # Logging out twice is harmless.
    assert client.post("/api/auth/logout", headers=auth(second)).status_code == 204


def test_login_session_records_token_id_and_expiry(client, db):
    from app.models.models import UserSession
    from app.utils.security import decode_access_token

    token = _register_and_login(client)
    session = db.query(UserSession).one()
    assert session.jwt_token_id == decode_access_token(token)["jti"]
    assert session.expires_at > datetime.datetime.utcnow()


def test_repeated_wrong_passwords_are_throttled(client):
    client.post(
        "/api/auth/register",
        json={
            "full_name": "Brute Force",
            "email": "bf@test.com",
            "password": "longenough1",
        },
    )
    bad = {"email": "bf@test.com", "password": "wrong-password"}
    for _ in range(5):
        assert client.post("/api/auth/login/json", json=bad).status_code == 401

    blocked = client.post("/api/auth/login/json", json=bad)
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0
    # Even the right password is refused while blocked…
    good = {"email": "bf@test.com", "password": "longenough1"}
    assert client.post("/api/auth/login/json", json=good).status_code == 429
    # …but another account from the same address isn't affected.
    other = client.post(
        "/api/auth/login/json", json={"email": "other@test.com", "password": "x" * 9}
    )
    assert other.status_code == 401


def test_successful_login_clears_failed_attempts(client):
    client.post(
        "/api/auth/register",
        json={
            "full_name": "Slip Up",
            "email": "su@test.com",
            "password": "longenough1",
        },
    )
    for _ in range(4):
        client.post(
            "/api/auth/login/json",
            json={"email": "su@test.com", "password": "nope-nope"},
        )
    ok = client.post(
        "/api/auth/login/json", json={"email": "su@test.com", "password": "longenough1"}
    )
    assert ok.status_code == 200
    for _ in range(4):  # counter restarted, so four more misses are still allowed
        assert (
            client.post(
                "/api/auth/login/json",
                json={"email": "su@test.com", "password": "nope-nope"},
            ).status_code
            == 401
        )


def test_attempt_limiter_window_expires():
    from app.utils.rate_limit import AttemptLimiter

    now = [1000.0]
    limiter = AttemptLimiter(max_failures=2, window_seconds=60, clock=lambda: now[0])
    limiter.record_failure("k")
    limiter.record_failure("k")
    assert limiter.retry_after("k") > 0
    now[0] += 61
    assert limiter.retry_after("k") == 0


# --------------------------------------------------- purchase impact model
def test_purchase_impact_counts_spend_as_unsaved_money(db, student_user):
    from app.routers.negotiator import _compute_goal_impact

    make_goal(
        db,
        student_user,
        target_amount=Decimal("1000.00"),
        current_amount=Decimal("100.00"),
    )
    db.add(
        Savings(
            user_id=student_user.user_id,
            amount=Decimal("300"),
            source="manual",
            created_at=NOW,
        )
    )
    db.commit()
    # ₹300/month: ₹900 left (3 months). A ₹600 purchase adds 2 months → ~60 days.
    # Previously this was clamped by the (smaller) saved balance and understated.
    impact = _compute_goal_impact(Decimal("600"), student_user.user_id, db)
    assert "delays 'Laptop' goal by ~2.0 months" in impact


def test_purchase_impact_without_savings_rate_is_not_invented(db, student_user):
    from app.routers.negotiator import _compute_goal_impact

    make_goal(db, student_user)
    impact = _compute_goal_impact(Decimal("600"), student_user.user_id, db)
    assert "no projected date yet" in impact


# ------------------------------------------------------------- CSV import
STATEMENT = (
    b"date,description,amount,category,type\n"
    b"2026-10-02,Lunch,120.50,Food,debit\n"
    b"2026-10-02,Lunch,120.50,Food,debit\n"  # two real identical purchases
    b"2026-10-03,Metro,45.00,Transport,debit\n"
)


def _upload(client, headers, content=STATEMENT):
    return client.post(
        "/api/transactions/upload",
        files={"file": ("statement.csv", content, "text/csv")},
        headers=headers,
    )


def test_reimporting_a_statement_does_not_duplicate_it(
    client, db, student_user, headers
):
    make_goal(db, student_user)
    first = _upload(client, headers).json()
    assert first["imported_count"] == 3  # repeated rows inside one file are kept
    assert first["duplicates_skipped"] == 0
    saved_after_first = db.query(Savings).count()

    second = _upload(client, headers).json()
    assert second["imported_count"] == 0
    assert second["duplicates_skipped"] == 3
    assert db.query(Transaction).count() == 3
    assert db.query(Savings).count() == saved_after_first  # no extra round-ups

    # A statement that overlaps only partly imports just the new rows.
    more = STATEMENT + b"2026-10-04,Books,300.00,Education,debit\n"
    third = _upload(client, headers, more).json()
    assert third["imported_count"] == 1
    assert third["duplicates_skipped"] == 3


def test_import_is_all_or_nothing(client, db, student_user, headers, monkeypatch):
    calls = {"n": 0}
    from app.routers import transactions

    real = transactions._import_key

    def explode_on_second_row(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("boom")
        return real(*args, **kwargs)

    monkeypatch.setattr(transactions, "_import_key", explode_on_second_row)
    res = _upload(client, headers)
    assert res.status_code == 500
    assert "nothing was saved" in res.json()["detail"]
    db.expire_all()
    assert db.query(Transaction).count() == 0


def test_importing_a_statement_never_creates_savings(client, db, student_user, headers):
    """Past purchases were never rounded up, so an import must not credit any goal."""
    goal = make_goal(db, student_user)
    res = _upload(client, headers)
    body = res.json()
    assert body["imported_count"] == 3
    assert body["roundups_triggered"] == 0
    assert Decimal(str(body["total_roundup_saved"])) == 0

    db.refresh(goal)
    assert goal.current_amount == Decimal("0.00")
    assert db.query(Savings).count() == 0
    assert db.query(Notification).count() == 0
    assert all(
        t.is_round_up_applied is False and t.round_up_amount == 0
        for t in db.query(Transaction).all()
    )
    # …but the history is there for the analysis.
    analysis = client.get("/api/analysis/spending?months=36", headers=headers).json()
    assert analysis["has_data"] is True


def test_new_spending_after_an_import_still_rounds_up(
    client, db, student_user, headers
):
    goal = make_goal(db, student_user)
    _upload(client, headers)
    assert goal.current_amount == Decimal("0.00")
    res = post_tx(client, headers, amount=12.5)
    assert res.json()["roundup_applied"] is True
    db.refresh(goal)
    assert goal.current_amount == Decimal("0.50")


# --------------------------------------------- dev SQLite files from older versions
def test_old_sqlite_dev_database_is_upgraded_in_place(tmp_path):
    from app.database import Base, upgrade_sqlite_schema
    from sqlalchemy import create_engine, inspect, text

    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    # The schema as it was before refresh tokens / transactions.source existed.
    with engine.begin() as c:
        Base.metadata.tables["users"].create(c)
        c.execute(
            text(
                "CREATE TABLE user_sessions (session_id INTEGER PRIMARY KEY, user_id INTEGER"
                " NOT NULL, jwt_token_id VARCHAR, ip_address VARCHAR, device VARCHAR,"
                " login_at DATETIME, expires_at DATETIME, logout_at DATETIME, revoked_at DATETIME)"
            )
        )
        c.execute(
            text(
                "CREATE TABLE transactions (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL,"
                " amount NUMERIC(12,2) NOT NULL, merchant VARCHAR NOT NULL, category VARCHAR"
                " NOT NULL, type VARCHAR NOT NULL, description VARCHAR, transaction_date"
                " DATETIME NOT NULL, round_up_amount NUMERIC(12,2) NOT NULL,"
                " is_round_up_applied BOOLEAN NOT NULL, created_at DATETIME NOT NULL,"
                " is_deleted BOOLEAN NOT NULL)"
            )
        )
        c.execute(
            text(
                "INSERT INTO users(full_name,email,role,has_completed_onboarding,created_at,updated_at)"
                " VALUES('Old','old@x.com','student',0,'2026-01-01','2026-01-01')"
            )
        )
        c.execute(
            text(
                "INSERT INTO transactions(user_id,amount,merchant,category,type,transaction_date,"
                "round_up_amount,is_round_up_applied,created_at,is_deleted)"
                " VALUES(1,10,'Cafe','Food','debit','2026-01-01',0,0,'2026-01-01',0)"
            )
        )

    added = upgrade_sqlite_schema(engine)
    assert set(added) == {
        "user_sessions.refresh_token_hash",
        "user_sessions.previous_refresh_token_hash",
        "user_sessions.refresh_expires_at",
        "transactions.source",
    }
    names = {c["name"] for c in inspect(engine).get_columns("transactions")}
    assert "source" in names
    with engine.connect() as c:
        # Existing rows survive and get the default.
        assert c.execute(text("SELECT source FROM transactions")).scalar() == "manual"
        assert c.execute(text("SELECT count(*) FROM users")).scalar() == 1
    assert upgrade_sqlite_schema(engine) == []  # idempotent


def test_demo_seed_is_complete_and_idempotent(client, db):
    from app.services.demo_seed import DEMO_EMAIL, DEMO_PASSWORD, seed

    first = seed(client)
    assert first["imported"] == 81
    assert first["simulated"] == 3

    second = seed(client)  # nothing is added twice
    assert second["imported"] == 0 and second["duplicates_skipped"] == 81
    assert second["simulated"] == 0

    token = client.post(
        "/api/auth/login/json", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}
    ).json()
    assert token["has_completed_onboarding"] is True
    headers = {"Authorization": f"Bearer {token['access_token']}"}
    goals = client.get("/api/goals/", headers=headers).json()
    assert [g["title"] for g in goals] == ["New Laptop"]
    # Savings come only from the three simulated payments, not from the history.
    assert db.query(Savings).count() == 3
    assert goals[0]["progress_percentage"] > 0
    analysis = client.get("/api/analysis/spending?months=36", headers=headers).json()
    assert analysis["has_data"] is True and analysis["transaction_count"] == 81


# ------------------------------------- wellness: scores first, narration second
def _calls(monkeypatch, behaviour):
    calls = {"n": 0}

    async def fake(*args, **kwargs):
        calls["n"] += 1
        return await behaviour()

    monkeypatch.setattr("app.routers.wellness.call_llama", fake)
    return calls


def test_wellness_score_returns_without_waiting_for_the_ai(
    client, headers, monkeypatch
):
    async def never_called():
        raise AssertionError("the fast path must not call the model")

    calls = _calls(monkeypatch, never_called)
    res = client.get("/api/wellness/score", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["summary_source"] == "factual"
    assert body["ai_summary"].startswith("Your financial wellness score is")
    assert calls["n"] == 0


def test_narration_upgrades_the_summary_and_is_remembered(client, headers, monkeypatch):
    async def narrate():
        return "You're doing fine; keep topping up your goal."

    calls = _calls(monkeypatch, narrate)
    report = client.get("/api/wellness/score", headers=headers).json()

    res = client.post(f"/api/wellness/narrate/{report['report_id']}", headers=headers)
    assert res.status_code == 200
    assert res.json()["summary_source"] == "ai"
    assert res.json()["ai_summary"].startswith("You're doing fine")

    # Same score within the hour: the stored AI text is served, the model isn't asked again.
    again = client.get("/api/wellness/score", headers=headers).json()
    assert again["report_id"] == report["report_id"]
    assert again["summary_source"] == "ai"
    client.post(f"/api/wellness/narrate/{report['report_id']}", headers=headers)
    assert calls["n"] == 1


def test_failed_narration_leaves_the_factual_summary(client, headers, monkeypatch):
    async def offline():
        raise RuntimeError("model offline")

    _calls(monkeypatch, offline)
    report = client.get("/api/wellness/score", headers=headers).json()
    res = client.post(f"/api/wellness/narrate/{report['report_id']}", headers=headers)
    assert res.status_code == 200
    assert res.json()["summary_source"] == "factual"
    assert res.json()["ai_summary"] == report["ai_summary"]


def test_narration_with_invented_figures_is_never_stored(client, headers):
    from unittest.mock import AsyncMock, patch

    import httpx
    from app.services.ai_engine import call_llama

    # Use the real call_llama (with its numbers check) against a model that invents a figure.
    reply = httpx.Response(
        200,
        json={"message": {"role": "assistant", "content": "You could save 37% more!"}},
        request=httpx.Request("POST", "http://ollama:11434/api/chat"),
    )
    report = client.get("/api/wellness/score", headers=headers).json()
    with (
        patch("app.routers.wellness.call_llama", call_llama),
        patch.object(
            httpx.AsyncClient, "post", new_callable=AsyncMock, return_value=reply
        ),
    ):
        res = client.post(
            f"/api/wellness/narrate/{report['report_id']}", headers=headers
        )
    assert res.json()["summary_source"] == "factual"
    assert "37" not in res.json()["ai_summary"]


def test_narration_is_private_and_skips_stale_reports(
    client, db, student_user, headers, monkeypatch
):
    from app.models.models import FinancialHealth, User

    async def narrate():
        return "Hello."

    _calls(monkeypatch, narrate)
    other = User(full_name="Other", email="o@x.com", role="student")
    db.add(other)
    db.commit()
    theirs = FinancialHealth(user_id=other.user_id, health_score=50, stress_score=50)
    db.add(theirs)
    db.commit()
    assert (
        client.post(
            f"/api/wellness/narrate/{theirs.report_id}", headers=headers
        ).status_code
        == 404
    )

    # A report whose score no longer matches the live numbers is not narrated.
    mine = FinancialHealth(
        user_id=student_user.user_id, health_score=1, stress_score=99, ai_summary="old"
    )
    db.add(mine)
    db.commit()
    res = client.post(f"/api/wellness/narrate/{mine.report_id}", headers=headers)
    assert (
        res.json()["ai_summary"] == "old" and res.json()["summary_source"] == "factual"
    )
