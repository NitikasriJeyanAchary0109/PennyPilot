import datetime

from app.database import Base
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship

# ==========================================================
# USER
# ==========================================================


class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)

    full_name = Column(String, nullable=False)

    email = Column(String, unique=True, index=True, nullable=False)

    password_hash = Column(String, nullable=True)

    phone = Column(String, nullable=True)

    university = Column(String, nullable=True)

    oauth_provider = Column(String, nullable=True)

    oauth_id = Column(String, unique=True, nullable=True)

    role = Column(String, default="student", nullable=False)

    has_completed_onboarding = Column(
        Boolean,
        default=False,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        nullable=False,
    )

    updated_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
    )

    # Relationships

    sessions = relationship(
        "UserSession",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    goals = relationship(
        "Goal",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    savings = relationship(
        "Savings",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    notifications = relationship(
        "Notification",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    chat_history = relationship(
        "ChatHistory",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    health_reports = relationship(
        "FinancialHealth",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    transactions = relationship(
        "Transaction",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    budgets = relationship(
        "Budget",
        back_populates="user",
        cascade="all, delete-orphan",
    )


# ==========================================================
# USER SESSION
# ==========================================================


class UserSession(Base):
    __tablename__ = "user_sessions"

    session_id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey(
            "users.user_id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    jwt_token_id = Column(
        String,
        unique=True,
        nullable=True,
    )

    ip_address = Column(String)

    device = Column(String)

    login_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
    )

    expires_at = Column(DateTime)

    logout_at = Column(DateTime)

    revoked_at = Column(DateTime)

    # Refresh-token rotation: only a SHA-256 hash of the current refresh token is
    # stored. The previous hash is kept so a replayed (stolen) token is detected.
    refresh_token_hash = Column(String, unique=True, nullable=True)

    previous_refresh_token_hash = Column(String, nullable=True)

    refresh_expires_at = Column(DateTime)

    user = relationship(
        "User",
        back_populates="sessions",
    )

    security_events = relationship(
        "SecurityEvent",
        back_populates="session",
        cascade="all, delete-orphan",
    )


# ==========================================================
# SECURITY EVENTS
# ==========================================================


class SecurityEvent(Base):
    __tablename__ = "security_events"

    event_id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    session_id = Column(
        Integer,
        ForeignKey(
            "user_sessions.session_id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    user_id = Column(
        Integer,
        ForeignKey(
            "users.user_id",
            ondelete="CASCADE",
        ),
        nullable=True,
    )

    event_type = Column(String, nullable=False)

    severity = Column(
        String,
        default="low",
    )

    ip_address = Column(String)

    user_agent = Column(String)

    created_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
    )

    session = relationship(
        "UserSession",
        back_populates="security_events",
    )


# ==========================================================
# GOALS
# ==========================================================


class Goal(Base):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )

    title = Column(String, nullable=False)

    target_amount = Column(
        Numeric(precision=12, scale=2),
        nullable=False,
    )

    current_amount = Column(
        Numeric(precision=12, scale=2),
        default=0.00,
        nullable=False,
    )

    target_date = Column(DateTime)

    status = Column(
        String,
        default="active",
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        nullable=False,
    )

    is_deleted = Column(
        Boolean,
        default=False,
        nullable=False,
    )

    user = relationship(
        "User",
        back_populates="goals",
    )


# ==========================================================
# SAVINGS
# ==========================================================


class Savings(Base):
    __tablename__ = "savings"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )

    goal_id = Column(
        Integer,
        ForeignKey("goals.id"),
        nullable=True,
    )

    triggered_by_transaction_id = Column(
        Integer,
        ForeignKey("transactions.id"),
        nullable=True,
    )

    amount = Column(
        Numeric(precision=12, scale=2),
        nullable=False,
    )

    source = Column(
        String,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        nullable=False,
    )

    user = relationship(
        "User",
        back_populates="savings",
    )


# ==========================================================
# NOTIFICATIONS
# ==========================================================


class Notification(Base):
    __tablename__ = "notifications"

    notif_id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id = Column(
        Integer,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )

    type = Column(String)

    title = Column(String, nullable=False)

    message = Column(String, nullable=False)

    status = Column(
        String,
        default="unread",
    )

    read_at = Column(DateTime)

    created_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
    )

    user = relationship(
        "User",
        back_populates="notifications",
    )


# ==========================================================
# CHAT HISTORY
# ==========================================================


class ChatHistory(Base):
    __tablename__ = "chat_history"

    chat_id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id = Column(
        Integer,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )

    role = Column(String)

    question = Column(
        Text,
        nullable=False,
    )

    response = Column(
        Text,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
    )

    user = relationship(
        "User",
        back_populates="chat_history",
    )


# ==========================================================
# FINANCIAL HEALTH
# ==========================================================


class FinancialHealth(Base):
    __tablename__ = "financial_health"

    report_id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )

    health_score = Column(Integer, nullable=False)

    stress_score = Column(Integer, nullable=False)

    ai_summary = Column(Text)

    # "factual": plain statement of the computed score (always available);
    # "ai": the model's narration, which passed the numbers check.
    summary_source = Column(
        String, nullable=False, default="factual", server_default="factual"
    )

    contributing_factors = Column(JSON)

    created_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        nullable=False,
    )

    user = relationship(
        "User",
        back_populates="health_reports",
    )


# ==========================================================
# TRANSACTIONS
# ==========================================================


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )

    amount = Column(
        Numeric(12, 2),
        nullable=False,
    )

    merchant = Column(String, nullable=False)

    category = Column(String, nullable=False)

    type = Column(String, nullable=False)

    description = Column(String)

    # Where the row came from: "manual", "csv_import" or "bank_simulation".
    source = Column(String, nullable=False, default="manual", server_default="manual")

    transaction_date = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        nullable=False,
    )

    round_up_amount = Column(
        Numeric(12, 2),
        default=0.00,
        nullable=False,
    )

    is_round_up_applied = Column(
        Boolean,
        default=False,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        nullable=False,
    )

    is_deleted = Column(
        Boolean,
        default=False,
        nullable=False,
    )

    user = relationship(
        "User",
        back_populates="transactions",
    )

    audit_logs = relationship(
        "AuditLog",
        back_populates="transaction",
        cascade="all, delete-orphan",
    )


# ==========================================================
# BUDGET
# ==========================================================


class Budget(Base):
    __tablename__ = "budgets"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    category = Column(String, nullable=False)

    limit_amount = Column(
        Numeric(12, 2),
        nullable=False,
    )

    period = Column(String, nullable=False)

    start_date = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        nullable=False,
    )

    is_deleted = Column(
        Boolean,
        default=False,
        nullable=False,
    )

    user = relationship(
        "User",
        back_populates="budgets",
    )

    recommendations = relationship(
        "AIRecommendation",
        back_populates="budget",
        cascade="all, delete-orphan",
    )


# ==========================================================
# AI RECOMMENDATIONS
# ==========================================================


class AIRecommendation(Base):
    __tablename__ = "ai_recommendations"

    rec_id = Column(Integer, primary_key=True, index=True)

    budget_id = Column(
        Integer,
        ForeignKey("budgets.id", ondelete="CASCADE"),
        nullable=True,
    )

    user_id = Column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=True,
    )

    rec_type = Column(String, nullable=False)

    content = Column(Text, nullable=False)

    input_context = Column(JSON)

    accepted = Column(
        Integer,
        default=0,
    )

    budget = relationship(
        "Budget",
        back_populates="recommendations",
    )


# ==========================================================
# AUDIT LOGS
# ==========================================================


class AuditLog(Base):
    __tablename__ = "audit_logs"

    log_id = Column(Integer, primary_key=True, index=True)

    trans_id = Column(
        Integer,
        ForeignKey("transactions.id", ondelete="CASCADE"),
        nullable=True,
    )

    user_id = Column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=True,
    )

    action = Column(String, nullable=False)

    entity_type = Column(String)

    entity_id = Column(Integer)

    performed_by = Column(String, nullable=False)

    metadata_json = Column("metadata", JSON)

    timestamp = Column(
        DateTime,
        default=datetime.datetime.utcnow,
    )

    transaction = relationship(
        "Transaction",
        back_populates="audit_logs",
    )
