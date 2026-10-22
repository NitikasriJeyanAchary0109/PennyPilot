import datetime
from typing import Optional, Tuple

from app.config import settings
from app.database import get_db
from app.middleware.auth_middleware import get_current_user, optional_oauth2_scheme
from app.models.models import SecurityEvent, User, UserSession
from app.schemas.schemas import (
    LogoutRequest,
    RefreshRequest,
    Token,
    UserCreate,
    UserLogin,
    UserResponse,
)
from app.services.google_auth import verify_google_id_token
from app.utils.rate_limit import login_limiter
from app.utils.security import (
    create_access_token,
    decode_token,
    generate_refresh_token,
    get_password_hash,
    hash_refresh_token,
    verify_password,
)
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Configure Google OAuth client
oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


def _find_user_by_email(db: Session, email: str):
    """Case-insensitive email lookup."""
    return (
        db.query(User).filter(func.lower(User.email) == email.strip().lower()).first()
    )


def _new_access_token(user: User, session_id: int) -> str:
    return create_access_token(
        data={
            "sub": user.email,
            "role": user.role,
            "user_id": user.user_id,
            "sid": session_id,
        }
    )


def _refresh_deadline() -> datetime.datetime:
    return datetime.datetime.utcnow() + datetime.timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )


def issue_session(db: Session, user: User, request: Request) -> Tuple[str, str]:
    """
    Record a sign-in and return (access_token, refresh_token).

    The access token is short-lived (see ACCESS_TOKEN_EXPIRE_MINUTES) and carries
    the session id; the refresh token is an opaque random secret of which only a
    hash is stored. Revoking the session (logout) kills both.
    """
    client_host = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    now = datetime.datetime.utcnow()

    refresh_token = generate_refresh_token()
    session = UserSession(
        user_id=user.user_id,
        ip_address=client_host,
        device=user_agent,
        login_at=now,
        refresh_token_hash=hash_refresh_token(refresh_token),
        refresh_expires_at=_refresh_deadline(),
    )
    db.add(session)
    db.flush()  # assigns session_id, which goes into the access token

    access_token = _new_access_token(user, session.session_id)
    claims = decode_token(access_token) or {}
    session.jwt_token_id = claims.get("jti")
    session.expires_at = (
        datetime.datetime.utcfromtimestamp(claims["exp"]) if claims.get("exp") else None
    )

    db.add(
        SecurityEvent(
            session_id=session.session_id,
            user_id=user.user_id,
            event_type="login",
            severity="low",
            ip_address=client_host,
            user_agent=user_agent,
            created_at=now,
        )
    )
    db.commit()
    return access_token, refresh_token


def _login_key(request: Request, email: str) -> str:
    host = request.client.host if request.client else "unknown"
    return f"{host}:{email.strip().lower()}"


def _authenticate(request: Request, db: Session, email: str, password: str) -> User:
    """Verify credentials with failed-attempt throttling; raise 401 / 429."""
    key = _login_key(request, email)
    wait = login_limiter.retry_after(key)
    if wait:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed sign-in attempts. Try again later.",
            headers={"Retry-After": str(wait)},
        )

    user = _find_user_by_email(db, email)
    if (
        not user
        or not user.password_hash
        or not verify_password(password, user.password_hash)
    ):
        login_limiter.record_failure(key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    login_limiter.reset(key)
    return user


@router.post(
    "/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED
)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Registers a new student user (email/password)."""
    if not user_data.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A password is required to create an account.",
        )

    # Check if user already exists
    existing_user = _find_user_by_email(db, user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists.",
        )

    # Hash password and create user with student role
    hashed_pwd = get_password_hash(user_data.password)
    new_user = User(
        full_name=user_data.full_name,
        email=user_data.email.strip().lower(),
        password_hash=hashed_pwd,
        phone=user_data.phone,
        role="student",
        created_at=datetime.datetime.utcnow(),
        updated_at=datetime.datetime.utcnow(),
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


def _token_response(user: User, access_token: str, refresh_token: str) -> dict:
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "token_type": "bearer",
        "role": user.role,
        "has_completed_onboarding": user.has_completed_onboarding,
    }


@router.post("/login", response_model=Token)
def login_for_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """OAuth2 compatible token login, returns access_token."""
    user = _authenticate(request, db, form_data.username, form_data.password)
    return _token_response(user, *issue_session(db, user, request))


@router.post("/login/json", response_model=Token)
def login_json(request: Request, user_data: UserLogin, db: Session = Depends(get_db)):
    """JSON-body login endpoint for easy API clients (like mobile axios)."""
    user = _authenticate(request, db, user_data.email, user_data.password)
    return _token_response(user, *issue_session(db, user, request))


def _revoke_session(db: Session, session: UserSession, event_type: str, severity: str):
    now = datetime.datetime.utcnow()
    if session.revoked_at is None:
        session.revoked_at = now
        session.logout_at = now
    db.add(
        SecurityEvent(
            session_id=session.session_id,
            user_id=session.user_id,
            event_type=event_type,
            severity=severity,
            created_at=now,
        )
    )


@router.post("/refresh", response_model=Token)
def refresh_tokens(
    payload: RefreshRequest, request: Request, db: Session = Depends(get_db)
):
    """
    Exchange a refresh token for a new access token and a NEW refresh token.

    Refresh tokens are single-use. Presenting one that was already rotated means
    it was copied (or replayed), so the whole session is revoked.
    """
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Session expired. Please sign in again.",
    )
    digest = hash_refresh_token(payload.refresh_token)
    now = datetime.datetime.utcnow()

    session = (
        db.query(UserSession).filter(UserSession.refresh_token_hash == digest).first()
    )
    if session is None:
        replayed = (
            db.query(UserSession)
            .filter(UserSession.previous_refresh_token_hash == digest)
            .first()
        )
        if replayed is not None and replayed.revoked_at is None:
            _revoke_session(db, replayed, "refresh_token_reuse", "high")
            db.commit()
        raise invalid

    if (
        session.revoked_at is not None
        or session.refresh_expires_at is None
        or session.refresh_expires_at <= now
    ):
        raise invalid

    user = db.query(User).filter(User.user_id == session.user_id).first()
    if user is None:
        raise invalid

    new_refresh = generate_refresh_token()
    session.previous_refresh_token_hash = digest
    session.refresh_token_hash = hash_refresh_token(new_refresh)
    session.refresh_expires_at = _refresh_deadline()

    access_token = _new_access_token(user, session.session_id)
    claims = decode_token(access_token) or {}
    session.jwt_token_id = claims.get("jti")
    session.expires_at = (
        datetime.datetime.utcfromtimestamp(claims["exp"]) if claims.get("exp") else None
    )
    db.commit()
    return _token_response(user, access_token, new_refresh)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    payload: Optional[LogoutRequest] = None,
    token: Optional[str] = Depends(optional_oauth2_scheme),
    db: Session = Depends(get_db),
):
    """
    End the current login session (access token AND refresh token).

    Works even if the access token has expired: the session is found from the
    token's signed session id, or from the refresh token in the body.
    """
    session = None
    if token:
        claims = decode_token(token, verify_exp=False) or {}
        if claims.get("sid") is not None:
            session = (
                db.query(UserSession)
                .filter(
                    UserSession.session_id == claims["sid"],
                    UserSession.user_id == claims.get("user_id"),
                )
                .first()
            )
    if session is None and payload and payload.refresh_token:
        digest = hash_refresh_token(payload.refresh_token)
        session = (
            db.query(UserSession)
            .filter(
                (UserSession.refresh_token_hash == digest)
                | (UserSession.previous_refresh_token_hash == digest)
            )
            .first()
        )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not identify the session to sign out.",
        )
    if session.revoked_at is None:
        _revoke_session(db, session, "logout", "low")
        db.commit()
    return None


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_everywhere(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Sign this account out on every device."""
    sessions = (
        db.query(UserSession)
        .filter(
            UserSession.user_id == current_user.user_id,
            UserSession.revoked_at.is_(None),
        )
        .all()
    )
    for session in sessions:
        _revoke_session(db, session, "logout_all", "medium")
    db.commit()
    return None


# ==========================================
# GOOGLE OAUTH 2.0 ENDPOINTS
# ==========================================
@router.get("/google/login")
async def google_login(request: Request):
    """Redirects the client to Google's OAuth 2.0 consent screen."""
    # Build redirect URI pointing to the callback endpoint
    redirect_uri = request.url_for("google_callback")
    # For HTTPS cloud deployments or proxies, adapt the redirect scheme if needed
    if "https" in str(request.base_url) or settings.ENVIRONMENT == "production":
        redirect_uri = redirect_uri.replace(scheme="https")
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    """Handles Google callback, fetches user information, and registers/logs in."""
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Google authentication failed: {str(e)}",
        )

    user_info = token.get("userinfo")
    if not user_info:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not retrieve user info from Google.",
        )

    email = user_info.get("email")
    full_name = (
        user_info.get("name")
        or f"{user_info.get('given_name', '')} {user_info.get('family_name', '')}".strip()
    )

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account must have an email address.",
        )
    if user_info.get("email_verified") is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your Google account email is not verified.",
        )

    # Check if user already exists
    user = _find_user_by_email(db, email)
    if not user:
        # Create a new student user
        user = User(
            full_name=full_name,
            email=email.strip().lower(),
            password_hash=None,  # No password for OAuth users
            role="student",  # Default signup role
            created_at=datetime.datetime.utcnow(),
            updated_at=datetime.datetime.utcnow(),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    _access_token, refresh_token = issue_session(db, user, request)

    # HTML Redirection payload to automatically route back into the mobile app's deep linking
    html_content = f"""
    <html>
      <head>
        <title>Authentication Successful</title>
        <script>
          const refreshToken = "{refresh_token}";
          const role = "{user.role}";
          // Deep link redirect
          const onboardingComplete = "{str(user.has_completed_onboarding).lower()}";
          const url = "pennypilot://oauth?refresh_token=" + refreshToken + "&role=" + role + "&has_completed_onboarding=" + onboardingComplete;
          window.location.href = url;
        </script>
      </head>
      <body style="background-color: #0F172A; color: #F8FAFC; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
        <div style="text-align: center; padding: 30px; border: 1px solid #334155; border-radius: 20px; background-color: #1E293B; max-width: 400px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);">
          <h2 style="color: #10B981; margin-bottom: 10px;">Login Successful!</h2>
          <p style="font-size: 14px; margin-bottom: 20px;">We've authenticated your Google account. Redirecting you back to Penny Pilot...</p>
          <p style="font-size: 11px; color: #94A3B8;">If you are not redirected automatically, <a href="pennypilot://oauth?refresh_token={refresh_token}&role={user.role}&has_completed_onboarding={str(user.has_completed_onboarding).lower()}" style="color: #6366F1; font-weight: bold; text-decoration: none;">click here to resume</a>.</p>
        </div>
      </body>
    </html>
    """
    return HTMLResponse(content=html_content)


@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    """Returns the authenticated user's details."""
    return current_user


class GoogleAuthRequest(BaseModel):
    id_token: str = Field(min_length=10)


@router.post("/google", response_model=Token)
def google_auth_post(
    request: Request, auth_data: GoogleAuthRequest, db: Session = Depends(get_db)
):
    """
    Exchanges a Google ID token for a backend JWT.

    The token is verified with Google first; the email / subject used to find or
    create the account come from Google's response, never from the client body.
    """
    claims = verify_google_id_token(auth_data.id_token)
    email = claims["email"].strip().lower()
    full_name = claims.get("name") or email.split("@")[0]
    oauth_id = claims["sub"]

    user = _find_user_by_email(db, email)
    if not user:
        user = User(
            full_name=full_name,
            email=email,
            password_hash=None,  # No password for OAuth users
            role="student",  # Default signup role
            oauth_provider="google",
            oauth_id=oauth_id,
            created_at=datetime.datetime.utcnow(),
            updated_at=datetime.datetime.utcnow(),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not user.oauth_provider:
        user.oauth_provider = "google"
        user.oauth_id = oauth_id
        db.commit()
        db.refresh(user)

    return _token_response(user, *issue_session(db, user, request))
