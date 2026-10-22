import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import {
  ArrowLeft,
  Coins,
  TrendingUp,
  ShoppingBag,
  Coffee,
  Car,
  Utensils,
  Receipt,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { apiService, getErrorMessage } from "../../services/api";
import {
  ScreenContainer,
  Card,
  Skeleton,
  EmptyState,
} from "../../components/ui";

interface TransactionActivity {
  id: string;
  merchant: string;
  time: string;
  category: string;
  amount: number;
  roundup: number;
  simulated: boolean;
}

const FILTERS: { label: string; sinceDays?: number }[] = [
  { label: "All Time" },
  { label: "Last 30 Days", sinceDays: 30 },
  { label: "Past 7 Days", sinceDays: 7 },
];

export const RoundupTrackerScreen = ({ navigation }: { navigation: any }) => {
  const [selectedFilter, setSelectedFilter] = useState(FILTERS[0]);
  const [activities, setActivities] = useState<TransactionActivity[]>([]);
  const [totalSaved, setTotalSaved] = useState<number>(0);
  const [roundupCount, setRoundupCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const { sinceDays } = selectedFilter;

      // Totals and the list are both filtered and computed by the backend.
      const [stats, txs] = await Promise.all([
        apiService.getRoundupStats(sinceDays),
        apiService.getTransactions({ hasRoundup: true, sinceDays, limit: 100 }),
      ]);

      setTotalSaved(Number(stats.total_saved) || 0);
      setRoundupCount(Number(stats.roundup_transactions_count) || 0);
      setActivities(
        txs.map((t: any) => ({
          id: String(t.trans_id),
          merchant: t.merchant || "Purchase",
          time: new Date(t.date).toLocaleDateString("en-IN", {
            month: "short",
            day: "numeric",
          }),
          category: t.category || "General",
          amount: Number(t.amount) || 0,
          roundup: Number(t.round_up_amount) || 0,
          simulated: t.source === "bank_simulation",
        }))
      );
      setError(null);
    } catch (e: any) {
      console.warn("Failed to load roundups activity:", e?.message);
      setError(getErrorMessage(e, "Couldn't load your round-ups."));
    } finally {
      setLoading(false);
    }
  }, [selectedFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const formatINR = (val: number): string => {
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const getCategoryIcon = (category: string) => {
    const cat = (category || "").toLowerCase();
    if (cat.includes("coffee") || cat.includes("cafe")) {
      return <Coffee size={16} color="#144a32" />;
    }
    if (cat.includes("food") || cat.includes("dining") || cat.includes("swiggy")) {
      return <Utensils size={16} color="#144a32" />;
    }
    if (cat.includes("transport") || cat.includes("uber") || cat.includes("ola") || cat.includes("travel")) {
      return <Car size={16} color="#144a32" />;
    }
    if (cat.includes("shop") || cat.includes("store")) {
      return <ShoppingBag size={16} color="#144a32" />;
    }
    return <Receipt size={16} color="#144a32" />;
  };

  return (
    <ScreenContainer
      refreshing={refreshing}
      onRefresh={handleRefresh}
      className="pt-2 pb-8"
    >
      {/* Header Bar */}
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => {
              triggerHaptic();
              navigation.goBack();
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="w-10 h-10 rounded-full bg-white border border-border items-center justify-center mr-3 shadow-card"
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={20} color="#144a32" />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-text-primary font-sans">
            Round-up Accumulator
          </Text>
        </View>
        <View className="w-10" />
      </View>

      {/* Hero Forest Card */}
      <Card variant="forest" padding="lg" className="shadow-card mb-4">
        <Text className="text-xs font-semibold text-sage-light uppercase tracking-wider font-sans mb-1">
          Total Round-up Savings
        </Text>
        <View className="flex-row items-baseline mb-4">
          <Text className="text-3xl font-bold text-white font-sans">
            ₹{formatINR(totalSaved)}
          </Text>
          <Text className="text-xs text-sage-light font-sans ml-2">
            accumulated
          </Text>
        </View>

        {/* Split Stats Sub-cards */}
        <View className="pt-3 border-t border-white/10">
          <View className="bg-white/10 rounded-xl p-3">
            <Text className="text-[10px] font-bold text-sage-light uppercase tracking-wider font-sans">
              Micro-Deposits
            </Text>
            <Text className="text-base font-bold text-white font-sans mt-0.5">
              {roundupCount} round-up{roundupCount === 1 ? "" : "s"}
            </Text>
          </View>
        </View>
      </Card>

      {/* Filter Tabs */}
      <View className="flex-row mb-4 space-x-2">
        {FILTERS.map((filter) => {
          const isSelected = selectedFilter.label === filter.label;
          return (
            <TouchableOpacity
              key={filter.label}
              onPress={() => {
                triggerHaptic();
                setSelectedFilter(filter);
              }}
              activeOpacity={0.8}
              className={`px-4 py-2.5 rounded-full border min-h-[44px] items-center justify-center mr-2 ${
                isSelected
                  ? "bg-primary border-primary shadow-button"
                  : "bg-white border-border"
              }`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <Text
                className={`text-xs font-sans ${
                  isSelected
                    ? "font-bold text-white"
                    : "font-semibold text-text-secondary"
                }`}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Activity List */}
      <View className="mb-2">
        <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans mb-3">
          Micro-Deposit Activity
        </Text>

        {error && (
          <Card variant="peach" padding="md" className="mb-3">
            <Text className="text-xs text-text-secondary font-sans">{error}</Text>
          </Card>
        )}

        {loading && activities.length === 0 ? (
          <View className="space-y-3 py-2">
            <Skeleton width="100%" height={70} className="rounded-card mb-3" />
            <Skeleton width="100%" height={70} className="rounded-card mb-3" />
            <Skeleton width="100%" height={70} className="rounded-card" />
          </View>
        ) : activities.length === 0 && !error ? (
          <Card variant="default" padding="lg" className="items-center shadow-card my-4">
            <EmptyState
              title="No round-ups in this period"
              description="Log a purchase from the Home screen (with an active savings goal) to see round-up micro-deposits here."
              actionTitle="Go to Home →"
              onAction={() => navigation.navigate("Home")}
              icon={<Coins size={32} color="#144a32" />}
            />
          </Card>
        ) : activities.length === 0 ? null : (
          <View className="space-y-2.5">
            {activities.map((item) => (
              <Card
                key={item.id}
                variant="default"
                padding="md"
                className="shadow-card mb-2.5 flex-row items-center justify-between"
              >
                <View className="flex-row items-center flex-1 mr-2">
                  <View className="w-10 h-10 rounded-full bg-sage-light border border-border items-center justify-center mr-3">
                    {getCategoryIcon(item.category)}
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-sm font-bold text-text-primary font-sans"
                      numberOfLines={1}
                    >
                      {item.merchant}
                    </Text>
                    <Text className="text-[11px] text-text-muted font-sans mt-0.5">
                      {item.category} • {item.time}
                      {item.simulated ? " • Simulated" : ""}
                    </Text>
                  </View>
                </View>

                <View className="items-end">
                  {item.roundup > 0 ? (
                    <Text className="text-sm font-bold text-primary font-sans">
                      +₹{formatINR(item.roundup)}
                    </Text>
                  ) : (
                    <Text className="text-xs font-semibold text-text-muted font-sans">
                      ₹0.00
                    </Text>
                  )}
                  <Text className="text-[10px] text-text-muted font-sans mt-0.5">
                    spent ₹{formatINR(item.amount)}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        )}
      </View>
    </ScreenContainer>
  );
};

export default RoundupTrackerScreen;
