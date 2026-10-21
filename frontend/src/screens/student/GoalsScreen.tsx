import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Target, Plus, ChevronRight, Calendar } from "lucide-react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { apiService } from "../../services/api";
import {
  ScreenContainer,
  Header,
  Card,
  ProgressBar,
  Skeleton,
  EmptyState,
  Button,
} from "../../components/ui";

interface GoalItem {
  goal_id: number;
  goal_name: string;
  saved: number;
  target: number;
  deadline?: string;
  progress_percentage?: number;
}

export const GoalsScreen = () => {
  const navigation = useNavigation<any>();
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const triggerHaptic = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore on web
    }
  };

  const loadGoals = useCallback(async () => {
    try {
      setLoading(true);
      const rawGoals = await apiService.getGoals();
      if (Array.isArray(rawGoals) && rawGoals.length > 0) {
        // Fetch detailed stats including backend-calculated progress_percentage for each
        const detailed = await Promise.all(
          rawGoals.map(async (g) => {
            try {
              const d = await apiService.getGoalById(g.goal_id);
              return {
                goal_id: g.goal_id,
                goal_name: g.goal_name,
                saved: g.saved,
                target: g.target,
                deadline: g.deadline,
                progress_percentage: d.progress_percentage,
              };
            } catch {
              return {
                goal_id: g.goal_id,
                goal_name: g.goal_name,
                saved: g.saved,
                target: g.target,
                deadline: g.deadline,
              };
            }
          })
        );
        setGoals(detailed);
      } else {
        setGoals([]);
      }
    } catch (e: any) {
      console.warn("Failed to load goals:", e?.message);
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadGoals();
    }, [loadGoals])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadGoals();
    setRefreshing(false);
  };

  const formatINR = (val: number): string => {
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  return (
    <ScreenContainer
      refreshing={refreshing}
      onRefresh={handleRefresh}
      className="pt-2"
    >
      {/* Brand Header */}
      <Header
        title="Dream Engine"
        subtitle="Your automated savings roadmap"
        showLogo
        showNotification={false}
        rightAction={
          <TouchableOpacity
            onPress={() => {
              triggerHaptic();
              navigation.navigate("GoalCreation");
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="w-10 h-10 rounded-full bg-primary items-center justify-center shadow-button"
            accessibilityRole="button"
            accessibilityLabel="Create a new savings goal"
          >
            <Plus size={20} color="#ffffff" />
          </TouchableOpacity>
        }
        className="px-0 mb-3"
      />

      {loading && goals.length === 0 ? (
        <View className="py-4 space-y-4">
          <Skeleton width="100%" height={120} className="rounded-card mb-3" />
          <Skeleton width="100%" height={120} className="rounded-card mb-3" />
          <Skeleton width="100%" height={120} className="rounded-card" />
        </View>
      ) : goals.length === 0 ? (
        <Card variant="default" padding="lg" className="my-6 shadow-card">
          <EmptyState
            title="No dreams set yet"
            description="Set your first savings goal and Penny Pilot will automatically route spare change toward it."
            actionTitle="Start a new dream →"
            onAction={() => {
              triggerHaptic();
              navigation.navigate("GoalCreation");
            }}
            icon={<Target size={32} color="#144a32" />}
          />
        </Card>
      ) : (
        <View className="mb-6 space-y-3.5">
          {goals.map((goal, idx) => {
            const deadlineStr = goal.deadline
              ? new Date(goal.deadline).toLocaleDateString("en-IN", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : null;

            return (
              <TouchableOpacity
                key={goal.goal_id || idx}
                onPress={() => {
                  triggerHaptic();
                  navigation.navigate("GoalDetail", { goal });
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`${goal.goal_name}, saved ₹${formatINR(goal.saved)} of ₹${formatINR(goal.target)}`}
                className="mb-3.5"
              >
                <Card variant="default" padding="md" className="shadow-card">
                  {/* Top Row: Icon, Title & Target */}
                  <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-row items-center flex-1 mr-2">
                      <View className="w-10 h-10 rounded-full bg-sage-light items-center justify-center mr-3 border border-border">
                        <Target size={18} color="#144a32" />
                      </View>
                      <View className="flex-1">
                        <Text
                          className="text-base font-bold text-text-primary font-sans"
                          numberOfLines={1}
                        >
                          {goal.goal_name}
                        </Text>
                        {deadlineStr && (
                          <View className="flex-row items-center mt-0.5">
                            <Calendar size={11} color="#666e69" />
                            <Text className="text-[11px] text-text-muted ml-1 font-sans">
                              Target: {deadlineStr}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <ChevronRight size={18} color="#707773" />
                  </View>

                  {/* Progress Bar (zero arithmetic, uses backend percentage) */}
                  {goal.progress_percentage !== undefined ? (
                    <View className="mt-1">
                      <ProgressBar
                        progress={goal.progress_percentage}
                        height={7}
                        fillColor="bg-primary"
                        trackColor="bg-cream"
                      />
                      <View className="flex-row justify-between items-center mt-1.5">
                        <Text className="text-xs font-semibold text-text-secondary font-sans">
                          ₹{formatINR(goal.saved)} saved
                        </Text>
                        <Text className="text-xs font-bold text-primary font-sans">
                          {Math.round(goal.progress_percentage)}% • Target ₹{formatINR(goal.target)}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View className="flex-row justify-between items-center mt-2">
                      <Text className="text-xs font-semibold text-text-secondary font-sans">
                        ₹{formatINR(goal.saved)} saved
                      </Text>
                      <Text className="text-xs font-bold text-text-primary font-sans">
                        Target: ₹{formatINR(goal.target)}
                      </Text>
                    </View>
                  )}
                </Card>
              </TouchableOpacity>
            );
          })}

          <Button
            title="+ Start another dream"
            variant="secondary"
            onPress={() => {
              triggerHaptic();
              navigation.navigate("GoalCreation");
            }}
            className="mt-2"
          />
        </View>
      )}
    </ScreenContainer>
  );
};

export default GoalsScreen;
