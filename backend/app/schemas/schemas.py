from datetime import date, datetime
from decimal import Decimal
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# ==========================================
# AUTH SCHEMAS
# ==========================================
class UserBase(BaseModel):
    full_name: str
    email: EmailStr
    phone: Optional[str] = None
    role: str = Field(default="student", description="Role: student")


MIN_PASSWORD_LENGTH = 8


class UserCreate(UserBase):
    password: Optional[str] = None  # Optional for Google OAuth users

    @field_validator("password")
    @classmethod
    def password_long_enough(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) < MIN_PASSWORD_LENGTH:
            raise ValueError(
                f"Password must be at least {MIN_PASSWORD_LENGTH} characters long."
            )
        return v

    @field_validator("full_name")
    @classmethod
    def full_name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Full name is required.")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(UserBase):
    user_id: int
    has_completed_onboarding: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    has_completed_onboarding: bool
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = None  # access-token lifetime in seconds


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20)


class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None


class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None
    user_id: Optional[int] = None


# ==========================================
# USER SESSION & SECURITY SCHEMAS
# ==========================================
class UserSessionResponse(BaseModel):
    session_id: int
    user_id: int
    ip_address: Optional[str]
    device: Optional[str]
    login_at: datetime
    logout_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class SecurityEventResponse(BaseModel):
    event_id: int
    session_id: int
    event_type: str
    severity: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# GOAL SCHEMAS
# ==========================================
class GoalBase(BaseModel):
    title: str
    target_amount: Decimal
    current_amount: Decimal = Decimal("0.00")
    target_date: Optional[datetime] = None


class GoalCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    target_amount: Decimal = Field(max_digits=12, decimal_places=2)
    target_date: Optional[datetime] = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Goal title is required.")
        return v


class GoalUpdate(BaseModel):
    """
    Editable goal fields. The saved balance (current_amount) is deliberately not
    editable here: it only changes through the savings ledger (deposits,
    round-ups, withdrawals) so it can never drift from the recorded history.
    """

    title: Optional[str] = Field(default=None, min_length=1, max_length=100)
    target_amount: Optional[Decimal] = Field(
        default=None, max_digits=12, decimal_places=2
    )
    target_date: Optional[datetime] = None


class GoalResponse(GoalBase):
    id: int
    user_id: int
    status: str
    created_at: datetime
    is_deleted: bool

    model_config = ConfigDict(from_attributes=True)


class GoalListItem(GoalResponse):
    progress_percentage: float


class GoalDetailResponse(GoalResponse):
    progress_percentage: float
    projected_completion_date: Optional[date] = None


class GoalWithdrawRequest(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    reason: str = Field(min_length=1, max_length=100)


class GoalWithdrawResponse(BaseModel):
    success: bool
    withdrawn: Decimal
    remaining: Decimal
    goal_status: str
    message: str


# ==========================================
# SAVINGS SCHEMAS
# ==========================================
SavingsSource = Literal[
    "round_up", "manual", "transfer", "withdrawal", "goal_reallocation"
]


class SavingsBase(BaseModel):
    amount: Decimal
    source: SavingsSource
    goal_id: Optional[int] = None

    @field_validator("source", mode="before")
    @classmethod
    def normalize_source(cls, v: Any) -> Any:
        if v == "roundup":
            return "round_up"
        return v


class SavingsCreate(SavingsBase):
    # Clients may only record deposits; withdrawals / reallocations are created
    # by the goal endpoints.
    amount: Decimal = Field(max_digits=12, decimal_places=2)
    source: Literal["round_up", "manual", "transfer"]


class SavingsUpdate(BaseModel):
    amount: Optional[Decimal] = None
    source: Optional[Literal["round_up", "manual", "transfer"]] = None
    goal_id: Optional[int] = None

    @field_validator("source", mode="before")
    @classmethod
    def normalize_source(cls, v: Any) -> Any:
        if v == "roundup":
            return "round_up"
        return v


class SavingsResponse(SavingsBase):
    id: int
    user_id: int
    created_at: datetime
    triggered_by_transaction_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class SavingsSummaryResponse(BaseModel):
    total_saved: Decimal
    saved_this_month: Decimal
    saved_via_roundup: Decimal
    saved_via_manual: Decimal


class SavingsTrendPoint(BaseModel):
    week_start: date
    week_end: date
    saved: Decimal


class SavingsTrendResponse(BaseModel):
    weeks: List[SavingsTrendPoint]
    total: Decimal


# ==========================================
# NOTIFICATION SCHEMAS
# ==========================================
class NotificationResponse(BaseModel):
    notif_id: int
    user_id: int
    type: Optional[str] = None
    title: str
    message: str
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# CHAT HISTORY SCHEMAS
# ==========================================
class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)


class ChatHistoryResponse(BaseModel):
    chat_id: int
    user_id: int
    question: str
    response: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# FINANCIAL HEALTH SCHEMAS
# ==========================================
class FinancialHealthResponse(BaseModel):
    report_id: int
    user_id: int
    health_score: int
    stress_score: int
    ai_summary: Optional[str]
    summary_source: str = "factual"
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# TRANSACTION SCHEMAS
# ==========================================
class TransactionBase(BaseModel):
    amount: Decimal
    category: str
    merchant: str
    type: str = "debit"  # credit/debit
    transaction_date: Optional[datetime] = None
    description: Optional[str] = None


class TransactionCreate(TransactionBase):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    category: str = Field(min_length=1, max_length=50)
    merchant: str = Field(min_length=1, max_length=100)
    type: Literal["debit", "credit"] = "debit"
    # Baseline / bookkeeping entries (e.g. onboarding income) should not generate
    # a round-up.
    apply_roundup: bool = True

    @field_validator("category", "merchant")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Value must not be blank.")
        return v


class TransactionUpdate(BaseModel):
    merchant: Optional[str] = Field(default=None, min_length=1, max_length=100)
    category: Optional[str] = Field(default=None, min_length=1, max_length=50)
    amount: Optional[Decimal] = Field(
        default=None, gt=0, max_digits=12, decimal_places=2
    )


class TransactionResponse(TransactionBase):
    id: int
    user_id: int
    source: str = "manual"
    transaction_date: datetime
    round_up_amount: Decimal
    is_round_up_applied: bool
    created_at: datetime
    is_deleted: bool

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# BUDGET SCHEMAS
# ==========================================
class BudgetBase(BaseModel):
    category: str = Field(min_length=1, max_length=50)
    limit_amount: Decimal
    period: Literal["weekly", "monthly"] = "monthly"
    start_date: Optional[datetime] = None


class BudgetCreate(BudgetBase):
    @field_validator("category")
    @classmethod
    def category_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Category must not be blank.")
        return v


class BudgetUpdate(BaseModel):
    limit_amount: Optional[Decimal] = None
    period: Optional[Literal["weekly", "monthly"]] = None


class BudgetResponse(BudgetBase):
    id: int
    user_id: int
    created_at: datetime
    is_deleted: bool
    spent_amount: Decimal = Decimal("0.00")
    remaining_amount: Decimal = Decimal("0.00")
    is_over_limit: bool = False

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# AI RECOMMENDATION SCHEMAS
# ==========================================
class AIRecommendationResponse(BaseModel):
    rec_id: int
    budget_id: int
    rec_type: str
    content: str

    model_config = ConfigDict(from_attributes=True)


class NegotiateRequest(BaseModel):
    item_name: str
    item_price: Decimal
    category: str


class ForecastRequest(BaseModel):
    goal_id: int
    monthly_contribution: Decimal


class StressRequest(BaseModel):
    timeframe_days: int = 30


# ==========================================
# AUDIT LOG SCHEMAS
# ==========================================
class AuditLogResponse(BaseModel):
    log_id: int
    trans_id: int
    action: str
    performed_by: str
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)
