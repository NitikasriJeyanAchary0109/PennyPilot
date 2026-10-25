import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import {
  ArrowLeft,
  Target,
  Calendar,
  Sparkles,
  ShieldAlert,
  Clock,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { apiService } from "../../services/api";
import {
  ScreenContainer,
  Card,
  ProgressBar,
  Button,
  Skeleton,
  EmptyState,
} from "../../components/ui";

interface GoalDetailData {
  goal_id: number;
  user_id?: number;
  goal_name: string;
  saved: number;
  target: number;
  deadline?: string;
  progress_percentage?: number;
  projected_completion_date?: string;
}

export const GoalDetailScreen = ({ route, navigation }: { route: any; navigation: any }) => {
  const paramGoal = route?.params?.goal;
  const goalId = paramGoal?.goal_id || paramGoal?.id || route?.params?.goalId;

  const [goal, setGoal] = useState<GoalDetailData | null>(paramGoal || null);
  const [forecast, setForecast] = useState<any>(null);
  const [loading, setLoading] = useState(!paramGoal);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const triggerHaptic = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore on web
    }
  };

  const loadData = useCallback(async () => {
    if (!goalId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const goalData = await apiService.getGoalById(goalId);
      setGoal(goalData);

      setLoadingForecast(true);
      try {
        const forecastData = await apiService.getGoalForecast(goalId);
        setForecast(forecastData);
      } catch (err) {
        console.warn("Forecast fetch error:", err);
      } finally {
        setLoadingForecast(false);
      }
    } catch (err: any) {
      console.warn("Failed to load goal details:", err?.message);
    } finally {
      setLoading(false);
    }
  }, [goalId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const formatINR = (val: number): string => {
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  if (!goalId && !goal) {
    return (
      <ScreenContainer className="pt-4">
        <EmptyState
          title="No Goal Selected"
          description="Please select a savings goal from your Dream Engine roadmap."
          actionTitle="View Goals"
          onAction={() => navigation.navigate("Goals")}
          icon={<Target size={32} color="#144a32" />}
        />
      </ScreenContainer>
    );
  }

  const formattedDeadline = goal?.deadline
    ? new Date(goal.deadline).toLocaleDateString("en-IN", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "No target date set";

  const formattedProjected = goal?.projected_completion_date
    ? new Date(goal.projected_completion_date).toLocaleDateString("en-IN", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : forecast?.forecast_date
    ? new Date(forecast.forecast_date).toLocaleDateString("en-IN", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <ScreenContainer
      refreshing={refreshing}
      onRefresh={handleRefresh}
      className="pt-2 pb-8"
    >
      {/* Top Navigation Row */}
      <View className="flex-row items-center justify-between mb-4">
        <TouchableOpacity
          onPress={() => {
            triggerHaptic();
            navigation.goBack();
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          className="w-10 h-10 rounded-full bg-white border border-border items-center justify-center shadow-card"
          accessibilityRole="button"
          accessibilityLabel="Back to goals"
        >
          <ArrowLeft size={20} color="#144a32" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-text-primary font-sans">
          Goal Overview
        </Text>
        <View className="w-10" />
      </View>

      {loading && !goal ? (
        <View className="space-y-4 py-4">
          <Skeleton width="100%" height={220} className="rounded-card mb-4" />
          <Skeleton width="100%" height={140} className="rounded-card mb-4" />
          <Skeleton width="100%" height={100} className="rounded-card" />
        </View>
      ) : goal ? (
        <View className="space-y-4">
          {/* Main Hero Goal Card */}
          <Card variant="forest" padding="lg" className="shadow-card mb-4">
            <View className="flex-row items-center mb-3">
              <View className="w-10 h-10 rounded-full bg-sage-light items-center justify-center mr-3 border border-border">
                <Target size={20} color="#144a32" />
              </View>
              <View className="flex-1">
                <Text
                  className="text-xl font-bold text-white font-sans"
                  numberOfLines={1}
                >
                  {goal.goal_name}
                </Text>
                <Text className="text-xs text-sage-light font-sans mt-0.5">
                  Automated Savings Goal
                </Text>
              </View>
            </View>

            {/* Figures Grid */}
            <View className="flex-row justify-between items-end my-3 pt-2 border-t border-white/10">
              <View>
                <Text className="text-[11px] font-semibold text-sage-light uppercase tracking-wider font-sans">
                  Saved So Far
                </Text>
                <Text className="text-2xl font-bold text-white font-sans mt-0.5">
                  ₹{formatINR(goal.saved)}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-[11px] font-semibold text-sage-light uppercase tracking-wider font-sans">
                  Target Amount
                </Text>
                <Text className="text-lg font-bold text-gold font-sans mt-0.5">
                  ₹{formatINR(goal.target)}
                </Text>
              </View>
            </View>

            {/* Progress bar using server percentage */}
            {goal.progress_percentage !== undefined && (
              <View className="mt-2">
                <ProgressBar
                  progress={goal.progress_percentage}
                  height={8}
                  fillColor="bg-gold"
                  trackColor="bg-white/20"
                />
                <View className="flex-row justify-between items-center mt-2">
                  <Text className="text-xs font-bold text-white font-sans">
                    {Math.round(goal.progress_percentage)}% completed
                  </Text>
                  {formattedDeadline && (
                    <Text className="text-xs text-sage-light font-sans">
                      Target: {formattedDeadline}
                    </Text>
                  )}
                </View>
              </View>
            )}
          </Card>

          {/* Goal Milestones & Dates */}
          <Card variant="default" padding="md" className="shadow-card mb-4">
            <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans mb-3">
              Timeline & Forecast
            </Text>

            <View className="space-y-3">
              <View className="flex-row items-center justify-between py-2 border-b border-border/50">
                <View className="flex-row items-center">
                  <Calendar size={16} color="#666e69" className="mr-2.5" />
                  <Text className="text-xs font-medium text-text-secondary font-sans ml-2">
                    Target Date
                  </Text>
                </View>
                <Text className="text-xs font-bold text-text-primary font-sans">
                  {formattedDeadline}
                </Text>
              </View>

              <View className="flex-row items-center justify-between py-2 border-b border-border/50">
                <View className="flex-row items-center">
                  <Clock size={16} color="#144a32" className="mr-2.5" />
                  <Text className="text-xs font-medium text-text-secondary font-sans ml-2">
                    Projected Completion
                  </Text>
                </View>
                <Text
                  className={`text-xs font-bold font-sans ${
                    formattedProjected ? "text-primary" : "text-text-muted"
                  }`}
                >
                  {formattedProjected ??
                    "Not enough recent savings to project"}
                </Text>
              </View>
            </View>
          </Card>

          {/* AI Savings Engine Insight */}
          <Card variant="peach" padding="md" className="shadow-card mb-4">
            <View className="flex-row items-center mb-2">
              <Sparkles size={18} color="#856529" className="mr-2" />
              <Text className="text-sm font-bold text-text-primary font-sans ml-1.5">
                Dream Engine Forecast
              </Text>
            </View>
            {loadingForecast ? (
              <Skeleton width="100%" height={40} className="rounded-card" />
            ) : forecast?.narrative ? (
              <Text className="text-xs text-text-secondary font-sans leading-relaxed">
                {forecast.narrative}
              </Text>
            ) : (
              <Text className="text-xs text-text-secondary font-sans leading-relaxed">
                A narrative forecast isn't available right now. Your projected date above is calculated from your last 30 days of savings.
              </Text>
            )}
          </Card>

          {/* Emergency Safety Net Box */}
          <Card variant="default" padding="md" className="shadow-card border-danger/20 mb-4">
            <View className="flex-row items-start">
              <View className="w-9 h-9 rounded-full bg-danger-light items-center justify-center mr-3 mt-0.5">
                <ShieldAlert size={18} color="#b3261e" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-text-primary font-sans">
                  Need emergency access?
                </Text>
                <Text className="text-xs text-text-secondary font-sans mt-1 leading-relaxed">
                  Life happens. You can release money from this goal at any time — Penny Pilot records it, so your balance and history stay accurate. (Moving the money in your bank is up to you.)
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic();
                    navigation.navigate("EmergencyWithdrawal", {
                      goalId: goal.goal_id,
                      goalName: goal.goal_name,
                      savedAmount: goal.saved,
                    });
                  }}
                  activeOpacity={0.8}
                  className="mt-3 self-start px-3.5 py-2 rounded-xl bg-danger-light border border-danger/30"
                  accessibilityRole="button"
                  accessibilityLabel="Request emergency withdrawal"
                >
                  <Text className="text-xs font-bold text-danger font-sans">
                    Emergency Withdrawal →
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Card>
        </View>
      ) : null}
    </ScreenContainer>
  );
};

export default GoalDetailScreen;
