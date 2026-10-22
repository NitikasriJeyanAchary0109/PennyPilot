import AsyncStorage from "@react-native-async-storage/async-storage";
import api, {
  apiService,
  getErrorMessage,
  setUnauthorizedHandler,
} from "../services/api";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

type Reply = { status: number; data?: any };

// Replace the network with a canned reply so interceptors and adapters run for real.
const respondWith = (reply: Reply | Error) => {
  api.defaults.adapter = async (config: any) => {
    if (reply instanceof Error) throw reply;
    const response = { ...reply, data: reply.data, headers: {}, config, statusText: "" };
    if (reply.status >= 400) {
      const error: any = new Error(`Request failed with status code ${reply.status}`);
      error.response = response;
      error.config = config;
      throw error;
    }
    return response;
  };
};

describe("getErrorMessage", () => {
  it("prefers the server's detail string", () => {
    expect(getErrorMessage({ response: { data: { detail: "Goal not found." } } })).toBe(
      "Goal not found."
    );
  });

  it("flattens FastAPI validation errors", () => {
    const error = {
      response: {
        data: { detail: [{ msg: "Value error, Password must be at least 8 characters long." }] },
      },
    };
    expect(getErrorMessage(error)).toBe("Password must be at least 8 characters long.");
  });

  it("explains network failures and timeouts", () => {
    expect(getErrorMessage({ message: "Network Error" })).toMatch(/reach the server/);
    expect(getErrorMessage({ code: "ECONNABORTED" })).toMatch(/timed out/);
  });

  it("falls back to the supplied text", () => {
    expect(getErrorMessage({}, "Custom fallback")).toBe("Custom fallback");
  });
});

describe("no substitute data when the API fails", () => {
  // These calls used to return invented results (fake withdrawal success, a
  // made-up fund recommendation, hard-coded subscriptions) on any error.
  const failing: [string, () => Promise<unknown>][] = [
    ["withdrawGoal", () => apiService.withdrawGoal(1, { amount: 10, reason: "medical" })],
    ["askAdvisor", () => apiService.askAdvisor("Best fund?")],
    ["getNegotiatorSubscriptions", () => apiService.getNegotiatorSubscriptions()],
    [
      "evaluatePurchase",
      () => apiService.evaluatePurchase({ price: 100, category: "Food", description: "x" }),
    ],
    ["getRoundupStats", () => apiService.getRoundupStats()],
    ["getStressMeter", () => apiService.getStressMeter(30)],
  ];

  it.each(failing)("%s rejects on a server error", async (_name, call) => {
    respondWith({ status: 500, data: { detail: "boom" } });
    await expect(call()).rejects.toBeTruthy();
  });

  it.each(failing)("%s rejects when offline", async (_name, call) => {
    respondWith(new Error("Network Error"));
    await expect(call()).rejects.toBeTruthy();
  });
});

describe("adapters", () => {
  it("keeps round-up fields on transactions", async () => {
    respondWith({
      status: 200,
      data: [
        {
          id: 7,
          user_id: 1,
          amount: "12.50",
          category: "Food",
          merchant: "Cafe",
          type: "debit",
          transaction_date: "2026-10-02T10:00:00",
          description: "Cafe",
          round_up_amount: "0.50",
          is_round_up_applied: true,
        },
      ],
    });
    const [tx] = await apiService.getTransactions({ hasRoundup: true });
    expect(tx).toMatchObject({ trans_id: 7, amount: 12.5, round_up_amount: 0.5, is_round_up_applied: true });
  });

  it("passes the backend's goal progress through untouched", async () => {
    respondWith({
      status: 200,
      data: [
        {
          id: 1,
          user_id: 1,
          title: "Laptop",
          target_amount: "1000.00",
          current_amount: "250.00",
          status: "active",
          progress_percentage: 25,
        },
      ],
    });
    const [goal] = await apiService.getGoals();
    expect(goal.progress_percentage).toBe(25);
    expect(goal.saved).toBe(250);
  });
});

describe("session expiry", () => {
  beforeEach(() => AsyncStorage.clear());

  it("a 401 clears stored credentials and signs the UI out", async () => {
    await AsyncStorage.setItem("hasCompletedOnboarding", "true");
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    respondWith({ status: 401, data: { detail: "Could not validate credentials" } });

    await expect(apiService.getCurrentUser()).rejects.toBeTruthy();

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem("hasCompletedOnboarding")).toBeNull();
    setUnauthorizedHandler(null);
  });

  it("other errors do not sign the user out", async () => {
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    respondWith({ status: 500, data: {} });
    await expect(apiService.getCurrentUser()).rejects.toBeTruthy();
    expect(onUnauthorized).not.toHaveBeenCalled();
    setUnauthorizedHandler(null);
  });
});
