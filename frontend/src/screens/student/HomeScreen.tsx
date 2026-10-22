import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert, TextInput } from "react-native";
import { ShoppingCart, ChevronRight, ArrowRight } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../hooks/useAuth";
import { useIsFocused } from "@react-navigation/native";
import { apiService, getErrorMessage } from "../../services/api";
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
import { DEFAULT_CATEGORIES } from "../../constants/categories";

const greetingForHour = (hour: number): string => {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

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
  const [userName, setUserName] = useState<string>("");

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
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Transactions state
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Simulation form states
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [customCategory, setCustomCategory] = useState("");
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [budgetCategories, setBudgetCategories] = useState<string[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  // Roundup alert modal / banner state
  const [roundupAlert, setRoundupAlert] = useState<{
    amount: number;
    newGoalAmount?: number;
    explanation?: string;
  } | null>(null);

  // Quick-pick categories: the defaults plus any the student has budgeted.
  const categories = Array.from(new Set([...DEFAULT_CATEGORIES, ...budgetCategories]));

  // Load user profile name
  const loadUser = useCallback(async () => {
    try {
      const user = await apiService.getCurrentUser();
      if (user && user.full_name) {
        const firstName = user.full_name.trim().split(" ")[0];
        setUserName(firstName);
      }
    } catch {
      // Name stays blank; the greeting simply omits it
    }
  }, []);

  // Load stats, goals, transactions, categories & unread count from backend.
  // Each piece loads independently so one failure doesn't blank the dashboard.
  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setGoalsLoading(true);
    const [stats, goalsList, txs, budgets, notifications] = await Promise.allSettled([
      apiService.getRoundupStats(),
      apiService.getGoals(),
      apiService.getTransactions({ limit: 5 }),
      apiService.getBudgets(),
      apiService.getNotifications(),
    ]);

    let failures = 0;

    if (stats.status === "fulfilled") {
      setTotalSaved(Number(stats.value.total_saved) || 0);
      setRoundupCount(Number(stats.value.roundup_transactions_count) || 0);
    } else {
      failures += 1;
    }

    if (goalsList.status === "fulfilled") {
      const goals = goalsList.value as any[];
      // Round-ups go to the oldest active goal — the list is oldest-first.
      const goal = goals.find((g) => g.status === "active") || goals[0];
      setActiveGoal(
        goal
          ? {
              goal_id: goal.goal_id,
              goal_name: goal.goal_name,
              saved: goal.saved,
              target: goal.target,
              progress_percentage: goal.progress_percentage,
            }
          : null
      );
    } else {
      failures += 1;
    }

    if (txs.status === "fulfilled") {
      setTransactions(txs.value as Transaction[]);
    } else {
      failures += 1;
    }

    if (budgets.status === "fulfilled") {
      setBudgetCategories(
        Array.from(new Set((budgets.value as any[]).map((b) => b.category)))
      );
    }

    if (notifications.status === "fulfilled") {
      setUnreadCount(
        (notifications.value as any[]).filter((n) => n.status !== "read").length
      );
    }

    setLoadError(
      failures > 0
        ? "Some of your data couldn't be loaded. Pull down to refresh."
        : null
    );
    setLoading(false);
    setGoalsLoading(false);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadUser(), loadDashboardData()]);
    setRefreshing(false);
  };

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Load on mount and refetch whenever the screen regains focus
  useEffect(() => {
    if (isFocused) {
      loadDashboardData();
    }
  }, [isFocused, loadDashboardData]);

  // Log a purchase; the backend computes the round-up
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
          "Purchase logged",
          response.roundup_details?.reason ||
            (activeGoal
              ? "No round-up was applied to this purchase."
              : "Set a savings goal to start rounding up your purchases.")
        );
      }

      // Reset input form
      setDesc("");
      setAmount("");

      // Refresh stats from backend to update totals without client-side calculation
      await loadDashboardData();
    } catch (e: any) {
      Alert.alert("Couldn't log purchase", getErrorMessage(e, "Failed to log the purchase."));
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
        title={`${greetingForHour(new Date().getHours())}${userName ? `, ${userName}` : ""} 👋`}
        subtitle={
          activeGoal
            ? `Round-ups are going to “${activeGoal.goal_name}”`
            : "Set a goal to start saving"
        }
        showLogo
        showNotification
        hasUnreadNotifications={unreadCount > 0}
        onNotificationPress={() => navigation.navigate("Notifications")}
        className="px-0 mb-2"
      />

      {loadError && (
        <Card variant="peach" padding="md" className="mb-3">
          <Text className="text-xs text-text-secondary font-sans">{loadError}</Text>
        </Card>
      )}

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
                  ? `From ${roundupCount} round-up${roundupCount === 1 ? "" : "s"}`
                  : loading
                  ? "Loading..."
                  : "Unavailable"}
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
            Log a purchase
          </Text>
          <Text className="text-xs text-text-muted mt-0.5">
            Record something you spent and Penny Pilot rounds it up toward your goal
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
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xs font-semibold text-text-primary tracking-wide">
              Category
            </Text>
            <View className="flex-row items-center bg-primary-tint/70 px-2.5 py-0.5 rounded-full">
              <Text className="text-[10px] font-semibold text-primary font-sans">
                ✍️ Or type custom category
              </Text>
            </View>
          </View>

          <View className="flex-row flex-wrap gap-2">
            {categories.map((cat) => {
              const isSelected = !isCustomCategory && category === cat;
              return (
                <Chip
                  key={cat}
                  label={cat}
                  category={cat}
                  selected={isSelected}
                  onPress={() => {
                    triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
                    setIsCustomCategory(false);
                    setCategory(cat);
                  }}
                />
              );
            })}
            <TouchableOpacity
              onPress={() => {
                triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
                setIsCustomCategory(true);
                if (customCategory.trim()) {
                  setCategory(customCategory.trim());
                }
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Add custom category"
              className={`py-1.5 px-3 rounded-xl border flex-row items-center ${
                isCustomCategory
                  ? "bg-primary border-primary"
                  : "bg-surface-cream border-border"
              }`}
            >
              <Text
                className={`text-xs font-sans ${
                  isCustomCategory ? "text-white font-bold" : "text-text font-medium"
                }`}
              >
                + Custom
              </Text>
            </TouchableOpacity>
          </View>

          {isCustomCategory && (
            <View className="mt-2.5 bg-surface-cream rounded-xl border border-primary/40 px-3.5 py-1">
              <TextInput
                placeholder="Type custom category (e.g. Gym, Books, Gaming)"
                placeholderTextColor="#707773"
                value={customCategory}
                onChangeText={(text) => {
                  setCustomCategory(text);
                  setCategory(text.trim() || "Custom");
                }}
                className="font-sans text-xs text-text py-2"
                autoFocus
              />
            </View>
          )}

          <Text className="text-[11px] text-text-muted font-sans mt-2">
            💡 Tip: Select a quick preset above or tap + Custom to directly type any category.
          </Text>
        </View>

        {/* Primary CTA */}
        <Button
          title="Log purchase & round up →"
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
              No transactions yet. Log a purchase above to get started.
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
