import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { MessageSquare, Coins, TrendingUp } from "lucide-react-native";
import { ChartWrapper } from "../../components/ChartWrapper";
import { apiService } from "../../services/api";
import { EducatorTrends } from "../../types";
import { ScreenContainer, Header, Card, Skeleton } from "../../components/ui";

const truncateLabel = (label: string, maxLen = 8) =>
  label.length > maxLen ? `${label.slice(0, maxLen - 1)}…` : label;

export const TrendsScreen = () => {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<EducatorTrends | null>(null);

  const fetchTrends = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiService.getEducatorTrends();
      setData(res);
    } catch (e: any) {
      console.warn("Failed to load educator trends:", e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTrends();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchTrends();
  }, [fetchTrends]);

  const formatINR = (val: number | string | null | undefined): string => {
    const num = typeof val === "number" ? val : parseFloat(String(val || 0));
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(isNaN(num) ? 0 : num);
  };

  const categoryLabels =
    data?.top_categories_discussed?.map((item) =>
      truncateLabel(item.category?.trim() || "Other")
    ) ?? [];
  const categoryCounts =
    data?.top_categories_discussed?.map((item) => item.count) ?? [];

  const summaryLabels = ["Messages", "Round-up"];
  const summaryData = data
    ? [data.total_student_messages_last_30_days, Number(data.average_round_up_amount)]
    : [];

  return (
    <ScreenContainer
      refreshing={refreshing}
      onRefresh={handleRefresh}
      className="pt-2 pb-8"
    >
      <Header
        title="Cohort Trends"
        subtitle="Aggregate metrics only — no individual student data"
        showLogo
        showNotification={false}
        className="px-0 mb-4"
      />

      {loading && !data ? (
        <View className="space-y-4 py-4">
          <Skeleton width="100%" height={100} className="rounded-card mb-4" />
          <Skeleton width="100%" height={220} className="rounded-card mb-4" />
          <Skeleton width="100%" height={220} className="rounded-card" />
        </View>
      ) : (
        <View className="space-y-4">
          {/* Top KPI Metrics Row */}
          <View className="flex-row space-x-3 mb-4">
            <Card variant="default" padding="md" className="flex-1 mr-1.5 shadow-card items-center">
              <View className="w-9 h-9 rounded-full bg-sage-light items-center justify-center mb-2 border border-border">
                <MessageSquare size={16} color="#144a32" />
              </View>
              <Text className="text-[11px] font-semibold text-text-muted uppercase tracking-wider font-sans mb-1 text-center">
                Coach Messages (30d)
              </Text>
              <Text className="text-2xl font-bold text-text-primary font-sans">
                {data?.total_student_messages_last_30_days ?? 0}
              </Text>
            </Card>

            <Card variant="default" padding="md" className="flex-1 ml-1.5 shadow-card items-center">
              <View className="w-9 h-9 rounded-full bg-sage-light items-center justify-center mb-2 border border-border">
                <Coins size={16} color="#144a32" />
              </View>
              <Text className="text-[11px] font-semibold text-text-muted uppercase tracking-wider font-sans mb-1 text-center">
                Avg Round-up
              </Text>
              <Text className="text-2xl font-bold text-primary font-sans">
                ₹{formatINR(data?.average_round_up_amount)}
              </Text>
            </Card>
          </View>

          {/* Visual Category Trends */}
          <View className="mb-4">
            <ChartWrapper
              title="Transaction Volume by Category"
              labels={categoryLabels.length > 0 ? categoryLabels : ["—"]}
              data={categoryCounts.length > 0 ? categoryCounts : [0]}
              type="line"
              suffix=""
            />
          </View>

          {/* Cohort Activity Summary */}
          <View className="mb-4">
            <ChartWrapper
              title="Cohort Activity Summary"
              labels={summaryLabels}
              data={summaryData.length > 0 ? summaryData : [0, 0]}
              type="bar"
              suffix=""
            />
          </View>
        </View>
      )}
    </ScreenContainer>
  );
};

export default TrendsScreen;
