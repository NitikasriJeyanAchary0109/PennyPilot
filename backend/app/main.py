from contextlib import asynccontextmanager

import uvicorn
from app.config import settings
from app.database import Base, engine, get_db
from app.routers import (
    auth,
    budgets,
    calculations,
    chat,
    coach,
    dream,
    educator,
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
    # Ensure database tables exist
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
origins = [
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:19000",
    "http://127.0.0.1:19000",
    "http://localhost:19006",
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
@app.get("/api/health")
async def healthcheck(db: Session = Depends(get_db)):
    db_status = "healthy"

    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

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
app.include_router(educator.router, prefix="/api")
app.include_router(savings.router, prefix="/api")
app.include_router(budgets.router, prefix="/api")
app.include_router(calculations.router, prefix="/api")
app.include_router(coach.router, prefix="/api")
app.include_router(dream.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(users.router, prefix="/api")

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
