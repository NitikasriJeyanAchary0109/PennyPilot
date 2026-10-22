import logging
from contextlib import asynccontextmanager

import uvicorn
from app.config import assert_production_ready, settings
from app.database import Base, engine, get_db
from app.routers import (
    advisor,
    analysis,
    auth,
    bank,
    budgets,
    calculations,
    chat,
    coach,
    dream,
    forecast,
    goals,
    negotiator,
    notifications,
    roundups,
    savings,
    transactions,
    users,
    wellness,
)
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware


# ==========================
# Startup / Shutdown
# ==========================
@asynccontextmanager
async def lifespan(app: FastAPI):
    assert_production_ready()
    # Production schemas are managed by Alembic; create_all is a dev/test
    # convenience only (it would bypass migrations).
    if settings.ENVIRONMENT.lower() != "production":
        Base.metadata.create_all(bind=engine)

    yield


# ==========================
# FastAPI App
# ==========================
app = FastAPI(
    title="Penny Pilot API",
    description="Backend API services for micro-savings and automated financial advice.",
    version="2.0.0",
    lifespan=lifespan,
)

# ==========================
# Session Middleware
# ==========================
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.JWT_SECRET,
)

# ==========================
# CORS
# ==========================
# Explicit origins come from ALLOWED_ORIGINS (comma-separated). "*" is not valid
# together with credentials, so it is ignored; local dev origins are always
# allowed through the regex below.
origins = [
    o.strip()
    for o in settings.ALLOWED_ORIGINS.split(",")
    if o.strip() and o.strip() != "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================
# Health Check
# ==========================
@app.get("/health")
@app.get("/api/health")
async def healthcheck(db: Session = Depends(get_db)):
    db_status = "healthy"

    try:
        db.execute(text("SELECT 1"))
    except Exception:
        logging.getLogger("pennypilot.health").exception("database health check failed")
        db_status = "unhealthy"

    return {
        "status": "online",
        "database": db_status,
        "environment": settings.ENVIRONMENT,
        "ollama": {
            "endpoint": settings.OLLAMA_URL,
            "model": settings.OLLAMA_MODEL,
        },
    }


# ==========================
# Routers
# ==========================
app.include_router(auth.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(goals.router, prefix="/api")
app.include_router(roundups.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(negotiator.router, prefix="/api")
app.include_router(forecast.router, prefix="/api")
app.include_router(wellness.router, prefix="/api")
app.include_router(savings.router, prefix="/api")
app.include_router(budgets.router, prefix="/api")
app.include_router(calculations.router, prefix="/api")
app.include_router(coach.router, prefix="/api")
app.include_router(dream.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(advisor.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(bank.router, prefix="/api")

# ==========================
# Run Server
# ==========================
if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )
