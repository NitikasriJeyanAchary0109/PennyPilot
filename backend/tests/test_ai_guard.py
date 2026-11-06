"""The model may only repeat numbers it was given (Zero-Arithmetic, enforced on output)."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from app.services.ai_engine import UngroundedReplyError, call_llama
from app.services.ai_guard import extract_numbers, ungrounded_figures


def reply(text, **extra):
    return httpx.Response(
        status_code=200,
        json={"message": {"role": "assistant", "content": text}, **extra},
        request=httpx.Request("POST", "http://ollama:11434/api/chat"),
    )


# ------------------------------------------------------------------- the check
def test_numbers_formatted_differently_are_still_the_same_number():
    given = "Purchase ₹261.05, round-up ₹0.95, goal balance ₹45,000.00."
    assert (
        ungrounded_figures("You saved ₹0.95 on ₹261.05 toward ₹45000.", [given]) == []
    )
    assert ungrounded_figures("That ₹0.950 round-up is small.", [given]) == []


def test_an_invented_percentage_is_caught():
    given = "Purchase ₹261.05 at Swiggy, round-up ₹0.95."
    bad = "This helps you save an additional 1% of your daily spending."
    assert ungrounded_figures(bad, [given]) == ["1"]


def test_spelled_out_percentages_are_caught_too():
    assert ungrounded_figures("You spend about twenty percent less.", ["data"]) == [
        "twenty percent"
    ]
    assert ungrounded_figures("Roughly thirty-five per cent.", ["data"]) == [
        "thirty-five per cent"
    ]


def test_numbers_from_any_supplied_text_are_allowed_and_prose_is_fine():
    system = "Reply in 3 sentences."
    user = "Goal Laptop needs ₹12,000 more by March 2027."
    ok = "In 3 sentences: you need ₹12,000 more by March 2027, so keep going!"
    assert ungrounded_figures(ok, [system, user]) == []
    assert ungrounded_figures("Great work, keep it up!", [system, user]) == []


def test_list_numbering_and_version_like_tokens_are_not_figures():
    reply_text = "Tips:\n1. Cook at home\n2) Walk to class\nUse covid19 rules."
    assert extract_numbers(reply_text) == set()


def test_more_than_one_invented_number_is_reported_in_order():
    assert ungrounded_figures("Save 15 and 250 today.", ["no numbers"]) == ["15", "250"]


# ------------------------------------------------------------ call_llama wiring
@pytest.mark.anyio
async def test_grounded_reply_passes_through_untouched():
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as post:
        post.return_value = reply("You saved ₹0.95 from your ₹261.05 purchase.")
        out = await call_llama("sys", "Purchase ₹261.05, round-up ₹0.95.")
    assert out == "You saved ₹0.95 from your ₹261.05 purchase."
    assert post.call_count == 1


@pytest.mark.anyio
async def test_invented_figure_triggers_one_retry_with_a_reminder():
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as post:
        post.side_effect = [
            reply("That is an extra 1% of your spending."),
            reply("Every little round-up helps you reach your goal."),
        ]
        out = await call_llama("sys", "Purchase ₹261.05, round-up ₹0.95.")

    assert out == "Every little round-up helps you reach your goal."
    assert post.call_count == 2
    retry_prompt = post.call_args_list[1].kwargs["json"]["messages"][1]["content"]
    assert "not in the data above" in retry_prompt
    first_prompt = post.call_args_list[0].kwargs["json"]["messages"][1]["content"]
    assert "not in the data above" not in first_prompt


@pytest.mark.anyio
async def test_a_model_that_keeps_inventing_numbers_is_rejected():
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as post:
        post.return_value = reply("You will save 40% more next year.")
        with pytest.raises(UngroundedReplyError) as exc:
            await call_llama("sys", "Purchase ₹261.05.")
    assert post.call_count == 2  # one retry, then give up
    assert "40" in exc.value.message


# ------------------------------------------------------------ endpoints react
@pytest.fixture
def headers(student_token):
    return {"Authorization": f"Bearer {student_token}"}


def test_chat_never_shows_an_ungrounded_answer(client, headers):
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as post:
        post.return_value = reply("Cut spending by 23% and you'll be rich.")
        res = client.post(
            "/api/chat/", json={"message": "How do I save?"}, headers=headers
        )
    assert res.status_code == 503
    assert "answer I could stand behind" in res.json()["detail"]
    assert "23" not in res.text


def test_advisor_rejects_invented_returns(client, headers):
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as post:
        post.return_value = reply("Index funds usually return 12% a year.")
        res = client.post(
            "/api/advisor/ask",
            json={"question": "What is an index fund?"},
            headers=headers,
        )
    assert res.status_code == 503
    assert "12" not in res.text


def test_a_users_own_number_in_the_question_is_allowed(client, headers):
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as post:
        post.return_value = reply("Saving ₹1,000 extra starts with one small habit.")
        res = client.post(
            "/api/chat/",
            json={"message": "How can I save ₹1,000 extra this month?"},
            headers=headers,
        )
    assert res.status_code == 200


def _goal_and_purchase(client, db, student_user, headers):
    from decimal import Decimal

    from app.models.models import Goal

    db.add(
        Goal(
            user_id=student_user.user_id,
            title="Laptop",
            target_amount=Decimal("1000"),
            current_amount=Decimal("0"),
            status="active",
        )
    )
    db.commit()
    return client.post(
        "/api/transactions/",
        json={
            "amount": 261.05,
            "category": "Food",
            "merchant": "Swiggy",
            "type": "debit",
        },
        headers=headers,
    ).json()


def test_a_purchase_never_waits_for_the_model(client, db, student_user, headers):
    async def must_not_run(*args, **kwargs):
        raise AssertionError("logging a purchase must not call the model")

    with patch("app.routers.transactions.call_llama", must_not_run):
        body = _goal_and_purchase(client, db, student_user, headers)

    details = body["roundup_details"]
    assert body["roundup_applied"] is True
    assert details["explanation_source"] == "template"
    assert "Swiggy" in details["explanation"] and "Laptop" in details["explanation"]


def test_explanation_endpoint_returns_the_models_sentence(
    client, db, student_user, headers
):
    body = _goal_and_purchase(client, db, student_user, headers)
    tx_id = body["transaction"]["id"]
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as post:
        post.return_value = reply("A small ₹0.95 round-up nudges you toward your goal.")
        res = client.post(f"/api/transactions/{tx_id}/explanation", headers=headers)
    assert res.status_code == 200
    assert res.json() == {
        "explanation": "A small ₹0.95 round-up nudges you toward your goal.",
        "explanation_source": "ai",
    }
    sent = post.call_args.kwargs["json"]
    assert sent["options"]["num_predict"] == 60  # one sentence, tiny budget
    assert post.call_count == 1


def test_explanation_endpoint_rejects_invented_figures_without_a_second_try(
    client, db, student_user, headers
):
    body = _goal_and_purchase(client, db, student_user, headers)
    tx_id = body["transaction"]["id"]
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as post:
        post.return_value = reply("This saves an additional 1% of your daily spending.")
        res = client.post(f"/api/transactions/{tx_id}/explanation", headers=headers)
    assert res.json()["explanation_source"] == "template"
    assert "1%" not in res.json()["explanation"]
    assert post.call_count == 1  # time-boxed callers don't pay for a regeneration


def test_explanation_endpoint_falls_back_when_the_model_is_down(
    client, db, student_user, headers
):
    body = _goal_and_purchase(client, db, student_user, headers)
    with patch.object(
        httpx.AsyncClient,
        "post",
        new_callable=AsyncMock,
        side_effect=httpx.ConnectError("down"),
    ):
        res = client.post(
            f"/api/transactions/{body['transaction']['id']}/explanation",
            headers=headers,
        )
    assert res.status_code == 200
    assert res.json()["explanation_source"] == "template"


def test_explanation_endpoint_is_private_and_needs_a_roundup(
    client, db, student_user, headers
):
    from decimal import Decimal

    from app.models.models import Transaction, User

    other = User(full_name="Other", email="o2@x.com", role="student")
    db.add(other)
    db.commit()
    theirs = Transaction(
        user_id=other.user_id,
        amount=Decimal("10"),
        merchant="X",
        category="Food",
        type="debit",
        is_round_up_applied=True,
        round_up_amount=Decimal("1"),
    )
    plain = Transaction(
        user_id=student_user.user_id,
        amount=Decimal("10"),
        merchant="Y",
        category="Food",
        type="debit",
    )
    db.add_all([theirs, plain])
    db.commit()
    assert (
        client.post(
            f"/api/transactions/{theirs.id}/explanation", headers=headers
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/transactions/{plain.id}/explanation", headers=headers
        ).status_code
        == 404
    )


# ------------------------------------------------------- speed: cache, budgets, warm-up
@pytest.mark.anyio
async def test_identical_prompts_are_answered_from_the_cache():
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as post:
        post.return_value = reply("Keep going, your goal is within reach.")
        first = await call_llama("sys", "Goal needs ₹500 more.")
        second = await call_llama("sys", "Goal needs ₹500 more.")
        changed = await call_llama("sys", "Goal needs ₹450 more.")  # the data changed
    assert first == second == changed
    assert post.call_count == 2  # the repeat was free; the changed prompt was not


@pytest.mark.anyio
async def test_rejected_replies_are_never_cached():
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as post:
        post.return_value = reply("You will save 30% more.")
        for _ in range(2):
            with pytest.raises(UngroundedReplyError):
                await call_llama("sys", "Purchase ₹100.", grounding_attempts=1)
    assert post.call_count == 2


@pytest.mark.anyio
async def test_request_asks_for_a_small_context_and_the_requested_token_budget():
    from app.config import settings

    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as post:
        post.return_value = reply("Fine.")
        await call_llama("sys", "user a", max_tokens=40)
        await call_llama("sys", "user b")
    first, second = (c.kwargs["json"]["options"] for c in post.call_args_list)
    assert first["num_predict"] == 40
    assert second["num_predict"] == settings.OLLAMA_NUM_PREDICT
    assert first["num_ctx"] == settings.OLLAMA_NUM_CTX


@pytest.mark.anyio
async def test_warm_up_loads_the_model_with_one_token_and_never_raises():
    from app.services.ai_engine import warm_up

    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as post:
        post.return_value = httpx.Response(
            200,
            json={"message": {"content": "o"}},
            request=httpx.Request("POST", "http://ollama:11434/api/chat"),
        )
        assert await warm_up() is True
        assert post.call_args.kwargs["json"]["options"]["num_predict"] == 1
        assert post.call_args.kwargs["json"]["keep_alive"] == -1

    with patch.object(
        httpx.AsyncClient,
        "post",
        new_callable=AsyncMock,
        side_effect=httpx.ConnectError("down"),
    ):
        assert await warm_up() is False
