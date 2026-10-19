from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ==========================================
# AUTH SCHEMAS
# ==========================================
class UserBase(BaseModel):
    full_name: str
    email: EmailStr
    phone: Optional[str] = None
    role: str = Field(default="student", description="Role: student or educator")


class UserCreate(UserBase):
    password: Optional[str] = None  # Optional for Google OAuth users


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
    title: str
    target_amount: Decimal
    target_date: Optional[datetime] = None


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    target_amount: Optional[Decimal] = None
    current_amount: Optional[Decimal] = None
    target_date: Optional[datetime] = None


class GoalResponse(GoalBase):
    id: int
    user_id: int
    status: str
    created_at: datetime
    is_deleted: bool

    model_config = ConfigDict(from_attributes=True)


class GoalDetailResponse(GoalResponse):
    progress_percentage: float
    projected_completion_date: Optional[date] = None


# ==========================================
# SAVINGS SCHEMAS
# ==========================================
class SavingsBase(BaseModel):
    amount: Decimal
    source: Literal["round_up", "manual", "transfer"]
    goal_id: Optional[int] = None


class SavingsCreate(SavingsBase):
    pass


class SavingsUpdate(BaseModel):
    amount: Optional[Decimal] = None
    source: Optional[Literal["round_up", "manual", "transfer"]] = None
    goal_id: Optional[int] = None


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


# ==========================================
# NOTIFICATION SCHEMAS
# ==========================================
class NotificationResponse(BaseModel):
    notif_id: int
    user_id: int
    title: str
    message: str
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# CHAT HISTORY SCHEMAS
# ==========================================
class ChatRequest(BaseModel):
    message: str


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
    pass


class TransactionUpdate(BaseModel):
    merchant: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[Decimal] = None


class TransactionResponse(TransactionBase):
    id: int
    user_id: int
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
    category: str
    limit_amount: Decimal
    period: Literal["weekly", "monthly"] = "monthly"
    start_date: Optional[datetime] = None


class BudgetCreate(BudgetBase):
    pass


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


# ==========================================
# EDUCATOR/ANALYTICS SCHEMAS
# ==========================================
class EducatorAnalyticsResponse(BaseModel):
    total_students: int
    total_savings: Decimal
    average_savings_per_student: Decimal
    total_transactions_processed: int
    recent_insights: List[ChatHistoryResponse]
