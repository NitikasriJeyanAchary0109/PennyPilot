import React, { useState, useEffect } from "react";
import { 
  View, 
  Text, 
  ScrollView, 
  Pressable, 
  SafeAreaView, 
  StyleSheet, 
  Image, 
  Alert,
  ActivityIndicator
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { apiService } from "../../services/api";

export const InsightsScreen = ({ navigation }: { navigation: any }) => {
  const [loading, setLoading] = useState(false);
  const [stressSummary, setStressSummary] = useState<string | null>(null);
  const [healthScore, setHealthScore] = useState<number>(85);
  const [stressScore, setStressScore] = useState<number>(20);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const loadWellnessData = async () => {
    try {
      setLoading(true);
      const res = await apiService.getStressMeter(30);
      if (res) {
        setHealthScore(res.health_score !== undefined ? Number(res.health_score) : 85);
        setStressScore(res.stress_score !== undefined ? Number(res.stress_score) : 20);
        setStressSummary(res.ai_summary);
      }
    } catch (e) {
      console.warn("Failed to load stress/wellness meter:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWellnessData();
  }, []);

  const handleRunStressMeter = async () => {
    triggerHaptic();
    setLoading(true);
    setStressSummary(null);
    try {
      const response = await apiService.getStressMeter(30);
      setHealthScore(response.health_score !== undefined ? Number(response.health_score) : 85);
      setStressScore(response.stress_score !== undefined ? Number(response.stress_score) : 20);
      setStressSummary(response.ai_summary);
      Alert.alert(
        "Stress Analysis Complete",
        response.ai_summary || "No cash flow anomalies detected in the last 30 days."
      );
    } catch (e: any) {
      Alert.alert("Analysis Failed", e.message || "Failed to contact AI stress scanner.");
    } finally {
      setLoading(false);
    }
  };

  const healthOffset = 94 * (1 - healthScore / 100);
  const stressOffset = 94 * (1 - stressScore / 100);

  return (
    <SafeAreaView className="flex-1 bg-[#f7f9ff]">
      {/* Top App Bar */}
      <View className="flex-row justify-between items-center px-margin-mobile py-stack-md bg-white border-b border-slate-100">
        <View className="flex-row items-center space-x-3">
          <View className="w-10 h-10 rounded-full overflow-hidden border border-outline-variant">
            <Image 
              source={{ uri: "https://lh3.googleusercontent.com/aida-public/AB6AXuBTq3IY7xhV3aWDPgRwaxHD_oWLUlqJZeh_dgSAaRl9LT4Wx5jYETm1gOlx3SHUMh4mRl0BdLwxw6rFOlrx2rwcgmPCh-IY6JMbPXmHtprrjV8_bjgrB7tqKPCLhpMe86efjCbDKiPwruo_2qkvIBE6NsGGjq8-sKib0D0lahPSoeYRe9YSC9lkJeomNXRKZau3b4mhPFuLa5HCrNdk4ZBzVIzq1G6V239Ce_UKPuZcxnvdG_iAHAUb" }}
              style={{ width: "100%", height: "100%", resizeMode: "cover" }}
            />
          </View>
          <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-lg text-ob-primary">
            Penny Pilot
          </Text>
        </View>
        <Pressable 
          onPress={triggerHaptic}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-50 border border-slate-100"
        >
          <MaterialIcons name="settings" size={20} color="#181c20" />
        </Pressable>
      </View>

      <ScrollView className="flex-grow" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 }}>
        {/* Welcome Header */}
        <View className="mb-6">
          <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-2xl text-on-surface mb-1">
            Hi Alex,
          </Text>
          <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-sm text-on-surface-variant">
            Your savings are on track this week.
          </Text>
        </View>

        {/* Gauges Section (Bento Grid) */}
        <View className="flex-row space-x-4 mb-6">
          {/* Wellness Score Card */}
          <Pressable 
            onPress={handleRunStressMeter}
            style={({ pressed }) => [
              styles.gaugeCard,
              { transform: [{ scale: pressed ? 0.98 : 1 }] }
            ]}
            className="flex-1 bg-white p-4 rounded-2xl items-center border border-outline-variant/30 shadow-sm"
          >
            <View style={styles.gaugeContainer} className="mb-2 items-center justify-center">
              <Svg width="120" height="120" viewBox="0 0 100 100" style={{ transform: [{ rotate: "-180deg" }] }}>
                {/* Background arc */}
                <Path d="M 20 50 A 30 30 0 0 1 80 50" fill="none" stroke="#F1F3F4" strokeWidth="8" />
                {/* Highlight fill (healthScore approx: strokeDashoffset calculation) */}
                <Path d="M 20 50 A 30 30 0 0 1 80 50" fill="none" stroke="#1A73E8" strokeWidth="8" strokeLinecap="round" strokeDasharray="94 94" strokeDashoffset={healthOffset} />
              </Svg>
              <View className="absolute bottom-1">
                {loading ? (
                  <ActivityIndicator size="small" color="#1a73e8" />
                ) : (
                  <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-lg text-primary">
                    {healthScore}
                  </Text>
                )}
              </View>
            </View>
            <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-ob-secondary uppercase tracking-wider">
              Wellness Score
            </Text>
            <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-[10px] text-on-surface-variant text-center mt-2 leading-4">
              {healthScore >= 80 ? "Excellent! You're in the top 10% of campus savers." : "Keep saving to build your wellness score!"}
            </Text>
          </Pressable>

          {/* Regret Meter Card */}
          <Pressable 
            onPress={() => {
              triggerHaptic();
              navigation.navigate("SubscriptionNegotiator");
            }}
            style={({ pressed }) => [
              styles.gaugeCard,
              { transform: [{ scale: pressed ? 0.98 : 1 }] }
            ]}
            className="flex-1 bg-white p-4 rounded-2xl items-center border border-outline-variant/30 shadow-sm"
          >
            <View style={styles.gaugeContainer} className="mb-2 items-center justify-center">
              <Svg width="120" height="120" viewBox="0 0 100 100" style={{ transform: [{ rotate: "-180deg" }] }}>
                <Path d="M 20 50 A 30 30 0 0 1 80 50" fill="none" stroke="#F1F3F4" strokeWidth="8" />
                <Path d="M 20 50 A 30 30 0 0 1 80 50" fill="none" stroke="#ba1a1a" strokeWidth="8" strokeLinecap="round" strokeDasharray="94 94" strokeDashoffset={stressOffset} />
              </Svg>
              <View className="absolute bottom-1">
                <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-lg text-error">
                  {stressScore}
                </Text>
              </View>
            </View>
            <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-ob-secondary uppercase tracking-wider">
              Regret Meter
            </Text>
            <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-[10px] text-on-surface-variant text-center mt-2 leading-4">
              Low. Your subscription spending is well controlled.
            </Text>
          </Pressable>
        </View>

        {/* Weekly Trend Chart */}
        <View style={styles.card} className="bg-white p-5 rounded-2xl border border-outline-variant/30 shadow-sm mb-6">
          <View className="flex-row justify-between items-start mb-4">
            <View>
              <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-base text-on-surface">
                Savings over time
              </Text>
              <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-on-surface-variant">
                Weekly performance trend
              </Text>
            </View>
            <View className="flex-row items-center space-x-0.5 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100">
              <MaterialIcons name="trending-up" size={14} color="#006d2a" />
              <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] text-tertiary font-bold">
                +12.4%
              </Text>
            </View>
          </View>

          {/* SVG Line Chart */}
          <View style={styles.chartWrapper} className="relative w-full h-44 mt-2 justify-end">
            <Svg width="100%" height="100%" viewBox="0 0 400 150" preserveAspectRatio="none">
              <Defs>
                <LinearGradient id="chartGradient" x1="0%" x2="0%" y1="0%" y2="100%">
                  <Stop offset="0%" stopColor="#1A73E8" stopOpacity="0.2" />
                  <Stop offset="100%" stopColor="#1A73E8" stopOpacity="0.0" />
                </LinearGradient>
              </Defs>
              {/* Area Fill */}
              <Path 
                d="M0 150 L0 120 C50 110, 80 130, 120 100 C160 70, 200 80, 250 40 C300 10, 350 20, 400 5 L400 150 Z" 
                fill="url(#chartGradient)" 
              />
              {/* Trend Line */}
              <Path 
                d="M0 120 C50 110, 80 130, 120 100 C160 70, 200 80, 250 40 C300 10, 350 20, 400 5" 
                fill="none" 
                stroke="#1A73E8" 
                strokeWidth="3.5" 
              />
              {/* Data points */}
              <Circle cx="120" cy="100" r="5" fill="#1A73E8" />
              <Circle cx="250" cy="40" r="5" fill="#1A73E8" />
              <Circle cx="400" cy="5" r="5" fill="#1A73E8" />
            </Svg>

            {/* Simulated Horizontal Grid lines (underlay) */}
            <View style={StyleSheet.absoluteFillObject} className="justify-between py-1 opacity-5 pointer-events-none">
              <View className="border-t border-slate-900" />
              <View className="border-t border-slate-900" />
              <View className="border-t border-slate-900" />
              <View className="border-t border-slate-900" />
            </View>
          </View>

          {/* X Axis Labels */}
          <View className="flex-row justify-between mt-3 px-1">
            <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] text-on-surface-variant font-bold">Mon</Text>
            <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] text-on-surface-variant font-bold">Wed</Text>
            <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] text-on-surface-variant font-bold">Fri</Text>
            <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] text-on-surface-variant font-bold">Sun</Text>
          </View>
        </View>

        {/* Insight Suggestion Card */}
        <View style={styles.card} className="bg-primary-container/5 p-5 rounded-2xl border border-primary/10 flex-row space-x-4 items-start mb-6">
          <View className="w-12 h-12 rounded-full bg-primary-container items-center justify-center shrink-0">
            <MaterialIcons name="lightbulb" size={24} color="#ffffff" />
          </View>
          <View className="flex-1">
            <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-sm text-on-surface mb-1">
              AI Smart Suggestion
            </Text>
            <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-on-surface-variant leading-relaxed">
              You could save an extra <Text style={{ fontFamily: "WorkSans_500Medium" }} className="font-bold">₹1,000</Text> this week by skipping your second coffee order. Move that to your Laptop goal?
            </Text>
            <View className="flex-row space-x-3 mt-4">
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  Alert.alert("Transfer Scheduled", "Moved ₹1,000 directly from your coffee reserve into Laptop Savings!");
                }}
                style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.95 : 1 }] }]}
                className="px-4 py-2 bg-primary rounded-full"
              >
                <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-white">
                  Yes, do it
                </Text>
              </Pressable>
              <Pressable
                onPress={triggerHaptic}
                style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.95 : 1 }] }]}
                className="px-4 py-2 border border-outline-variant rounded-full"
              >
                <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-on-surface-variant">
                  Not now
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Dynamic Navigation helpers */}
        <View className="flex-row space-x-3">
          <Pressable
            onPress={() => {
              triggerHaptic();
              navigation.navigate("InvestmentAdvisor");
            }}
            className="flex-1 bg-slate-50 border border-slate-200 py-3.5 rounded-xl items-center"
          >
            <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold" }} className="text-xs text-ob-primary">
              AI Investment Advisor
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              triggerHaptic();
              navigation.navigate("EmergencyWithdrawal");
            }}
            className="flex-1 bg-slate-50 border border-slate-200 py-3.5 rounded-xl items-center"
          >
            <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold" }} className="text-xs text-[#ba1a1a]">
              Emergency Withdrawal
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  gaugeCard: {
    minHeight: 160,
  },
  gaugeContainer: {
    width: 120,
    height: 60,
    overflow: "hidden",
  },
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  chartWrapper: {
    overflow: "hidden",
  }
});

export default InsightsScreen;
