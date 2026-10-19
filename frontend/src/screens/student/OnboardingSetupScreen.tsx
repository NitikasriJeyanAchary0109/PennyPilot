import React from "react";
import { Image, Pressable, SafeAreaView, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useAuth } from "../../hooks/useAuth";

export default function OnboardingSetupScreen({ navigation }: { navigation: any }) {
  const { completeOnboarding } = useAuth();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="items-center px-margin-mobile py-stack-md">
        <Text className="font-jakarta-semibold text-xl text-ob-primary">Penny Pilot</Text>
      </View>
      <View className="flex-1 items-center justify-center px-margin-mobile">
        <View className="h-60 w-60 items-center justify-center rounded-full bg-surface-container-low">
          <Image source={require("../../../assets/illustrations/onboarding.png")} className="h-52 w-52" resizeMode="contain" />
          <View className="absolute right-0 top-4 h-11 w-11 items-center justify-center rounded-2xl border border-outline-variant bg-white">
            <MaterialIcons name="trending-up" size={22} color="#006d2a" />
          </View>
          <View className="absolute bottom-5 left-0 h-11 w-11 items-center justify-center rounded-2xl border border-outline-variant bg-white">
            <MaterialIcons name="savings" size={22} color="#005bbf" />
          </View>
        </View>
        <View className="mt-stack-xl items-center">
          <Text className="font-jakarta-bold text-2xl text-on-surface">Welcome to Penny Pilot</Text>
          <Text className="mt-2 max-w-[280px] text-center font-worksans text-base text-on-surface-variant">Let’s build your financial future together.</Text>
        </View>
        <View className="mt-stack-xl w-full gap-4">
          <Pressable onPress={() => navigation.navigate("CreateGoal")} className="h-14 items-center justify-center rounded-full bg-primary-container">
            <Text className="font-jakarta-semibold text-base text-white">Set a Goal First</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate("SpendingEntryChoice")} className="h-14 items-center justify-center rounded-full border-2 border-outline-variant bg-white">
            <Text className="font-jakarta-semibold text-base text-ob-primary">Tell Us About Your Spending</Text>
          </Pressable>
        </View>
      </View>
      <View className="items-center px-margin-mobile py-stack-xl">
        <Pressable onPress={completeOnboarding} hitSlop={12}><Text className="font-worksans-medium text-sm text-ob-secondary">Skip for now</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}
