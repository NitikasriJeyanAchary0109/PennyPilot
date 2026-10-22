jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const secureStore: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => secureStore[key] ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    secureStore[key] = value;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete secureStore[key];
  }),
}));

// Each test gets a fresh module registry (so Platform.OS can differ); the
// AsyncStorage instance must come from that same registry to be the one used.
const loadWithPlatform = (os: "ios" | "web") => {
  jest.resetModules();
  jest.doMock("react-native", () => ({ Platform: { OS: os } }));
  const tokens = require("../services/tokenStorage")
    .tokenStorage as typeof import("../services/tokenStorage").tokenStorage;
  const storageModule = require("@react-native-async-storage/async-storage");
  const AsyncStorage = (storageModule.default ??
    storageModule) as typeof import("@react-native-async-storage/async-storage").default;
  return { tokens, AsyncStorage };
};

beforeEach(() => {
  Object.keys(secureStore).forEach((k) => delete secureStore[k]);
});

describe("tokenStorage on a device", () => {
  it("stores the token in the secure store, not AsyncStorage", async () => {
    const { tokens, AsyncStorage } = loadWithPlatform("ios");
    await tokens.set("abc");
    expect(secureStore.userToken).toBe("abc");
    expect(await AsyncStorage.getItem("userToken")).toBeNull();
    expect(await tokens.get()).toBe("abc");
  });

  it("moves a token saved by an older version into the secure store", async () => {
    const { tokens, AsyncStorage } = loadWithPlatform("ios");
    await AsyncStorage.setItem("userToken", "legacy-token");
    expect(await tokens.get()).toBe("legacy-token");
    expect(secureStore.userToken).toBe("legacy-token");
    expect(await AsyncStorage.getItem("userToken")).toBeNull();
  });

  it("clear removes it everywhere", async () => {
    const { tokens, AsyncStorage } = loadWithPlatform("ios");
    await tokens.set("abc");
    await AsyncStorage.setItem("userToken", "stale");
    await tokens.clear();
    expect(await tokens.get()).toBeNull();
  });
});

describe("tokenStorage on web", () => {
  it("falls back to AsyncStorage", async () => {
    const { tokens, AsyncStorage } = loadWithPlatform("web");
    await tokens.set("web-token");
    expect(await AsyncStorage.getItem("userToken")).toBe("web-token");
    expect(secureStore.userToken).toBeUndefined();
    await tokens.clear();
    expect(await tokens.get()).toBeNull();
  });
});
