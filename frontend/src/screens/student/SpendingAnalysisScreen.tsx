import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { ArrowLeft, FileSpreadsheet, Repeat, Sparkles } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../hooks/useAuth";
import { apiService, getErrorMessage, SpendingAnalysis } from "../../services/api";
import {
  ScreenContainer,
  Card,
  ProgressBar,
  Button,
  Skeleton,
  EmptyState,
} from "../../components/ui";

const formatINR = (val: string | number | null | undefined): string =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(val ?? 0));

/**
 * What the student's past spending looks like — built entirely from the
 * transactions they imported. Every figure is computed by the backend
 * (rule_engine.spending_profile); this screen only displays them.
 */
export const SpendingAnalysisScreen = ({ navigation }: { navigation: any }) => {
  const { hasCompletedOnboarding } = useAuth();
  const [analysis, setAnalysis] = useState<SpendingAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingBudgets, setCreatingBudgets] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setAnalysis(await apiService.getSpendingAnalysis());
      setError(null);
    } catch (e: any) {
      setError(getErrorMessage(e, "Couldn't analyse your spending."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleContinue = () => {
    if (hasCompletedOnboarding) {
      navigation.popToTop();
    } else {
      navigation.navigate("CreateGoal");
    }
  };

  const handleCreateBudgets = async () => {
    if (!analysis) return;
    setCreatingBudgets(true);
    let created = 0;
    let skipped = 0;
    try {
      for (const cat of analysis.top_categories) {
        try {
          await apiService.createBudget({
            category: cat.category,
            limit_amount: Number(cat.suggested_budget),
            period: "monthly",
          });
          created += 1;
        } catch (e: any) {
          // 409 = a budget for this category already exists: leave it alone.
          if (e?.response?.status === 409) skipped += 1;
          else throw e;
        }
      }
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // Ignore on web
      }
      Alert.alert(
        "Budgets created",
        `${created} budget${created === 1 ? "" : "s"} created from your typical month` +
          (skipped ? ` (${skipped} already existed and were left as they are).` : ".")
      );
    } catch (e: any) {
      Alert.alert("Couldn't create budgets", getErrorMessage(e));
    } finally {
      setCreatingBudgets(false);
    }
  };

  return (
    <ScreenContainer className="pt-2 pb-8">
      <View className="flex-row items-center justify-between mb-4">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          className="w-10 h-10 rounded-full bg-white border border-border items-center justify-center shadow-card"
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={20} color="#144a32" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-text-primary font-sans">
          Your Spending Habits
        </Text>
        <View className="w-10" />
      </View>

      {loading ? (
        <View className="py-2">
          <Skeleton width="100%" height={150} className="rounded-card mb-4" />
          <Skeleton width="100%" height={220} className="rounded-card mb-4" />
          <Skeleton width="100%" height={120} className="rounded-card" />
        </View>
      ) : error ? (
        <Card variant="peach" padding="md">
          <Text className="text-xs text-text-secondary font-sans mb-2">{error}</Text>
          <TouchableOpacity onPress={load} accessibilityRole="button">
            <Text className="text-xs font-bold text-primary font-sans">Try again</Text>
          </TouchableOpacity>
        </Card>
      ) : !analysis?.has_data ? (
        <Card variant="default" padding="lg" className="shadow-card">
          <EmptyState
            title="No spending history yet"
            description="Import a bank statement (CSV) and Penny Pilot will show where your money goes, which charges repeat, and what round-ups could add up to."
            actionTitle="Import a statement →"
            onAction={() => navigation.navigate("CSVUpload")}
            icon={<FileSpreadsheet size={32} color="#144a32" />}
          />
        </Card>
      ) : (
        <View>
          {/* Overview */}
          <Card variant="forest" padding="lg" className="shadow-card mb-4">
            <Text className="text-xs font-semibold text-sage-light uppercase tracking-wider font-sans mb-1">
              Typical month
            </Text>
            <Text className="text-3xl font-bold text-white font-sans">
              ₹{formatINR(analysis.average_monthly_spend)}
            </Text>
            <Text className="text-xs text-sage-light font-sans mt-0.5">
              average spend · {analysis.months_covered} month
              {analysis.months_covered === 1 ? "" : "s"} of data ·{" "}
              {analysis.transaction_count} transactions
            </Text>

            <View className="flex-row pt-3 mt-3 border-t border-white/10">
              <View className="flex-1 bg-white/10 rounded-xl p-3 mr-1.5">
                <Text className="text-[10px] font-bold text-sage-light uppercase tracking-wider font-sans">
                  Money in
                </Text>
                <Text className="text-base font-bold text-white font-sans mt-0.5">
                  ₹{formatINR(analysis.average_monthly_income)}
                </Text>
              </View>
              <View className="flex-1 bg-white/10 rounded-xl p-3 ml-1.5">
                <Text className="text-[10px] font-bold text-sage-light uppercase tracking-wider font-sans">
                  Left over
                </Text>
                <Text className="text-base font-bold text-gold font-sans mt-0.5">
                  ₹{formatINR(analysis.average_monthly_net)}
                </Text>
              </View>
            </View>
            {analysis.spend_to_income_percent != null && (
              <Text className="text-[11px] text-sage-light font-sans mt-3">
                You spend {formatINR(analysis.spend_to_income_percent)}% of what comes in.
              </Text>
            )}
          </Card>

          {/* Where the money goes */}
          <Card variant="default" padding="md" className="shadow-card mb-4">
            <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans mb-3">
              Where it goes
            </Text>
            {analysis.top_categories.map((cat) => (
              <View key={cat.category} className="mb-3">
                <View className="flex-row justify-between items-center mb-1">
                  <Text className="text-sm font-semibold text-text-primary font-sans">
                    {cat.category}
                  </Text>
                  <Text className="text-xs text-text-secondary font-sans">
                    ₹{formatINR(cat.monthly_average)}/mo · {formatINR(cat.share_percent)}%
                  </Text>
                </View>
                <ProgressBar
                  progress={Number(cat.share_percent)}
                  height={6}
                  fillColor="bg-primary"
                  trackColor="bg-cream"
                />
              </View>
            ))}
            <Button
              title={creatingBudgets ? "Creating…" : "Create budgets from my typical month"}
              variant="secondary"
              onPress={handleCreateBudgets}
              loading={creatingBudgets}
              className="mt-1"
            />
            <Text className="text-[11px] text-text-muted font-sans mt-2">
              Each limit is your monthly average rounded up to the next ₹50.
            </Text>
          </Card>

          {/* Recurring */}
          {analysis.recurring_merchants.length > 0 && (
            <Card variant="default" padding="md" className="shadow-card mb-4">
              <View className="flex-row items-center mb-3">
                <Repeat size={14} color="#144a32" />
                <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans ml-1.5">
                  Charges that repeat
                </Text>
              </View>
              {analysis.recurring_merchants.map((m) => (
                <View
                  key={m.merchant}
                  className="flex-row justify-between items-center py-2 border-b border-border/40"
                >
                  <View className="flex-1 pr-2">
                    <Text className="text-sm font-semibold text-text-primary font-sans">
                      {m.merchant}
                    </Text>
                    <Text className="text-[11px] text-text-muted font-sans">
                      {m.category} · seen in {m.months_seen} months
                    </Text>
                  </View>
                  <Text className="text-sm font-bold text-text-primary font-sans">
                    ₹{formatINR(m.typical_amount)}
                  </Text>
                </View>
              ))}
            </Card>
          )}

          {/* Behaviour + round-up potential */}
          <Card variant="peach" padding="md" className="shadow-card mb-4">
            <View className="flex-row items-center mb-2">
              <Sparkles size={16} color="#856529" />
              <Text className="text-sm font-bold text-text-primary font-sans ml-1.5">
                What round-ups could do
              </Text>
            </View>
            <Text className="text-xs text-text-secondary font-sans leading-relaxed">
              Rounding up every purchase you made would have saved about{" "}
              <Text className="font-bold text-primary">
                ₹{formatINR(analysis.estimated_monthly_roundup)}
              </Text>{" "}
              a month. {formatINR(analysis.weekend_spend_percent)}% of your spending
              happens on weekends
              {analysis.largest_purchase
                ? `, and your biggest purchase was ₹${formatINR(
                    analysis.largest_purchase.amount
                  )} at ${analysis.largest_purchase.merchant}.`
                : "."}
            </Text>
          </Card>

          <Button title="Continue" variant="primary" size="lg" onPress={handleContinue} />
        </View>
      )}
    </ScreenContainer>
  );
};

export default SpendingAnalysisScreen;
