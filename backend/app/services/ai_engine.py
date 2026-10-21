"""
AI Engine — the ONLY module in Penny Pilot that communicates with the LLM.

Architecture contract
---------------------
- ONLY responsibility: format a prompt, POST it to Ollama, and return raw text.
- NEVER perform financial calculations, access the database, or import rule_engine.
- All numbers in prompts must be pre-computed by rule_engine.py BEFORE this module
  is called. This module treats every numeric value it receives as an opaque string
  inside a prompt — it never interprets or transforms them.
- On any failure (timeout, 5xx, empty response) raise AIEngineError and let the
  calling router surface a user-friendly HTTP error. NEVER return a hardcoded or
  mocked string as a substitute for a real LLM response.

Ollama connectivity
-------------------
Base URL is derived from settings.OLLAMA_URL (set via env / docker-compose).
Docker Compose defines the service as "ollama", so inside the Docker network the
host resolves to http://ollama:11434.  If running outside Docker (local dev),
override OLLAMA_URL in your .env:
    OLLAMA_URL=http://localhost:11434/api/generate
The /api/generate vs /api/chat path is handled here — callers do not need to know
which Ollama endpoint is in use.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import httpx
from app.config import settings

# ---------------------------------------------------------------------------
# Module logger — uses the same name as the root app logger so log aggregators
# can filter by "pennypilot.ai_engine".
# ---------------------------------------------------------------------------
logger = logging.getLogger("pennypilot.ai_engine")

# ---------------------------------------------------------------------------
# Runtime constants — change here; reflected everywhere automatically.
# ---------------------------------------------------------------------------
_REQUEST_TIMEOUT_SECONDS: float = 30.0  # per-attempt wall-clock timeout
_MAX_RETRIES: int = 1  # retry once on timeout or 5xx, then raise


# Derive the /api/chat base URL from the configured OLLAMA_URL.
# settings.OLLAMA_URL may end in /api/generate or /api/chat — we normalise to
# the host:port portion and always append /api/chat ourselves.
def _chat_url() -> str:
    """Return the Ollama /api/chat endpoint, regardless of what OLLAMA_URL is set to."""
    # Strip known path suffixes to get bare host
    base = settings.OLLAMA_URL
    for suffix in ("/api/generate", "/api/chat", "/api/"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
            break
    return base.rstrip("/") + "/api/chat"


def _health_url() -> str:
    """Return the Ollama root endpoint used for health pings."""
    base = settings.OLLAMA_URL
    for suffix in ("/api/generate", "/api/chat", "/api/"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
            break
    return base.rstrip("/") + "/"


# ---------------------------------------------------------------------------
# Custom exception — callers catch this and raise an appropriate HTTPException.
# ---------------------------------------------------------------------------
class AIEngineError(Exception):
    """
    Raised when the AI Engine cannot obtain a valid response from Ollama.

    Attributes:
        message:     Human-readable description of what went wrong.
        status_code: Ollama HTTP status if available, else None.
        retried:     True if the single retry was also exhausted.
    """

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        retried: bool = False,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.retried = retried

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"AIEngineError(message={self.message!r}, "
            f"status_code={self.status_code!r}, retried={self.retried!r})"
        )


# ---------------------------------------------------------------------------
# Core LLM caller
# ---------------------------------------------------------------------------


async def call_llama(
    system_prompt: str,
    user_prompt: str,
    model: str = "llama3",
) -> str:
    """
    Send a chat-style request to Ollama and return the assistant's reply as a
    plain string.

    Uses the /api/chat endpoint with a system + user message pair so the LLM
    has a persistent role/persona throughout the conversation turn.

    Retry policy
    ------------
    On a timeout (httpx.TimeoutException) or a 5xx HTTP response, the call is
    retried exactly once.  If the retry also fails, AIEngineError is raised.
    4xx errors are NOT retried — they indicate a client/model configuration
    problem that won't self-heal.

    Logging
    -------
    - INFO  on every attempt start  (prompt type tag, model, attempt number)
    - INFO  on success              (latency_ms, response length in chars)
    - ERROR on every failure        (error type, status_code if available)
    No prompt bodies or response bodies are logged to protect user financial data.

    Args:
        system_prompt: Persona/role instructions for the LLM.
        user_prompt:   The actual question or narration request.
        model:         Ollama model tag (default: "llama3").

    Returns:
        The assistant's response text, stripped of leading/trailing whitespace.

    Raises:
        AIEngineError: On timeout, 5xx after retry, empty response, or any
                       unexpected network error.
    """
    url = _chat_url()
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
    }

    last_error: Optional[Exception] = None

    for attempt in range(_MAX_RETRIES + 1):  # attempts: 0, 1
        attempt_label = "initial" if attempt == 0 else "retry"
        logger.info(
            "ai_engine.call_llama | attempt=%s model=%s url=%s",
            attempt_label,
            model,
            url,
        )
        t_start = time.monotonic()

        try:
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
                response = await client.post(url, json=payload)

            latency_ms = int((time.monotonic() - t_start) * 1000)

            # --- Handle non-200 responses ---
            if response.status_code >= 500:
                logger.error(
                    "ai_engine.call_llama | attempt=%s status=%d latency_ms=%d — 5xx, will %s",
                    attempt_label,
                    response.status_code,
                    latency_ms,
                    "retry" if attempt < _MAX_RETRIES else "raise",
                )
                last_error = AIEngineError(
                    message=(
                        f"Ollama returned server error {response.status_code}. "
                        "The AI service may be starting up — please try again shortly."
                    ),
                    status_code=response.status_code,
                    retried=(attempt == _MAX_RETRIES),
                )
                continue  # go to next attempt

            if response.status_code != 200:
                # 4xx — do not retry, raise immediately
                logger.error(
                    "ai_engine.call_llama | attempt=%s status=%d latency_ms=%d — client error, no retry",
                    attempt_label,
                    response.status_code,
                    latency_ms,
                )
                raise AIEngineError(
                    message=(
                        f"Ollama rejected the request with status {response.status_code}. "
                        "Check the model name and payload format."
                    ),
                    status_code=response.status_code,
                    retried=False,
                )

            # --- Parse successful response ---
            data = response.json()
            # /api/chat response shape: {"message": {"role": "assistant", "content": "..."}}
            content = (
                data.get("message", {}).get("content", "")
                or data.get("response", "")  # fallback for older Ollama builds
            ).strip()

            if not content:
                logger.error(
                    "ai_engine.call_llama | attempt=%s latency_ms=%d — empty content in response",
                    attempt_label,
                    latency_ms,
                )
                raise AIEngineError(
                    message="Ollama returned a 200 but the response content was empty.",
                    status_code=200,
                    retried=(attempt > 0),
                )

            logger.info(
                "ai_engine.call_llama | attempt=%s model=%s latency_ms=%d response_chars=%d — success",
                attempt_label,
                model,
                latency_ms,
                len(content),
            )
            return content

        except httpx.TimeoutException as exc:
            latency_ms = int((time.monotonic() - t_start) * 1000)
            logger.error(
                "ai_engine.call_llama | attempt=%s latency_ms=%d — timeout (%s), will %s",
                attempt_label,
                latency_ms,
                type(exc).__name__,
                "retry" if attempt < _MAX_RETRIES else "raise",
            )
            last_error = AIEngineError(
                message=(
                    f"Ollama did not respond within {_REQUEST_TIMEOUT_SECONDS}s. "
                    "The model may be loading — please try again in a moment."
                ),
                retried=(attempt == _MAX_RETRIES),
            )
            continue  # go to retry

        except httpx.RequestError as exc:
            # Connection refused, DNS failure, etc. — not worth retrying
            latency_ms = int((time.monotonic() - t_start) * 1000)
            logger.error(
                "ai_engine.call_llama | attempt=%s latency_ms=%d — network error: %s",
                attempt_label,
                latency_ms,
                type(exc).__name__,
            )
            raise AIEngineError(
                message=(
                    "Could not reach the Ollama service. "
                    "Verify the container is running and OLLAMA_URL is correct."
                ),
                retried=(attempt > 0),
            ) from exc

        except AIEngineError:
            # Re-raise empty-content error immediately (not a retriable error)
            raise

    # All attempts exhausted — raise the last recorded error
    assert last_error is not None, "Retry loop exited without setting last_error"
    raise last_error


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


async def health_check() -> bool:
    """
    Ping the Ollama service to verify it is reachable and responding.

    Used by the /api/health endpoint (main.py) to report AI availability
    separately from database availability.

    Returns:
        True  — Ollama root responded with HTTP 200.
        False — Ollama is unreachable or returned an unexpected status.
    """
    url = _health_url()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url)
        is_up = response.status_code == 200
        if is_up:
            logger.info("ai_engine.health_check | ollama=reachable url=%s", url)
        else:
            logger.warning(
                "ai_engine.health_check | ollama=unexpected_status status=%d url=%s",
                response.status_code,
                url,
            )
        return is_up
    except (httpx.RequestError, httpx.TimeoutException) as exc:
        logger.warning(
            "ai_engine.health_check | ollama=unreachable error=%s url=%s",
            type(exc).__name__,
            url,
        )
        return False
