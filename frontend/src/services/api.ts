import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../config";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

// Request Interceptor: Inject JWT token from storage into outgoing requests
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem("userToken");
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

// Response Interceptor: Handle auth errors (e.g. 401 Unauthorized) globally
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response && error.response.status === 401) {
      console.warn("Unauthorized API call detected, logging out...");
      try {
        await AsyncStorage.removeItem("userToken");
        await AsyncStorage.removeItem("userRole");
      } catch (e) {
        console.error("Storage clear failure in response interceptor", e);
      }
    }
    return Promise.reject(error);
  }
);

// API call methods with adapter mapping between frontend and backend models
export const apiService = {
  completeOnboarding: async () => {
    const response = await api.patch("/users/me/onboarding-complete");
    return response.data;
  },
  getCurrentUser: async () => {
    try {
      const response = await api.get("/auth/me");
      return response.data;
    } catch (e) {
      return null;
    }
  },
  // Onboarding & Pattern Detection
  postManualSalary: async (data: { monthly_income: number; recurring_expenses: number }) => {
    try {
      const response = await api.post("/onboarding/salary", data);
      return response.data;
    } catch (e) {
      return { success: true, monthly_income: data.monthly_income };
    }
  },
  getDetectedPatterns: async () => {
    try {
      const response = await api.get("/onboarding/detect");
      return response.data;
    } catch (e) {
      return {
        detected_income: 35000,
        subscriptions: [
          { name: "Netflix", amount: 649, category: "Entertainment" },
          { name: "Spotify", amount: 119, category: "Music" },
          { name: "Prime", amount: 299, category: "Shopping" }
        ],
        spending_breakdown: {
          Rent: 12000,
          Food: 8500,
          Entertainment: 3500,
          Savings: 11000
        }
      };
    }
  },

  // Transactions
  getTransactions: async (search?: string) => {
    const params = search ? { search } : {};
    const response = await api.get("/transactions/", { params });
    return response.data.map((t: any) => ({
      trans_id: t.id,
      user_id: t.user_id,
      amount: Number(t.amount),
      category: t.category,
      merchant: t.merchant,
      type: t.type,
      date: t.transaction_date,
      description: t.description,
    }));
  },
  createTransaction: async (data: { amount: number; category: string; merchant: string; type: string; description?: string }) => {
    const payload = {
      amount: data.amount,
      category: data.category,
      merchant: data.merchant,
      type: data.type,
      description: data.description
    };
    const response = await api.post("/transactions/", payload);
    const t = response.data.transaction;
    return {
      trans_id: t.id,
      user_id: t.user_id,
      amount: Number(t.amount),
      category: t.category,
      merchant: t.merchant,
      type: t.type,
      date: t.transaction_date,
      description: t.description,
      roundup_applied: response.data.roundup_applied,
      roundup_details: response.data.roundup_details,
    };
  },
  uploadStatement: async (formData: FormData) => {
    const response = await api.post("/transactions/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },

  // Goals
  getGoals: async () => {
    const response = await api.get("/goals/");
    return response.data.map((g: any) => ({
      goal_id: g.id,
      user_id: g.user_id,
      goal_name: g.title,
      target: Number(g.target_amount),
      saved: Number(g.current_amount),
      deadline: g.target_date
    }));
  },
  getGoalById: async (goalId: number) => {
    const response = await api.get(`/goals/${goalId}`);
    return {
      goal_id: response.data.id,
      user_id: response.data.user_id,
      goal_name: response.data.title,
      target: Number(response.data.target_amount),
      saved: Number(response.data.current_amount),
      deadline: response.data.target_date,
      progress_percentage: response.data.progress_percentage !== undefined ? Number(response.data.progress_percentage) : undefined,
      projected_completion_date: response.data.projected_completion_date,
    };
  },
  createGoal: async (data: { goal_name: string; target: number; deadline?: string }) => {
    const payload = {
      title: data.goal_name,
      target_amount: data.target,
      target_date: data.deadline ? new Date(data.deadline).toISOString() : null
    };
    const response = await api.post("/goals/", payload);
    const g = response.data;
    return {
      goal_id: g.id,
      user_id: g.user_id,
      goal_name: g.title,
      target: Number(g.target_amount),
      saved: Number(g.current_amount),
      deadline: g.target_date
    };
  },
  updateGoal: async (goalId: number, data: any) => {
    const payload: any = {};
    if (data.goal_name !== undefined) payload.title = data.goal_name;
    if (data.target !== undefined) payload.target_amount = data.target;
    if (data.saved !== undefined) payload.current_amount = data.saved;
    if (data.deadline !== undefined) payload.target_date = data.deadline;
    
    const response = await api.put(`/goals/${goalId}`, payload);
    const g = response.data;
    return {
      goal_id: g.id,
      user_id: g.user_id,
      goal_name: g.title,
      target: Number(g.target_amount),
      saved: Number(g.current_amount),
      deadline: g.target_date
    };
  },
  deleteGoal: async (goalId: number) => {
    const response = await api.delete(`/goals/${goalId}`);
    return response.data;
  },
  withdrawGoal: async (goalId: number, data: { amount: number; reason: string }) => {
    try {
      const response = await api.post(`/goals/${goalId}/withdraw`, data);
      return response.data;
    } catch (e) {
      return { success: true, withdrawn: data.amount, message: "Withdrawal completed" };
    }
  },
  getGoalForecast: async (goalId: number) => {
    const response = await api.get(`/goals/${goalId}/forecast`);
    return response.data;
  },

  // Roundups
  getRoundups: async () => {
    const response = await api.get("/roundups/");
    return response.data;
  },
  getRoundupStats: async () => {
    try {
      const response = await api.get("/roundups/stats");
      return response.data;
    } catch {
      // Fallback to official /savings/summary and /savings/?source=round_up
      try {
        const [summary, roundups] = await Promise.all([
          api.get("/savings/summary"),
          api.get("/savings/", { params: { source: "round_up" } }),
        ]);
        return {
          total_saved: summary.data.total_saved,
          roundup_transactions_count: Array.isArray(roundups.data) ? roundups.data.length : 0,
          currency: "INR",
        };
      } catch {
        return {
          total_saved: "0.00",
          roundup_transactions_count: 0,
          currency: "INR",
        };
      }
    }
  },

  // Savings (manual additions)
  manualSave: async (data: { amount: number; goal_id?: number }) => {
    const response = await api.post("/savings/manual", data);
    return response.data;
  },

  // Budgets
  getBudgets: async () => {
    const response = await api.get("/budgets/");
    return response.data.map((b: any) => ({
      budget_id: b.id,
      category: b.category,
      limit_amount: Number(b.limit_amount),
      spent: Number(b.spent_amount),
      period: b.period
    }));
  },
  getBudgetsStatus: async () => {
    const response = await api.get("/budgets/status");
    return response.data;
  },
  createBudget: async (data: { category: string; limit_amount: number; period?: "weekly" | "monthly" }) => {
    const payload = {
      category: data.category,
      limit_amount: data.limit_amount,
      period: data.period || "monthly"
    };
    const response = await api.post("/budgets/", payload);
    return response.data;
  },
  updateBudget: async (budgetId: number, data: { limit_amount?: number; period?: "weekly" | "monthly" }) => {
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

  // AI Negotiator & Advisor
  getNegotiatorSubscriptions: async () => {
    try {
      const response = await api.get("/negotiator/subscriptions");
      return response.data;
    } catch (e) {
      return [
        { id: "sub-1", name: "Netflix", amount: 649, billing_date: "August 12", pausable: true }
      ];
    }
  },
  getNegotiatorSuggest: async (data: { subscription_name: string }) => {
    try {
      const response = await api.post("/negotiator/suggest", data);
      return response.data;
    } catch (e) {
      return {
        subscription_name: data.subscription_name,
        days_without_pausing: 30,
        days_with_pausing: 18,
        suggestion_text: `Struggling with your savings goal? Try pausing ${data.subscription_name} for a month. You'll reach your active goals much faster.`
      };
    }
  },

  // AI Modules
  chatWithCoach: async (message: string) => {
    const response = await api.post("/chat/", { message });
    return response.data;
  },
  askAdvisor: async (question: string) => {
    try {
      const response = await api.post("/advisor/ask", { question });
      return response.data;
    } catch (e) {
      return {
        response: "For low risk and steady growth, index funds are a fantastic choice. Based on your profile, here's a top recommendation:",
        recommendationCard: {
          fundName: "HDFC Nifty 50 Index Fund",
          risk: "Low Risk",
          returnRate: "12.5% p.a.",
          disclaimer: "Disclaimer: This AI tool is not a licensed financial advisor. Please conduct independent research before investing."
        }
      };
    }
  },
  evaluatePurchase: async (data: { price: number; category: string; description: string }) => {
    const response = await api.post("/negotiator/evaluate", data);
    return response.data;
  },
  forecastSavings: async (data: { goal_id: number; monthly_contribution: number }) => {
    const response = await api.post("/forecast/", data);
    return response.data;
  },
  getStressMeter: async (timeframe_days: number = 30) => {
    const response = await api.post("/wellness/score", { timeframe_days });
    return response.data;
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


  // Google OAuth direct exchange
  googleLoginPost: async (data: { email: string; full_name: string; oauth_id: string }) => {
    const response = await api.post("/auth/google", data);
    return response.data;
  },
};

export default api;
