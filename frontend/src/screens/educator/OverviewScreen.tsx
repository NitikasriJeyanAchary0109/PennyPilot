import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator } from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { apiService } from "../../services/api";
import { Card } from "../../components/Card";
import { EducatorAnalytics } from "../../types";

const formatCurrency = (val: string | number | null | undefined): string => {
  if (val === null || val === undefined) return "0.00";
  const num = typeof val === "number" ? val : parseFloat(String(val));
  return isNaN(num) ? "0.00" : num.toFixed(2);
};

export const OverviewScreen = () => {
  const { logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<EducatorAnalytics | null>(null);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await apiService.getEducatorAnalytics();
      setData(res);
    } catch (e: any) {
      console.warn("Failed to load educator analytics:", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAnalytics();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  return (
    <ScrollView
      className="flex-1 bg-surface"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#005bbf" />
      }
    >
      {/* Header */}
      <View className="flex-row justify-between items-center mb-6">
        <View>
          <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider">Advisor Portal</Text>
          <Text className="text-on-surface text-2xl font-black">Educator Dashboard</Text>
        </View>
        <TouchableOpacity
          onPress={logout}
          className="bg-white border border-outline-variant py-2 px-4 rounded-xl"
        >
          <Text className="text-red-400 text-xs font-bold">Logout</Text>
        </TouchableOpacity>
      </View>

      {loading && !data ? (
        <View className="flex-1 justify-center items-center py-20">
          <ActivityIndicator size="large" color="#005bbf" />
        </View>
      ) : (
        <View className="mb-10">
          {/* Main Indicators */}
          <Card className="items-center py-6 mb-4">
            <Text className="text-on-surface-variant text-xs font-semibold mb-1 uppercase tracking-wider">Total Micro-Savings (All Students)</Text>
            <Text className="text-tertiary text-4xl font-black">₹{formatCurrency(data?.total_savings)}</Text>
          </Card>

          <View className="flex-row gap-x-4 mb-4">
            <Card className="flex-1 my-0 py-4 items-center">
              <Text className="text-on-surface-variant text-xs font-semibold mb-1">Active Students</Text>
              <Text className="text-ob-primary text-2xl font-black">{data?.total_students ?? 0}</Text>
            </Card>

            <Card className="flex-1 my-0 py-4 items-center">
              <Text className="text-on-surface-variant text-xs font-semibold mb-1">Average Savings</Text>
              <Text className="text-tertiary text-2xl font-black">₹{formatCurrency(data?.average_savings_per_student)}</Text>
            </Card>
          </View>

          <Card className="items-center py-4 mb-6">
            <Text className="text-on-surface-variant text-xs font-semibold mb-1">Card Swipes Processed</Text>
            <Text className="text-on-surface text-xl font-bold">{data?.total_transactions_processed ?? 0} Swipes</Text>
          </Card>

          {/* Quick Info Box */}
          <Card>
            <Text className="text-on-surface text-base font-bold mb-2">Advisor Insights</Text>
            <Text className="text-on-surface-variant text-xs leading-relaxed">
              This panel aggregates automated savings metrics over all student accounts with `role='student'`.
              Students build financial buffers through round-up micro-savings. If average savings rates decrease,
              consider pushing localized curriculum guidelines via the Financial Literacy tab.
            </Text>
          </Card>
        </View>
      )}
    </ScrollView>
  );
};

export default OverviewScreen;
