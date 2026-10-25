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


def test_roundup_explanation_falls_back_to_the_factual_template(
    client, db, student_user, headers
):
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
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as post:
        post.return_value = reply("This saves an additional 1% of your daily spending.")
        res = client.post(
            "/api/transactions/",
            json={
                "amount": 261.05,
                "category": "Food",
                "merchant": "Swiggy",
                "type": "debit",
            },
            headers=headers,
        )
    details = res.json()["roundup_details"]
    assert details["explanation_source"] == "template"
    assert "1%" not in details["explanation"]
    assert "Swiggy" in details["explanation"]
