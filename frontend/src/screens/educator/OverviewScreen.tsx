import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { Users, Coins, CreditCard, Sparkles, LogOut } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../hooks/useAuth";
import { apiService } from "../../services/api";
import { EducatorAnalytics } from "../../types";
import { ScreenContainer, Header, Card, Skeleton } from "../../components/ui";

export const OverviewScreen = () => {
  const { logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<EducatorAnalytics | null>(null);

  const triggerHaptic = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore on web
    }
  };

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiService.getEducatorAnalytics();
      setData(res);
    } catch (e: any) {
      console.warn("Failed to load educator analytics:", e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAnalytics();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleLogout = () => {
    triggerHaptic();
    Alert.alert("Logout", "Sign out of your Educator Advisor account?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            // Ignore on web
          }
          await logout();
        },
      },
    ]);
  };

  const formatINR = (val: number | string | null | undefined): string => {
    const num = typeof val === "number" ? val : parseFloat(String(val || 0));
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(isNaN(num) ? 0 : num);
  };

  return (
    <ScreenContainer
      refreshing={refreshing}
      onRefresh={handleRefresh}
      className="pt-2 pb-8"
    >
      {/* Top Header */}
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-xl font-bold text-text-primary font-sans">
            Educator Dashboard
          </Text>
          <Text className="text-xs text-text-muted font-sans mt-0.5">
            Campus-wide savings & cohort metrics
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleLogout}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          className="flex-row items-center px-3.5 py-2 rounded-xl bg-white border border-danger/30 shadow-card min-h-[44px]"
          accessibilityRole="button"
          accessibilityLabel="Log out of educator portal"
        >
          <LogOut size={14} color="#b3261e" />
          <Text className="text-xs font-bold text-danger font-sans ml-1.5">
            Sign Out
          </Text>
        </TouchableOpacity>
      </View>

      {loading && !data ? (
        <View className="space-y-4 py-4">
          <Skeleton width="100%" height={140} className="rounded-card mb-4" />
          <Skeleton width="100%" height={100} className="rounded-card mb-4" />
          <Skeleton width="100%" height={120} className="rounded-card" />
        </View>
      ) : (
        <View className="space-y-4">
          {/* Main Hero Card: Total Micro-Savings */}
          <Card variant="forest" padding="lg" className="shadow-card mb-4">
            <Text className="text-xs font-semibold text-sage-light uppercase tracking-wider font-sans mb-1">
              Total Micro-Savings (All Students)
            </Text>
            <View className="flex-row items-baseline mb-2">
              <Text className="text-3xl font-bold text-white font-sans">
                ₹{formatINR(data?.total_savings)}
              </Text>
              <Text className="text-xs text-sage-light font-sans ml-2">
                accumulated
              </Text>
            </View>
            <Text className="text-xs text-sage-light font-sans leading-relaxed">
              Automated spare-change deposits across all enrolled campus accounts.
            </Text>
          </Card>

          {/* Sub Metrics Grid */}
          <View className="flex-row space-x-3 mb-4">
            <Card variant="default" padding="md" className="flex-1 mr-1.5 shadow-card items-center">
              <View className="w-9 h-9 rounded-full bg-sage-light items-center justify-center mb-2 border border-border">
                <Users size={16} color="#144a32" />
              </View>
              <Text className="text-[11px] font-semibold text-text-muted uppercase tracking-wider font-sans mb-1 text-center">
                Active Savers
              </Text>
              <Text className="text-2xl font-bold text-text-primary font-sans">
                {data?.total_students ?? 0}
              </Text>
            </Card>

            <Card variant="default" padding="md" className="flex-1 ml-1.5 shadow-card items-center">
              <View className="w-9 h-9 rounded-full bg-sage-light items-center justify-center mb-2 border border-border">
                <Coins size={16} color="#144a32" />
              </View>
              <Text className="text-[11px] font-semibold text-text-muted uppercase tracking-wider font-sans mb-1 text-center">
                Avg Savings
              </Text>
              <Text className="text-2xl font-bold text-primary font-sans">
                ₹{formatINR(data?.average_savings_per_student)}
              </Text>
            </Card>
          </View>

          {/* Swipes Activity Card */}
          <Card variant="default" padding="md" className="shadow-card mb-4 flex-row items-center justify-between">
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-full bg-sage-light items-center justify-center mr-3 border border-border">
                <CreditCard size={18} color="#144a32" />
              </View>
              <View>
                <Text className="text-sm font-bold text-text-primary font-sans">
                  Card Swipes Processed
                </Text>
                <Text className="text-xs text-text-muted font-sans mt-0.5">
                  Simulated purchase round-up events
                </Text>
              </View>
            </View>
            <Text className="text-lg font-bold text-text-primary font-sans">
              {data?.total_transactions_processed ?? 0}
            </Text>
          </Card>

          {/* Advisor Oversight Insights Note */}
          <Card variant="peach" padding="md" className="shadow-card mb-4">
            <View className="flex-row items-center mb-2">
              <Sparkles size={16} color="#856529" className="mr-2" />
              <Text className="text-xs font-bold text-text-primary font-sans ml-1">
                Advisor Insights & Curriculum
              </Text>
            </View>
            <Text className="text-xs text-text-secondary font-sans leading-relaxed">
              This portal aggregates automated savings metrics for all student accounts. Students build financial buffers through round-up micro-savings without manual budget strain. If cohort velocity dips, consider pushing targeted curriculum guidance via the AI Quality Oversight tab.
            </Text>
          </Card>
        </View>
      )}
    </ScreenContainer>
  );
};

export default OverviewScreen;
