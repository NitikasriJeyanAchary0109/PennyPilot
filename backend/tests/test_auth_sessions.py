"""Access-token lifetime, refresh-token rotation and session logout."""

import datetime

import pytest
from app.config import settings
from app.models.models import SecurityEvent, UserSession
from app.utils.rate_limit import login_limiter
from app.utils.security import create_access_token, decode_token


@pytest.fixture(autouse=True)
def _reset_limiter():
    login_limiter.clear()
    yield
    login_limiter.clear()


def sign_in(client, email="sessions@test.com"):
    client.post(
        "/api/auth/register",
        json={"full_name": "Ses Sion", "email": email, "password": "longenough1"},
    )
    res = client.post(
        "/api/auth/login/json", json={"email": email, "password": "longenough1"}
    )
    assert res.status_code == 200
    return res.json()


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_access_token_lives_15_minutes_and_login_returns_a_refresh_token(client):
    from app.config import Settings

    # The shipped default, independent of any local .env override...
    assert Settings(_env_file=None).ACCESS_TOKEN_EXPIRE_MINUTES == 15
    # ...and what this environment actually uses.
    assert settings.ACCESS_TOKEN_EXPIRE_MINUTES == 15
    body = sign_in(client)
    assert body["expires_in"] == 15 * 60
    assert len(body["refresh_token"]) >= 40

    claims = decode_token(body["access_token"])
    lifetime = (
        claims["exp"]
        - (datetime.datetime.utcnow() - datetime.datetime(1970, 1, 1)).total_seconds()
    )
    assert 14 * 60 <= lifetime <= 15 * 60 + 5
    assert claims["sid"] is not None


def test_refresh_token_is_stored_hashed_only(client, db):
    body = sign_in(client)
    session = db.query(UserSession).one()
    assert session.refresh_token_hash and body["refresh_token"] not in (
        session.refresh_token_hash,
    )
    assert len(session.refresh_token_hash) == 64  # sha256 hex


def test_refresh_rotates_both_tokens_and_keeps_the_session(client, db):
    first = sign_in(client)
    res = client.post(
        "/api/auth/refresh", json={"refresh_token": first["refresh_token"]}
    )
    assert res.status_code == 200
    second = res.json()
    assert second["refresh_token"] != first["refresh_token"]
    assert second["access_token"] != first["access_token"]
    assert second["has_completed_onboarding"] is False

    assert db.query(UserSession).count() == 1  # same login session
    assert (
        client.get("/api/auth/me", headers=bearer(second["access_token"])).status_code
        == 200
    )


def test_replaying_a_used_refresh_token_revokes_the_whole_session(client, db):
    first = sign_in(client)
    second = client.post(
        "/api/auth/refresh", json={"refresh_token": first["refresh_token"]}
    ).json()

    # An attacker (or buggy client) presents the already-used token.
    replay = client.post(
        "/api/auth/refresh", json={"refresh_token": first["refresh_token"]}
    )
    assert replay.status_code == 401

    # Everything from that session is now dead, including the newest tokens.
    assert (
        client.get("/api/auth/me", headers=bearer(second["access_token"])).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/refresh", json={"refresh_token": second["refresh_token"]}
        ).status_code
        == 401
    )
    event = db.query(SecurityEvent).filter_by(event_type="refresh_token_reuse").one()
    assert event.severity == "high"


def test_unknown_and_expired_refresh_tokens_are_rejected(client, db):
    assert (
        client.post("/api/auth/refresh", json={"refresh_token": "x" * 48}).status_code
        == 401
    )
    body = sign_in(client)
    session = db.query(UserSession).one()
    session.refresh_expires_at = datetime.datetime.utcnow() - datetime.timedelta(
        seconds=1
    )
    db.commit()
    assert (
        client.post(
            "/api/auth/refresh", json={"refresh_token": body["refresh_token"]}
        ).status_code
        == 401
    )


def test_expired_access_token_is_refused_until_refreshed(client):
    body = sign_in(client)
    claims = decode_token(body["access_token"])
    expired = create_access_token(
        {
            "sub": claims["sub"],
            "role": claims["role"],
            "user_id": claims["user_id"],
            "sid": claims["sid"],
        },
        expires_delta=datetime.timedelta(seconds=-5),
    )
    assert client.get("/api/auth/me", headers=bearer(expired)).status_code == 401
    refreshed = client.post(
        "/api/auth/refresh", json={"refresh_token": body["refresh_token"]}
    ).json()
    assert (
        client.get(
            "/api/auth/me", headers=bearer(refreshed["access_token"])
        ).status_code
        == 200
    )


def test_logout_revokes_every_token_of_the_session(client):
    first = sign_in(client)
    renewed = client.post(
        "/api/auth/refresh", json={"refresh_token": first["refresh_token"]}
    ).json()

    assert (
        client.post(
            "/api/auth/logout", headers=bearer(renewed["access_token"])
        ).status_code
        == 204
    )

    # Not just the presented access token: older ones from the session, and the
    # refresh token, stop working too.
    assert (
        client.get("/api/auth/me", headers=bearer(first["access_token"])).status_code
        == 401
    )
    assert (
        client.get("/api/auth/me", headers=bearer(renewed["access_token"])).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/refresh", json={"refresh_token": renewed["refresh_token"]}
        ).status_code
        == 401
    )


def test_logout_works_with_an_expired_access_token_or_just_the_refresh_token(client):
    body = sign_in(client)
    claims = decode_token(body["access_token"])
    expired = create_access_token(
        {k: claims[k] for k in ("sub", "role", "user_id", "sid")},
        expires_delta=datetime.timedelta(seconds=-5),
    )
    assert client.post("/api/auth/logout", headers=bearer(expired)).status_code == 204
    assert (
        client.post(
            "/api/auth/refresh", json={"refresh_token": body["refresh_token"]}
        ).status_code
        == 401
    )

    other = sign_in(client)
    res = client.post(
        "/api/auth/logout", json={"refresh_token": other["refresh_token"]}
    )
    assert res.status_code == 204
    assert (
        client.get("/api/auth/me", headers=bearer(other["access_token"])).status_code
        == 401
    )


def test_logout_without_any_credentials_is_rejected(client):
    assert client.post("/api/auth/logout").status_code == 401
    forged = create_access_token(
        {"sub": "x", "role": "student", "user_id": 1, "sid": 1}
    )
    assert (
        client.post("/api/auth/logout", headers=bearer(forged + "tamper")).status_code
        == 401
    )


def test_logout_is_scoped_to_one_device_and_logout_all_ends_every_device(client):
    phone = sign_in(client)
    laptop = sign_in(client)

    client.post("/api/auth/logout", headers=bearer(phone["access_token"]))
    assert (
        client.get("/api/auth/me", headers=bearer(laptop["access_token"])).status_code
        == 200
    )

    tablet = sign_in(client)
    assert (
        client.post(
            "/api/auth/logout-all", headers=bearer(laptop["access_token"])
        ).status_code
        == 204
    )
    for tokens in (laptop, tablet):
        assert (
            client.get(
                "/api/auth/me", headers=bearer(tokens["access_token"])
            ).status_code
            == 401
        )
        assert (
            client.post(
                "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
            ).status_code
            == 401
        )


def test_google_callback_hands_over_only_a_single_use_refresh_token(client):
    from unittest.mock import AsyncMock, patch

    info = {
        "userinfo": {
            "email": "oauth-ses@test.com",
            "name": "Oauth Ses",
            "email_verified": True,
        }
    }
    with patch(
        "app.routers.auth.oauth.google.authorize_access_token",
        new=AsyncMock(return_value=info),
    ):
        html = client.get("/api/auth/google/callback").text
    assert "refresh_token=" in html
    assert "oauth?token=" not in html  # no access token in the URL

    refresh = html.split('const refreshToken = "')[1].split('"')[0]
    first = client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert first.status_code == 200
    # The URL value is now spent: a second redemption (an interceptor) is a replay.
    assert (
        client.post("/api/auth/refresh", json={"refresh_token": refresh}).status_code
        == 401
    )
