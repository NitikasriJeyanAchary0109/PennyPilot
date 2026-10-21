import React from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { TrendingUp, Coins, Target, ArrowRight } from "lucide-react-native";
import { useAuth } from "../../hooks/useAuth";
import { ScreenContainer } from "../../components/ui/ScreenContainer";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

export default function OnboardingSetupScreen({ navigation }: { navigation: any }) {
  const { completeOnboarding } = useAuth();

  return (
    <ScreenContainer scrollable={true} className="justify-between py-6">
      {/* Brand Header */}
      <View className="items-center pt-2 pb-4">
        <Text className="font-sans font-bold text-2xl text-primary tracking-tight">
          Penny Pilot
        </Text>
        <Text className="font-sans text-xs text-text-secondary mt-0.5">
          Student Financial Companion
        </Text>
      </View>

      {/* Hero Illustration & Welcome */}
      <View className="items-center my-4">
        <View className="relative w-56 h-56 items-center justify-center rounded-full bg-primary-tint/60 border border-primary/10">
          <Image
            source={require("../../../assets/illustrations/onboarding.png")}
            className="w-44 h-44"
            resizeMode="contain"
            accessibilityLabel="Penny Pilot student onboarding illustration"
          />

          {/* Floating badge 1: Trend */}
          <View className="absolute right-1 top-3 w-11 h-11 items-center justify-center rounded-2xl border border-border bg-surface shadow-sm">
            <TrendingUp size={22} color="#144a32" />
          </View>

          {/* Floating badge 2: Savings Coins */}
          <View className="absolute bottom-3 left-1 w-11 h-11 items-center justify-center rounded-2xl border border-border bg-surface shadow-sm">
            <Coins size={22} color="#a88544" />
          </View>
        </View>

        <View className="mt-8 items-center px-4">
          <Text className="font-sans font-extrabold text-2xl text-text text-center tracking-tight">
            Welcome to Penny Pilot
          </Text>
          <Text className="mt-2 text-center font-sans text-sm text-text-secondary leading-relaxed max-w-[300px]">
            Master your student budget, automate spare change savings, and reach your goals effortlessly.
          </Text>
        </View>
      </View>

      {/* Feature Highlights Card */}
      <Card variant="default" className="p-4 mx-1 mb-6">
        <View className="flex-row items-center justify-around">
          <View className="items-center">
            <View className="w-10 h-10 rounded-full bg-primary-tint items-center justify-center mb-1.5">
              <Target size={18} color="#144a32" />
            </View>
            <Text className="font-sans font-semibold text-xs text-text">Smart Goals</Text>
            <Text className="font-sans text-[11px] text-text-secondary">Target tracking</Text>
          </View>
          <View className="w-[1px] h-8 bg-border" />
          <View className="items-center">
            <View className="w-10 h-10 rounded-full bg-gold-light items-center justify-center mb-1.5">
              <Coins size={18} color="#a88544" />
            </View>
            <Text className="font-sans font-semibold text-xs text-text">Micro Savings</Text>
            <Text className="font-sans text-[11px] text-text-secondary">Roundup spares</Text>
          </View>
        </View>
      </Card>

      {/* Action Buttons */}
      <View className="w-full gap-3 px-1">
        <Button
          title="Set a Goal First"
          onPress={() => navigation.navigate("CreateGoal")}
          variant="primary"
          size="lg"
          rightIcon={<ArrowRight size={18} color="#ffffff" />}
          accessibilityLabel="Set a Goal First"
        />

        <Button
          title="Tell Us About Your Spending"
          onPress={() => navigation.navigate("SpendingEntryChoice")}
          variant="secondary"
          size="lg"
          accessibilityLabel="Tell Us About Your Spending"
        />

        <TouchableOpacity
          onPress={completeOnboarding}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
          className="items-center justify-center min-h-[44px] mt-1"
          accessibilityRole="button"
          accessibilityLabel="Skip for now"
        >
          <Text className="font-sans font-medium text-xs text-text-secondary">
            Skip for now and explore dashboard
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}
