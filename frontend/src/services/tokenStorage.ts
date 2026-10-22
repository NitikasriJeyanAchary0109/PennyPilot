import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

// The access token is a credential: on iOS/Android it lives in the Keychain /
// Keystore (expo-secure-store). The web build has no secure store, so it keeps
// using AsyncStorage (localStorage) there. Non-secret flags stay in AsyncStorage.
const TOKEN_KEY = "userToken";
const useSecureStore = Platform.OS !== "web";

export const tokenStorage = {
  async get(): Promise<string | null> {
    if (!useSecureStore) return AsyncStorage.getItem(TOKEN_KEY);

    const secure = await SecureStore.getItemAsync(TOKEN_KEY);
    if (secure) return secure;

    // One-time migration for installs that stored the token in AsyncStorage.
    const legacy = await AsyncStorage.getItem(TOKEN_KEY);
    if (legacy) {
      await SecureStore.setItemAsync(TOKEN_KEY, legacy);
      await AsyncStorage.removeItem(TOKEN_KEY);
      return legacy;
    }
    return null;
  },

  async set(token: string): Promise<void> {
    if (!useSecureStore) {
      await AsyncStorage.setItem(TOKEN_KEY, token);
      return;
    }
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await AsyncStorage.removeItem(TOKEN_KEY);
  },

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(TOKEN_KEY);
    if (useSecureStore) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  },
};
