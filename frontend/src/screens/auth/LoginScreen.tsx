import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform, Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { API_URL } from "../../config";

WebBrowser.maybeCompleteAuthSession();

export const LoginScreen = ({ navigation }: { navigation: any }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login, loginWithToken } = useAuth();

  // Listen for incoming deep link URLs (in case redirect isn't handled by WebBrowser)
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      parseAndLoginFromUrl(event.url);
    };

    const subscription = Linking.addEventListener("url", handleDeepLink);
    
    // Check if app was opened from a deep link initially
    Linking.getInitialURL().then((url) => {
      if (url) parseAndLoginFromUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const parseAndLoginFromUrl = (url: string) => {
    try {
      const parsed = Linking.parse(url);
      const token = parsed.queryParams?.token as string;
      const role = parsed.queryParams?.role as "student" | "educator";
      const completed = parsed.queryParams?.has_completed_onboarding === "true";

      if (token && role) {
        loginWithToken(token, role, completed);
        WebBrowser.dismissBrowser();
      }
    } catch (e) {
      console.error("Deep link parsing failed", e);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMsg("Please fill in all fields.");
      return;
    }

    setErrorMsg(null);
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (e: any) {
      setErrorMsg(e.message || "Invalid credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const redirectUrl = Linking.createURL("oauth");
      const authUrl = `${API_URL}/auth/google/login`;
      
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      
      if (result.type === "success" && result.url) {
        parseAndLoginFromUrl(result.url);
      }
    } catch (e: any) {
      Alert.alert("Google Login Error", e.message || "Could not complete Google OAuth.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f7f9ff" }}>
      {/* Header Bar */}
      <View style={{ width: "100%", paddingVertical: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: "#f1f5f9" }}>
        <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 20, color: "#005bbf" }}>
          Penny Pilot
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView 
          style={{ flex: 1 }} 
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20, paddingVertical: 24 }}
        >
          <View style={{ width: "100%", maxWidth: 440 }}>
            {/* Subtitle */}
            <View style={{ marginBottom: 24, alignItems: "center" }}>
              <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 24, color: "#1e293b", textAlign: "center" }}>
                Welcome Back
              </Text>
              <Text style={{ fontFamily: "WorkSans_400Regular", fontSize: 14, color: "#64748b", marginTop: 4, textAlign: "center" }}>
                Micro-savings automation for students & educators
              </Text>
            </View>

            {/* Login Card */}
            <Card className="my-0">
              {errorMsg && (
                <View className="bg-red-50 border border-red-200 p-3.5 rounded-xl mb-4">
                  <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-red-700 text-xs text-center">{errorMsg}</Text>
                </View>
              )}

              <View className="mb-4">
                <Text style={{ fontFamily: "WorkSans_600SemiBold" }} className="text-slate-500 text-[10px] uppercase tracking-wider mb-2 ml-1">
                  Email Address
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="email@college.edu"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ fontFamily: "WorkSans_400Regular" }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-slate-800 text-sm focus:border-[#005bbf]"
                />
              </View>

              <View className="mb-6">
                <Text style={{ fontFamily: "WorkSans_600SemiBold" }} className="text-slate-500 text-[10px] uppercase tracking-wider mb-2 ml-1">
                  Password
                </Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ fontFamily: "WorkSans_400Regular" }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-slate-800 text-sm focus:border-[#005bbf]"
                />
              </View>

              <Button title="Login" onPress={handleLogin} loading={loading} variant="primary" />

              <View className="flex-row items-center my-4">
                <View className="flex-1 h-[1px] bg-slate-200" />
                <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-slate-400 text-xs px-3">OR</Text>
                <View className="flex-1 h-[1px] bg-slate-200" />
              </View>

              {/* Google Login Button */}
              <TouchableOpacity
                onPress={handleGoogleLogin}
                disabled={loading}
                activeOpacity={0.8}
                className="py-3.5 px-6 rounded-full border border-slate-200 bg-slate-50 active:bg-slate-100 flex-row justify-center items-center my-1"
              >
                <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold" }} className="text-slate-700 text-sm">Continue with Google</Text>
              </TouchableOpacity>

              <View className="flex-row justify-center items-center mt-5">
                <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-slate-500 text-xs">Don't have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate("Register")}>
                  <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold" }} className="text-[#005bbf] text-xs font-bold">Register Now</Text>
                </TouchableOpacity>
              </View>
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default LoginScreen;
