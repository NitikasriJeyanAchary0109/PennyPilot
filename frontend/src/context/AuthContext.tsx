import React, { createContext, useState, useEffect, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_URL } from "../config";
import { TokenResponse } from "../types";
import { apiService, getErrorMessage, setUnauthorizedHandler } from "../services/api";
import { tokenStorage } from "../services/tokenStorage";

interface AuthContextType {
  userToken: string | null;
  userRole: "student" | null;
  isLoading: boolean;
  hasCompletedOnboarding: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (fullName: string, email: string, password: string, role?: string) => Promise<void>;
  loginWithToken: (token: string, role?: string, hasCompletedOnboarding?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [userToken, setUserToken] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<"student" | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const clearSession = useCallback(() => {
    setUserToken(null);
    setUserRole(null);
    setHasCompletedOnboarding(false);
  }, []);

  // Any 401 from the API (expired / revoked token) signs the user out of the UI too.
  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  // Restore the session on app start and confirm it with the server.
  useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        const token = await tokenStorage.get();
        if (!token) return;

        const storedCompleted = await AsyncStorage.getItem("hasCompletedOnboarding");
        setUserToken(token);
        setUserRole("student");
        setHasCompletedOnboarding(storedCompleted === "true");

        try {
          const user = await apiService.getCurrentUser();
          // The server is the source of truth for onboarding state.
          const completed = Boolean(user?.has_completed_onboarding);
          setHasCompletedOnboarding(completed);
          await AsyncStorage.setItem("hasCompletedOnboarding", String(completed));
        } catch (e: any) {
          // 401 → the interceptor already cleared the session. Anything else
          // (e.g. offline) keeps the stored session so the app still opens.
          if (e?.response?.status !== 401) {
            console.warn("Could not verify session with server", e?.message);
          }
        }
      } catch (e) {
        console.error("Failed to load auth credentials from storage", e);
      } finally {
        setIsLoading(false);
      }
    };

    bootstrapAsync();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await axios.post<TokenResponse>(`${API_URL}/auth/login/json`, {
        email,
        password,
      });

      const { access_token, has_completed_onboarding } = response.data;

      await tokenStorage.set(access_token);
      await AsyncStorage.setItem("userRole", "student");
      await AsyncStorage.setItem("hasCompletedOnboarding", String(has_completed_onboarding));

      setUserToken(access_token);
      setUserRole("student");
      setHasCompletedOnboarding(has_completed_onboarding);
    } catch (error: any) {
      const errMsg = error.response?.data?.detail || "Authentication login failed.";
      throw new Error(errMsg);
    }
  };

  const register = async (fullName: string, email: string, password: string, _role = "student") => {
    try {
      await axios.post(`${API_URL}/auth/register`, {
        full_name: fullName,
        email,
        password,
        role: "student",
      });
    } catch (error: any) {
      const errMsg = getErrorMessage(error, "Registration failed.");
      throw new Error(errMsg);
    }
  };

  const loginWithToken = async (token: string, _role = "student", completed = false) => {
    try {
      setIsLoading(true);
      await tokenStorage.set(token);
      await AsyncStorage.setItem("userRole", "student");
      await AsyncStorage.setItem("hasCompletedOnboarding", String(completed));
      setUserToken(token);
      setUserRole("student");
      setHasCompletedOnboarding(completed);
    } catch (e) {
      console.error("Failed to store credentials during OAuth login", e);
    } finally {
      setIsLoading(false);
    }
  };

  // Throws on failure so callers can tell the user — silently marking onboarding
  // complete locally would send them back to onboarding on the next sign-in.
  const completeOnboarding = async () => {
    await apiService.completeOnboarding();
    await AsyncStorage.setItem("hasCompletedOnboarding", "true");
    setHasCompletedOnboarding(true);
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      // Revoke on the server first (needs the token); a failure must not trap
      // the user in a signed-in state, so it is ignored.
      await apiService.logout().catch(() => undefined);
      await tokenStorage.clear();
      await AsyncStorage.removeItem("userRole");
      await AsyncStorage.removeItem("hasCompletedOnboarding");
      setUserToken(null);
      setUserRole(null);
      setHasCompletedOnboarding(false);
    } catch (e) {
      console.error("Failed to clear credentials during logout", e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      userToken, 
      userRole, 
      isLoading, 
      hasCompletedOnboarding, 
      login, 
      register, 
      loginWithToken, 
      logout,
      completeOnboarding
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
