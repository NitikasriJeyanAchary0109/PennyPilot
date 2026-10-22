"""
Google ID-token verification.

The mobile/web client hands the backend a Google ID token; the backend must
verify it with Google before trusting any identity claim in it. (Trusting an
email / oauth_id sent by the client would let anyone sign in as anyone.)
"""

from __future__ import annotations

import logging
from typing import Any, Dict

import httpx
from app.config import settings
from fastapi import HTTPException, status

logger = logging.getLogger("pennypilot.google_auth")

_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"


def _allowed_audiences() -> set:
    return {c.strip() for c in settings.GOOGLE_CLIENT_ID.split(",") if c.strip()}


def verify_google_id_token(id_token: str) -> Dict[str, Any]:
    """
    Validate `id_token` with Google and return its verified claims
    (email, sub, name).

    Raises HTTPException 503 if Google sign-in isn't configured, 401 if the
    token is invalid / for another app / has an unverified email.
    """
    audiences = _allowed_audiences()
    if not audiences:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured on this server.",
        )

    try:
        response = httpx.get(
            _TOKENINFO_URL, params={"id_token": id_token}, timeout=10.0
        )
    except httpx.RequestError as exc:
        logger.error("google_auth | tokeninfo unreachable: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not reach Google to verify the sign-in. Try again.",
        ) from exc

    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid Google sign-in token.",
    )
    if response.status_code != 200:
        raise invalid

    claims = response.json()
    if claims.get("aud") not in audiences:
        raise invalid
    if str(claims.get("email_verified")).lower() != "true" or not claims.get("email"):
        raise invalid
    if not claims.get("sub"):
        raise invalid
    return claims
