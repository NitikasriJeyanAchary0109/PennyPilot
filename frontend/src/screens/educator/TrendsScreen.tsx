import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { ChartWrapper } from "../../components/ChartWrapper";
import { Card } from "../../components/Card";
import { apiService } from "../../services/api";
import { EducatorTrends } from "../../types";

const truncateLabel = (label: string, maxLen = 8) =>
  label.length > maxLen ? `${label.slice(0, maxLen - 1)}…` : label;

export const TrendsScreen = () => {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<EducatorTrends | null>(null);

  const fetchTrends = async () => {
    try {
      setLoading(true);
      const res = await apiService.getEducatorTrends();
      setData(res);
    } catch (e: any) {
      console.warn("Failed to load educator trends:", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTrends();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchTrends();
  }, []);

  const categoryLabels =
    data?.top_categories_discussed.map((item) =>
      truncateLabel(item.category?.trim() || "Other")
    ) ?? [];
  const categoryCounts = data?.top_categories_discussed.map((item) => item.count) ?? [];

  const summaryLabels = ["Messages", "Round-up"];
  const summaryData = data
    ? [data.total_student_messages_last_30_days, Number(data.average_round_up_amount)]
    : [];

  return (
    <ScrollView
      className="flex-1 bg-surface"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#005bbf" />
      }
    >
      <View className="mb-6">
        <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider">Visual Analytics</Text>
        <Text className="text-on-surface text-2xl font-black">Cohort Trends</Text>
        <Text className="text-on-surface-variant text-xs mt-1">Aggregate metrics only — no individual student data</Text>
      </View>

      {loading && !data ? (
        <View className="flex-1 justify-center items-center py-20">
          <ActivityIndicator size="large" color="#005bbf" />
        </View>
      ) : (
        <>
          <View className="flex-row gap-x-4 mb-2">
            <Card className="flex-1 my-0 py-4 items-center">
              <Text className="text-slate-400 text-xs font-semibold mb-1">Coach Messages (30d)</Text>
              <Text className="text-indigo-400 text-2xl font-black">
                {data?.total_student_messages_last_30_days ?? 0}
              </Text>
            </Card>
            <Card className="flex-1 my-0 py-4 items-center">
              <Text className="text-slate-400 text-xs font-semibold mb-1">Avg Round-up</Text>
              <Text className="text-emerald-400 text-2xl font-black">
                ₹{Number(data?.average_round_up_amount ?? 0).toFixed(2)}
              </Text>
            </Card>
          </View>

          <ChartWrapper
            title="Transaction Volume by Category"
            labels={categoryLabels.length > 0 ? categoryLabels : ["—"]}
            data={categoryCounts.length > 0 ? categoryCounts : [0]}
            type="line"
            suffix=""
          />

          <ChartWrapper
            title="Cohort Activity Summary"
            labels={summaryLabels}
            data={summaryData.length > 0 ? summaryData : [0, 0]}
            type="bar"
            suffix=""
          />
        </>
      )}

      <View className="h-10" />
    </ScrollView>
  );
};

export default TrendsScreen;
