import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useAuth } from "../../hooks/useAuth";
import {
  ScreenContainer,
  Card,
  Input,
  Button,
  PennyPilotLogoIcon,
  SavingsJarIllustration,
} from "../../components/ui";
import { API_URL } from "../../config";

WebBrowser.maybeCompleteAuthSession();

export const LoginScreen = ({ navigation }: { navigation: any }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login, loginWithToken } = useAuth();

  // Listen for incoming deep link URLs
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
      setErrorMsg("Please enter both email and password.");
      return;
    }

    setErrorMsg(null);
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (e: any) {
      setErrorMsg(e.message || "Invalid credentials. Please try again.");
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
    <ScreenContainer
      maxWidth={440}
      contentContainerClassName="justify-center py-6"
    >
      {/* Brand Header */}
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center">
          <PennyPilotLogoIcon size={32} />
          <View className="ml-2.5">
            <Text className="text-xl font-bold text-primary font-sans tracking-tight">
              Penny Pilot
            </Text>
            <Text className="text-xs text-text-muted font-sans font-medium">
              Small steps. Bigger tomorrow.
            </Text>
          </View>
        </View>
      </View>

      {/* Hero Visual & Tagline */}
      <View className="items-center my-3">
        <Text className="text-xl font-bold text-text-primary text-center px-4 font-sans leading-tight">
          Save a little today for a bigger you tomorrow
        </Text>
        <View className="my-2 items-center justify-center">
          <SavingsJarIllustration width={190} height={160} />
        </View>
      </View>

      {/* Form Card */}
      <Card variant="default" padding="lg" className="shadow-card-elevated">
        <View className="mb-4">
          <Text className="text-lg font-bold text-text-primary font-sans">
            Sign in
          </Text>
          <Text className="text-xs text-text-secondary mt-0.5">
            Continue to your automated student savings
          </Text>
        </View>

        {errorMsg && (
          <View className="bg-danger-light/30 border border-danger/40 p-3 rounded-card-sm mb-4">
            <Text className="text-danger text-xs font-medium text-center">
              {errorMsg}
            </Text>
          </View>
        )}

        <Input
          label="Email address"
          placeholder="name@college.edu"
          value={email}
          onChangeText={(val) => {
            setEmail(val);
            if (errorMsg) setErrorMsg(null);
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          required
        />

        <Input
          label="Password"
          placeholder="Enter your password"
          value={password}
          onChangeText={(val) => {
            setPassword(val);
            if (errorMsg) setErrorMsg(null);
          }}
          isPassword
          required
        />

        <Button
          title="Sign in →"
          variant="primary"
          onPress={handleLogin}
          loading={loading}
          className="mt-1"
        />

        {/* Divider */}
        <View className="flex-row items-center my-4">
          <View className="flex-1 h-[1px] bg-border" />
          <Text className="text-text-muted text-xs font-semibold px-3 uppercase tracking-wider">
            OR
          </Text>
          <View className="flex-1 h-[1px] bg-border" />
        </View>

        {/* Continue with Google */}
        <Button
          title="Continue with Google"
          variant="secondary"
          onPress={handleGoogleLogin}
          disabled={loading}
        />

        {/* Register footer */}
        <View className="flex-row justify-center items-center mt-5">
          <Text className="text-xs text-text-secondary">
            Don't have an account?{" "}
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate("Register")}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Register now"
          >
            <Text className="text-xs font-bold text-primary">
              Register now
            </Text>
          </TouchableOpacity>
        </View>
      </Card>
    </ScreenContainer>
  );
};

export default LoginScreen;
