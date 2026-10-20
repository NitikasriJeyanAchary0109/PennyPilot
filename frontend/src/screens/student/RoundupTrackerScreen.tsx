// Accepts both canonical 'round_up' and legacy 'roundup'
export const isRoundupSource = (source?: string): boolean =>
  source === "round_up" || source === "roundup";

import React, { useState, useEffect } from "react";
import { 
  View, 
  Text, 
  ScrollView, 
  Pressable, 
  SafeAreaView, 
  StyleSheet, 
  Image,
  ActivityIndicator
} from "react-native";
import { MaterialIcons, FontAwesome, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { apiService } from "../../services/api";

interface TransactionActivity {
  id: string;
  merchant: string;
  time: string;
  category: string;
  amount: number;
  roundup: number;
  icon: string;
  iconColor: string;
  iconBg: string;
  iconProvider: "fa" | "mci";
}

const ACTIVITIES: TransactionActivity[] = [
  {
    id: "act-1",
    merchant: "Starbucks",
    time: "10:30 AM",
    category: "Coffee",
    amount: 187,
    roundup: 13,
    icon: "coffee",
    iconColor: "#ffffff",
    iconBg: "#006241",
    iconProvider: "fa"
  },
  {
    id: "act-2",
    merchant: "Swiggy",
    time: "01:15 PM",
    category: "Food",
    amount: 442,
    roundup: 8,
    icon: "food-delivery",
    iconColor: "#ffffff",
    iconBg: "#fc8019",
    iconProvider: "mci"
  },
  {
    id: "act-3",
    merchant: "Uber",
    time: "Yesterday",
    category: "Transport",
    amount: 219,
    roundup: 1,
    icon: "taxi",
    iconColor: "#ffffff",
    iconBg: "#000000",
    iconProvider: "mci"
  },
  {
    id: "act-4",
    merchant: "Flipkart",
    time: "Yesterday",
    category: "Shopping",
    amount: 899,
    roundup: 1,
    icon: "shopping",
    iconColor: "#ffffff",
    iconBg: "#2874f0",
    iconProvider: "mci"
  }
];

export const RoundupTrackerScreen = ({ navigation }: { navigation: any }) => {
  const [selectedFilter, setSelectedFilter] = useState("All Time");
  const [activities, setActivities] = useState<TransactionActivity[]>([]);
  const [totalSaved, setTotalSaved] = useState(1245);
  const [todaySaved, setTodaySaved] = useState(42);
  const [loading, setLoading] = useState(false);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const txs = await apiService.getTransactions();
      const roundups = txs.filter((t: any) => t.amount % 10 !== 0 || t.date);

      let total = 0;
      let today = 0;
      const todayStr = new Date().toDateString();

      const mapped: TransactionActivity[] = txs
        .filter((t: any) => Number(t.round_up_amount) > 0)
        .map((t: any) => {
          const rUp = Number(t.round_up_amount) || 0;
          total += rUp;
          const txDate = new Date(t.date);
          if (txDate.toDateString() === todayStr) {
            today += rUp;
          }

          const formattedTime = txDate.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          });

          const cat = t.category.toLowerCase();
          let icon = "shopping";
          let iconBg = "#2874f0";
          if (cat.includes("coffee") || cat.includes("cafe") || cat.includes("starbucks")) {
            icon = "coffee";
            iconBg = "#006241";
          } else if (cat.includes("food") || cat.includes("swiggy") || cat.includes("restaurant")) {
            icon = "food-delivery";
            iconBg = "#fc8019";
          } else if (cat.includes("transport") || cat.includes("uber") || cat.includes("ola")) {
            icon = "taxi";
            iconBg = "#000000";
          }

          return {
            id: t.trans_id.toString(),
            merchant: t.merchant,
            time: formattedTime,
            category: t.category,
            amount: t.amount,
            roundup: rUp,
            icon: icon,
            iconColor: "#ffffff",
            iconBg: iconBg,
            iconProvider: icon === "coffee" ? "fa" : "mci"
          };
        });

      if (mapped.length > 0) {
        setActivities(mapped);
        setTotalSaved(total);
        setTodaySaved(today);
      } else {
        setActivities(ACTIVITIES);
      }
    } catch (e) {
      console.warn("Failed to load roundups activity:", e);
      setActivities(ACTIVITIES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-[#f7f9ff]">
      {/* Header Bar */}
      <View className="flex-row justify-between items-center px-margin-mobile py-stack-md bg-white border-b border-slate-100">
        <View className="flex-row items-center space-x-3">
          <Pressable 
            onPress={() => {
              triggerHaptic();
              navigation.goBack();
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            className="p-1"
          >
            <MaterialIcons name="arrow-back" size={24} color="#181c20" />
          </Pressable>
          <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-xl text-ob-primary">
            SpareChange AI
          </Text>
        </View>
        <View className="flex-row items-center space-x-2">
          <Pressable 
            onPress={triggerHaptic}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-50 border border-slate-100"
          >
            <MaterialIcons name="settings" size={20} color="#181c20" />
          </Pressable>
          <View className="w-8 h-8 rounded-full overflow-hidden border border-outline-variant">
            <Image 
              source={{ uri: "https://lh3.googleusercontent.com/aida-public/AB6AXuCkXoLdnxb4scqjRl370lF7V3SJ4s_7HbEKCx7KyCKdMV4HrLWawLGHQlcU3dRfU7WTSJEvNxJQmTpxpFHQ8pXHULygs8-vA7MSkdL7VMVUqKG732achwJSUF_aCIdXDhrHTSpdPkwowh3jblExdfP2JahrztBllBwGBrcgBeJpuBWnDaR9DvaVMgtBYOqq--ZfgQQcjV4UvyRtjxuU3nmi-XhpHZfvAbPJj_AW2dkARWTf4UDwaX9Q" }}
              style={{ width: "100%", height: "100%", resizeMode: "cover" }}
            />
          </View>
        </View>
      </View>

      <ScrollView className="flex-grow" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}>
        {/* Hero Card */}
        <LinearGradient
          colors={["#1a73e8", "#005bbf"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
          className="rounded-2xl p-5 mb-6 relative overflow-hidden"
        >
          <View className="z-10">
            <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-white/90 uppercase mb-1">
              Total Round-up Savings
            </Text>
            <View className="flex-row items-baseline space-x-2 mb-4">
              <Text style={{ fontFamily: "PlusJakartaSans_800ExtraBold" }} className="text-4xl text-white">
                ₹{totalSaved.toLocaleString("en-IN")}
              </Text>
              <View className="bg-tertiary px-2 py-0.5 rounded-full border border-emerald-400/20">
                <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] text-white font-bold">
                  Active
                </Text>
              </View>
            </View>
            
            {/* Split cards */}
            <View className="flex-row space-x-3">
              <View className="flex-1 bg-white/10 rounded-xl p-3">
                <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] text-white/80 uppercase tracking-wider font-bold">
                  Today
                </Text>
                <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-lg text-white">
                  ₹{todaySaved.toLocaleString("en-IN")}
                </Text>
              </View>
              <View className="flex-1 bg-white/10 rounded-xl p-3">
                <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] text-white/80 uppercase tracking-wider font-bold">
                  Transactions
                </Text>
                <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-lg text-white">
                  {activities.length}
                </Text>
              </View>
            </View>
          </View>
          {/* Decorative background blur circle */}
          <View className="absolute -right-8 -top-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
        </LinearGradient>

        {/* Weekly Summary Chip Bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-6">
          {["All Time", "This Month", "Last Week"].map((filter) => {
            const isSelected = selectedFilter === filter;
            return (
              <Pressable
                key={filter}
                onPress={() => {
                  triggerHaptic();
                  setSelectedFilter(filter);
                }}
                className={`px-5 py-2.5 rounded-full mr-2 border ${
                  isSelected 
                    ? "bg-primary-container border-primary-container" 
                    : "bg-surface-container-high border-outline-variant/30"
                }`}
              >
                <Text 
                  style={{ fontFamily: "WorkSans_500Medium" }} 
                  className={`text-xs ${isSelected ? "text-white" : "text-on-surface-variant"}`}
                >
                  {filter}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Transaction list header */}
        <View className="flex-row items-center justify-between mb-4 px-1">
          <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-base text-on-surface">
            Recent Activity
          </Text>
          <Pressable 
            onPress={() => {
              triggerHaptic();
              navigation.navigate("TransactionList");
            }}
          >
            <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-ob-primary font-bold">
              View All
            </Text>
          </Pressable>
        </View>

        {/* Transaction list */}
        <View className="space-y-3 mb-6">
          {loading ? (
            <ActivityIndicator size="small" color="#005bbf" className="py-4" />
          ) : (
            activities.map((act) => (
              <Pressable
                key={act.id}
                onPress={triggerHaptic}
                style={({ pressed }) => [
                  styles.itemCard,
                  { transform: [{ scale: pressed ? 0.98 : 1 }] }
                ]}
                className="flex-row items-center justify-between p-4 bg-white rounded-2xl border border-outline-variant/30"
              >
                <View className="flex-row items-center space-x-3">
                  <View 
                    style={{ backgroundColor: act.iconBg }}
                    className="w-12 h-12 rounded-full items-center justify-center border border-outline-variant/20"
                  >
                    {act.iconProvider === "fa" ? (
                      <FontAwesome name={act.icon as any} size={20} color={act.iconColor} />
                    ) : (
                      <MaterialCommunityIcons name={act.icon as any} size={20} color={act.iconColor} />
                    )}
                  </View>
                  <View>
                    <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-sm text-on-surface">
                      {act.merchant}
                    </Text>
                    <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-[10px] text-on-secondary-container">
                      {act.time} • {act.category}
                    </Text>
                  </View>
                </View>

                <View className="items-end space-y-1">
                  <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-sm text-on-surface">
                    ₹{act.amount}
                  </Text>
                  <View className="bg-tertiary/10 px-2 py-0.5 rounded-full border border-tertiary/20">
                    <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[9px] text-tertiary font-bold">
                      +₹{act.roundup} round-up
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))
          )}
        </View>

        {/* AI Insight Box */}
        <View className="p-4 bg-primary-fixed text-on-primary-fixed-variant rounded-2xl border border-primary-fixed-dim flex-row space-x-4 items-start">
          <MaterialIcons name="smart-toy" size={24} color="#005bbf" className="mt-0.5" />
          <View className="flex-1 space-y-1">
            <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-sm text-on-surface">
              AI Coach Insight
            </Text>
            <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-on-surface-variant leading-5">
              "You saved <Text style={{ fontFamily: "WorkSans_500Medium" }} className="font-bold">₹42</Text> more than last Tuesday! At this rate, you'll reach your 'iPhone Upgrade' goal 2 weeks earlier."
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  heroCard: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  itemCard: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  }
});

export default RoundupTrackerScreen;
