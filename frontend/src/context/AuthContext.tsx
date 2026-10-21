import React, { createContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_URL } from "../config";
import { TokenResponse } from "../types";
import { apiService } from "../services/api";

interface AuthContextType {
  userToken: string | null;
  userRole: "student" | null;
  isLoading: boolean;
  hasCompletedOnboarding: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (fullName: string, email: string, password: string, role?: string) => Promise<void>;
  loginWithToken: (token: string, role?: string, hasCompletedOnboarding?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  loginAsGuest: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [userToken, setUserToken] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<"student" | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Check if token and onboarding state exist in storage on app start
  useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        const token = await AsyncStorage.getItem("userToken");
        const completed = await AsyncStorage.getItem("hasCompletedOnboarding");
        
        if (token) {
          setUserToken(token);
          setUserRole("student");
        }
        if (completed === "true") {
          setHasCompletedOnboarding(true);
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
      setIsLoading(true);
      const response = await axios.post<TokenResponse>(`${API_URL}/auth/login/json`, {
        email,
        password,
      });

      const { access_token, has_completed_onboarding } = response.data;

      await AsyncStorage.setItem("userToken", access_token);
      await AsyncStorage.setItem("userRole", "student");
      await AsyncStorage.setItem("hasCompletedOnboarding", String(has_completed_onboarding));

      setUserToken(access_token);
      setUserRole("student");
      setHasCompletedOnboarding(has_completed_onboarding);
    } catch (error: any) {
      const errMsg = error.response?.data?.detail || "Authentication login failed.";
      throw new Error(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (fullName: string, email: string, password: string, _role = "student") => {
    try {
      setIsLoading(true);
      await axios.post(`${API_URL}/auth/register`, {
        full_name: fullName,
        email,
        password,
        role: "student",
      });
    } catch (error: any) {
      const errMsg = error.response?.data?.detail || "Registration failed.";
      throw new Error(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithToken = async (token: string, _role = "student", completed = false) => {
    try {
      setIsLoading(true);
      await AsyncStorage.setItem("userToken", token);
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

  const loginAsGuest = async () => {
    try {
      setIsLoading(true);
      await AsyncStorage.setItem("userToken", "guest");
      await AsyncStorage.setItem("userRole", "student");
      await AsyncStorage.setItem("hasCompletedOnboarding", "true");
      setUserToken("guest");
      setUserRole("student");
      setHasCompletedOnboarding(true);
    } catch (e) {
      console.error("Failed to log in as guest", e);
    } finally {
      setIsLoading(false);
    }
  };

  const completeOnboarding = async () => {
    try {
      if (userToken && userToken !== "guest") {
        await apiService.completeOnboarding();
      }
      await AsyncStorage.setItem("hasCompletedOnboarding", "true");
      setHasCompletedOnboarding(true);
    } catch (e) {
      console.error("Failed to complete onboarding", e);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      await AsyncStorage.removeItem("userToken");
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
      loginAsGuest,
      completeOnboarding
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
