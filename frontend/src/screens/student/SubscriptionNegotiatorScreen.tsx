import React, { useState, useEffect } from "react";
import { 
  View, 
  Text, 
  Pressable, 
  SafeAreaView, 
  StyleSheet, 
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert 
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { apiService } from "../../services/api";

export const SubscriptionNegotiatorScreen = ({ navigation }: { navigation: any }) => {
  const [activeTab, setActiveTab] = useState<"subscriptions" | "custom">("subscriptions");
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [selectedSub, setSelectedSub] = useState<any>(null);

  // Custom purchase form state
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [category, setCategory] = useState("Coffee");

  // Evaluation response state
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalResult, setEvalResult] = useState<any>(null);

  const categories = ["Coffee", "Dining", "Electronics", "Entertainment", "Subscriptions"];

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  useEffect(() => {
    const fetchSubscriptions = async () => {
      try {
        setLoadingSubs(true);
        const res = await apiService.getNegotiatorSubscriptions();
        setSubscriptions(res);
        if (res && res.length > 0) {
          setSelectedSub(res[0]);
        }
      } catch (e) {
        console.warn("Failed to fetch subscriptions:", e);
      } finally {
        setLoadingSubs(false);
      }
    };
    fetchSubscriptions();
  }, []);

  const handleEvaluate = async () => {
    triggerHaptic();
    setEvalResult(null);

    let priceNum = 0;
    let cat = "";
    let desc = "";

    if (activeTab === "subscriptions") {
      if (!selectedSub) {
        Alert.alert("Error", "No subscription selected.");
        return;
      }
      priceNum = Number(selectedSub.amount);
      cat = "Subscriptions";
      desc = selectedSub.name;
    } else {
      if (!itemName.trim() || !itemPrice.trim()) {
        Alert.alert("Error", "Please fill in all fields.");
        return;
      }
      priceNum = parseFloat(itemPrice);
      if (isNaN(priceNum) || priceNum <= 0) {
        Alert.alert("Error", "Please enter a valid positive price.");
        return;
      }
      cat = category;
      desc = itemName.trim();
    }

    try {
      setEvalLoading(true);
      const res = await apiService.evaluatePurchase({
        price: priceNum,
        category: cat,
        description: desc
      });
      setEvalResult(res);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      console.warn("Evaluation failed:", e);
      Alert.alert("Error", e.message || "Failed to run AI evaluation.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setEvalLoading(false);
    }
  };

  // Status pill styling helper
  const getStatusColor = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s.includes("exceeded") || s.includes("danger") || s.includes("red")) {
      return { bg: "#fde8e8", text: "#ba1a1a", label: "Exceeded" };
    }
    if (s.includes("warning") || s.includes("caution") || s.includes("amber")) {
      return { bg: "#fef3c7", text: "#d97706", label: "Warning" };
    }
    return { bg: "#d1fae5", text: "#065f46", label: "Safe" };
  };

  return (
    <SafeAreaView style={styles.container} className="flex-1">
      {/* Background Underlay (translucent dark sheet) */}
      <View style={StyleSheet.absoluteFillObject} className="bg-slate-900/60" />

      {/* Main Bottom Sheet Canvas */}
      <View style={styles.sheet} className="bg-white rounded-t-3xl pt-2 pb-10 px-margin-mobile flex-col max-h-[90%]">
        {/* Drag Handle indicator */}
        <View className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4" />

        {/* Header Title with Back button */}
        <View className="flex-row items-center justify-between mb-4">
          <Text style={{ fontFamily: "Inter_700Bold" }} className="text-xl text-slate-800">
            AI Negotiator
          </Text>
          <Pressable 
            onPress={() => {
              triggerHaptic();
              navigation.goBack();
            }}
            className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center"
          >
            <MaterialIcons name="close" size={16} color="#181c20" />
          </Pressable>
        </View>

        {/* Tab Buttons */}
        <View className="flex-row bg-slate-100 rounded-xl p-1 mb-5">
          <Pressable
            onPress={() => {
              triggerHaptic();
              setActiveTab("subscriptions");
              setEvalResult(null);
            }}
            className={`flex-1 py-2.5 rounded-lg items-center ${
              activeTab === "subscriptions" ? "bg-white shadow-sm" : ""
            }`}
          >
            <Text 
              style={{ fontFamily: "WorkSans_600SemiBold" }} 
              className={`text-xs ${activeTab === "subscriptions" ? "text-slate-800" : "text-slate-500"}`}
            >
              Subscription Pause
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              triggerHaptic();
              setActiveTab("custom");
              setEvalResult(null);
            }}
            className={`flex-1 py-2.5 rounded-lg items-center ${
              activeTab === "custom" ? "bg-white shadow-sm" : ""
            }`}
          >
            <Text 
              style={{ fontFamily: "WorkSans_600SemiBold" }} 
              className={`text-xs ${activeTab === "custom" ? "text-slate-800" : "text-slate-500"}`}
            >
              Custom Purchase
            </Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} className="flex-grow">
          {activeTab === "subscriptions" ? (
            <View className="space-y-4">
              <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-slate-500 mb-2">
                Evaluate the impact of pausing recurring monthly payments on your savings trajectory.
              </Text>
              
              {loadingSubs ? (
                <ActivityIndicator size="small" color="#005bbf" className="py-6" />
              ) : subscriptions.length === 0 ? (
                <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-slate-400 italic text-center py-4">
                  No active pausable subscriptions found.
                </Text>
              ) : (
                <View className="space-y-2">
                  {subscriptions.map((sub) => {
                    const isSelected = selectedSub?.id === sub.id;
                    return (
                      <Pressable
                        key={sub.id}
                        onPress={() => {
                          triggerHaptic();
                          setSelectedSub(sub);
                          setEvalResult(null);
                        }}
                        className={`flex-row justify-between items-center p-4 rounded-2xl border ${
                          isSelected ? "bg-blue-50/50 border-blue-600" : "bg-slate-50/50 border-slate-100"
                        }`}
                      >
                        <View className="flex-row items-center space-x-3.5">
                          <View className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                            <MaterialIcons name="subscriptions" size={20} color={isSelected ? "#005bbf" : "#64748b"} />
                          </View>
                          <View>
                            <Text style={{ fontFamily: "Inter_700Bold" }} className="text-sm text-slate-800">
                              {sub.name}
                            </Text>
                            <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-[10px] text-slate-400">
                              Billed: {sub.billing_date}
                            </Text>
                          </View>
                        </View>
                        <Text style={{ fontFamily: "Inter_700Bold" }} className="text-sm text-slate-800">
                          ₹{sub.amount}/mo
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          ) : (
            <View className="space-y-4">
              <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-slate-500 mb-2">
                Simulate a hypothetical item purchase to evaluate how it impacts your budgets and goals.
              </Text>

              {/* Form Input fields */}
              <View className="space-y-3">
                <View>
                  <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Item Name</Text>
                  <TextInput
                    value={itemName}
                    onChangeText={setItemName}
                    placeholder="e.g. boAt Airdopes"
                    placeholderTextColor="#94a3b8"
                    className="bg-slate-50 border border-slate-100 text-slate-800 rounded-xl px-4 py-3 text-xs"
                  />
                </View>

                <View>
                  <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Price (₹)</Text>
                  <TextInput
                    value={itemPrice}
                    onChangeText={itemPrice => setItemPrice(itemPrice.replace(/[^0-9.]/g, ""))}
                    placeholder="e.g. 1499"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    className="bg-slate-50 border border-slate-100 text-slate-800 rounded-xl px-4 py-3 text-xs"
                  />
                </View>

                <View>
                  <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Category</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {categories.map((cat) => {
                      const isSelected = category === cat;
                      return (
                        <Pressable
                          key={cat}
                          onPress={() => {
                            triggerHaptic();
                            setCategory(cat);
                          }}
                          className={`py-2 px-3 rounded-lg border ${
                            isSelected ? "bg-blue-50 border-blue-600" : "bg-slate-50 border-slate-100"
                          }`}
                        >
                          <Text 
                            style={{ fontFamily: "WorkSans_500Medium" }} 
                            className={`text-[10px] font-semibold ${isSelected ? "text-blue-700" : "text-slate-500"}`}
                          >
                            {cat}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Action button */}
          <Pressable
            disabled={evalLoading}
            style={({ pressed }) => [
              styles.actionBtn,
              { opacity: (pressed || evalLoading) ? 0.85 : 1 }
            ]}
            onPress={handleEvaluate}
            className="mt-6 mb-4 w-full h-12 rounded-xl bg-blue-600 items-center justify-center flex-row"
          >
            {evalLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <MaterialIcons name="auto-awesome" size={16} color="#ffffff" className="mr-2" />
                <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-white text-sm">
                  {activeTab === "subscriptions" ? "Evaluate Pause" : "Should I Buy?"}
                </Text>
              </>
            )}
          </Pressable>

          {/* AI Result Card */}
          {evalResult && (
            <View style={styles.card} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mt-2 space-y-3.5">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center space-x-2">
                  <MaterialIcons name="smart-toy" size={18} color="#005bbf" />
                  <Text style={{ fontFamily: "Inter_700Bold" }} className="text-xs text-slate-800">
                    AI recommendation
                  </Text>
                </View>
                {/* Budget status badge */}
                <View 
                  style={{ backgroundColor: getStatusColor(evalResult.budget_status).bg }}
                  className="px-2.5 py-0.5 rounded-full"
                >
                  <Text 
                    style={{ fontFamily: "WorkSans_600SemiBold", color: getStatusColor(evalResult.budget_status).text }}
                    className="text-[9px] uppercase tracking-wider font-bold"
                  >
                    Budget: {getStatusColor(evalResult.budget_status).label}
                  </Text>
                </View>
              </View>

              {/* Advice description */}
              <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-slate-600 leading-relaxed">
                "{evalResult.advice}"
              </Text>

              {/* Goal impact status bar */}
              <View className="border-t border-slate-200/60 pt-3 flex-row items-start space-x-2">
                <MaterialIcons name="track-changes" size={16} color="#64748b" className="mt-0.5" />
                <View className="flex-1">
                  <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-[10px] text-slate-700 font-bold mb-0.5">
                    Goal impact
                  </Text>
                  <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-slate-500">
                    {evalResult.goal_impact}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: "flex-end",
  },
  sheet: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 24,
  },
  actionBtn: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  }
});

export default SubscriptionNegotiatorScreen;
