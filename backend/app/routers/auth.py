import datetime

from app.config import settings
from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.models import SecurityEvent, User, UserSession
from app.schemas.schemas import Token, UserCreate, UserLogin, UserResponse
from app.utils.security import create_access_token, get_password_hash, verify_password
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
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


def log_login_session(db: Session, user: User, request: Request) -> UserSession:
    """Logs the session and security events upon successful login."""
    client_host = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")

    # 1. Create session record
    session = UserSession(
        user_id=user.user_id,
        ip_address=client_host,
        device=user_agent,
        login_at=datetime.datetime.utcnow(),
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # 2. Log security event for successful login
    sec_event = SecurityEvent(
        session_id=session.session_id,
        event_type="login",
        severity="low",
        created_at=datetime.datetime.utcnow(),
    )
    db.add(sec_event)
    db.commit()

    return session


@router.post(
    "/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED
)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Registers a new student user (email/password)."""
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists.",
        )

    # Hash password and create user with student role
    hashed_pwd = get_password_hash(user_data.password) if user_data.password else None
    new_user = User(
        full_name=user_data.full_name,
        email=user_data.email,
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


@router.post("/login", response_model=Token)
def login_for_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """OAuth2 compatible token login, returns access_token."""
    user = db.query(User).filter(User.email == form_data.username).first()
    if (
        not user
        or not user.password_hash
        or not verify_password(form_data.password, user.password_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Log session and event
    log_login_session(db, user, request)

    access_token = create_access_token(
        data={"sub": user.email, "role": user.role, "user_id": user.user_id}
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role,
        "has_completed_onboarding": user.has_completed_onboarding,
    }


@router.post("/login/json", response_model=Token)
def login_json(request: Request, user_data: UserLogin, db: Session = Depends(get_db)):
    """JSON-body login endpoint for easy API clients (like mobile axios)."""
    user = db.query(User).filter(User.email == user_data.email).first()
    if (
        not user
        or not user.password_hash
        or not verify_password(user_data.password, user.password_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    # Log session and event
    log_login_session(db, user, request)

    access_token = create_access_token(
        data={"sub": user.email, "role": user.role, "user_id": user.user_id}
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role,
        "has_completed_onboarding": user.has_completed_onboarding,
    }


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

    # Check if user already exists
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # Create a new student user
        user = User(
            full_name=full_name,
            email=email,
            password_hash=None,  # No password for OAuth users
            role="student",  # Default signup role
            created_at=datetime.datetime.utcnow(),
            updated_at=datetime.datetime.utcnow(),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # Log session and event
    log_login_session(db, user, request)

    # Generate access token
    access_token = create_access_token(
        data={"sub": user.email, "role": user.role, "user_id": user.user_id}
    )

    # HTML Redirection payload to automatically route back into the mobile app's deep linking
    html_content = f"""
    <html>
      <head>
        <title>Authentication Successful</title>
        <script>
          const token = "{access_token}";
          const role = "{user.role}";
          // Deep link redirect
          const onboardingComplete = "{str(user.has_completed_onboarding).lower()}";
          const url = "pennypilot://oauth?token=" + token + "&role=" + role + "&has_completed_onboarding=" + onboardingComplete;
          window.location.href = url;
        </script>
      </head>
      <body style="background-color: #0F172A; color: #F8FAFC; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
        <div style="text-align: center; padding: 30px; border: 1px solid #334155; border-radius: 20px; background-color: #1E293B; max-width: 400px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);">
          <h2 style="color: #10B981; margin-bottom: 10px;">Login Successful!</h2>
          <p style="font-size: 14px; margin-bottom: 20px;">We've authenticated your Google account. Redirecting you back to Penny Pilot...</p>
          <p style="font-size: 11px; color: #94A3B8;">If you are not redirected automatically, <a href="pennypilot://oauth?token={access_token}&role={user.role}&has_completed_onboarding={str(user.has_completed_onboarding).lower()}" style="color: #6366F1; font-weight: bold; text-decoration: none;">click here to resume</a>.</p>
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
    email: str
    full_name: str
    oauth_id: str


@router.post("/google", response_model=Token)
def google_auth_post(
    request: Request, auth_data: GoogleAuthRequest, db: Session = Depends(get_db)
):
    """Exchanges Google OAuth profile data for a backend JWT token."""
    email = auth_data.email
    full_name = auth_data.full_name
    oauth_id = auth_data.oauth_id

    # Check if user already exists
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # Create a new student user
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
    else:
        # Update oauth details if not set
        if not user.oauth_provider:
            user.oauth_provider = "google"
            user.oauth_id = oauth_id
            db.commit()
            db.refresh(user)

    # Log session and event
    log_login_session(db, user, request)

    # Generate access token
    access_token = create_access_token(
        data={"sub": user.email, "role": user.role, "user_id": user.user_id}
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role,
        "has_completed_onboarding": user.has_completed_onboarding,
    }
