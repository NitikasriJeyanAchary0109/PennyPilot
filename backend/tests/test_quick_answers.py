"""Instant chat answers: right questions, right numbers, no model involved."""

import datetime
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from app.models.models import Budget, Goal, Savings, Transaction
from app.services.quick_answers import detect_intent

NOW = datetime.datetime.utcnow()


@pytest.fixture
def headers(student_token):
    return {"Authorization": f"Bearer {student_token}"}


@pytest.mark.parametrize(
    "message, intent",
    [
        ("How much have I saved so far?", "saved"),
        ("what are my savings", "saved"),
        ("total savings?", "saved"),
        ("How is my goal going?", "goals"),
        ("When will I reach my goal?", "goals"),
        ("goal progress", "goals"),
        ("Which budgets am I close to?", "budgets"),
        ("how are my budgets doing", "budgets"),
        ("What subscriptions do I have?", "subscriptions"),
        ("my subscriptions", "subscriptions"),
    ],
)
def test_common_status_questions_are_recognised(message, intent):
    assert detect_intent(message) == intent


@pytest.mark.parametrize(
    "message",
    [
        # a qualifier the canned answer would silently ignore
        "How much did I save in September?",
        "how much have I saved last week",
        "How much have I saved for my laptop?",
        "What did I spend on Swiggy?",
        "How is my 2nd goal going?",
        # asking for advice, not status
        "How can I reach my goal faster?",
        "Tips to improve my budget",
        "Should I cancel my subscriptions?",
        "How can I save ₹1,000 extra this month?",
        # general questions
        "How do micro-savings and round-ups work?",
        "Hello",
        "",
        "x" * 200,
    ],
)
def test_anything_with_a_qualifier_or_asking_for_advice_goes_to_the_model(message):
    assert detect_intent(message) is None


def no_model():
    """A model that fails the test if it is ever contacted."""
    return patch.object(
        httpx.AsyncClient,
        "post",
        new_callable=AsyncMock,
        side_effect=AssertionError(
            "the model must not be called for an instant answer"
        ),
    )


def test_saved_answer_uses_the_real_totals_and_skips_the_model(
    client, db, student_user, headers
):
    db.add_all(
        [
            Savings(
                user_id=student_user.user_id,
                amount=Decimal("120.50"),
                source="round_up",
                created_at=NOW,
            ),
            Savings(
                user_id=student_user.user_id,
                amount=Decimal("300"),
                source="manual",
                created_at=NOW,
            ),
        ]
    )
    db.commit()
    with no_model():
        res = client.post(
            "/api/chat/",
            json={"message": "How much have I saved so far?"},
            headers=headers,
        )
    assert res.status_code == 200
    body = res.json()
    assert body["role"] == "calculated"
    assert "₹420.50" in body["response"]
    assert "₹120.50" in body["response"] and "₹300.00" in body["response"]


def test_empty_state_answers_are_honest(client, headers):
    with no_model():
        saved = client.post(
            "/api/chat/", json={"message": "how much have i saved"}, headers=headers
        ).json()
        goals = client.post(
            "/api/chat/", json={"message": "how is my goal going"}, headers=headers
        ).json()
        budgets = client.post(
            "/api/chat/", json={"message": "how are my budgets doing"}, headers=headers
        ).json()
        subs = client.post(
            "/api/chat/",
            json={"message": "what subscriptions do i have"},
            headers=headers,
        ).json()
    assert "haven't saved anything" in saved["response"]
    assert "don't have an active goal" in goals["response"]
    assert "haven't set any budgets" in budgets["response"]
    assert "don't see any subscription" in subs["response"]


def test_goal_answer_shows_progress_and_a_projection_only_when_there_is_one(
    client, db, student_user, headers
):
    goal = Goal(
        user_id=student_user.user_id,
        title="Laptop",
        target_amount=Decimal("1000"),
        current_amount=Decimal("250"),
        status="active",
        created_at=NOW,
    )
    db.add(goal)
    db.commit()
    with no_model():
        before = client.post(
            "/api/chat/", json={"message": "how is my goal going"}, headers=headers
        ).json()
    assert "₹250.00 of ₹1,000.00 (25.0%)" in before["response"]
    assert "isn't enough recent saving" in before["response"]

    db.add(
        Savings(
            user_id=student_user.user_id,
            goal_id=goal.id,
            amount=Decimal("100"),
            source="manual",
            created_at=NOW,
        )
    )
    db.commit()
    with no_model():
        after = client.post(
            "/api/chat/", json={"message": "when will i reach my goal"}, headers=headers
        ).json()
    assert "you'd finish around" in after["response"]


def test_budget_answer_reports_each_budget_with_its_status(
    client, db, student_user, headers
):
    db.add(
        Budget(
            user_id=student_user.user_id,
            category="Food",
            limit_amount=Decimal("100"),
            period="monthly",
            start_date=NOW,
        )
    )
    db.add(
        Transaction(
            user_id=student_user.user_id,
            amount=Decimal("150"),
            category="Food",
            merchant="Cafe",
            type="debit",
            transaction_date=NOW,
        )
    )
    db.commit()
    with no_model():
        res = client.post(
            "/api/chat/",
            json={"message": "which budgets am i close to"},
            headers=headers,
        ).json()
    assert "Food: ₹150.00 of ₹100.00 this month — over the limit." in res["response"]


def test_subscription_answer_lists_what_the_transactions_show(
    client, db, student_user, headers
):
    db.add_all(
        [
            Transaction(
                user_id=student_user.user_id,
                amount=Decimal("649"),
                category="Subscriptions",
                merchant="Netflix",
                type="debit",
                transaction_date=NOW,
            ),
            Transaction(
                user_id=student_user.user_id,
                amount=Decimal("119"),
                category="Subscriptions",
                merchant="Spotify",
                type="debit",
                transaction_date=NOW,
            ),
        ]
    )
    db.commit()
    with no_model():
        res = client.post(
            "/api/chat/",
            json={"message": "what subscriptions do i have"},
            headers=headers,
        ).json()
    assert "2 subscriptions" in res["response"]
    assert "about ₹768.00 a month" in res["response"]
    assert "Netflix ₹649.00" in res["response"]


def test_other_questions_still_reach_the_model_and_are_labelled_as_coach(
    client, headers
):
    reply = httpx.Response(
        200,
        json={
            "message": {
                "role": "assistant",
                "content": "Round-ups turn spare change into savings.",
            }
        },
        request=httpx.Request("POST", "http://ollama:11434/api/chat"),
    )
    with patch.object(
        httpx.AsyncClient, "post", new_callable=AsyncMock, return_value=reply
    ) as post:
        res = client.post(
            "/api/chat/", json={"message": "How do round-ups work?"}, headers=headers
        ).json()
    assert post.call_count == 1
    assert res["role"] == "coach"


def test_instant_answers_are_saved_to_the_history_with_their_label(client, headers):
    with no_model():
        client.post(
            "/api/chat/", json={"message": "how much have i saved"}, headers=headers
        )
    items = client.get("/api/coach/history", headers=headers).json()["items"]
    assert [(i["question"], i["role"]) for i in items] == [
        ("how much have i saved", "calculated")
    ]
