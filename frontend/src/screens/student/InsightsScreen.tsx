import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  Sparkles,
  ShieldAlert,
  ArrowRight,
  Activity,
  HeartPulse,
} from "lucide-react-native";
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { apiService, getErrorMessage } from "../../services/api";
import {
  ScreenContainer,
  Header,
  Card,
  Skeleton,
} from "../../components/ui";

interface TrendWeek {
  week_start: string;
  saved: number;
}

const CHART_W = 400;
const CHART_H = 140;
const CHART_PAD = 12;

// Wording for a 0-100 wellness score (the score itself comes from the backend).
const describeHealth = (score: number): string => {
  if (score >= 80) return "Looking healthy.";
  if (score >= 50) return "Some room to improve.";
  return "Needs attention.";
};

export const InsightsScreen = ({ navigation }: { navigation: any }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState<string>("");
  const [stressSummary, setStressSummary] = useState<string | null>(null);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [stressScore, setStressScore] = useState<number | null>(null);
  const [trend, setTrend] = useState<TrendWeek[] | null>(null);
  const [trendTotal, setTrendTotal] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const triggerHaptic = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore on web
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    const [user, wellness, savingsTrend] = await Promise.allSettled([
      apiService.getCurrentUser(),
      apiService.getStressMeter(30),
      apiService.getSavingsTrend(4),
    ]);

    if (user.status === "fulfilled" && user.value?.full_name) {
      setUserName(user.value.full_name.split(" ")[0]);
    }

    if (wellness.status === "fulfilled") {
      const res = wellness.value;
      setHealthScore(Number(res.health_score));
      setStressScore(Number(res.stress_score));
      setStressSummary(res.ai_summary || null);
      setError(null);
    } else {
      setHealthScore(null);
      setStressScore(null);
      setStressSummary(null);
      setError(getErrorMessage(wellness.reason, "Couldn't load your wellness score."));
    }

    if (savingsTrend.status === "fulfilled") {
      setTrend(
        savingsTrend.value.weeks.map((w) => ({
          week_start: w.week_start,
          saved: Number(w.saved),
        }))
      );
      setTrendTotal(Number(savingsTrend.value.total));
    } else {
      setTrend(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleRunScanner = async () => {
    triggerHaptic();
    setLoading(true);
    try {
      const response = await apiService.getStressMeter(30);
      setHealthScore(Number(response.health_score));
      setStressScore(Number(response.stress_score));
      setStressSummary(response.ai_summary || null);
      setError(null);
      Alert.alert(
        "Financial health updated",
        response.ai_summary || `Your wellness score is ${response.health_score}/100.`
      );
    } catch (e: any) {
      Alert.alert("Couldn't update", getErrorMessage(e, "Failed to refresh your wellness score."));
    } finally {
      setLoading(false);
    }
  };

  // Chart geometry: backend supplies the weekly amounts; this only maps them to pixels.
  const chartPoints = (trend || []).map((w, i, arr) => {
    const maxSaved = Math.max(...arr.map((x) => x.saved), 1);
    const x = arr.length > 1 ? (i / (arr.length - 1)) * CHART_W : CHART_W / 2;
    const y = CHART_H - CHART_PAD - (Math.max(w.saved, 0) / maxSaved) * (CHART_H - 2 * CHART_PAD);
    return { x, y };
  });
  const linePath = chartPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  const areaPath = chartPoints.length
    ? `${linePath} L${chartPoints[chartPoints.length - 1].x} ${CHART_H} L${chartPoints[0].x} ${CHART_H} Z`
    : "";
  const hasTrendData = Boolean(trend && trend.some((w) => w.saved > 0));

  const formatINR = (val: number): string =>
    new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(val);

  const GAUGE_CIRCUMFERENCE = 119.4;
  const healthOffset =
    GAUGE_CIRCUMFERENCE * (1 - Math.min(Math.max(healthScore ?? 0, 0), 100) / 100);
  const stressOffset =
    GAUGE_CIRCUMFERENCE * (1 - Math.min(Math.max(stressScore ?? 0, 0), 100) / 100);

  return (
    <ScreenContainer
      refreshing={refreshing}
      onRefresh={handleRefresh}
      className="pt-2 pb-8"
    >
      {/* Brand Header */}
      <Header
        title="Insights & Health"
        subtitle={
          userName
            ? `Hi ${userName}, your financial health overview`
            : "Your financial health overview"
        }
        showLogo
        showNotification={false}
        className="px-0 mb-4"
      />

      {loading && healthScore === null && !error ? (
        <View className="space-y-4 py-2">
          <Skeleton width="100%" height={160} className="rounded-card mb-4" />
          <Skeleton width="100%" height={180} className="rounded-card mb-4" />
          <Skeleton width="100%" height={120} className="rounded-card" />
        </View>
      ) : (
        <View className="space-y-4">
          {error && (
            <Card variant="peach" padding="md" className="mb-4">
              <Text className="text-xs text-text-secondary font-sans mb-2">{error}</Text>
              <TouchableOpacity
                onPress={loadData}
                accessibilityRole="button"
                accessibilityLabel="Retry loading wellness score"
              >
                <Text className="text-xs font-bold text-primary font-sans">Try again</Text>
              </TouchableOpacity>
            </Card>
          )}

          {/* Dual Gauges Bento Grid */}
          <View className="flex-row gap-3 mb-4">
            {/* Wellness Score Card */}
            <TouchableOpacity
              onPress={handleRunScanner}
              activeOpacity={0.8}
              className="flex-1"
              accessibilityRole="button"
              accessibilityLabel={`Wellness Score: ${healthScore ?? "unavailable"}`}
            >
              <Card variant="default" padding="md" className="shadow-card h-full justify-between">
                <View className="flex-row items-center justify-between w-full mb-2">
                  <Text
                    className="text-[11px] font-bold text-text-secondary uppercase tracking-wider font-sans flex-1 mr-1"
                    numberOfLines={1}
                  >
                    Wellness Score
                  </Text>
                  <HeartPulse size={15} color="#144a32" />
                </View>

                {/* Clean Arch Gauge SVG */}
                <View className="w-full items-center justify-center my-1 relative">
                  <Svg width={110} height={58} viewBox="0 0 100 52">
                    <Path
                      d="M 12 46 A 38 38 0 0 1 88 46"
                      fill="none"
                      stroke="#e8e4d9"
                      strokeWidth="7"
                      strokeLinecap="round"
                    />
                    <Path
                      d="M 12 46 A 38 38 0 0 1 88 46"
                      fill="none"
                      stroke="#144a32"
                      strokeWidth="7"
                      strokeLinecap="round"
                      strokeDasharray={`${GAUGE_CIRCUMFERENCE} ${GAUGE_CIRCUMFERENCE}`}
                      strokeDashoffset={healthOffset}
                    />
                  </Svg>
                  <View className="absolute bottom-0 items-center justify-center">
                    <Text className="text-xl font-bold text-primary font-sans">
                      {healthScore ?? "--"}
                    </Text>
                  </View>
                </View>

                <Text className="text-[11px] text-text-muted text-center font-sans mt-2 leading-4">
                  {healthScore === null ? "Not available right now." : describeHealth(healthScore)}
                </Text>
              </Card>
            </TouchableOpacity>

            {/* Impulse Monitor Card */}
            <TouchableOpacity
              onPress={() => {
                triggerHaptic();
                navigation.navigate("SubscriptionNegotiator");
              }}
              activeOpacity={0.8}
              className="flex-1"
              accessibilityRole="button"
              accessibilityLabel={`Stress Index: ${stressScore ?? "unavailable"}`}
            >
              <Card variant="default" padding="md" className="shadow-card h-full justify-between">
                <View className="flex-row items-center justify-between w-full mb-2">
                  <Text
                    className="text-[11px] font-bold text-text-secondary uppercase tracking-wider font-sans flex-1 mr-1"
                    numberOfLines={1}
                  >
                    Stress Index
                  </Text>
                  <Activity size={15} color="#a88544" />
                </View>

                {/* Clean Arch Gauge SVG */}
                <View className="w-full items-center justify-center my-1 relative">
                  <Svg width={110} height={58} viewBox="0 0 100 52">
                    <Path
                      d="M 12 46 A 38 38 0 0 1 88 46"
                      fill="none"
                      stroke="#e8e4d9"
                      strokeWidth="7"
                      strokeLinecap="round"
                    />
                    <Path
                      d="M 12 46 A 38 38 0 0 1 88 46"
                      fill="none"
                      stroke="#a88544"
                      strokeWidth="7"
                      strokeLinecap="round"
                      strokeDasharray={`${GAUGE_CIRCUMFERENCE} ${GAUGE_CIRCUMFERENCE}`}
                      strokeDashoffset={stressOffset}
                    />
                  </Svg>
                  <View className="absolute bottom-0 items-center justify-center">
                    <Text className="text-xl font-bold text-gold-ui font-sans">
                      {stressScore ?? "--"}
                    </Text>
                  </View>
                </View>

                <Text className="text-[11px] text-text-muted text-center font-sans mt-2 leading-4">
                  Lower is better. Tap to review subscriptions.
                </Text>
              </Card>
            </TouchableOpacity>
          </View>

          {/* Savings Trend Chart (weekly totals computed by the backend) */}
          <Card variant="default" padding="md" className="shadow-card mb-4">
            <View className="flex-row justify-between items-start mb-3">
              <View className="flex-1 mr-2">
                <Text className="text-sm font-bold text-text-primary font-sans">
                  Savings Growth Trajectory
                </Text>
                <Text className="text-xs text-text-muted font-sans mt-0.5">
                  {trend
                    ? `₹${formatINR(trendTotal)} saved over the last 4 weeks`
                    : "Weekly savings"}
                </Text>
              </View>
            </View>

            {trend === null ? (
              <Text className="text-xs text-text-muted italic font-sans py-6 text-center">
                Couldn't load your savings history. Pull down to retry.
              </Text>
            ) : !hasTrendData ? (
              <Text className="text-xs text-text-muted italic font-sans py-6 text-center">
                No savings recorded in the last 4 weeks yet. Round-ups and manual
                deposits will show up here.
              </Text>
            ) : (
              <>
                <View className="w-full h-36 overflow-hidden my-1 justify-end">
                  <Svg
                    width="100%"
                    height="100%"
                    viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                    preserveAspectRatio="none"
                  >
                    <Defs>
                      <LinearGradient id="savingsGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <Stop offset="0%" stopColor="#144a32" stopOpacity="0.25" />
                        <Stop offset="100%" stopColor="#144a32" stopOpacity="0.0" />
                      </LinearGradient>
                    </Defs>
                    <Path d={areaPath} fill="url(#savingsGrad)" />
                    <Path d={linePath} fill="none" stroke="#144a32" strokeWidth="3" />
                    {chartPoints.map((p, i) => (
                      <Circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r="4.5"
                        fill="#144a32"
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                    ))}
                  </Svg>
                </View>

                <View className="flex-row justify-between mt-3 pt-2.5 border-t border-border/50 px-2">
                  {(trend || []).map((w) => (
                    <View key={w.week_start} className="items-center">
                      <Text className="text-[10px] text-text-muted font-bold font-sans">
                        {new Date(w.week_start).toLocaleDateString("en-IN", {
                          month: "short",
                          day: "numeric",
                        })}
                      </Text>
                      <Text className="text-[10px] text-text-secondary font-sans">
                        ₹{formatINR(w.saved)}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </Card>

          {/* AI Cash Flow Narrative Card */}
          {stressSummary && (
            <Card variant="peach" padding="md" className="shadow-card mb-4">
              <View className="flex-row items-center mb-2">
                <Sparkles size={16} color="#856529" className="mr-2" />
                <Text className="text-xs font-bold text-text-primary font-sans ml-1">
                  Cash Flow Diagnostic
                </Text>
              </View>
              <Text className="text-xs text-text-secondary font-sans leading-relaxed">
                {stressSummary}
              </Text>
            </Card>
          )}

          {/* Action Row */}
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => {
                triggerHaptic();
                navigation.navigate("SubscriptionNegotiator");
              }}
              activeOpacity={0.8}
              className="flex-1 p-3 rounded-2xl bg-white border border-border items-center shadow-card flex-row justify-center"
              accessibilityRole="button"
              accessibilityLabel="Subscription Negotiator"
            >
              <Text className="text-xs font-bold text-primary font-sans mr-1">
                Pause Subscriptions
              </Text>
              <ArrowRight size={14} color="#144a32" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                triggerHaptic();
                navigation.navigate("EmergencyWithdrawal");
              }}
              activeOpacity={0.8}
              className="flex-1 p-3 rounded-2xl bg-white border border-border items-center shadow-card flex-row justify-center"
              accessibilityRole="button"
              accessibilityLabel="Emergency Safety Net"
            >
              <ShieldAlert size={14} color="#b3261e" className="mr-1" />
              <Text className="text-xs font-bold text-danger font-sans ml-1">
                Emergency Net
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScreenContainer>
  );
};

export default InsightsScreen;
