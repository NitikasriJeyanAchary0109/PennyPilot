import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import api, {
  apiService,
  getErrorMessage,
  setUnauthorizedHandler,
} from "../services/api";
import { tokenStorage } from "../services/tokenStorage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
// A working in-memory secure store (the real one needs a device).
const mockSecureStore: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureStore[key] ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore[key] = value;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete mockSecureStore[key];
  }),
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


describe("silent token refresh (15-minute access tokens)", () => {
  const fail401 = (config: any) => {
    const error: any = new Error("Request failed with status code 401");
    error.config = config;
    error.response = { status: 401, data: { detail: "Could not validate credentials" }, config };
    return error;
  };

  // Succeeds only when called with the given bearer token.
  const acceptOnly = (token: string, data: any = { ok: true }) => {
    const seen: string[] = [];
    api.defaults.adapter = async (config: any) => {
      seen.push(String(config.headers.Authorization));
      if (config.headers.Authorization !== `Bearer ${token}`) throw fail401(config);
      return { status: 200, data, headers: {}, config, statusText: "" };
    };
    return seen;
  };

  beforeEach(async () => {
    await AsyncStorage.clear();
    Object.keys(mockSecureStore).forEach((k) => delete mockSecureStore[k]);
    await tokenStorage.setTokens("old-access", "refresh-1");
  });
  afterEach(() => {
    jest.restoreAllMocks();
    setUnauthorizedHandler(null);
  });

  it("renews the access token on a 401 and replays the request", async () => {
    const refresh = jest.spyOn(axios, "post").mockResolvedValue({
      data: { access_token: "new-access", refresh_token: "refresh-2" },
    });
    const seen = acceptOnly("new-access", { id: 1, email: "a@b.com" });
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(apiService.getCurrentUser()).resolves.toEqual({ id: 1, email: "a@b.com" });

    expect(seen).toEqual(["Bearer old-access", "Bearer new-access"]);
    expect(refresh).toHaveBeenCalledWith(
      expect.stringContaining("/auth/refresh"),
      { refresh_token: "refresh-1" },
      expect.anything()
    );
    expect(await tokenStorage.get()).toBe("new-access");
    expect(await tokenStorage.getRefresh()).toBe("refresh-2"); // rotated
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("several requests that expire together share a single refresh", async () => {
    const refresh = jest.spyOn(axios, "post").mockResolvedValue({
      data: { access_token: "new-access", refresh_token: "refresh-2" },
    });
    acceptOnly("new-access", []);
    await Promise.all([
      apiService.getGoals(),
      apiService.getNotifications(),
      apiService.getCurrentUser(),
    ]);
    // Refresh tokens are single-use: a second call would look like a replay.
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("signs the user out when the refresh token is rejected", async () => {
    jest.spyOn(axios, "post").mockRejectedValue(new Error("401"));
    acceptOnly("never");
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(apiService.getCurrentUser()).rejects.toBeTruthy();

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(await tokenStorage.get()).toBeNull();
    expect(await tokenStorage.getRefresh()).toBeNull();
  });

  it("signs out straight away when there is no refresh token", async () => {
    await tokenStorage.clear();
    await tokenStorage.setTokens("old-access");
    const refresh = jest.spyOn(axios, "post");
    acceptOnly("never");
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(apiService.getCurrentUser()).rejects.toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not retry more than once", async () => {
    jest.spyOn(axios, "post").mockResolvedValue({
      data: { access_token: "still-bad", refresh_token: "refresh-2" },
    });
    const seen = acceptOnly("never");
    await expect(apiService.getCurrentUser()).rejects.toBeTruthy();
    expect(seen).toHaveLength(2); // original + one replay
  });

  it("logout sends the refresh token so it works with an expired access token", async () => {
    let body: any;
    api.defaults.adapter = async (config: any) => {
      body = JSON.parse(config.data);
      return { status: 204, data: "", headers: {}, config, statusText: "" };
    };
    await apiService.logout();
    expect(body).toEqual({ refresh_token: "refresh-1" });
  });
});
