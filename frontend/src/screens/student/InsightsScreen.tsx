import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  TrendingUp,
  Sparkles,
  ShieldAlert,
  ArrowRight,
  Activity,
  HeartPulse,
} from "lucide-react-native";
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { apiService } from "../../services/api";
import {
  ScreenContainer,
  Header,
  Card,
  Chip,
  Button,
  Skeleton,
} from "../../components/ui";

export const InsightsScreen = ({ navigation }: { navigation: any }) => {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState<string>("there");
  const [stressSummary, setStressSummary] = useState<string | null>(null);
  const [healthScore, setHealthScore] = useState<number>(85);
  const [stressScore, setStressScore] = useState<number>(20);

  const triggerHaptic = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore on web
    }
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      // Load current user profile for greeting
      const user = await apiService.getCurrentUser();
      if (user?.full_name) {
        const firstName = user.full_name.split(" ")[0];
        setUserName(firstName);
      }

      // Load real stress & wellness meter from backend
      const res = await apiService.getStressMeter(30);
      if (res) {
        setHealthScore(
          res.health_score !== undefined ? Number(res.health_score) : 85
        );
        setStressScore(
          res.stress_score !== undefined ? Number(res.stress_score) : 20
        );
        setStressSummary(res.ai_summary || null);
      }
    } catch (e: any) {
      console.warn("Failed to load insights data:", e?.message);
    } finally {
      setLoading(false);
    }
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
      setHealthScore(
        response.health_score !== undefined ? Number(response.health_score) : 85
      );
      setStressScore(
        response.stress_score !== undefined ? Number(response.stress_score) : 20
      );
      setStressSummary(response.ai_summary);
      Alert.alert(
        "Financial Health Scan Complete",
        response.ai_summary || "No cash flow anomalies detected in the last 30 days."
      );
    } catch (e: any) {
      Alert.alert(
        "Scanner Update",
        e.message || "Failed to contact cash flow health scanner."
      );
    } finally {
      setLoading(false);
    }
  };

  const healthOffset = 94 * (1 - healthScore / 100);
  const stressOffset = 94 * (1 - stressScore / 100);

  return (
    <ScreenContainer
      refreshing={refreshing}
      onRefresh={handleRefresh}
      className="pt-2 pb-8"
    >
      {/* Brand Header */}
      <Header
        title="Insights & Health"
        subtitle={`Hi ${userName}, your financial health overview`}
        showLogo
        showNotification={false}
        className="px-0 mb-4"
      />

      {loading && !stressSummary && healthScore === 85 ? (
        <View className="space-y-4 py-2">
          <Skeleton width="100%" height={160} className="rounded-card mb-4" />
          <Skeleton width="100%" height={180} className="rounded-card mb-4" />
          <Skeleton width="100%" height={120} className="rounded-card" />
        </View>
      ) : (
        <View className="space-y-4">
          {/* Dual Gauges Bento Grid */}
          <View className="flex-row space-x-3 mb-4">
            {/* Wellness Score Card */}
            <TouchableOpacity
              onPress={handleRunScanner}
              activeOpacity={0.8}
              className="flex-1 mr-1.5"
              accessibilityRole="button"
              accessibilityLabel={`Wellness Score: ${healthScore}`}
            >
              <Card variant="default" padding="md" className="items-center shadow-card h-full justify-between">
                <View className="flex-row items-center justify-between w-full mb-1">
                  <Text className="text-[11px] font-bold text-text-secondary uppercase tracking-wider font-sans">
                    Wellness Score
                  </Text>
                  <HeartPulse size={14} color="#144a32" />
                </View>

                {/* Half-Circle Gauge SVG */}
                <View className="w-[110px] h-[55px] overflow-hidden items-center justify-center my-2 relative">
                  <Svg
                    width="110"
                    height="110"
                    viewBox="0 0 100 100"
                    style={{ transform: [{ rotate: "-180deg" }] }}
                  >
                    <Path
                      d="M 20 50 A 30 30 0 0 1 80 50"
                      fill="none"
                      stroke="#e8e4d9"
                      strokeWidth="8"
                    />
                    <Path
                      d="M 20 50 A 30 30 0 0 1 80 50"
                      fill="none"
                      stroke="#144a32"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray="94 94"
                      strokeDashoffset={healthOffset}
                    />
                  </Svg>
                  <View className="absolute bottom-0">
                    <Text className="text-xl font-bold text-primary font-sans">
                      {healthScore}
                    </Text>
                  </View>
                </View>

                <Text className="text-[11px] text-text-muted text-center font-sans mt-1 leading-4">
                  {healthScore >= 80
                    ? "Optimal stability. Low stress."
                    : "Building stability streak."}
                </Text>
              </Card>
            </TouchableOpacity>

            {/* Impulse Monitor Card (Renamed from Regret Meter) */}
            <TouchableOpacity
              onPress={() => {
                triggerHaptic();
                navigation.navigate("SubscriptionNegotiator");
              }}
              activeOpacity={0.8}
              className="flex-1 ml-1.5"
              accessibilityRole="button"
              accessibilityLabel={`Impulse Monitor Score: ${stressScore}`}
            >
              <Card variant="default" padding="md" className="items-center shadow-card h-full justify-between">
                <View className="flex-row items-center justify-between w-full mb-1">
                  <Text className="text-[11px] font-bold text-text-secondary uppercase tracking-wider font-sans">
                    Impulse Monitor
                  </Text>
                  <Activity size={14} color="#a88544" />
                </View>

                {/* Half-Circle Gauge SVG */}
                <View className="w-[110px] h-[55px] overflow-hidden items-center justify-center my-2 relative">
                  <Svg
                    width="110"
                    height="110"
                    viewBox="0 0 100 100"
                    style={{ transform: [{ rotate: "-180deg" }] }}
                  >
                    <Path
                      d="M 20 50 A 30 30 0 0 1 80 50"
                      fill="none"
                      stroke="#e8e4d9"
                      strokeWidth="8"
                    />
                    <Path
                      d="M 20 50 A 30 30 0 0 1 80 50"
                      fill="none"
                      stroke="#a88544"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray="94 94"
                      strokeDashoffset={stressOffset}
                    />
                  </Svg>
                  <View className="absolute bottom-0">
                    <Text className="text-xl font-bold text-gold-ui font-sans">
                      {stressScore}
                    </Text>
                  </View>
                </View>

                <Text className="text-[11px] text-text-muted text-center font-sans mt-1 leading-4">
                  Controlled impulse index. Tap to review subscriptions.
                </Text>
              </Card>
            </TouchableOpacity>
          </View>

          {/* Savings Trend Chart */}
          <Card variant="default" padding="md" className="shadow-card mb-4">
            <View className="flex-row justify-between items-start mb-3">
              <View>
                <Text className="text-sm font-bold text-text-primary font-sans">
                  Savings Growth Trajectory
                </Text>
                <Text className="text-xs text-text-muted font-sans mt-0.5">
                  Micro-deposit accumulation trend
                </Text>
              </View>
              <Chip
                label="Healthy"
                variant="success"
                icon={<TrendingUp size={12} color="#144a32" />}
              />
            </View>

            {/* SVG Trend Line */}
            <View className="w-full h-36 overflow-hidden my-1 justify-end">
              <Svg width="100%" height="100%" viewBox="0 0 400 140" preserveAspectRatio="none">
                <Defs>
                  <LinearGradient id="savingsGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <Stop offset="0%" stopColor="#144a32" stopOpacity="0.25" />
                    <Stop offset="100%" stopColor="#144a32" stopOpacity="0.0" />
                  </LinearGradient>
                </Defs>
                <Path
                  d="M0 140 L0 110 C60 100, 100 120, 160 85 C220 50, 260 70, 320 30 C360 10, 380 15, 400 5 L400 140 Z"
                  fill="url(#savingsGrad)"
                />
                <Path
                  d="M0 110 C60 100, 100 120, 160 85 C220 50, 260 70, 320 30 C360 10, 380 15, 400 5"
                  fill="none"
                  stroke="#144a32"
                  strokeWidth="3"
                />
                <Circle cx="160" cy="85" r="4.5" fill="#144a32" stroke="#ffffff" strokeWidth="2" />
                <Circle cx="320" cy="30" r="4.5" fill="#144a32" stroke="#ffffff" strokeWidth="2" />
                <Circle cx="400" cy="5" r="4.5" fill="#144a32" stroke="#ffffff" strokeWidth="2" />
              </Svg>
            </View>

            <View className="flex-row justify-between mt-2 pt-2 border-t border-border/50 px-1">
              <Text className="text-[10px] text-text-muted font-bold font-sans">Week 1</Text>
              <Text className="text-[10px] text-text-muted font-bold font-sans">Week 2</Text>
              <Text className="text-[10px] text-text-muted font-bold font-sans">Week 3</Text>
              <Text className="text-[10px] text-text-muted font-bold font-sans">Week 4</Text>
            </View>
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
          <View className="flex-row space-x-3">
            <TouchableOpacity
              onPress={() => {
                triggerHaptic();
                navigation.navigate("SubscriptionNegotiator");
              }}
              activeOpacity={0.8}
              className="flex-1 mr-1.5 p-3 rounded-2xl bg-white border border-border items-center shadow-card flex-row justify-center"
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
              className="flex-1 ml-1.5 p-3 rounded-2xl bg-white border border-border items-center shadow-card flex-row justify-center"
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
