import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ArrowRight } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../hooks/useAuth";
import {
  ScreenContainer,
  Card,
  Input,
  Button,
  PennyPilotLogoIcon,
} from "../../components/ui";

export const RegisterScreen = ({ navigation }: { navigation: any }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();

  const triggerHaptic = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore on web
    }
  };

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password) {
      setErrorMsg("Please complete all fields to create your account.");
      return;
    }
    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters long.");
      return;
    }

    triggerHaptic();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      await register(name.trim(), email.trim().toLowerCase(), password);
      setSuccessMsg("Account created! Redirecting to login...");
      setTimeout(() => {
        navigation.navigate("Login");
      }, 1500);
    } catch (e: any) {
      setErrorMsg(e?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer scrollable className="justify-center py-6">
      {/* Brand & Title */}
      <View className="items-center mb-6">
        <View className="w-16 h-16 rounded-full bg-sage-light items-center justify-center mb-3 border border-border shadow-card">
          <PennyPilotLogoIcon size={36} />
        </View>
        <Text className="text-2xl font-bold text-text-primary font-sans text-center">
          Create Account
        </Text>
        <Text className="text-xs text-text-muted font-sans text-center mt-1">
          Join the automated micro-savings platform
        </Text>
      </View>

      <Card variant="default" padding="lg" className="shadow-card max-w-md mx-auto w-full mb-6">
        {/* Error / Success Notifications */}
        {errorMsg && (
          <View className="bg-danger-light border border-danger/30 p-3 rounded-2xl mb-4">
            <Text className="text-xs font-semibold text-danger font-sans text-center">
              {errorMsg}
            </Text>
          </View>
        )}

        {successMsg && (
          <View className="bg-sage-light border border-border p-3 rounded-2xl mb-4">
            <Text className="text-xs font-semibold text-primary font-sans text-center">
              {successMsg}
            </Text>
          </View>
        )}

        {/* Form Inputs */}
        <Input
          label="Full Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Priya Sharma"
          autoCapitalize="words"
          className="mb-4"
        />

        <Input
          label="Campus Email Address"
          value={email}
          onChangeText={setEmail}
          placeholder="e.g. priya@college.edu"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          className="mb-4"
        />

        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          secureTextEntry
          autoCapitalize="none"
          className="mb-6"
        />

        {/* Submit Button */}
        <Button
          title={loading ? "Creating Account..." : "Create Account"}
          onPress={handleRegister}
          loading={loading}
          variant="primary"
          size="lg"
          className="mb-4"
        />

        {/* Navigation to Login */}
        <View className="flex-row justify-center items-center mt-2 py-2">
          <Text className="text-xs text-text-secondary font-sans">
            Already have an account?{" "}
          </Text>
          <TouchableOpacity
            onPress={() => {
              triggerHaptic();
              navigation.navigate("Login");
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text className="text-xs font-bold text-primary font-sans underline">
              Sign In
            </Text>
          </TouchableOpacity>
        </View>
      </Card>
    </ScreenContainer>
  );
};

export default RegisterScreen;
