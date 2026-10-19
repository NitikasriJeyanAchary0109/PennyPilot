import React, { useEffect } from "react";
import { View, Text, Image, Pressable, SafeAreaView, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  withDelay, 
  Easing 
} from "react-native-reanimated";

export const OnboardingScreen = ({ navigation }: { navigation: any }) => {
  // Float animations for central illustration and badges
  const floatMain = useSharedValue(0);
  const floatBadge1 = useSharedValue(0);
  const floatBadge2 = useSharedValue(0);

  useEffect(() => {
    floatMain.value = withRepeat(
      withTiming(-10, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    // Staggered float animations to mimic the css delay offsets
    floatBadge1.value = withDelay(
      1000,
      withRepeat(
        withTiming(-8, { duration: 2800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );
    floatBadge2.value = withDelay(
      2500,
      withRepeat(
        withTiming(-12, { duration: 3200, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );
  }, []);

  const animStyleMain = useAnimatedStyle(() => ({
    transform: [{ translateY: floatMain.value }]
  }));

  const animStyleBadge1 = useAnimatedStyle(() => ({
    transform: [{ translateY: floatBadge1.value }]
  }));

  const animStyleBadge2 = useAnimatedStyle(() => ({
    transform: [{ translateY: floatBadge2.value }]
  }));

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="w-full py-4 px-5 flex-row items-center justify-between border-b border-slate-100">
        <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold" }} className="text-xl text-[#005bbf]">
          Penny Pilot
        </Text>
        <Pressable 
          onPress={() => navigation.navigate("Login")}
          className="py-1 px-3 bg-blue-50 border border-blue-100 rounded-full"
        >
          <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold" }} className="text-xs text-[#005bbf] font-bold">
            Log In
          </Text>
        </Pressable>
      </View>

      {/* Main Content */}
      <View className="flex-1 items-center justify-center px-5 max-w-md mx-auto w-full">
        {/* Illustration Canvas */}
        <View className="relative w-64 h-64 mb-8 flex items-center justify-center">
          {/* Subtle background blob */}
          <View className="absolute w-56 h-56 bg-surface-container-low rounded-full opacity-40 scale-110 blur-xl" />

          {/* Central Illustration */}
          <Animated.View style={[animStyleMain, styles.dropShadow]} className="z-10 w-full h-full justify-center items-center">
            <Image 
              source={require("../../../assets/illustrations/onboarding.png")}
              style={{ width: "90%", height: "90%", resizeMode: "contain" }}
            />
          </Animated.View>

          {/* Small Accent Badges */}
          <Animated.View 
            style={[animStyleBadge1, styles.customShadow]} 
            className="absolute top-4 right-2 bg-white p-3 rounded-2xl border border-outline-variant/30 z-20"
          >
            <MaterialIcons name="trending-up" size={24} color="#006d2a" />
          </Animated.View>

          <Animated.View 
            style={[animStyleBadge2, styles.customShadow]} 
            className="absolute bottom-8 left-0 bg-white p-3 rounded-2xl border border-outline-variant/30 z-20"
          >
            <MaterialIcons name="savings" size={24} color="#005bbf" />
          </Animated.View>
        </View>

        {/* Typography */}
        <View className="items-center mb-8 px-4">
          <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-2xl text-on-surface text-center mb-2">
            Welcome to Penny Pilot
          </Text>
          <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-base text-on-surface-variant text-center px-4">
            Let's build your financial future together.
          </Text>
        </View>

        {/* Actions */}
        <View className="w-full space-y-4 px-4">
          {/* Primary Action Button */}
          <Pressable 
            android_ripple={{ color: "rgba(255,255,255,0.2)" }}
            style={({ pressed }) => [
              styles.primaryBtn,
              { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }
            ]}
            onPress={() => navigation.navigate("GoalCreation")}
          >
            <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold" }} className="text-white text-base">
              Set a Goal First
            </Text>
          </Pressable>

          {/* Secondary Action Button */}
          <Pressable 
            android_ripple={{ color: "rgba(0,91,191,0.1)" }}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }
            ]}
            onPress={() => navigation.navigate("SpendingChoice")}
          >
            <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold" }} className="text-ob-primary text-base">
              Tell Us About Your Spending
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Footer */}
      <View className="py-6 items-center">
        <Pressable 
          onPress={() => navigation.navigate("Login")}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          className="py-2 px-4"
        >
          <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-sm text-ob-secondary">
            Skip for now
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  dropShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  customShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryBtn: {
    width: "100%",
    height: 56,
    backgroundColor: "#1a73e8",
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtn: {
    width: "100%",
    height: 56,
    borderWidth: 2,
    borderColor: "#c1c6d6",
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  }
});

export default OnboardingScreen;
