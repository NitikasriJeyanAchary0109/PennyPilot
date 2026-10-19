import React, { useState, useEffect } from "react";
import { View, Text, Pressable, SafeAreaView, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { apiService } from "../../services/api";

export const GoalDetailScreen = ({ route, navigation }: { route: any; navigation: any }) => {
  const goal = route?.params?.goal || { goal_name: "🏠 Home", target: 50000, saved: 34000, deadline: new Date().toISOString() };
  const [forecast, setForecast] = useState<any>(null);
  const [loadingForecast, setLoadingForecast] = useState(false);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const goalId = goal.goal_id || goal.id || 1;

  useEffect(() => {
    const fetchForecast = async () => {
      try {
        setLoadingForecast(true);
        const res = await apiService.getGoalForecast(goalId);
        setForecast(res);
      } catch (e) {
        console.warn("Failed to fetch goal forecast:", e);
      } finally {
        setLoadingForecast(false);
      }
    };
    fetchForecast();
  }, [goalId]);

  const target = Number(goal.target) || 1;
  const saved = Number(goal.saved) || 0;
  const percent = Math.min(Math.round((saved / target) * 100), 100);
  const left = Math.max(target - saved, 0);

  const formattedDeadline = goal.deadline
    ? new Date(goal.deadline).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "No deadline set";

  const remainingDays = goal.deadline
    ? Math.max(0, Math.ceil((new Date(goal.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <SafeAreaView className="flex-1 bg-[#f7f9ff]">
      {/* Header */}
      <View className="flex-row items-center px-margin-mobile py-stack-md bg-white border-b border-slate-100">
        <Pressable 
          onPress={() => {
            triggerHaptic();
            navigation.goBack();
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          className="p-1 mr-3"
        >
          <MaterialIcons name="arrow-back" size={24} color="#181c20" />
        </Pressable>
        <Text style={{ fontFamily: "Inter_700Bold" }} className="text-lg text-slate-800">
          Goal Details
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 }}>
        {/* Main Card */}
        <View style={styles.card} className="bg-white rounded-3xl p-6 border border-slate-100 mb-6">
          <View className="items-center mb-6">
            <Text className="text-4xl mb-2">{goal.goal_name.split(" ")[0]}</Text>
            <Text style={{ fontFamily: "Inter_700Bold" }} className="text-xl text-slate-800 text-center font-bold">
              {goal.goal_name.substring(goal.goal_name.indexOf(" ") + 1) || goal.goal_name}
            </Text>
          </View>

          {/* Progress numbers */}
          <View className="flex-row justify-between mb-4">
            <View>
              <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-slate-400 text-xs uppercase tracking-wider">
                Saved So Far
              </Text>
              <Text style={{ fontFamily: "Inter_800ExtraBold" }} className="text-2xl text-emerald-600 font-extrabold mt-0.5">
                ₹{saved.toLocaleString("en-IN")}
              </Text>
            </View>
            <View className="items-end">
              <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-slate-400 text-xs uppercase tracking-wider">
                Target Amount
              </Text>
              <Text style={{ fontFamily: "Inter_800ExtraBold" }} className="text-2xl text-slate-800 font-extrabold mt-0.5">
                ₹{target.toLocaleString("en-IN")}
              </Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mb-6">
            <View 
              style={{ width: `${percent}%` }}
              className="h-full bg-blue-600 rounded-full"
            />
          </View>

          {/* Stats list */}
          <View className="space-y-4 border-t border-slate-100 pt-4">
            <View className="flex-row justify-between items-center">
              <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-slate-500 text-sm">Percent Complete</Text>
              <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-slate-800 text-sm font-bold">{percent}%</Text>
            </View>
            <View className="flex-row justify-between items-center">
              <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-slate-500 text-sm">Remaining Balance</Text>
              <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-slate-800 text-sm font-bold">₹{left.toLocaleString("en-IN")}</Text>
            </View>
            <View className="flex-row justify-between items-center">
              <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-slate-500 text-sm">Target Date</Text>
              <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-slate-800 text-sm font-bold">{formattedDeadline}</Text>
            </View>
            {remainingDays !== null && (
              <View className="flex-row justify-between items-center">
                <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-slate-500 text-sm">Days Remaining</Text>
                <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-slate-800 text-sm font-bold">{remainingDays} days</Text>
              </View>
            )}
          </View>
        </View>

        {/* Dream Engine AI Forecast */}
        <View style={styles.card} className="bg-white rounded-3xl p-5 border border-slate-100 mb-6">
          <View className="flex-row items-center space-x-2.5 mb-3">
            <MaterialIcons name="smart-toy" size={20} color="#005bbf" />
            <Text style={{ fontFamily: "Inter_700Bold" }} className="text-base text-slate-800 font-bold">
              Dream Engine AI
            </Text>
          </View>
          {loadingForecast ? (
            <ActivityIndicator size="small" color="#005bbf" className="py-4" />
          ) : forecast ? (
            <View className="space-y-3">
              <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-slate-600 leading-relaxed">
                {forecast.narrative}
              </Text>
              {forecast.forecast_date && (
                <View className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex-row items-center space-x-2">
                  <MaterialIcons name="event-available" size={16} color="#005bbf" />
                  <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[11px] text-blue-800 font-medium">
                    Projected Target: {new Date(forecast.forecast_date).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-slate-400">
              No forecast narrative available for this goal yet. Keep saving to build a savings timeline!
            </Text>
          )}
        </View>

        {/* Withdrawal action box */}
        <View style={styles.card} className="bg-white rounded-3xl p-5 border border-slate-100 items-center">
          <MaterialIcons name="help-outline" size={28} color="#ba1a1a" className="mb-2" />
          <Text style={{ fontFamily: "Inter_700Bold" }} className="text-slate-800 text-sm font-bold text-center mb-1">
            Need funds for an emergency?
          </Text>
          <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-slate-500 text-xs text-center mb-4 px-2">
            You can instantly withdraw your saved balance from this goal to your primary bank account.
          </Text>

          <Pressable
            onPress={() => {
              triggerHaptic();
              navigation.navigate("EmergencyWithdrawal", { 
                goalId: goal.goal_id || goal.id || 1,
                goalName: goal.goal_name,
                savedAmount: saved
              });
            }}
            className="w-full py-3.5 rounded-xl bg-red-50 border border-red-200 active:bg-red-100 flex-row justify-center items-center"
          >
            <MaterialIcons name="emergency" size={16} color="#ba1a1a" className="mr-1.5" />
            <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-red-700 text-xs font-bold uppercase tracking-wider">
              Emergency Withdrawal
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  }
});

export default GoalDetailScreen;
