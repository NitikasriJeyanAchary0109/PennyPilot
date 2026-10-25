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
  RefreshCw,
  Music,
  Tv,
  ShoppingBag,
  Zap,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { apiService, getErrorMessage } from "../../services/api";
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

const getSubscriptionIcon = (subName: string) => {
  const norm = subName.toLowerCase();
  if (norm.includes("spotify") || norm.includes("music")) {
    return (
      <View className="w-9 h-9 rounded-xl bg-emerald-100 items-center justify-center mr-3 border border-emerald-200">
        <Music size={18} color="#059669" />
      </View>
    );
  }
  if (norm.includes("amazon") || norm.includes("prime") || norm.includes("shop")) {
    return (
      <View className="w-9 h-9 rounded-xl bg-sky-100 items-center justify-center mr-3 border border-sky-200">
        <ShoppingBag size={18} color="#0284c7" />
      </View>
    );
  }
  if (norm.includes("netflix") || norm.includes("tv") || norm.includes("stream")) {
    return (
      <View className="w-9 h-9 rounded-xl bg-rose-100 items-center justify-center mr-3 border border-rose-200">
        <Tv size={18} color="#e11d48" />
      </View>
    );
  }
  return (
    <View className="w-9 h-9 rounded-xl bg-amber-100 items-center justify-center mr-3 border border-amber-200">
      <Zap size={18} color="#d97706" />
    </View>
  );
};

export const SubscriptionNegotiatorScreen = ({
  navigation,
}: {
  navigation: any;
}) => {
  const [activeTab, setActiveTab] = useState<"subscriptions" | "custom">("subscriptions");
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [selectedSub, setSelectedSub] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [subsError, setSubsError] = useState<string | null>(null);

  // Custom purchase form
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [category, setCategory] = useState("Coffee");
  const [customCategory, setCustomCategory] = useState("");
  const [isCustomCategory, setIsCustomCategory] = useState(false);

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
      const list = Array.isArray(res) ? res : [];
      setSubscriptions(list);
      setSelectedSub(list.length > 0 ? list[0] : null);
      setSubsError(null);
    } catch (e: any) {
      console.warn("Failed to fetch subscriptions:", e?.message);
      setSubsError(getErrorMessage(e, "Couldn't load your subscriptions."));
    } finally {
      setLoadingSubs(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const handleSyncSubscriptions = async () => {
    try {
      triggerHaptic();
      setSyncing(true);
      const res = await apiService.syncSubscriptions();
      const list = Array.isArray(res?.subscriptions) ? res.subscriptions : [];
      setSubscriptions(list);
      setSelectedSub(list.length > 0 ? list[0] : null);
      setSubsError(null);
      Alert.alert("Rescan complete", res?.message);
    } catch (e: any) {
      Alert.alert("Rescan failed", getErrorMessage(e, "Couldn't rescan your transactions."));
    } finally {
      setSyncing(false);
    }
  };

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
      cat = selectedSub.category || "Subscriptions";
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
      cat = isCustomCategory ? (customCategory.trim() || "Custom") : category;
      desc = itemName.trim();
    }

    try {
      setEvalLoading(true);
      const res = await apiService.evaluatePurchase({
        price: priceNum,
        category: cat,
        description: desc,
        // Subscriptions tab asks "what if I stop paying this?"; the other tab
        // asks "what if I buy this?".
        kind: activeTab === "subscriptions" ? "pause" : "purchase",
      });
      setEvalResult(res);
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // Ignore on web
      }
    } catch (e: any) {
      Alert.alert("Couldn't evaluate", getErrorMessage(e, "Failed to run the evaluation."));
    } finally {
      setEvalLoading(false);
    }
  };

  // Penny Pilot has no connection to subscription providers, so it cannot pause
  // anything — be explicit about that instead of pretending.
  const handleHowToPause = () => {
    triggerHaptic();
    Alert.alert(
      `Pausing ${selectedSub?.name}`,
      `Penny Pilot can't pause subscriptions for you. Open ${
        selectedSub?.merchant || "the provider's"
      } app or website and pause or cancel it there. Once you've kept the ₹${formatINR(
        selectedSub?.amount
      )}, record it from a goal using a manual deposit.`
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
        <Card variant="default" padding="md" className="shadow-card mb-4 p-5">
          <View className="flex-row items-center justify-between mb-1.5 px-0.5">
            <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans">
              Active Subscriptions
            </Text>
            <View className="flex-row items-center bg-primary-tint/70 px-2 py-0.5 rounded-full">
              <Text className="text-[10px] font-semibold text-primary font-sans">
                From your transactions
              </Text>
            </View>
          </View>

          <Text className="text-xs text-text-secondary font-sans mb-3.5 leading-relaxed px-0.5">
            Select a subscription to see how much sooner you'd reach your goal if you saved that money instead.
          </Text>

          {/* Sync API Section */}
          <View className="flex-row items-center justify-between bg-cream/70 p-2.5 rounded-2xl border border-border/60 mb-3.5">
            <View className="flex-1 pr-2">
              <Text className="text-xs font-semibold text-text-primary font-sans">
                Detected from payments you've logged or imported
              </Text>
              <Text className="text-[10px] text-text-muted font-sans">
                Penny Pilot isn't connected to your bank or UPI
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleSyncSubscriptions}
              disabled={syncing}
              className="py-1.5 px-3 rounded-xl bg-white border border-primary/40 flex-row items-center shadow-button active:opacity-70"
            >
              <RefreshCw
                size={12}
                color="#144a32"
                className={syncing ? "animate-spin mr-1.5" : "mr-1.5"}
              />
              <Text className="text-[11px] font-bold text-primary font-sans">
                {syncing ? "Scanning..." : "Rescan"}
              </Text>
            </TouchableOpacity>
          </View>

          {loadingSubs ? (
            <View className="space-y-2 py-2">
              <Skeleton width="100%" height={64} className="rounded-2xl mb-2" />
              <Skeleton width="100%" height={64} className="rounded-2xl mb-2" />
              <Skeleton width="100%" height={64} className="rounded-2xl" />
            </View>
          ) : subsError ? (
            <Text className="text-xs text-danger text-center py-4 font-sans">
              {subsError}
            </Text>
          ) : subscriptions.length === 0 ? (
            <Text className="text-xs text-text-muted italic text-center py-4 font-sans">
              No subscriptions found in your transactions yet. Log or import a payment
              (for example Netflix or Spotify) and tap Rescan.
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
                    className={`p-3.5 rounded-2xl border min-h-[62px] mb-2.5 ${
                      isSelected
                        ? "bg-sage-light/80 border-primary shadow-sm"
                        : "bg-surface-cream border-border"
                    }`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center flex-1 pr-2">
                        {getSubscriptionIcon(sub.name)}
                        <View className="flex-1">
                          <View className="flex-row items-center flex-wrap">
                            <Text
                              className={`text-sm font-sans ${
                                isSelected
                                  ? "font-bold text-primary"
                                  : "font-semibold text-text-primary"
                              }`}
                            >
                              {sub.name}
                            </Text>
                            {sub.auto_tracked && (
                              <View className="ml-1.5 bg-primary/10 px-1.5 py-0.5 rounded-md">
                                <Text className="text-[9px] font-bold text-primary font-sans">
                                  Tracked
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text className="text-[11px] text-text-muted font-sans mt-0.5">
                            {sub.billing_date ? `Last charged ${sub.billing_date}` : "Monthly billing"} • ≈ ₹{formatINR(sub.annual_cost)}/yr if monthly
                          </Text>
                        </View>
                      </View>

                      <View className="items-end pl-1">
                        <Text className="text-sm font-bold text-text-primary font-sans">
                          ₹{formatINR(sub.amount)}
                          <Text className="text-[10px] text-text-muted font-normal">
                            /mo
                          </Text>
                        </Text>
                        <View
                          className={`w-5 h-5 rounded-full items-center justify-center mt-1 ${
                            isSelected ? "bg-primary" : "border border-border bg-white"
                          }`}
                        >
                          {isSelected && <Check size={11} color="#ffffff" />}
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <Button
            title={evalLoading ? "Analyzing..." : "See Pause Impact →"}
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
        <Card variant="default" padding="md" className="shadow-card mb-4 p-5">
          <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans mb-1 px-0.5">
            Evaluate a Desired Purchase
          </Text>
          <Text className="text-xs text-text-secondary font-sans mb-3.5 leading-relaxed px-0.5">
            Thinking of buying something non-essential? Penny Pilot checks it against your budget and how it would affect your goal.
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
            <View className="flex-row items-center justify-between mb-2 px-0.5">
              <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans">
                Category
              </Text>
              <View className="flex-row items-center bg-primary-tint/70 px-2 py-0.5 rounded-full">
                <Text className="text-[10px] font-semibold text-primary font-sans">
                  ✍️ Or type custom category
                </Text>
              </View>
            </View>

            <View className="flex-row flex-wrap gap-2">
              {CATEGORIES.map((cat) => {
                const isSelected = !isCustomCategory && category === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => {
                      triggerHaptic();
                      setIsCustomCategory(false);
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
              <TouchableOpacity
                onPress={() => {
                  triggerHaptic();
                  setIsCustomCategory(true);
                  if (customCategory.trim()) {
                    setCategory(customCategory.trim());
                  }
                }}
                className={`px-3 py-2 rounded-xl border mb-1.5 ${
                  isCustomCategory
                    ? "bg-primary border-primary shadow-button"
                    : "bg-cream border-border"
                }`}
              >
                <Text
                  className={`text-xs font-sans ${
                    isCustomCategory
                      ? "font-bold text-white"
                      : "font-semibold text-text-secondary"
                  }`}
                >
                  + Custom
                </Text>
              </TouchableOpacity>
            </View>

            {isCustomCategory && (
              <View className="mt-2 bg-cream rounded-xl border border-primary/40 px-3.5 py-1">
                <TextInput
                  placeholder="Type custom category (e.g. Subscriptions, Streaming)"
                  placeholderTextColor="#707773"
                  value={customCategory}
                  onChangeText={(val) => {
                    setCustomCategory(val);
                    setCategory(val.trim() || "Other");
                  }}
                  className="font-sans text-xs text-text py-2"
                  autoFocus
                />
              </View>
            )}

            <Text className="text-[11px] text-text-muted font-sans mt-2 px-0.5">
              💡 Tip: Select a quick preset or tap + Custom to type any category directly.
            </Text>
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
                  ? "Over budget"
                  : evalResult.budget_status === "warning"
                  ? "Near budget limit"
                  : evalResult.budget_status === "no_budget"
                  ? "No budget set"
                  : "Within budget"
              }
              variant={
                evalResult.budget_status === "exceeded"
                  ? "danger"
                  : evalResult.budget_status === "warning"
                  ? "warning"
                  : evalResult.budget_status === "no_budget"
                  ? "default"
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
              title={`How to pause ${selectedSub.name}`}
              variant="nudge"
              size="md"
              onPress={handleHowToPause}
              className="mt-1"
            />
          )}
        </Card>
      )}
    </ScreenContainer>
  );
};

export default SubscriptionNegotiatorScreen;
