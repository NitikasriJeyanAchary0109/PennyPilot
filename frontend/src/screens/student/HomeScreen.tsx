import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { ShoppingCart, ChevronRight, ArrowRight } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../hooks/useAuth";
import { useIsFocused } from "@react-navigation/native";
import { apiService } from "../../services/api";
import {
  ScreenContainer,
  Header,
  Card,
  Input,
  Button,
  Chip,
  ListItem,
  ProgressBar,
  Skeleton,
  PottedPlantIcon,
} from "../../components/ui";
import { Transaction } from "../../types";

const DEFAULT_CATEGORIES = ["Food", "Education", "Transport", "Shopping", "More"];

export const HomeScreen = ({ navigation }: { navigation: any }) => {
  const { logout } = useAuth();
  const isFocused = useIsFocused();

  const triggerHaptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    try {
      Haptics.impactAsync(style);
    } catch {
      // Ignore haptics error on web
    }
  };

  // User info state
  const [userName, setUserName] = useState<string>("Student");

  // Loading & refresh states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Backend stats states (zero client-side math)
  const [totalSaved, setTotalSaved] = useState<number | null>(null);
  const [roundupCount, setRoundupCount] = useState<number | null>(null);
  const [activeGoal, setActiveGoal] = useState<{
    goal_id: number;
    goal_name: string;
    saved: number;
    target: number;
    progress_percentage?: number;
  } | null>(null);
  const [goalsLoading, setGoalsLoading] = useState(true);

  // Transactions state
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Simulation form states
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [logLoading, setLogLoading] = useState(false);

  // Roundup alert modal / banner state
  const [roundupAlert, setRoundupAlert] = useState<{
    amount: number;
    newGoalAmount?: number;
    explanation?: string;
  } | null>(null);

  // Load user profile name
  const loadUser = useCallback(async () => {
    try {
      const user = await apiService.getCurrentUser();
      if (user && user.full_name) {
        const firstName = user.full_name.trim().split(" ")[0];
        setUserName(firstName);
      }
    } catch {
      // Fallback to default
    }
  }, []);

  // Load stats, goals, transactions & categories from backend
  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Fetch round-up stats from backend
      try {
        const stats = await apiService.getRoundupStats();
        if (stats && stats.total_saved !== undefined) {
          setTotalSaved(Number(stats.total_saved));
          setRoundupCount(Number(stats.roundup_transactions_count || 0));
        } else {
          setTotalSaved(0);
          setRoundupCount(0);
        }
      } catch (err) {
        console.warn("Failed to load roundup stats:", err);
        setTotalSaved(0);
        setRoundupCount(0);
      }

      // 2. Fetch goals from backend (zero client-side math)
      setGoalsLoading(true);
      try {
        const goalsList = await apiService.getGoals();
        if (Array.isArray(goalsList) && goalsList.length > 0) {
          const firstGoal = goalsList[0];
          // Retrieve detailed goal including backend-calculated progress_percentage
          try {
            const detail = await apiService.getGoalById(firstGoal.goal_id);
            setActiveGoal({
              goal_id: detail.goal_id,
              goal_name: detail.goal_name,
              saved: detail.saved,
              target: detail.target,
              progress_percentage: detail.progress_percentage,
            });
          } catch {
            setActiveGoal({
              goal_id: firstGoal.goal_id,
              goal_name: firstGoal.goal_name,
              saved: firstGoal.saved,
              target: firstGoal.target,
            });
          }
        } else {
          setActiveGoal(null);
        }
      } catch (err) {
        console.warn("Failed to load goals:", err);
      } finally {
        setGoalsLoading(false);
      }

      // 3. Fetch recent transactions
      try {
        const txs = await apiService.getTransactions();
        if (Array.isArray(txs)) {
          setTransactions(txs.slice(0, 5));
        }
      } catch (err) {
        console.warn("Failed to load transactions:", err);
      }

      // 4. Fetch dynamic categories from user's budgets if available
      try {
        const budgets = await apiService.getBudgets();
        if (Array.isArray(budgets) && budgets.length > 0) {
          const uniqueCats = Array.from(new Set(budgets.map((b: any) => b.category)));
          if (uniqueCats.length > 0) {
            setCategories(uniqueCats);
            if (!uniqueCats.includes(category)) {
              setCategory(uniqueCats[0]);
            }
          }
        }
      } catch {
        // Keep DEFAULT_CATEGORIES
      }
    } catch (e: any) {
      console.warn("Failed to load dashboard data:", e?.message);
    } finally {
      setLoading(false);
    }
  }, [category]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadUser(), loadDashboardData()]);
    setRefreshing(false);
  };

  useEffect(() => {
    loadUser();
    loadDashboardData();
  }, [loadUser, loadDashboardData]);

  // Refetch when returning to screen
  useEffect(() => {
    if (isFocused) {
      loadDashboardData();
    }
  }, [isFocused, loadDashboardData]);

  // Handle transaction simulation & backend round-up calculation
  const handleLogTransaction = async () => {
    if (!desc.trim()) {
      Alert.alert("Missing description", "Please enter a store or item name.");
      return;
    }

    const numericAmount = parseFloat(amount.trim());
    if (isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid positive amount in ₹.");
      return;
    }

    setLogLoading(true);
    try {
      const response = await apiService.createTransaction({
        description: desc.trim(),
        amount: numericAmount,
        category: category,
        merchant: desc.trim(),
        type: "debit",
      });

      triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

      if (response.roundup_applied && response.roundup_details?.success) {
        const amt = Number(response.roundup_details.roundup_amount || 0);
        const explanation = response.roundup_details.explanation;
        const newGoalAmt = response.roundup_details.new_goal_amount !== undefined
          ? Number(response.roundup_details.new_goal_amount)
          : undefined;

        setRoundupAlert({
          amount: amt,
          newGoalAmount: newGoalAmt,
          explanation: explanation,
        });
      } else {
        Alert.alert(
          "Transaction Logged",
          "Transaction logged successfully. No round-up was applied to this purchase."
        );
      }

      // Reset input form
      setDesc("");
      setAmount("");

      // Refresh stats from backend to update totals without client-side calculation
      await loadDashboardData();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to log transaction.");
    } finally {
      setLogLoading(false);
    }
  };

  // Helper formatting for currency (zero arithmetic, string formatting only)
  const formatINR = (val: number | null | undefined): string => {
    if (val === null || val === undefined) return "--";
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
      {/* Top Header with Brand and Notification Bell */}
      <Header
        title={`Good morning, ${userName} 👋`}
        subtitle="Micro-savings active"
        showLogo
        showNotification
        hasUnreadNotifications={true}
        onNotificationPress={() => navigation.navigate("Notifications")}
        className="px-0 mb-2"
      />

      {/* Main Stats Card: Total Auto-Saved & Active Goal */}
      <Card variant="default" padding="none" className="mb-4 shadow-card-elevated">
        <View className="p-4.5 bg-surface">
          {/* Top Row: Total Auto-Saved with Plant Motif */}
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                Total Auto-Saved
              </Text>
              {loading && totalSaved === null ? (
                <Skeleton width={130} height={32} className="my-1" />
              ) : (
                <Text className="text-3xl font-extrabold text-primary font-sans tracking-tight">
                  ₹{formatINR(totalSaved)}
                </Text>
              )}
              <Text className="text-xs text-text-muted mt-1 font-sans">
                {roundupCount !== null
                  ? `From ${roundupCount} round-ups`
                  : "Calculating round-ups..."}
              </Text>
            </View>

            {/* Plant Motif Illustration */}
            <View className="w-14 h-14 rounded-full bg-sage-light items-center justify-center border border-border">
              <PottedPlantIcon size={34} />
            </View>
          </View>

          {/* Goal Progress Section */}
          <View className="mt-4 pt-3.5 border-t border-border-light">
            {goalsLoading ? (
              <View className="py-2">
                <Skeleton width="60%" height={14} className="mb-2" />
                <Skeleton width="100%" height={8} className="rounded-full" />
              </View>
            ) : activeGoal ? (
              <View>
                <View className="flex-row justify-between items-center mb-1.5">
                  <View className="flex-row items-center flex-1 pr-2">
                    <Text
                      className="text-xs font-bold text-text-primary font-sans"
                      numberOfLines={1}
                    >
                      🎯 {activeGoal.goal_name}
                    </Text>
                  </View>
                  <Text className="text-xs font-semibold text-text-secondary font-sans">
                    ₹{formatINR(activeGoal.saved)} / ₹{formatINR(activeGoal.target)}
                  </Text>
                </View>

                {/* Progress bar uses backend progress_percentage (never computed client-side) */}
                {activeGoal.progress_percentage !== undefined ? (
                  <View className="mt-1">
                    <ProgressBar
                      progress={activeGoal.progress_percentage}
                      height={7}
                      fillColor="bg-primary"
                      trackColor="bg-cream"
                    />
                    <View className="flex-row justify-between items-center mt-1">
                      <Text className="text-[11px] text-text-muted font-medium">
                        Goal progress
                      </Text>
                      <Text className="text-[11px] font-bold text-primary">
                        {Math.round(activeGoal.progress_percentage)}%
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Skeleton width="100%" height={7} className="mt-1 rounded-full" />
                )}
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => navigation.navigate("GoalCreation")}
                className="flex-row items-center justify-between py-1"
                accessibilityRole="button"
                accessibilityLabel="Set your first savings goal"
              >
                <View>
                  <Text className="text-xs font-bold text-primary">
                    + Set your first savings goal
                  </Text>
                  <Text className="text-[11px] text-text-muted mt-0.5">
                    Connect round-ups directly to what you care about
                  </Text>
                </View>
                <ChevronRight size={16} color="#144a32" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Card>

      {/* AI Roundup Alert Banner (Displays after purchase simulation) */}
      {roundupAlert && (
        <Card variant="sage" padding="md" className="mb-4">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xs font-bold text-primary tracking-wide">
              🎉 Micro-savings automated!
            </Text>
            <TouchableOpacity
              onPress={() => setRoundupAlert(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text className="text-xs font-semibold text-text-secondary">
                Dismiss
              </Text>
            </TouchableOpacity>
          </View>

          <Text className="text-2xl font-black text-primary font-sans mb-1">
            +₹{formatINR(roundupAlert.amount)}
          </Text>

          {/* New goal amount strictly from backend */}
          {roundupAlert.newGoalAmount !== undefined && (
            <Text className="text-xs font-bold text-text-primary mb-1">
              New Goal Balance: ₹{formatINR(roundupAlert.newGoalAmount)}
            </Text>
          )}

          {roundupAlert.explanation && (
            <Text className="text-xs text-text-secondary italic mt-1 font-sans">
              "{roundupAlert.explanation}"
            </Text>
          )}
        </Card>
      )}

      {/* Peach AI Nudge Card */}
      <TouchableOpacity
        onPress={() => {
          triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
          navigation.navigate("SubscriptionNegotiator");
        }}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Thinking of buying something? Pause and see how it fits your goals."
        className="mb-4"
      >
        <Card variant="nudge" padding="md" className="flex-row items-center justify-between">
          <View className="w-10 h-10 rounded-full bg-nudge-border/50 items-center justify-center mr-3">
            <ShoppingCart size={18} color="#9a3412" />
          </View>
          <View className="flex-1 pr-2">
            <Text className="text-xs font-bold text-nudge-text font-sans uppercase tracking-wider">
              Thinking of buying something?
            </Text>
            <Text className="text-xs text-text font-medium mt-0.5">
              Pause and see how it fits your goals. →
            </Text>
          </View>
          <ChevronRight size={18} color="#9a3412" />
        </Card>
      </TouchableOpacity>

      {/* Simulate Card Swipe / Purchase Card */}
      <Card variant="default" padding="lg" className="mb-4 shadow-card">
        <View className="mb-3.5">
          <Text className="text-base font-bold text-text-primary font-sans">
            Simulate card swipe / purchase
          </Text>
          <Text className="text-xs text-text-muted mt-0.5">
            Test how Penny Pilot rounds up your daily campus spending
          </Text>
        </View>

        {/* Store / Item input */}
        <Input
          label="Store / Item"
          placeholder="e.g. Campus Coffee, Bookstore, Canteen"
          value={desc}
          onChangeText={setDesc}
          autoCapitalize="sentences"
          required
        />

        {/* Amount input strictly in INR */}
        <Input
          label="Amount (₹)"
          placeholder="e.g. 185.00"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          required
          helperText="All amounts processed strictly in Indian Rupees (₹)"
        />

        {/* Dynamic Category Chips */}
        <View className="mb-4">
          <Text className="text-xs font-semibold text-text-primary tracking-wide mb-2">
            Category
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {categories.map((cat) => (
              <Chip
                key={cat}
                label={cat}
                category={cat}
                selected={category === cat}
                onPress={() => {
                  triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
                  setCategory(cat);
                }}
              />
            ))}
          </View>
        </View>

        {/* Primary CTA */}
        <Button
          title="Show round-up & new balance →"
          variant="primary"
          onPress={handleLogTransaction}
          loading={logLoading}
        />
      </Card>

      {/* Recent Purchases List */}
      <Card variant="default" padding="md" className="mb-6 shadow-card">
        <View className="flex-row items-center justify-between pb-2 mb-1 border-b border-border-light">
          <Text className="text-base font-bold text-text-primary font-sans">
            Recent Transactions
          </Text>
          <TouchableOpacity
            onPress={() => {
              triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("RoundupTracker");
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="flex-row items-center"
            accessibilityRole="button"
            accessibilityLabel="See all transactions"
          >
            <Text className="text-xs font-bold text-primary mr-0.5">
              See all
            </Text>
            <ArrowRight size={13} color="#144a32" />
          </TouchableOpacity>
        </View>

        {loading && transactions.length === 0 ? (
          <View className="py-4">
            <Skeleton width="100%" height={44} className="mb-2" />
            <Skeleton width="100%" height={44} className="mb-2" />
            <Skeleton width="100%" height={44} />
          </View>
        ) : transactions.length === 0 ? (
          <View className="py-6 items-center justify-center">
            <Text className="text-xs text-text-muted italic text-center">
              No recent swipes. Try logging a purchase above!
            </Text>
          </View>
        ) : (
          transactions.map((t, idx) => {
            const dateStr = t.date
              ? new Date(t.date).toLocaleDateString("en-IN", {
                  month: "short",
                  day: "numeric",
                })
              : "Recent";

            return (
              <ListItem
                key={t.trans_id || idx}
                title={t.merchant || t.description || "Purchase"}
                subtitle={`${t.category || "General"} • ${dateStr}`}
                amount={t.amount}
                isDebit={t.type !== "credit"}
                category={t.category}
                showDivider={idx < transactions.length - 1}
              />
            );
          })
        )}
      </Card>
    </ScreenContainer>
  );
};

export default HomeScreen;
