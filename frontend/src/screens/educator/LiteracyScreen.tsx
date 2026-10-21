import React, { useState, useEffect, useCallback } from "react";
import { View, Text } from "react-native";
import {
  GraduationCap,
  Sparkles,
  Bot,
  MessageSquareQuote,
  Clock,
} from "lucide-react-native";
import { apiService } from "../../services/api";
import { AIInsight } from "../../types";
import {
  ScreenContainer,
  Header,
  Card,
  Chip,
  Skeleton,
  EmptyState,
} from "../../components/ui";

export const LiteracyScreen = () => {
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadInsights = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiService.getEducatorAnalytics();
      setInsights(res?.recent_insights || []);
    } catch (e: any) {
      console.warn("Failed to load insights for auditor:", e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadInsights();
    setRefreshing(false);
  };

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  return (
    <ScreenContainer
      refreshing={refreshing}
      onRefresh={handleRefresh}
      className="pt-2 pb-8"
    >
      <Header
        title="AI Quality Oversight"
        subtitle="Monitor AI explanations generated for students"
        showLogo
        showNotification={false}
        className="px-0 mb-4"
      />

      {/* Oversight Guidance Card */}
      <Card variant="peach" padding="md" className="shadow-card mb-4">
        <View className="flex-row items-center mb-1.5">
          <Sparkles size={16} color="#856529" className="mr-2" />
          <Text className="text-xs font-bold text-text-primary font-sans ml-1">
            Advisor Audit Protocol
          </Text>
        </View>
        <Text className="text-xs text-text-secondary font-sans leading-relaxed">
          Review student interactions with the AI financial coach and wealth advisor. Use this audit log to ensure recommendations strictly adhere to institutional policy and deterministic rules.
        </Text>
      </Card>

      <View className="mb-2">
        <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans mb-3">
          Recent Student AI Dialogues
        </Text>

        {loading && insights.length === 0 ? (
          <View className="space-y-3 py-2">
            <Skeleton width="100%" height={110} className="rounded-card mb-3" />
            <Skeleton width="100%" height={110} className="rounded-card mb-3" />
            <Skeleton width="100%" height={110} className="rounded-card" />
          </View>
        ) : insights.length === 0 ? (
          <Card variant="default" padding="lg" className="items-center shadow-card my-4">
            <EmptyState
              title="No student dialogues yet"
              description="When students query their AI Coach or Wealth Advisor, conversation logs will appear here for quality review."
              icon={<GraduationCap size={32} color="#144a32" />}
            />
          </Card>
        ) : (
          <View className="space-y-3">
            {insights.map((ins) => {
              const dateStr = ins.created_at
                ? new Date(ins.created_at).toLocaleDateString("en-IN", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";

              return (
                <Card
                  key={ins.chat_id}
                  variant="default"
                  padding="md"
                  className="shadow-card mb-3"
                >
                  <View className="flex-row items-start justify-between mb-2">
                    <View className="flex-row items-center flex-1 mr-2">
                      <View className="w-7 h-7 rounded-full bg-sage-light items-center justify-center mr-2 border border-border">
                        <Bot size={14} color="#144a32" />
                      </View>
                      <Text
                        className="text-xs font-bold text-primary font-sans flex-1"
                        numberOfLines={2}
                      >
                        Q: {ins.question}
                      </Text>
                    </View>

                    {dateStr ? (
                      <View className="flex-row items-center">
                        <Clock size={11} color="#666e69" />
                        <Text className="text-[10px] text-text-muted font-sans ml-1">
                          {dateStr}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View className="bg-cream p-3 rounded-xl border border-border/60 mt-1">
                    <Text className="text-xs text-text-primary font-sans leading-relaxed italic">
                      "{ins.response}"
                    </Text>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </View>
    </ScreenContainer>
  );
};

export default LiteracyScreen;
