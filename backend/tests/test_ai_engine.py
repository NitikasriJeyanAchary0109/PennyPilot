"""Unit tests for AI Engine using mocked httpx.

Covers:
- Successful call to call_llama (extracting content from message or response fallback)
- Timeout with retry and eventual failure (raising AIEngineError)
- 5xx error retry (first 500, then 200 success)
- 5xx error retries exhausted (raising AIEngineError with retried=True)
- 4xx client error (immediate AIEngineError without retry)
- Empty response payload (raising AIEngineError)
- Network/connection error (raising AIEngineError)
- Router mapping of AIEngineError to HTTP 503 Service Unavailable
- Healthcheck check_ollama_health
"""

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from app.services.ai_engine import (
    AIEngineError,
    call_llama,
    health_check,
)


@pytest.mark.anyio
async def test_call_llama_success():
    """Verify call_llama successfully parses Ollama assistant message."""
    mock_response = httpx.Response(
        status_code=200,
        json={
            "message": {"role": "assistant", "content": "  Great job saving money!  "}
        },
        request=httpx.Request("POST", "http://ollama:11434/api/chat"),
    )

    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response
        reply = await call_llama("System prompt", "User prompt")

        assert reply == "Great job saving money!"
        assert mock_post.call_count == 1
        args, kwargs = mock_post.call_args
        assert kwargs["json"]["messages"][0]["content"] == "System prompt"
        assert kwargs["json"]["messages"][1]["content"] == "User prompt"


@pytest.mark.anyio
async def test_call_llama_fallback_response_key():
    """Verify fallback for older Ollama builds returning 'response' key."""
    mock_response = httpx.Response(
        status_code=200,
        json={"response": "Fallback content"},
        request=httpx.Request("POST", "http://ollama:11434/api/chat"),
    )

    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response
        reply = await call_llama("System", "User")
        assert reply == "Fallback content"


@pytest.mark.anyio
async def test_call_llama_timeout_and_retry_exhaustion():
    """Verify timeout triggers retry and raises AIEngineError when exhausted."""
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = httpx.TimeoutException("Read timed out")

        with pytest.raises(AIEngineError) as exc_info:
            await call_llama("System", "User")

        # 1 initial + 1 retry = 2 attempts
        assert mock_post.call_count == 2
        assert "did not respond" in exc_info.value.message
        assert exc_info.value.retried is True


@pytest.mark.anyio
async def test_call_llama_5xx_retry_and_success():
    """Verify 5xx triggers retry and succeeds on 2nd attempt."""
    resp_500 = httpx.Response(
        status_code=500,
        text="Internal Server Error",
        request=httpx.Request("POST", "http://ollama:11434/api/chat"),
    )
    resp_200 = httpx.Response(
        status_code=200,
        json={"message": {"role": "assistant", "content": "Success after retry"}},
        request=httpx.Request("POST", "http://ollama:11434/api/chat"),
    )

    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = [resp_500, resp_200]
        reply = await call_llama("System", "User")

        assert reply == "Success after retry"
        assert mock_post.call_count == 2


@pytest.mark.anyio
async def test_call_llama_5xx_retries_exhausted():
    """Verify 5xx on all attempts raises AIEngineError."""
    resp_503 = httpx.Response(
        status_code=503,
        text="Service Unavailable",
        request=httpx.Request("POST", "http://ollama:11434/api/chat"),
    )

    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = [resp_503, resp_503]

        with pytest.raises(AIEngineError) as exc_info:
            await call_llama("System", "User")

        assert mock_post.call_count == 2
        assert exc_info.value.status_code == 503
        assert exc_info.value.retried is True


@pytest.mark.anyio
async def test_call_llama_4xx_no_retry():
    """Verify 4xx error is not retried and raises immediately."""
    resp_404 = httpx.Response(
        status_code=404,
        text="Model not found",
        request=httpx.Request("POST", "http://ollama:11434/api/chat"),
    )

    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = resp_404

        with pytest.raises(AIEngineError) as exc_info:
            await call_llama("System", "User")

        assert mock_post.call_count == 1
        assert exc_info.value.status_code == 404
        assert exc_info.value.retried is False


@pytest.mark.anyio
async def test_call_llama_empty_response():
    """Verify 200 with empty string raises AIEngineError."""
    resp_empty = httpx.Response(
        status_code=200,
        json={"message": {"role": "assistant", "content": "   "}},
        request=httpx.Request("POST", "http://ollama:11434/api/chat"),
    )

    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = resp_empty

        with pytest.raises(AIEngineError) as exc_info:
            await call_llama("System", "User")

        assert mock_post.call_count == 1
        assert "response content was empty" in exc_info.value.message


@pytest.mark.anyio
async def test_call_llama_network_error():
    """Verify generic request error raises AIEngineError without retrying."""
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = httpx.ConnectError("Connection refused")

        with pytest.raises(AIEngineError) as exc_info:
            await call_llama("System", "User")

        assert mock_post.call_count == 1
        assert "Could not reach the Ollama service" in exc_info.value.message


@pytest.mark.anyio
async def test_check_ollama_health_status():
    """Verify health_check reporting."""
    resp_ok = httpx.Response(
        status_code=200,
        text="Ollama is running",
        request=httpx.Request("GET", "http://ollama:11434/"),
    )
    with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = resp_ok
        is_up = await health_check()
        assert is_up is True

    with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = httpx.ConnectError("Connection refused")
        is_up = await health_check()
        assert is_up is False


@pytest.mark.anyio
async def test_router_returns_503_when_call_llama_fails(client, student_token):
    """Verify endpoints return HTTP 503 when call_llama raises AIEngineError."""
    headers = {"Authorization": f"Bearer {student_token}"}

    with patch("app.routers.coach.call_llama", new_callable=AsyncMock) as mock_call:
        mock_call.side_effect = AIEngineError("Ollama offline", status_code=503)
        resp = client.post(
            "/api/coach/chat",
            json={"message": "How do I start saving?"},
            headers=headers,
        )
        assert resp.status_code == 503
        assert "temporarily unavailable" in resp.json()["detail"]


@pytest.mark.anyio
async def test_call_llama_trims_reply_cut_off_by_token_limit():
    """A reply stopped by num_predict is cut back to its last complete sentence."""
    mock_response = httpx.Response(
        status_code=200,
        json={
            "message": {
                "role": "assistant",
                "content": "You saved ₹1,200.50 this month. Try setting aside a lit",
            },
            "done_reason": "length",
        },
        request=httpx.Request("POST", "http://ollama:11434/api/chat"),
    )
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response
        reply = await call_llama("System", "User")
    assert reply == "You saved ₹1,200.50 this month."


def test_trim_to_last_sentence_edge_cases():
    from app.services.ai_engine import trim_to_last_sentence

    assert trim_to_last_sentence("One. Two! Thr") == "One. Two!"
    assert trim_to_last_sentence("No terminator here") == "No terminator here"
    assert trim_to_last_sentence("Costs ₹99.50 and") == "Costs ₹99.50 and"
    assert trim_to_last_sentence("Done.") == "Done."


@pytest.mark.anyio
async def test_call_llama_uses_configured_model_and_token_limit():
    from app.config import settings

    mock_response = httpx.Response(
        status_code=200,
        json={"message": {"role": "assistant", "content": "ok."}},
        request=httpx.Request("POST", "http://ollama:11434/api/chat"),
    )
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response
        await call_llama("System", "User")
    payload = mock_post.call_args.kwargs["json"]
    assert payload["model"] == settings.OLLAMA_MODEL
    assert payload["options"]["num_predict"] == settings.OLLAMA_NUM_PREDICT
