import React from "react";
import { 
  View, 
  Text, 
  ScrollView, 
  Pressable, 
  SafeAreaView, 
  StyleSheet 
} from "react-native";
import { MaterialIcons, FontAwesome, MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";

export const AnalysisScreen = ({ navigation }: { navigation: any }) => {
  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Subscription list config
  const subscriptions = [
    { name: "Netflix", icon: "play", color: "#e50914", provider: "fa" },
    { name: "Spotify", icon: "spotify", color: "#1db954", provider: "mci" },
    { name: "Apple", icon: "apple", color: "#555555", provider: "fa" },
    { name: "YouTube", icon: "youtube-play", color: "#ff0000", provider: "fa" },
    { name: "Prime", icon: "amazon", color: "#00a8e1", provider: "fa" },
  ];

  return (
    <SafeAreaView className="flex-1 bg-[#f7f9ff]">
      {/* Top App Bar */}
      <View className="flex-row justify-between items-center px-margin-mobile py-stack-md border-b border-slate-100 bg-white">
        <View className="flex-row items-center space-x-3">
          <Text style={{ fontFamily: "Inter_700Bold" }} className="text-xl text-ob-primary">
            Penny Pilot
          </Text>
        </View>
        <Pressable 
          onPress={() => {
            triggerHaptic();
            navigation.navigate("Login");
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-50 border border-slate-100"
        >
          <MaterialIcons name="settings" size={20} color="#5c5f60" />
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}>
        {/* AI Analysis Header */}
        <View className="mb-6">
          <Text style={{ fontFamily: "Inter_700Bold" }} className="text-2xl text-on-surface mb-1">
            AI Analysis Results
          </Text>
          <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-sm text-on-surface-variant">
            We've parsed your last 30 days of transactions.
          </Text>
        </View>

        {/* Top Card: Income */}
        <View style={styles.incomeCard} className="bg-primary-container p-6 rounded-2xl flex-row items-center justify-between mb-6 overflow-hidden">
          <View className="z-10">
            <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-white/80 uppercase tracking-wider mb-1">
              Detected Monthly Income
            </Text>
            <Text style={{ fontFamily: "Inter_800ExtraBold" }} className="text-3xl text-white">
              ₹45,000
            </Text>
          </View>
          <MaterialIcons name="account-balance-wallet" size={40} color="rgba(255, 255, 255, 0.3)" className="z-10" />
          {/* Decorative background blur circle */}
          <View className="absolute -right-8 -top-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
        </View>

        {/* Center: Spending Donut */}
        <View style={styles.card} className="bg-white border border-outline-variant rounded-2xl p-5 items-center mb-6">
          <View className="relative w-48 h-48 items-center justify-center">
            {/* Svg Donut segments mapping exactly to: 
                Savings (25%), Rent (30%), Food (25%), Fun (20%) 
                Radius: 15.915 gives circumference: ~100.
            */}
            <Svg width="100%" height="100%" viewBox="0 0 36 36" style={{ transform: [{ rotate: "-90deg" }] }}>
              {/* Fun (Gray) */}
              <Circle
                cx="18"
                cy="18"
                r="15.915"
                fill="transparent"
                stroke="#5c5f60"
                strokeWidth="3.5"
                strokeDasharray="20 80"
                strokeDashoffset="-80"
              />
              {/* Food (Red) */}
              <Circle
                cx="18"
                cy="18"
                r="15.915"
                fill="transparent"
                stroke="#ba1a1a"
                strokeWidth="3.5"
                strokeDasharray="25 75"
                strokeDashoffset="-55"
              />
              {/* Rent (Blue-ish) */}
              <Circle
                cx="18"
                cy="18"
                r="15.915"
                fill="transparent"
                stroke="#adc7ff"
                strokeWidth="3.5"
                strokeDasharray="30 70"
                strokeDashoffset="-25"
              />
              {/* Savings (Green) */}
              <Circle
                cx="18"
                cy="18"
                r="15.915"
                fill="transparent"
                stroke="#16893a"
                strokeWidth="3.5"
                strokeDasharray="25 75"
                strokeDashoffset="0"
              />
            </Svg>
            <View className="absolute items-center">
              <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-on-surface-variant uppercase">
                Spent
              </Text>
              <Text style={{ fontFamily: "Inter_700Bold" }} className="text-xl text-on-surface">
                ₹33,750
              </Text>
            </View>
          </View>

          {/* Category List */}
          <View className="w-full mt-6 space-y-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center space-x-3">
                <View className="w-3.5 h-3.5 rounded-full bg-tertiary-container" />
                <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-sm text-on-surface">
                  Savings
                </Text>
              </View>
              <Text style={{ fontFamily: "Inter_700Bold" }} className="text-sm text-on-surface">
                ₹11,250
              </Text>
            </View>

            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center space-x-3">
                <View className="w-3.5 h-3.5 rounded-full bg-primary-fixed-dim" />
                <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-sm text-on-surface">
                  Rent
                </Text>
              </View>
              <Text style={{ fontFamily: "Inter_700Bold" }} className="text-sm text-on-surface">
                ₹13,500
              </Text>
            </View>

            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center space-x-3">
                <View className="w-3.5 h-3.5 rounded-full bg-ob-error" />
                <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-sm text-on-surface">
                  Food
                </Text>
              </View>
              <Text style={{ fontFamily: "Inter_700Bold" }} className="text-sm text-on-surface">
                ₹11,250
              </Text>
            </View>

            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center space-x-3">
                <View className="w-3.5 h-3.5 rounded-full bg-ob-secondary" />
                <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-sm text-on-surface">
                  Fun
                </Text>
              </View>
              <Text style={{ fontFamily: "Inter_700Bold" }} className="text-sm text-on-surface">
                ₹9,000
              </Text>
            </View>
          </View>
        </View>

        {/* Subscriptions List */}
        <View className="mb-8">
          <Text style={{ fontFamily: "Inter_700Bold" }} className="text-base text-on-surface mb-3 px-1">
            Active Subscriptions
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-1">
            {subscriptions.map((sub, idx) => (
              <View key={sub.name} className={`flex-col items-center mr-4 ${idx === subscriptions.length - 1 ? "mr-0" : ""}`}>
                <Pressable
                  onPress={triggerHaptic}
                  style={({ pressed }) => [
                    styles.subIconWrapper,
                    { transform: [{ scale: pressed ? 0.95 : 1 }] }
                  ]}
                  className="w-14 h-14 rounded-full bg-white border border-outline-variant items-center justify-center shadow-sm"
                >
                  {sub.provider === "fa" ? (
                    <FontAwesome name={sub.icon as any} size={24} color={sub.color} />
                  ) : (
                    <MaterialCommunityIcons name={sub.icon as any} size={24} color={sub.color} />
                  )}
                </Pressable>
                <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-on-surface-variant mt-2">
                  {sub.name}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Continue Action */}
        <View className="mt-2">
          <Pressable
            android_ripple={{ color: "rgba(255,255,255,0.2)" }}
            style={({ pressed }) => [
              styles.continueBtn,
              { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }
            ]}
            onPress={() => {
              triggerHaptic();
              navigation.navigate("Login");
            }}
          >
            <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-white text-base mr-1">
              Continue
            </Text>
            <MaterialIcons name="arrow-forward" size={20} color="#ffffff" />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  incomeCard: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  subIconWrapper: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  continueBtn: {
    width: "100%",
    height: 48,
    backgroundColor: "#1a73e8",
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  }
});

export default AnalysisScreen;
