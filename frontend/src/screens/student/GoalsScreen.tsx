import React, { useState, useEffect } from "react";
import { 
  View, 
  Text, 
  ScrollView, 
  Pressable, 
  SafeAreaView, 
  StyleSheet, 
  ActivityIndicator, 
  RefreshControl,
  Alert,
  Image
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { apiService } from "../../services/api";
import { Goal } from "../../types";

export const GoalsScreen = () => {
  const navigation = useNavigation<any>();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const loadGoals = async () => {
    try {
      setLoading(true);
      const res = await apiService.getGoals();
      setGoals(res);
    } catch (e: any) {
      console.warn("Failed to load goals:", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadGoals();
    setRefreshing(false);
  };

  useEffect(() => {
    loadGoals();
  }, []);

  // Map category emoji labels to MaterialIcons
  const getGoalIcon = (name: string): keyof typeof MaterialIcons.glyphMap => {
    const n = name.toLowerCase();
    if (n.includes("laptop") || n.includes("mac") || n.includes("tech") || n.includes("computer")) return "laptop-mac";
    if (n.includes("goa") || n.includes("trip") || n.includes("travel") || n.includes("flight")) return "flight-takeoff";
    if (n.includes("camera") || n.includes("sony") || n.includes("photo")) return "photo-camera";
    if (n.includes("home") || n.includes("house") || n.includes("rent")) return "home";
    if (n.includes("car") || n.includes("vehicle")) return "directions-car";
    if (n.includes("school") || n.includes("tuition") || n.includes("education")) return "school";
    return "track-changes";
  };

  const getIconBgColor = (name: string): string => {
    const n = name.toLowerCase();
    if (n.includes("laptop") || n.includes("mac") || n.includes("tech")) return "#d8e2ff"; // primary-fixed
    if (n.includes("goa") || n.includes("trip") || n.includes("travel")) return "#8ffa9b"; // tertiary-fixed
    if (n.includes("camera") || n.includes("sony") || n.includes("photo")) return "#e1e3e4"; // secondary-fixed
    return "#d8e2ff";
  };

  const getIconColor = (name: string): string => {
    const n = name.toLowerCase();
    if (n.includes("laptop") || n.includes("mac") || n.includes("tech")) return "#005bbf"; // primary
    if (n.includes("goa") || n.includes("trip") || n.includes("travel")) return "#00531e"; // tertiary
    if (n.includes("camera") || n.includes("sony") || n.includes("photo")) return "#5c5f60"; // secondary
    return "#005bbf";
  };

  // Mock static data to populate if empty, matching the Stitch mockup design
  const mockGoals = [
    { goal_id: "mock-1", goal_name: "New Laptop", target: 50000, saved: 12000, isPriority: true },
    { goal_id: "mock-2", goal_name: "Goa Trip", target: 15000, saved: 8500, isPriority: false },
    { goal_id: "mock-3", goal_name: "Sony A7 IV", target: 210000, saved: 4500, isPriority: false },
  ];

  const displayedGoals = goals.length > 0 ? goals : mockGoals;

  return (
    <SafeAreaView className="flex-1 bg-[#f7f9ff]">
      {/* Header Banner */}
      <View className="flex-row justify-between items-center px-margin-mobile py-stack-md bg-white border-b border-slate-100">
        <View className="flex-row items-center space-x-3">
          <View className="w-10 h-10 rounded-full bg-surface-container overflow-hidden">
            <Image 
              source={{ uri: "https://lh3.googleusercontent.com/aida-public/AB6AXuCr4f6j5TOnM6olaPKu21SzVM04BxNin0s7kvSA3Ll-cqO_hDom2VXB_5UngwMBAe7ES_8DiG4VYhKq-nXLZckYLKtzeUTOmAdam-gLDnbvKtKqQjzkQ0hVHZqycl3XGwhY22pRFKbhg53AipNsBO-9Y7agi0FwrC5ZEhrEuRvocfrbjapAxiRJ0TZi5je1E4JN_zNUQz6y6iqMlrGiVjWX7f1MIQrUufMDUHSMjxIK5v1c4Xmb1ISO" }}
              style={{ width: "100%", height: "100%", resizeMode: "cover" }}
            />
          </View>
          <Text style={{ fontFamily: "Inter_700Bold" }} className="text-lg text-ob-primary">
            Penny Pilot
          </Text>
        </View>
        <Pressable 
          onPress={triggerHaptic}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-50 border border-slate-100"
        >
          <MaterialIcons name="settings" size={20} color="#181c20" />
        </Pressable>
      </View>

      <ScrollView 
        className="flex-grow" 
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#005bbf" />
        }
      >
        {/* Welcome Section */}
        <View className="mb-6">
          <Text style={{ fontFamily: "Inter_700Bold" }} className="text-2xl text-on-surface mb-1">
            Dream Engine
          </Text>
          <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-sm text-on-surface-variant">
            Your automated savings roadmap
          </Text>
        </View>

        {/* Bento Grid cards (Saved + Subscriptions) */}
        <View className="flex-row space-x-4 mb-6">
          <View style={styles.card} className="flex-1 bg-white p-4 rounded-2xl border border-outline-variant/30 shadow-sm">
            <MaterialIcons name="savings" size={24} color="#005bc0" className="mb-2" />
            <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] text-on-surface-variant uppercase tracking-wider">
              Total Saved
            </Text>
            <Text style={{ fontFamily: "Inter_700Bold" }} className="text-lg text-on-surface mt-1">
              ₹12,500
            </Text>
          </View>

          <Pressable
            onPress={() => {
              triggerHaptic();
              navigation.navigate("SubscriptionNegotiator");
            }}
            style={({ pressed }) => [
              styles.card,
              { transform: [{ scale: pressed ? 0.98 : 1 }] }
            ]}
            className="flex-1 bg-white p-4 rounded-2xl border border-outline-variant/30 shadow-sm"
          >
            <MaterialIcons name="subscriptions" size={24} color="#16893a" className="mb-2" />
            <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] text-on-surface-variant uppercase tracking-wider">
              Subscriptions
            </Text>
            <Text style={{ fontFamily: "Inter_700Bold" }} className="text-lg text-on-surface mt-1">
              ₹1,200/mo
            </Text>
          </Pressable>
        </View>

        {/* Dynamic Goals List */}
        <View className="space-y-4">
          {loading && goals.length === 0 ? (
            <ActivityIndicator size="large" color="#005bbf" className="py-8" />
          ) : (
            displayedGoals.map((g: any) => {
              const targetAmount = Number(g.target) || 1;
              const savedAmount = Number(g.saved) || 0;
              const percent = Math.min(Math.round((savedAmount / targetAmount) * 100), 100);
              const left = Math.max(targetAmount - savedAmount, 0);
              const isPriority = g.isPriority || false;

              return (
                <View 
                  key={g.goal_id}
                  style={styles.card} 
                  className="bg-white rounded-2xl p-4 border border-outline-variant/30 relative overflow-hidden"
                >
                  {isPriority && (
                    <View className="absolute top-3 right-3 bg-amber-100 px-3 py-1 rounded-full border border-amber-200">
                      <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] font-semibold text-amber-800 uppercase">
                        Priority
                      </Text>
                    </View>
                  )}

                  {/* Icon and metadata */}
                  <View className="flex-row items-center space-x-4 mb-4">
                    <View 
                      style={{ backgroundColor: getIconBgColor(g.goal_name) }}
                      className="w-12 h-12 rounded-full items-center justify-center"
                    >
                      <MaterialIcons 
                        name={getGoalIcon(g.goal_name)} 
                        size={24} 
                        color={getIconColor(g.goal_name)} 
                      />
                    </View>
                    <View>
                      <Text style={{ fontFamily: "Inter_700Bold" }} className="text-base text-on-surface">
                        {g.goal_name}
                      </Text>
                      <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-on-surface-variant">
                        ₹{savedAmount.toLocaleString("en-IN")} of ₹{targetAmount.toLocaleString("en-IN")} saved
                      </Text>
                    </View>
                  </View>

                  {/* Progress Line */}
                  <View className="w-full space-y-2">
                    <View className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <View 
                        style={{ width: `${percent}%` }}
                        className="h-full bg-primary-container rounded-full"
                      />
                    </View>
                    <View className="flex-row justify-between">
                      <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                        {percent}% Complete
                      </Text>
                      <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                        ₹{left.toLocaleString("en-IN")} left
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}

          {/* Add New Goal Card (Dashed) */}
          <Pressable 
            onPress={() => {
              triggerHaptic();
              navigation.navigate("GoalCreation");
            }}
            style={({ pressed }) => [
              styles.dashedCard,
              { transform: [{ scale: pressed ? 0.98 : 1 }] }
            ]}
            className="w-full h-32 rounded-2xl border-2 border-dashed border-outline-variant flex flex-col items-center justify-center space-y-2 bg-slate-50/50"
          >
            <MaterialIcons name="add-circle" size={32} color="#727785" />
            <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-sm text-on-surface-variant">
              Start a new dream
            </Text>
          </Pressable>
        </View>

        {/* AI Insight Box */}
        <View className="mt-8 p-4 bg-primary-fixed/20 rounded-2xl border border-primary-fixed flex-row space-x-4 items-start">
          <MaterialIcons name="smart-toy" size={24} color="#005bbf" className="mt-0.5" />
          <View className="flex-1 space-y-1">
            <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-on-primary-fixed leading-5">
              You're on track to buy the <Text style={{ fontFamily: "WorkSans_500Medium" }} className="font-bold">New Laptop</Text> by October! Penny Pilot moved ₹124 more today.
            </Text>
            <Pressable 
              onPress={() => {
                triggerHaptic();
                Alert.alert(
                  "AI Saving Strategy",
                  "We increased round-ups from 5% to 8% on weekends, matching your low-spending trend to secure the laptop faster!"
                );
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              className="py-1"
            >
              <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-ob-primary font-bold">
                View AI Strategy
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* FAB for Quick Save */}
      <Pressable 
        onPress={() => {
          triggerHaptic();
          Alert.alert("Quick Save", "Save ₹500 instantly into your priority goal?", [
            { text: "Cancel", style: "cancel" },
            { 
              text: "Save Now", 
              onPress: async () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert("Success", "Deposited ₹500 into New Laptop savings!");
                loadGoals();
              } 
            }
          ]);
        }}
        style={({ pressed }) => [
          styles.fab,
          { transform: [{ scale: pressed ? 0.92 : 1 }] }
        ]}
        className="fixed bg-primary shadow-lg rounded-2xl flex items-center justify-center"
      >
        <MaterialIcons name="add" size={28} color="#ffffff" />
      </Pressable>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  dashedCard: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#c1c6d6",
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: "#005bc0",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 99,
  }
});

export default GoalsScreen;
