export interface User {
  user_id: number;
  full_name: string;
  email: string;
  phone?: string;
  role: "student";
  has_completed_onboarding: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserSession {
  session_id: number;
  user_id: number;
  ip_address?: string;
  device?: string;
  login_at: string;
  logout_at?: string;
}

export interface SecurityEvent {
  event_id: number;
  session_id: number;
  event_type: string;
  severity: string;
  created_at: string;
}

export interface Goal {
  goal_id: number;
  user_id: number;
  goal_name: string;
  target: number;
  saved: number;
  deadline?: string;
  status?: string;
  progress_percentage?: number;
  projected_completion_date?: string | null;
}

export interface Savings {
  save_id: number;
  user_id: number;
  amount: number;
  source: string;
  date: string;
}

export interface Notification {
  notif_id: number;
  user_id: number;
  type?: string | null;
  title: string;
  message: string;
  status: "unread" | "read";
  created_at: string;
}

export interface ChatHistory {
  chat_id: number;
  user_id: number;
  question: string;
  response: string;
  created_at: string;
}

export interface FinancialHealth {
  report_id: number;
  user_id: number;
  health_score: number;
  stress_score: number;
  ai_summary?: string;
  created_at: string;
}

export interface Transaction {
  trans_id: number;
  user_id: number;
  amount: number;
  category: string;
  merchant: string;
  type: string;  // credit or debit
  date: string;
  description?: string;
  round_up_amount?: number;
  is_round_up_applied?: boolean;
}

export interface Budget {
  budget_id: number;
  trans_id: number;
  report_id: number;
  category: string;
  limit_amount: number;
  spent: number;
  period: string;
}

export interface AIRecommendation {
  rec_id: number;
  budget_id: number;
  rec_type: string;
  content: string;
}

export interface AuditLog {
  log_id: number;
  trans_id: number;
  action: string;
  performed_by: string;
  timestamp: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  role: "student";
  has_completed_onboarding: boolean;
}

export interface AIInsight {
  insight_id?: number;
  chat_id?: number;
  title?: string;
  question?: string;
  response?: string;
  category?: string;
  recommendation?: string;
  summary?: string;
  type?: string;
  created_at?: string;
}
