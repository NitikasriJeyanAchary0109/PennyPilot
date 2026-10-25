import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  TextInput,
} from "react-native";
import {
  ArrowLeft,
  ShieldAlert,
  Check,
  ChevronDown,
  HeartHandshake,
  AlertTriangle,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { apiService, getErrorMessage } from "../../services/api";
import {
  ScreenContainer,
  Card,
  Button,
  Skeleton,
  EmptyState,
} from "../../components/ui";

const REASONS = [
  { value: "medical", label: "Medical Emergency" },
  { value: "food", label: "Food & Daily Essentials" },
  { value: "rent", label: "Rent & Housing" },
  { value: "travel", label: "Urgent Family Travel" },
  { value: "other", label: "Other Unexpected Emergency" },
];

export const EmergencyWithdrawalScreen = ({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) => {
  const goalIdParam = route?.params?.goalId;
  const [goalId, setGoalId] = useState<number | null>(goalIdParam || null);
  const [goalName, setGoalName] = useState<string>(route?.params?.goalName || "");
  const [balance, setBalance] = useState<number>(route?.params?.savedAmount || 0);

  const [availableGoals, setAvailableGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const triggerHaptic = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore on web
    }
  };

  const loadGoalData = useCallback(async () => {
    try {
      setLoading(true);
      if (goalIdParam) {
        const goalData = await apiService.getGoalById(goalIdParam);
        if (goalData) {
          setGoalId(goalData.goal_id);
          setGoalName(goalData.goal_name);
          setBalance(Number(goalData.saved) || 0);
        }
      } else {
        // If no goalIdParam, fetch all goals so user can select
        const allGoals = await apiService.getGoals();
        if (Array.isArray(allGoals) && allGoals.length > 0) {
          setAvailableGoals(allGoals);
          const firstWithBalance = allGoals.find((g) => Number(g.saved) > 0) || allGoals[0];
          setGoalId(firstWithBalance.goal_id);
          setGoalName(firstWithBalance.goal_name);
          setBalance(Number(firstWithBalance.saved) || 0);
        }
      }
    } catch (e: any) {
      console.warn("Failed to load goal for withdrawal:", e?.message);
      Alert.alert("Couldn't load goals", getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [goalIdParam]);

  useEffect(() => {
    loadGoalData();
  }, [loadGoalData]);

  const formatINR = (val: number): string => {
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const handleConfirm = async () => {
    if (!goalId) {
      Alert.alert("Goal Required", "Please select a goal to withdraw funds from.");
      return;
    }
    if (!reason) {
      Alert.alert("Reason Required", "Please choose a reason for this withdrawal.");
      return;
    }

    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid withdrawal amount.");
      return;
    }

    if (val > balance) {
      Alert.alert(
        "Insufficient Balance",
        `Your maximum withdrawable balance from "${goalName}" is ₹${formatINR(balance)}.`
      );
      return;
    }

    triggerHaptic();
    setIsProcessing(true);

    try {
      const result = await apiService.withdrawGoal(goalId, { amount: val, reason });
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // Ignore on web
      }

      // The backend message is explicit that this updates Penny Pilot's records
      // and does not move money in a bank account.
      Alert.alert("Withdrawal recorded", result.message, [
        { text: "Done", onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert(
        "Withdrawal not recorded",
        getErrorMessage(e, "Failed to record the withdrawal. Please try again.")
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedReasonLabel =
    REASONS.find((r) => r.value === reason)?.label || "Choose emergency reason...";

  return (
    <ScreenContainer className="pt-2 pb-8">
      {/* Top Header */}
      <View className="flex-row items-center justify-between mb-4">
        <TouchableOpacity
          onPress={() => {
            triggerHaptic();
            navigation.goBack();
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          className="w-10 h-10 rounded-full bg-white border border-border items-center justify-center shadow-card"
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={20} color="#144a32" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-text-primary font-sans">
          Emergency Safety Net
        </Text>
        <View className="w-10" />
      </View>

      {loading ? (
        <View className="space-y-4 py-4">
          <Skeleton width="100%" height={120} className="rounded-card mb-4" />
          <Skeleton width="100%" height={140} className="rounded-card mb-4" />
          <Skeleton width="100%" height={80} className="rounded-card" />
        </View>
      ) : balance <= 0 && !goalName ? (
        <Card variant="default" padding="lg" className="items-center shadow-card my-6">
          <EmptyState
            title="No Withdrawable Goals"
            description="You don't currently have any active savings goals with an accumulated balance."
            actionTitle="View Goals →"
            onAction={() => navigation.navigate("Goals")}
            icon={<ShieldAlert size={32} color="#144a32" />}
          />
        </Card>
      ) : (
        <View className="space-y-4">
          {/* Compassionate Reassurance Card */}
          <Card variant="peach" padding="md" className="shadow-card mb-3">
            <View className="flex-row items-start">
              <View className="w-9 h-9 rounded-full bg-white/80 items-center justify-center mr-3 mt-0.5 border border-border/40">
                <HeartHandshake size={20} color="#856529" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-text-primary font-sans">
                  Life happens. You're protected.
                </Text>
                <Text className="text-xs text-text-secondary font-sans mt-1 leading-relaxed">
                  Your micro-savings are there for urgent needs. Release what you need now — there are no penalties, and your goal history stays accurate.
                </Text>
              </View>
            </View>
          </Card>

          {/* Goal & Balance Card */}
          <Card variant="default" padding="md" className="shadow-card mb-3">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans">
                Source Goal
              </Text>
              {availableGoals.length > 1 && (
                <TouchableOpacity
                  onPress={() => setShowGoalPicker(true)}
                  className="flex-row items-center"
                >
                  <Text className="text-xs font-semibold text-primary font-sans mr-1">
                    Change Goal
                  </Text>
                  <ChevronDown size={14} color="#144a32" />
                </TouchableOpacity>
              )}
            </View>

            <Text className="text-base font-bold text-text-primary font-sans">
              {goalName}
            </Text>

            <View className="flex-row items-baseline mt-2 pt-2 border-t border-border/50">
              <Text className="text-xs text-text-secondary font-sans">
                Available to release:
              </Text>
              <Text className="text-base font-bold text-primary font-sans ml-2">
                ₹{formatINR(balance)}
              </Text>
            </View>
          </Card>

          {/* Amount Entry Card */}
          <Card variant="default" padding="lg" className="shadow-card items-center mb-3">
            <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans mb-2">
              Withdrawal Amount
            </Text>

            <View className="flex-row items-center justify-center my-2">
              <Text className="text-3xl font-bold text-text-primary font-sans mr-1.5">
                ₹
              </Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor="#707773"
                keyboardType="numeric"
                className="text-4xl font-bold text-text-primary font-sans text-center min-w-[120px] pb-1"
                maxLength={7}
              />
            </View>

            {/* Quick preset buttons (UX convenience) */}
            {balance > 0 && (
              <View className="flex-row space-x-2 mt-2">
                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic();
                    setAmount(Math.min(500, balance).toString());
                  }}
                  className="px-3 py-1.5 rounded-full bg-cream border border-border mr-2"
                >
                  <Text className="text-xs font-bold text-text-secondary font-sans">
                    ₹500
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic();
                    setAmount(Math.min(1000, balance).toString());
                  }}
                  className="px-3 py-1.5 rounded-full bg-cream border border-border mr-2"
                >
                  <Text className="text-xs font-bold text-text-secondary font-sans">
                    ₹1,000
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic();
                    setAmount(balance.toString());
                  }}
                  className="px-3 py-1.5 rounded-full bg-sage-light border border-border"
                >
                  <Text className="text-xs font-bold text-primary font-sans">
                    All (₹{formatINR(balance)})
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </Card>

          {/* Reason Selector */}
          <View className="mb-4">
            <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans mb-1.5 ml-1">
              Reason for withdrawal
            </Text>
            <TouchableOpacity
              onPress={() => {
                triggerHaptic();
                setShowPicker(true);
              }}
              activeOpacity={0.8}
              className="flex-row items-center justify-between p-4 bg-white border border-border rounded-2xl shadow-card min-h-[48px]"
              accessibilityRole="button"
              accessibilityLabel={`Reason: ${selectedReasonLabel}`}
            >
              <Text
                className={`text-sm font-sans ${
                  reason ? "font-bold text-text-primary" : "text-text-muted"
                }`}
              >
                {selectedReasonLabel}
              </Text>
              <ChevronDown size={18} color="#707773" />
            </TouchableOpacity>
          </View>

          {/* Action Button */}
          <Button
            title={isProcessing ? "Recording..." : "Record Emergency Withdrawal"}
            variant="danger"
            size="lg"
            disabled={isProcessing || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > balance}
            onPress={handleConfirm}
            className="mt-2 min-h-[50px]"
          />
        </View>
      )}

      {/* Reason Picker Modal */}
      <Modal visible={showPicker} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl pt-3 pb-8 px-5">
            <View className="w-12 h-1.5 bg-border rounded-full mx-auto mb-4" />
            <Text className="text-base font-bold text-text-primary font-sans mb-3">
              Select Emergency Reason
            </Text>
            {REASONS.map((r) => {
              const isSelected = reason === r.value;
              return (
                <TouchableOpacity
                  key={r.value}
                  onPress={() => {
                    triggerHaptic();
                    setReason(r.value);
                    setShowPicker(false);
                  }}
                  className="py-3.5 border-b border-border/50 flex-row justify-between items-center min-h-[48px]"
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text
                    className={`text-sm font-sans ${
                      isSelected
                        ? "font-bold text-primary"
                        : "font-medium text-text-secondary"
                    }`}
                  >
                    {r.label}
                  </Text>
                  {isSelected && <Check size={18} color="#144a32" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* Goal Switcher Modal */}
      {availableGoals.length > 1 && (
        <Modal visible={showGoalPicker} transparent animationType="slide">
          <View className="flex-1 justify-end bg-black/40">
            <View className="bg-white rounded-t-3xl pt-3 pb-8 px-5">
              <View className="w-12 h-1.5 bg-border rounded-full mx-auto mb-4" />
              <Text className="text-base font-bold text-text-primary font-sans mb-3">
                Select Source Goal
              </Text>
              {availableGoals.map((g) => {
                const isSelected = goalId === g.goal_id;
                return (
                  <TouchableOpacity
                    key={g.goal_id}
                    onPress={() => {
                      triggerHaptic();
                      setGoalId(g.goal_id);
                      setGoalName(g.goal_name);
                      setBalance(Number(g.saved) || 0);
                      setShowGoalPicker(false);
                    }}
                    className="py-3.5 border-b border-border/50 flex-row justify-between items-center min-h-[48px]"
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View>
                      <Text
                        className={`text-sm font-sans ${
                          isSelected
                            ? "font-bold text-primary"
                            : "font-medium text-text-secondary"
                        }`}
                      >
                        {g.goal_name}
                      </Text>
                      <Text className="text-xs text-text-muted font-sans mt-0.5">
                        Balance: ₹{formatINR(Number(g.saved) || 0)}
                      </Text>
                    </View>
                    {isSelected && <Check size={18} color="#144a32" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Modal>
      )}
    </ScreenContainer>
  );
};

export default EmergencyWithdrawalScreen;
