import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Both tokens are credentials: on iOS/Android they live in the Keychain /
// Keystore (expo-secure-store). The web build has no secure store, so it keeps
// using AsyncStorage (localStorage) there. Non-secret flags stay in AsyncStorage.
const ACCESS_KEY = "userToken";
const REFRESH_KEY = "refreshToken";
const useSecureStore = Platform.OS !== "web";

const read = async (key: string): Promise<string | null> => {
  if (!useSecureStore) return AsyncStorage.getItem(key);

  const secure = await SecureStore.getItemAsync(key);
  if (secure) return secure;

  // One-time migration for installs that stored the token in AsyncStorage.
  const legacy = await AsyncStorage.getItem(key);
  if (legacy) {
    await SecureStore.setItemAsync(key, legacy);
    await AsyncStorage.removeItem(key);
    return legacy;
  }
  return null;
};

const write = async (key: string, value: string): Promise<void> => {
  if (!useSecureStore) {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
  await AsyncStorage.removeItem(key);
};

const remove = async (key: string): Promise<void> => {
  await AsyncStorage.removeItem(key);
  if (useSecureStore) {
    await SecureStore.deleteItemAsync(key);
  }
};

export const tokenStorage = {
  get: () => read(ACCESS_KEY),
  getRefresh: () => read(REFRESH_KEY),

  /** Save the pair returned by login / refresh. */
  async setTokens(accessToken: string, refreshToken?: string | null): Promise<void> {
    await write(ACCESS_KEY, accessToken);
    if (refreshToken) await write(REFRESH_KEY, refreshToken);
  },

  setRefresh: (token: string) => write(REFRESH_KEY, token),

  async clear(): Promise<void> {
    await remove(ACCESS_KEY);
    await remove(REFRESH_KEY);
  },
};
