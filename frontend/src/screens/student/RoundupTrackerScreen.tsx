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
  Sparkles,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { apiService } from "../../services/api";
import {
  ScreenContainer,
  Card,
  Chip,
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
}

export const RoundupTrackerScreen = ({ navigation }: { navigation: any }) => {
  const [selectedFilter, setSelectedFilter] = useState("All Time");
  const [activities, setActivities] = useState<TransactionActivity[]>([]);
  const [totalSaved, setTotalSaved] = useState<number>(0);
  const [roundupCount, setRoundupCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

      // Load server-calculated statistics (zero arithmetic rule)
      const stats = await apiService.getRoundupStats();
      if (stats) {
        setTotalSaved(Number(stats.total_saved) || 0);
        setRoundupCount(Number(stats.roundup_count) || 0);
      }

      // Load real transactions
      const txs = await apiService.getTransactions();
      if (Array.isArray(txs)) {
        const mapped: TransactionActivity[] = txs.map((t: any) => {
          const rUp = Number(t.round_up_amount) || 0;
          const txDate = t.date ? new Date(t.date) : new Date();
          const formattedTime = txDate.toLocaleDateString("en-IN", {
            month: "short",
            day: "numeric",
          });

          return {
            id: (t.trans_id || t.id || Math.random()).toString(),
            merchant: t.merchant || "Purchase",
            time: formattedTime,
            category: t.category || "General",
            amount: Number(t.amount) || 0,
            roundup: rUp,
          };
        });
        setActivities(mapped);
      } else {
        setActivities([]);
      }
    } catch (e: any) {
      console.warn("Failed to load roundups activity:", e?.message);
      setActivities([]);
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
        <Chip
          label="Active"
          variant="success"
          icon={<Sparkles size={12} color="#144a32" />}
        />
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
        <View className="flex-row space-x-3 pt-3 border-t border-white/10">
          <View className="flex-1 bg-white/10 rounded-xl p-3 mr-1.5">
            <Text className="text-[10px] font-bold text-sage-light uppercase tracking-wider font-sans">
              Multiplier
            </Text>
            <Text className="text-base font-bold text-gold font-sans mt-0.5">
              1x Standard
            </Text>
          </View>
          <View className="flex-1 bg-white/10 rounded-xl p-3 ml-1.5">
            <Text className="text-[10px] font-bold text-sage-light uppercase tracking-wider font-sans">
              Micro-Deposits
            </Text>
            <Text className="text-base font-bold text-white font-sans mt-0.5">
              {roundupCount} swipes
            </Text>
          </View>
        </View>
      </Card>

      {/* Filter Tabs */}
      <View className="flex-row mb-4 space-x-2">
        {["All Time", "This Month", "Past 7 Days"].map((filter) => {
          const isSelected = selectedFilter === filter;
          return (
            <TouchableOpacity
              key={filter}
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
                {filter}
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

        {loading && activities.length === 0 ? (
          <View className="space-y-3 py-2">
            <Skeleton width="100%" height={70} className="rounded-card mb-3" />
            <Skeleton width="100%" height={70} className="rounded-card mb-3" />
            <Skeleton width="100%" height={70} className="rounded-card" />
          </View>
        ) : activities.length === 0 ? (
          <Card variant="default" padding="lg" className="items-center shadow-card my-4">
            <EmptyState
              title="No round-up transactions yet"
              description="Make a simulated purchase from the Home screen to see your round-up micro-deposits accumulate."
              actionTitle="Go to Home →"
              onAction={() => navigation.navigate("Home")}
              icon={<Coins size={32} color="#144a32" />}
            />
          </Card>
        ) : (
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
