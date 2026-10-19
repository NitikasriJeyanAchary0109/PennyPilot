import React, { useState } from "react";
import { 
  View, 
  Text, 
  ScrollView, 
  Pressable, 
  SafeAreaView, 
  StyleSheet, 
  Image, 
  TextInput,
  Modal,
  Alert,
  ActivityIndicator
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { apiService } from "../../services/api";

export const EmergencyWithdrawalScreen = ({ route, navigation }: { route: any; navigation: any }) => {
  const goalName = route?.params?.goalName || "Laptop Goal";
  const balance = route?.params?.savedAmount || 12500;

  const [amount, setAmount] = useState("1000");
  const [reason, setReason] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const REASONS = [
    { value: "medical", label: "Medical Emergency" },
    { value: "food", label: "Food & Essentials" },
    { value: "rent", label: "Rent / Housing" },
    { value: "travel", label: "Urgent Travel" },
  ];

  const handleConfirm = async () => {
    if (!reason) {
      Alert.alert("Reason Required", "Please select a reason for this withdrawal.");
      return;
    }
    const val = parseFloat(amount) || 0;
    if (val <= 0 || val > balance) {
      Alert.alert("Invalid Amount", `Please enter an amount between ₹1 and ₹${balance.toLocaleString("en-IN")}.`);
      return;
    }

    triggerHaptic();
    setIsProcessing(true);

    try {
      const goalId = route?.params?.goalId || 1;
      await apiService.withdrawGoal(goalId, { amount: val, reason });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsCompleted(true);
      
      Alert.alert(
        "Withdrawal Confirmed",
        `Successfully transferred ₹${val.toLocaleString("en-IN")} from "${goalName}" to your primary account.`,
        [{ text: "Done", onPress: () => navigation.goBack() }]
      );
    } catch (e: any) {
      Alert.alert("Withdrawal Error", e.message || "Failed to process emergency withdrawal.");
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedReasonLabel = REASONS.find(r => r.value === reason)?.label || "Select a reason...";

  return (
    <SafeAreaView className="flex-1 bg-[#f7f9ff]">
      {/* Top App Bar */}
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
          <Text style={{ fontFamily: "Inter_700Bold" }} className="text-xl text-ob-primary">
            Penny Pilot
          </Text>
        </View>
        <View className="flex-row items-center space-x-2">
          <View className="w-8 h-8 rounded-full overflow-hidden border border-outline-variant">
            <Image 
              source={{ uri: "https://lh3.googleusercontent.com/aida-public/AB6AXuCBr27xl_NE-E1FDPyMOkQ6F9N0JWMqe4a-rxCzIAUHCWjiKEx_-EC11TzOV-_P-w4JXq7rxu1J_KU-jbYFTFNm85P7aRHT1MyAivzuJT9J9oE_D2oh9oxHww-AFOV2UpqLxTX1Wb-Z-vrSyp5yjtyAQb0ty7Rt2Vr3e4wjPBJL3avBkgRprPasP2HktDndAhaylkaCllZXvcTZnNpzrxMrhvr7UUTDzfIWdozJmDLsdOHRzk2D4Hr2" }}
              style={{ width: "100%", height: "100%", resizeMode: "cover" }}
            />
          </View>
          <Pressable 
            onPress={triggerHaptic}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            className="p-1"
          >
            <MaterialIcons name="settings" size={20} color="#5c5f60" />
          </Pressable>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120 }}>
        {/* Emergency Header */}
        <View className="items-center mb-6">
          <View className="w-16 h-16 bg-error-container text-on-error-container rounded-full items-center justify-center mb-4 shadow-sm">
            <MaterialIcons name="emergency" size={32} color="#ba1a1a" />
          </View>
          <Text style={{ fontFamily: "Inter_700Bold" }} className="text-2xl text-on-surface text-center mb-1">
            Emergency Withdrawal
          </Text>
          <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-sm text-on-surface-variant text-center px-4">
            Funds will be moved to your primary account instantly
          </Text>
        </View>

        {/* Warning Banner */}
        <View style={styles.warningCard} className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex-row space-x-3 mb-6 items-center">
          <MaterialIcons name="warning" size={24} color="#d97706" />
          <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-amber-900 flex-1 leading-5">
            <Text style={{ fontFamily: "WorkSans_500Medium" }} className="font-bold">Attention:</Text> This withdrawal will delay your 'New Laptop' goal by <Text style={{ fontFamily: "WorkSans_500Medium" }} className="font-bold">6 days</Text>.
          </Text>
        </View>

        {/* Amount Input */}
        <View className="items-center mb-6">
          <View className="flex-row items-center justify-center">
            <Text style={{ fontFamily: "Inter_800ExtraBold" }} className="text-4xl text-on-surface mr-2">
              ₹
            </Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              maxLength={6}
              style={{ fontFamily: "Inter_800ExtraBold", fontSize: 44, color: "#181c20", minWidth: 100, textAlign: "center" }}
            />
          </View>
          <View className="mt-2 bg-slate-100 px-3.5 py-1.5 rounded-full border border-slate-200/50">
            <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-on-surface-variant">
              Balance: ₹12,500
            </Text>
          </View>
        </View>

        {/* Custom Dropdown Selector */}
        <View className="mb-6">
          <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-on-surface-variant mb-2 ml-2 uppercase tracking-wider">
            Reason for withdrawal
          </Text>
          <Pressable
            onPress={() => {
              triggerHaptic();
              setShowPicker(true);
            }}
            className="flex-row justify-between items-center bg-white border border-outline-variant rounded-2xl py-4 px-5"
          >
            <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-base text-on-surface">
              {selectedReasonLabel}
            </Text>
            <MaterialIcons name="expand-more" size={24} color="#5c5f60" />
          </Pressable>
        </View>

        {/* AI Insight Card */}
        <View style={styles.card} className="bg-white border border-outline-variant/30 rounded-2xl p-5 mb-8 flex-row space-x-4 items-start">
          <View className="p-2 bg-primary-fixed rounded-xl">
            <MaterialIcons name="smart-toy" size={24} color="#005bbf" />
          </View>
          <View className="flex-1">
            <Text style={{ fontFamily: "Inter_700Bold" }} className="text-sm text-on-surface mb-1">
              Coach's Tip
            </Text>
            <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-on-surface-variant leading-relaxed">
              Try to keep this below ₹2,000 to keep your "Financial Resilience" badge active this month.
            </Text>
          </View>
        </View>

        {/* Dropdown Modal Selector */}
        <Modal visible={showPicker} transparent animationType="slide">
          <View style={styles.pickerModalOverlay} className="flex-1 justify-end">
            <View className="bg-white rounded-t-3xl pt-2 pb-8 px-margin-mobile">
              <View className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4" />
              <Text style={{ fontFamily: "Inter_700Bold" }} className="text-lg text-on-surface mb-4 px-2">
                Select a reason
              </Text>
              {REASONS.map((r) => (
                <Pressable
                  key={r.value}
                  onPress={() => {
                    triggerHaptic();
                    setReason(r.value);
                    setShowPicker(false);
                  }}
                  className="py-4 border-b border-slate-100 flex-row justify-between items-center"
                >
                  <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-sm text-on-surface pl-2">
                    {r.label}
                  </Text>
                  {reason === r.value && (
                    <MaterialIcons name="check" size={20} color="#005bbf" />
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        </Modal>
      </ScrollView>

      {/* Fixed bottom actions */}
      <View style={styles.fixedBottom} className="px-margin-mobile py-4 bg-white/95 border-t border-slate-100">
        <Pressable
          android_ripple={{ color: "rgba(255,255,255,0.2)" }}
          disabled={isProcessing}
          style={({ pressed }) => [
            styles.confirmBtn,
            { 
              opacity: pressed || isProcessing ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
              backgroundColor: isCompleted ? "#006d2a" : "#ba1a1a"
            }
          ]}
          onPress={handleConfirm}
        >
          {isProcessing ? (
            <View className="flex-row items-center space-x-2">
              <ActivityIndicator size="small" color="#ffffff" />
              <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-white text-base">
                Processing...
              </Text>
            </View>
          ) : isCompleted ? (
            <View className="flex-row items-center space-x-2">
              <MaterialIcons name="check-circle" size={20} color="#ffffff" />
              <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-white text-base">
                Transfer Complete
              </Text>
            </View>
          ) : (
            <View className="flex-row items-center space-x-2">
              <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-white text-base mr-1">
                Confirm Withdrawal
              </Text>
              <MaterialIcons name="arrow-forward" size={20} color="#ffffff" />
            </View>
          )}
        </Pressable>
        <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-[10px] text-on-surface-variant text-center mt-3 px-margin-mobile">
          By confirming, you agree to the instant transfer terms.
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  warningCard: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  pickerModalOverlay: {
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  fixedBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  confirmBtn: {
    width: "100%",
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  }
});

export default EmergencyWithdrawalScreen;
