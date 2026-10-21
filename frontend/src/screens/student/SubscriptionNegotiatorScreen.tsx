import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert, TextInput } from "react-native";
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Check,
  Tag,
  ShieldCheck,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { apiService } from "../../services/api";
import {
  ScreenContainer,
  Card,
  Chip,
  Button,
  Skeleton,
} from "../../components/ui";

const CATEGORIES = [
  "Coffee",
  "Dining",
  "Electronics",
  "Entertainment",
  "Subscriptions",
];

export const SubscriptionNegotiatorScreen = ({
  navigation,
}: {
  navigation: any;
}) => {
  const [activeTab, setActiveTab] = useState<"subscriptions" | "custom">("subscriptions");
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [selectedSub, setSelectedSub] = useState<any>(null);

  // Custom purchase form
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [category, setCategory] = useState("Coffee");

  // Evaluation state
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalResult, setEvalResult] = useState<any>(null);

  const triggerHaptic = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore on web
    }
  };

  const fetchSubscriptions = useCallback(async () => {
    try {
      setLoadingSubs(true);
      const res = await apiService.getNegotiatorSubscriptions();
      if (Array.isArray(res)) {
        setSubscriptions(res);
        if (res.length > 0) {
          setSelectedSub(res[0]);
        }
      } else {
        setSubscriptions([]);
      }
    } catch (e: any) {
      console.warn("Failed to fetch subscriptions:", e?.message);
    } finally {
      setLoadingSubs(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const formatINR = (val: number | string | null | undefined): string => {
    const num = typeof val === "number" ? val : parseFloat(String(val || 0));
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(isNaN(num) ? 0 : num);
  };

  const handleEvaluate = async () => {
    triggerHaptic();
    setEvalResult(null);

    let priceNum = 0;
    let cat = "";
    let desc = "";

    if (activeTab === "subscriptions") {
      if (!selectedSub) {
        Alert.alert("Selection Required", "Please select a recurring subscription to evaluate.");
        return;
      }
      priceNum = Number(selectedSub.amount) || 0;
      cat = "Subscriptions";
      desc = selectedSub.name;
    } else {
      if (!itemName.trim() || !itemPrice.trim()) {
        Alert.alert("Input Required", "Please enter both an item name and expected price.");
        return;
      }
      priceNum = parseFloat(itemPrice);
      if (isNaN(priceNum) || priceNum <= 0) {
        Alert.alert("Invalid Price", "Please enter a valid price amount greater than ₹0.");
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
        description: desc,
      });
      setEvalResult(res);
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // Ignore on web
      }
    } catch (e: any) {
      Alert.alert("Evaluation Error", e?.message || "Failed to run AI purchase evaluation.");
    } finally {
      setEvalLoading(false);
    }
  };

  const handleConfirmPause = () => {
    triggerHaptic();
    Alert.alert(
      "Subscription Paused",
      `Successfully scheduled a pause for ${selectedSub?.name}. We will redirect ₹${formatINR(
        selectedSub?.amount
      )} to your priority savings goal next billing cycle!`,
      [{ text: "Great!", onPress: () => navigation.goBack() }]
    );
  };

  return (
    <ScreenContainer className="pt-2 pb-8">
      {/* Top Header */}
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
          <View>
            <Text className="text-lg font-bold text-text-primary font-sans">
              Impulse & Subscription Evaluator
            </Text>
            <Text className="text-xs text-text-muted font-sans mt-0.5">
              AI delay evaluator and subscription pauser
            </Text>
          </View>
        </View>
      </View>

      {/* Mode Switcher Tabs */}
      <View className="flex-row bg-cream p-1 rounded-2xl border border-border justify-center mb-4">
        <TouchableOpacity
          onPress={() => {
            triggerHaptic();
            setActiveTab("subscriptions");
            setEvalResult(null);
          }}
          activeOpacity={0.8}
          className={`flex-1 py-2.5 px-3 rounded-xl items-center flex-row justify-center min-h-[44px] ${
            activeTab === "subscriptions"
              ? "bg-white shadow-button border border-border/40"
              : ""
          }`}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "subscriptions" }}
        >
          <ShieldCheck
            size={15}
            color={activeTab === "subscriptions" ? "#144a32" : "#666e69"}
          />
          <Text
            className={`text-xs ml-1.5 font-sans ${
              activeTab === "subscriptions"
                ? "font-bold text-primary"
                : "font-semibold text-text-muted"
            }`}
          >
            Subscription Pause
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            triggerHaptic();
            setActiveTab("custom");
            setEvalResult(null);
          }}
          activeOpacity={0.8}
          className={`flex-1 py-2.5 px-3 rounded-xl items-center flex-row justify-center min-h-[44px] ${
            activeTab === "custom"
              ? "bg-white shadow-button border border-border/40"
              : ""
          }`}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "custom" }}
        >
          <Sparkles
            size={15}
            color={activeTab === "custom" ? "#144a32" : "#666e69"}
          />
          <Text
            className={`text-xs ml-1.5 font-sans ${
              activeTab === "custom"
                ? "font-bold text-primary"
                : "font-semibold text-text-muted"
            }`}
          >
            Custom Purchase
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab 1: Subscriptions */}
      {activeTab === "subscriptions" ? (
        <Card variant="default" padding="md" className="shadow-card mb-4">
          <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans mb-1">
            Active Subscriptions
          </Text>
          <Text className="text-xs text-text-secondary font-sans mb-3 leading-relaxed">
            Select an ongoing monthly subscription to analyze the impact of pausing it for 30–60 days.
          </Text>

          {loadingSubs ? (
            <View className="space-y-2 py-2">
              <Skeleton width="100%" height={56} className="rounded-2xl mb-2" />
              <Skeleton width="100%" height={56} className="rounded-2xl" />
            </View>
          ) : subscriptions.length === 0 ? (
            <Text className="text-xs text-text-muted italic text-center py-4 font-sans">
              No active recurring subscriptions detected.
            </Text>
          ) : (
            <View className="space-y-2 mb-2">
              {subscriptions.map((sub) => {
                const isSelected = selectedSub?.id === sub.id;
                return (
                  <TouchableOpacity
                    key={sub.id}
                    onPress={() => {
                      triggerHaptic();
                      setSelectedSub(sub);
                      setEvalResult(null);
                    }}
                    activeOpacity={0.8}
                    className={`flex-row items-center justify-between p-3.5 rounded-2xl border min-h-[50px] mb-2 ${
                      isSelected
                        ? "bg-sage-light/70 border-primary shadow-sm"
                        : "bg-cream border-border"
                    }`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                  >
                    <View className="flex-row items-center">
                      <View
                        className={`w-7 h-7 rounded-full items-center justify-center mr-3 ${
                          isSelected ? "bg-primary" : "bg-white border border-border"
                        }`}
                      >
                        {isSelected && <Check size={14} color="#ffffff" />}
                      </View>
                      <Text
                        className={`text-sm font-sans ${
                          isSelected
                            ? "font-bold text-primary"
                            : "font-semibold text-text-primary"
                        }`}
                      >
                        {sub.name}
                      </Text>
                    </View>
                    <Text className="text-sm font-bold text-text-primary font-sans">
                      ₹{formatINR(sub.amount)}
                      <Text className="text-[10px] text-text-muted font-normal">
                        /mo
                      </Text>
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <Button
            title={evalLoading ? "Analyzing Impact..." : "Evaluate Pause Impact"}
            variant="primary"
            size="lg"
            onPress={handleEvaluate}
            loading={evalLoading}
            disabled={evalLoading || !selectedSub}
            className="mt-3 min-h-[48px]"
          />
        </Card>
      ) : (
        /* Tab 2: Custom Purchase */
        <Card variant="default" padding="md" className="shadow-card mb-4">
          <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans mb-1">
            Evaluate a Desired Purchase
          </Text>
          <Text className="text-xs text-text-secondary font-sans mb-3 leading-relaxed">
            Thinking of buying something non-essential? Our rule engine checks if it will delay your goals.
          </Text>

          <View className="mb-3">
            <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans mb-1.5 ml-1">
              Item Name
            </Text>
            <TextInput
              value={itemName}
              onChangeText={setItemName}
              placeholder="e.g. Wireless Noise-Cancelling Headphones"
              placeholderTextColor="#707773"
              className="bg-cream border border-border rounded-2xl px-4 py-3 text-xs text-text-primary font-sans min-h-[44px]"
            />
          </View>

          <View className="mb-3">
            <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans mb-1.5 ml-1">
              Estimated Price (₹)
            </Text>
            <TextInput
              value={itemPrice}
              onChangeText={(val) => setItemPrice(val.replace(/[^0-9.]/g, ""))}
              placeholder="e.g. 2499"
              placeholderTextColor="#707773"
              keyboardType="decimal-pad"
              className="bg-cream border border-border rounded-2xl px-4 py-3 text-xs text-text-primary font-sans min-h-[44px]"
            />
          </View>

          <View className="mb-4">
            <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans mb-2 ml-1">
              Category
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {CATEGORIES.map((cat) => {
                const isSelected = category === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => {
                      triggerHaptic();
                      setCategory(cat);
                    }}
                    className={`px-3 py-2 rounded-xl border mb-1.5 ${
                      isSelected
                        ? "bg-primary border-primary shadow-button"
                        : "bg-cream border-border"
                    }`}
                  >
                    <Text
                      className={`text-xs font-sans ${
                        isSelected
                          ? "font-bold text-white"
                          : "font-semibold text-text-secondary"
                      }`}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <Button
            title={evalLoading ? "Analyzing..." : "Should I Buy This?"}
            variant="primary"
            size="lg"
            onPress={handleEvaluate}
            loading={evalLoading}
            disabled={evalLoading || !itemName || !itemPrice}
            className="mt-2 min-h-[48px]"
          />
        </Card>
      )}

      {/* AI Evaluation Result Card */}
      {evalResult && (
        <Card variant="peach" padding="md" className="shadow-card mb-4">
          <View className="flex-row items-center justify-between mb-2 pb-2 border-b border-border/40">
            <View className="flex-row items-center">
              <Sparkles size={16} color="#856529" className="mr-1.5" />
              <Text className="text-xs font-bold text-text-primary font-sans ml-1">
                AI Recommendation
              </Text>
            </View>

            <Chip
              label={
                evalResult.budget_status === "exceeded"
                  ? "Over Limit"
                  : evalResult.budget_status === "warning"
                  ? "High Impact"
                  : "Within Safe Range"
              }
              variant={
                evalResult.budget_status === "exceeded"
                  ? "danger"
                  : evalResult.budget_status === "warning"
                  ? "warning"
                  : "success"
              }
            />
          </View>

          <Text className="text-xs text-text-primary font-sans leading-relaxed mb-3">
            "{evalResult.advice}"
          </Text>

          {evalResult.goal_impact && (
            <View className="bg-white/80 p-3 rounded-xl border border-border/60 mb-3">
              <View className="flex-row items-center mb-1">
                <Clock size={13} color="#144a32" className="mr-1.5" />
                <Text className="text-xs font-bold text-primary font-sans ml-1">
                  Goal Timeline Impact
                </Text>
              </View>
              <Text className="text-xs text-text-secondary font-sans leading-relaxed">
                {evalResult.goal_impact}
              </Text>
            </View>
          )}

          {activeTab === "subscriptions" && selectedSub && (
            <Button
              title={`Pause ${selectedSub.name} & Save ₹${formatINR(
                selectedSub.amount
              )}/mo`}
              variant="nudge"
              size="md"
              onPress={handleConfirmPause}
              className="mt-1"
            />
          )}
        </Card>
      )}
    </ScreenContainer>
  );
};

export default SubscriptionNegotiatorScreen;
