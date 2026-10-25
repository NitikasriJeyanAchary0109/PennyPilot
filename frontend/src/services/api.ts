import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../config";
import { tokenStorage } from "./tokenStorage";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

// LLM-backed endpoints can legitimately take a while (local Ollama cold start).
const AI_TIMEOUT_MS = 65000;

// ---------------------------------------------------------------------------
// Session handling
// ---------------------------------------------------------------------------
let unauthorizedHandler: (() => void) | null = null;

/** AuthContext registers this so a 401 anywhere signs the user out of the UI. */
export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  unauthorizedHandler = handler;
};

/** Turns an axios error into a message that is safe and useful to show a user. */
export const getErrorMessage = (
  error: any,
  fallback = "Something went wrong. Please try again."
): string => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    // FastAPI validation errors: [{ msg: "Value error, ..." }]
    return detail
      .map((d: any) => String(d?.msg ?? "").replace(/^Value error,\s*/i, ""))
      .filter(Boolean)
      .join(" ");
  }
  if (error?.code === "ECONNABORTED") {
    return "The request timed out. Please try again.";
  }
  if (error?.message === "Network Error") {
    return "Can't reach the server. Check your connection and try again.";
  }
  return fallback;
};

// Request Interceptor: Inject JWT token from storage into outgoing requests
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await tokenStorage.get();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      console.error("Failed to fetch token for API interceptor", e);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor. A 401 means the short-lived access token expired (or the
// session was revoked): try ONE silent refresh with the stored refresh token and
// replay the request; only if that fails is the user signed out.
const AUTH_PATHS = ["/auth/login", "/auth/refresh", "/auth/logout"];
let refreshInFlight: Promise<string | null> | null = null;

/** Swap the refresh token for a new token pair. Concurrent callers share one call. */
export const refreshSession = (): Promise<string | null> => {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const refreshToken = await tokenStorage.getRefresh();
        if (!refreshToken) return null;
        // A bare axios call: this request must not go through the interceptors.
        const response = await axios.post(
          `${API_URL}/auth/refresh`,
          { refresh_token: refreshToken },
          { timeout: 15000 }
        );
        await tokenStorage.setTokens(
          response.data.access_token,
          response.data.refresh_token
        );
        return response.data.access_token as string;
      } catch (e) {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
};

const endSession = async () => {
  try {
    await tokenStorage.clear();
    await AsyncStorage.multiRemove(["userRole", "hasCompletedOnboarding"]);
  } catch (e) {
    console.error("Storage clear failure in response interceptor", e);
  }
  unauthorizedHandler?.();
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const isAuthCall = AUTH_PATHS.some((p) => original?.url?.includes(p));

    if (error.response?.status === 401 && original && !isAuthCall && !original._retried) {
      original._retried = true;
      const newAccessToken = await refreshSession();
      if (newAccessToken) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(original);
      }
      console.warn("Session could not be renewed, logging out...");
      await endSession();
    }
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// Adapters between backend models and the shapes the screens use.
// Every function below returns real backend data or throws — there are no
// substitute / simulated results.
// ---------------------------------------------------------------------------
const mapGoal = (g: any) => ({
  goal_id: g.id,
  user_id: g.user_id,
  goal_name: g.title,
  target: Number(g.target_amount),
  saved: Number(g.current_amount),
  deadline: g.target_date,
  status: g.status,
  progress_percentage:
    g.progress_percentage !== undefined ? Number(g.progress_percentage) : undefined,
  projected_completion_date: g.projected_completion_date ?? null,
});

const mapTransaction = (t: any) => ({
  trans_id: t.id,
  user_id: t.user_id,
  amount: Number(t.amount),
  category: t.category,
  merchant: t.merchant,
  type: t.type,
  date: t.transaction_date,
  description: t.description,
  round_up_amount: Number(t.round_up_amount ?? 0),
  is_round_up_applied: Boolean(t.is_round_up_applied),
  source: (t.source ?? "manual") as string,
});

export interface WellnessReport {
  report_id: number;
  health_score: number;
  stress_score: number;
  ai_summary: string | null;
  /** "factual" = plain statement of the score; "ai" = model narration. */
  summary_source: "factual" | "ai";
  created_at: string;
}

export interface SpendingAnalysis {
  has_data: boolean;
  period_start?: string | null;
  period_end?: string | null;
  months_covered: number;
  transaction_count: number;
  total_income: string | number;
  total_spend: string | number;
  average_monthly_income: string | number;
  average_monthly_spend: string | number;
  average_monthly_net: string | number;
  spend_to_income_percent?: string | number | null;
  top_categories: {
    category: string;
    total: string | number;
    monthly_average: string | number;
    share_percent: string | number;
    suggested_budget: string | number;
  }[];
  recurring_merchants: {
    merchant: string;
    category: string;
    typical_amount: string | number;
    months_seen: number;
  }[];
  weekend_spend_percent: string | number;
  largest_purchase?: {
    merchant: string;
    category: string;
    amount: string | number;
    date: string;
  } | null;
  estimated_monthly_roundup: string | number;
}

export const apiService = {
  // Auth / profile
  completeOnboarding: async () => {
    const response = await api.patch("/users/me/onboarding-complete");
    return response.data;
  },
  // Ends the whole login session on the server (access AND refresh token). The
  // refresh token is sent too so this works even if the access token expired.
  logout: async () => {
    const refreshToken = await tokenStorage.getRefresh();
    await api.post("/auth/logout", { refresh_token: refreshToken });
  },
  logoutEverywhere: async () => {
    await api.post("/auth/logout-all");
  },
  getCurrentUser: async () => {
    const response = await api.get("/auth/me");
    return response.data;
  },

  // Transactions
  getTransactions: async (params?: {
    search?: string;
    limit?: number;
    sinceDays?: number;
    hasRoundup?: boolean;
  }) => {
    const query: Record<string, any> = {};
    if (params?.search) query.search = params.search;
    if (params?.limit) query.limit = params.limit;
    if (params?.hasRoundup) query.has_roundup = true;
    if (params?.sinceDays) {
      query.start_date = new Date(
        Date.now() - params.sinceDays * 24 * 60 * 60 * 1000
      ).toISOString();
    }
    const response = await api.get("/transactions/", { params: query });
    return response.data.map(mapTransaction);
  },
  createTransaction: async (data: {
    amount: number;
    category: string;
    merchant: string;
    type: "debit" | "credit";
    description?: string;
    applyRoundup?: boolean;
  }) => {
    const response = await api.post(
      "/transactions/",
      {
        amount: data.amount,
        category: data.category,
        merchant: data.merchant,
        type: data.type,
        description: data.description,
        apply_roundup: data.applyRoundup ?? true,
      },
      { timeout: AI_TIMEOUT_MS }
    );
    return {
      ...mapTransaction(response.data.transaction),
      roundup_applied: response.data.roundup_applied,
      roundup_details: response.data.roundup_details,
    };
  },
  uploadStatement: async (formData: FormData) => {
    const response = await api.post("/transactions/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      timeout: 120000,
    });
    return response.data as {
      success: boolean;
      message: string;
      imported_count: number;
      roundups_triggered: number;
      total_roundup_saved: string | number;
      failed_count: number;
      duplicates_skipped: number;
      errors: { row: number; column: string; error: string }[];
    };
  },

  // Goals
  getGoals: async () => {
    const response = await api.get("/goals/");
    return response.data.map(mapGoal);
  },
  getGoalById: async (goalId: number) => {
    const response = await api.get(`/goals/${goalId}`);
    return mapGoal(response.data);
  },
  createGoal: async (data: { goal_name: string; target: number; deadline?: string }) => {
    const response = await api.post("/goals/", {
      title: data.goal_name,
      target_amount: data.target,
      target_date: data.deadline ? new Date(data.deadline).toISOString() : null,
    });
    return mapGoal(response.data);
  },
  updateGoal: async (
    goalId: number,
    data: { goal_name?: string; target?: number; deadline?: string }
  ) => {
    const payload: any = {};
    if (data.goal_name !== undefined) payload.title = data.goal_name;
    if (data.target !== undefined) payload.target_amount = data.target;
    if (data.deadline !== undefined) payload.target_date = data.deadline;
    const response = await api.put(`/goals/${goalId}`, payload);
    return mapGoal(response.data);
  },
  deleteGoal: async (goalId: number) => {
    const response = await api.delete(`/goals/${goalId}`);
    return response.data;
  },
  withdrawGoal: async (goalId: number, data: { amount: number; reason: string }) => {
    const response = await api.post(`/goals/${goalId}/withdraw`, data);
    return response.data as {
      success: boolean;
      withdrawn: string | number;
      remaining: string | number;
      goal_status: string;
      message: string;
    };
  },
  getGoalForecast: async (goalId: number) => {
    const response = await api.get(`/goals/${goalId}/forecast`, {
      timeout: AI_TIMEOUT_MS,
    });
    return response.data;
  },

  // Bank statement analysis & sandbox
  getSpendingAnalysis: async (months = 12) => {
    const response = await api.get("/analysis/spending", { params: { months } });
    return response.data as SpendingAnalysis;
  },
  simulateBankTransaction: async () => {
    const response = await api.post("/bank/simulate", undefined, {
      timeout: AI_TIMEOUT_MS,
    });
    return {
      ...mapTransaction(response.data.transaction),
      roundup_applied: response.data.roundup_applied as boolean,
      roundup_details: response.data.roundup_details,
      based_on_purchases: response.data.based_on_purchases as number,
    };
  },

  // Roundups & savings
  getRoundups: async () => {
    const response = await api.get("/roundups/");
    return response.data;
  },
  getRoundupStats: async (sinceDays?: number) => {
    const response = await api.get("/roundups/stats", {
      params: sinceDays ? { since_days: sinceDays } : undefined,
    });
    return response.data as {
      total_saved: string | number;
      roundup_transactions_count: number;
      currency: string;
    };
  },
  manualSave: async (data: { amount: number; goal_id?: number }) => {
    const response = await api.post("/savings/manual", data);
    return response.data;
  },
  getSavingsTrend: async (weeks = 4) => {
    const response = await api.get("/savings/trend", { params: { weeks } });
    return response.data as {
      weeks: { week_start: string; week_end: string; saved: string | number }[];
      total: string | number;
    };
  },

  // Budgets
  getBudgets: async () => {
    const response = await api.get("/budgets/");
    return response.data.map((b: any) => ({
      budget_id: b.id,
      category: b.category,
      limit_amount: Number(b.limit_amount),
      spent: Number(b.spent_amount),
      period: b.period,
    }));
  },
  getBudgetsStatus: async () => {
    const response = await api.get("/budgets/status");
    return response.data;
  },
  createBudget: async (data: {
    category: string;
    limit_amount: number;
    period?: "weekly" | "monthly";
  }) => {
    const response = await api.post("/budgets/", {
      category: data.category,
      limit_amount: data.limit_amount,
      period: data.period || "monthly",
    });
    return response.data;
  },
  updateBudget: async (
    budgetId: number,
    data: { limit_amount?: number; period?: "weekly" | "monthly" }
  ) => {
    const payload: any = {};
    if (data.limit_amount !== undefined) payload.limit_amount = data.limit_amount;
    if (data.period !== undefined) payload.period = data.period;
    const response = await api.put(`/budgets/${budgetId}`, payload);
    return response.data;
  },
  deleteBudget: async (budgetId: number) => {
    const response = await api.delete(`/budgets/${budgetId}`);
    return response.data;
  },

  // Subscriptions & purchase evaluation
  getNegotiatorSubscriptions: async () => {
    const response = await api.get("/negotiator/subscriptions");
    return response.data;
  },
  syncSubscriptions: async () => {
    const response = await api.post("/negotiator/subscriptions/sync");
    return response.data;
  },
  evaluatePurchase: async (data: {
    price: number;
    category: string;
    description: string;
    kind?: "purchase" | "pause";
  }) => {
    const response = await api.post("/negotiator/evaluate", data, {
      timeout: AI_TIMEOUT_MS,
    });
    return response.data as {
      advice: string;
      budget_status: "safe" | "warning" | "exceeded" | "no_budget";
      goal_impact: string;
    };
  },

  // AI chat
  chatWithCoach: async (message: string) => {
    const response = await api.post("/chat/", { message }, { timeout: AI_TIMEOUT_MS });
    return response.data;
  },
  getCoachHistory: async (pageSize = 20) => {
    const response = await api.get("/coach/history", {
      params: { page: 1, page_size: pageSize },
    });
    return response.data.items as {
      chat_id: number;
      question: string;
      response: string;
      created_at: string;
    }[];
  },
  askAdvisor: async (question: string) => {
    const response = await api.post(
      "/advisor/ask",
      { question },
      { timeout: AI_TIMEOUT_MS }
    );
    return response.data as { response: string; disclaimer: string };
  },
  forecastSavings: async (data: { goal_id: number; monthly_contribution: number }) => {
    const response = await api.post("/forecast/", data, { timeout: AI_TIMEOUT_MS });
    return response.data;
  },
  // The score and a plain summary come back immediately...
  getStressMeter: async (timeframe_days: number = 30) => {
    const response = await api.post("/wellness/score", { timeframe_days });
    return response.data as WellnessReport;
  },
  // ...the AI's friendlier narration is a separate, slower call.
  narrateWellness: async (reportId: number, timeframe_days: number = 30) => {
    const response = await api.post(
      `/wellness/narrate/${reportId}`,
      undefined,
      { params: { timeframe_days }, timeout: AI_TIMEOUT_MS }
    );
    return response.data as WellnessReport;
  },

  // Notifications
  getNotifications: async () => {
    const response = await api.get("/notifications/");
    return response.data;
  },
  markNotificationRead: async (notifId: number) => {
    const response = await api.patch(`/notifications/${notifId}/read`);
    return response.data;
  },
  markAllNotificationsRead: async () => {
    const response = await api.post("/notifications/read-all");
    return response.data;
  },
};

export default api;
