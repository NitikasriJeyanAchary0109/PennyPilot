import React, { useState, useEffect } from "react";
import { 
  View, 
  Text, 
  ScrollView, 
  Pressable, 
  SafeAreaView, 
  StyleSheet, 
  Dimensions 
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming 
} from "react-native-reanimated";
import { apiService } from "../../services/api";

// Width calculation for keys (3 columns)
const { width } = Dimensions.get("window");
const keyWidth = (width - 1) / 3;

interface ExpenseCategory {
  id: string;
  name: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  amount: number;
}

const DEFAULT_EXPENSES: ExpenseCategory[] = [
  { id: "rent", name: "Rent", icon: "home", amount: 8000 },
  { id: "tuition", name: "Tuition", icon: "school", amount: 12000 },
  { id: "food", name: "Food", icon: "restaurant", amount: 3000 },
  { id: "utilities", name: "Utilities", icon: "bolt", amount: 1500 },
  { id: "transport", name: "Transport", icon: "directions-bus", amount: 1000 },
];

export const SpendingSetupScreen = ({ navigation }: { navigation: any }) => {
  const [currentInput, setCurrentInput] = useState("0");
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set());

  // Cursor blink animation
  const cursorOpacity = useSharedValue(1);
  useEffect(() => {
    cursorOpacity.value = withRepeat(
      withTiming(0, { duration: 500 }),
      -1,
      true
    );
  }, []);

  const cursorStyle = useAnimatedStyle(() => ({
    opacity: cursorOpacity.value
  }));

  // Trigger haptic feedback
  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const appendDigit = (digit: string) => {
    triggerHaptic();
    if (currentInput === "0" && digit !== ".") {
      setCurrentInput(digit);
    } else {
      // Prevent multiple decimals
      if (digit === "." && currentInput.includes(".")) return;
      // Limit to 8 digits
      if (currentInput.length >= 8) return;
      setCurrentInput(currentInput + digit);
    }
  };

  const deleteDigit = () => {
    triggerHaptic();
    if (currentInput.length > 1) {
      setCurrentInput(currentInput.slice(0, -1));
    } else {
      setCurrentInput("0");
    }
  };

  const toggleExpense = (id: string) => {
    triggerHaptic();
    const newSelected = new Set(selectedExpenses);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedExpenses(newSelected);
  };

  // Calculate total expenses
  const totalExpenses = DEFAULT_EXPENSES.reduce((sum, item) => {
    return selectedExpenses.has(item.id) ? sum + item.amount : sum;
  }, 0);

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Top Navigation Bar */}
      <View className="flex-row justify-between items-center px-margin-mobile py-stack-md border-b border-slate-100">
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
        <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold" }} className="text-lg text-ob-primary">
          Penny Pilot
        </Text>
        <View className="w-6" /> {/* Spacer */}
      </View>

      {/* Main Content Area */}
      <ScrollView 
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 380 }}
      >
        {/* Income Display */}
        <View className="items-center mb-8">
          <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-on-surface-variant uppercase tracking-wider mb-2">
            Enter your monthly income
          </Text>
          <View className="flex-row items-center justify-center">
            <Text style={{ fontFamily: "PlusJakartaSans_800ExtraBold" }} className="text-4xl text-on-surface mr-1">
              ₹
            </Text>
            <Text style={{ fontFamily: "PlusJakartaSans_800ExtraBold" }} className="text-4xl text-on-surface">
              {currentInput}
            </Text>
            {/* Blinking blue cursor */}
            <Animated.View style={[cursorStyle, styles.cursor]} />
          </View>
        </View>

        {/* Expense Selection Card */}
        <View style={styles.card} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5">
          <View className="flex-row items-center justify-between mb-4">
            <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold" }} className="text-base text-on-surface">
              Add recurring expenses
            </Text>
            <MaterialIcons name="info" size={20} color="#1a73e8" />
          </View>

          {/* Chips */}
          <View className="flex-row flex-wrap gap-2 mb-6">
            {DEFAULT_EXPENSES.map((item) => {
              const isSelected = selectedExpenses.has(item.id);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => toggleExpense(item.id)}
                  className={`flex-row items-center space-x-1.5 px-4 py-2.5 rounded-full border ${
                    isSelected 
                      ? "bg-primary-container border-primary-container" 
                      : "bg-surface-container border-outline-variant"
                  }`}
                  style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.95 : 1 }] }]}
                >
                  <MaterialIcons 
                    name={item.icon} 
                    size={16} 
                    color={isSelected ? "#ffffff" : "#414754"} 
                  />
                  <Text 
                    style={{ fontFamily: "WorkSans_500Medium" }} 
                    className={`text-sm ${isSelected ? "text-white" : "text-on-surface-variant"}`}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              );
            })}
            
            {/* Other Chip (Dashed) */}
            <Pressable
              onPress={() => {
                triggerHaptic();
                // Mock dialog or direct input addition
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }}
              style={({ pressed }) => [
                styles.dashedChip,
                { transform: [{ scale: pressed ? 0.95 : 1 }] }
              ]}
              className="flex-row items-center space-x-1.5 px-4 py-2.5 rounded-full"
            >
              <MaterialIcons name="add" size={16} color="#414754" />
              <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-sm text-on-surface-variant">
                Other
              </Text>
            </Pressable>
          </View>

          {/* Expenses total summary */}
          <View className="pt-4 border-t border-outline-variant flex-row justify-between items-center">
            {selectedExpenses.size === 0 ? (
              <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-sm text-on-surface-variant/60 italic">
                No recurring expenses added yet
              </Text>
            ) : (
              <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-sm text-on-surface-variant">
                Selected expenses ({selectedExpenses.size})
              </Text>
            )}
            <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-lg text-on-surface">
              ₹{totalExpenses.toLocaleString("en-IN")}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Fixed bottom pad and continue button */}
      <View style={styles.fixedBottom} className="border-t border-outline-variant bg-white">
        {/* Grid Numpad */}
        <View className="flex-row flex-wrap bg-slate-100">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"].map((digit) => (
            <Pressable
              key={digit}
              onPress={() => appendDigit(digit)}
              style={({ pressed }) => [
                styles.numpadKey,
                { backgroundColor: pressed ? "#f1f3f4" : "#ffffff" }
              ]}
            >
              <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-2xl text-on-surface">
                {digit}
              </Text>
            </Pressable>
          ))}
          {/* Backspace Key */}
          <Pressable
            onPress={deleteDigit}
            style={({ pressed }) => [
              styles.numpadKey,
              { backgroundColor: pressed ? "#f1f3f4" : "#ffffff" }
            ]}
          >
            <MaterialIcons name="backspace" size={24} color="#ba1a1a" />
          </Pressable>
        </View>

        {/* Primary action */}
        <View className="px-margin-mobile py-4 bg-white">
          <Pressable 
            android_ripple={{ color: "rgba(255,255,255,0.2)" }}
            style={({ pressed }) => [
              styles.continueBtn,
              { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }
            ]}
            onPress={async () => {
              triggerHaptic();
              try {
                await apiService.postManualSalary({
                  monthly_income: parseFloat(currentInput) || 0,
                  recurring_expenses: totalExpenses
                });
              } catch (e) {
                console.warn("Manual salary POST error:", e);
              }
              navigation.navigate("GoalCreation", { 
                monthlyIncome: parseFloat(currentInput) || 0,
                expensesTotal: totalExpenses
              });
            }}
          >
            <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold" }} className="text-white text-base mr-1">
              Continue
            </Text>
            <MaterialIcons name="arrow-forward" size={20} color="#ffffff" />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  cursor: {
    width: 2.5,
    height: 38,
    backgroundColor: "#1a73e8",
    marginLeft: 3,
  },
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  dashedChip: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#c1c6d6",
    backgroundColor: "transparent",
  },
  fixedBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  numpadKey: {
    width: keyWidth,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
    borderColor: "#f1f3f4",
  },
  continueBtn: {
    width: "100%",
    height: 56,
    backgroundColor: "#005bbf",
    borderRadius: 28,
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

export default SpendingSetupScreen;
