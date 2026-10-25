import React, { useRef, useState } from "react";
import { View, Text, TouchableOpacity, TextInput, Alert, ScrollView } from "react-native";
import {
  ArrowLeft,
  Home,
  GraduationCap,
  Utensils,
  Zap,
  Bus,
  Check,
  Info,
  IndianRupee,
  PlusCircle,
} from "lucide-react-native";
import { apiService, getErrorMessage } from "../../services/api";
import { ScreenContainer } from "../../components/ui/ScreenContainer";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";

interface ExpenseItem {
  id: string;
  name: string;
  icon: React.ComponentType<{ size: number; color: string }>;
}

// Only the *kinds* of recurring cost are preset. The amount is always what the
// student types — nothing is assumed on their behalf.
const PRESET_EXPENSES: ExpenseItem[] = [
  { id: "rent", name: "Rent & Housing", icon: Home },
  { id: "tuition", name: "Tuition & Books", icon: GraduationCap },
  { id: "food", name: "Food & Groceries", icon: Utensils },
  { id: "utilities", name: "Utilities & Wifi", icon: Zap },
  { id: "transport", name: "Transport & Transit", icon: Bus },
];

export default function ManualIncomeExpenseScreen({ navigation }: { navigation: any }) {
  const [income, setIncome] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Entries already saved by a previous (partially failed) attempt, so a retry
  // doesn't record them twice.
  const savedKeys = useRef<Set<string>>(new Set());

  const toggleExpense = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleContinue = async () => {
    const monthlyIncome = Number(income.replace(/,/g, ""));
    if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) {
      Alert.alert(
        "Monthly Income Required",
        "Please enter your expected monthly allowance or income greater than ₹0."
      );
      return;
    }

    const selectedExpenses = PRESET_EXPENSES.filter((item) => selectedIds.includes(item.id));
    for (const item of selectedExpenses) {
      const value = Number((amounts[item.id] || "").replace(/,/g, ""));
      if (!Number.isFinite(value) || value <= 0) {
        Alert.alert("Amount needed", `Enter a monthly amount for ${item.name}, or untick it.`);
        return;
      }
    }

    setSaving(true);
    try {
      // Baseline entries are bookkeeping, not purchases: no round-ups.
      // 1. Record the baseline income credit
      if (!savedKeys.current.has("income")) {
        await apiService.createTransaction({
          amount: monthlyIncome,
          category: "Income",
          merchant: "Monthly Income / Allowance",
          type: "credit",
          description: "Initial baseline added during onboarding",
          applyRoundup: false,
        });
        savedKeys.current.add("income");
      }

      // 2. Record selected recurring expenses, one at a time
      for (const item of selectedExpenses) {
        if (savedKeys.current.has(item.id)) continue;
        await apiService.createTransaction({
          amount: Number((amounts[item.id] || "").replace(/,/g, "")),
          category: item.name,
          merchant: item.name,
          type: "debit",
          description: "Recurring monthly cost added during onboarding",
          applyRoundup: false,
        });
        savedKeys.current.add(item.id);
      }

      navigation.navigate("CreateGoal");
    } catch (error: any) {
      Alert.alert(
        "Could Not Save Setup",
        getErrorMessage(error, "An error occurred while saving. Please try again.")
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer scrollable={true} className="py-2">
      {/* Top Header */}
      <View className="flex-row items-center py-3 mb-2">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
          className="p-2 -ml-2 mr-2 rounded-full active:bg-surface-cream"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={22} color="#144a32" />
        </TouchableOpacity>
        <Text className="font-sans font-bold text-lg text-primary">
          Step 1: Income & Expenses
        </Text>
      </View>

      {/* Income Card */}
      <Card variant="default" className="p-5 mb-5">
        <Text className="font-sans font-semibold text-xs text-text-secondary uppercase tracking-wider mb-2">
          Monthly Income / Allowance
        </Text>
        <Text className="font-sans text-xs text-text-secondary mb-3 leading-relaxed">
          How much money comes into your student account each month?
        </Text>

        <View className="flex-row items-center bg-surface-cream rounded-input border border-border px-4 py-2">
          <Text className="font-sans font-extrabold text-3xl text-primary mr-1">
            ₹
          </Text>
          <TextInput
            value={income}
            onChangeText={(val) => setIncome(val.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            placeholder="Enter amount"
            placeholderTextColor="#707773"
            className="flex-1 font-sans font-bold text-2xl text-text py-2"
            accessibilityLabel="Monthly income input in Rupees"
          />
        </View>
      </Card>

      {/* Recurring Expenses Card */}
      <Card variant="default" className="p-5 mb-6">
        <View className="flex-row items-center justify-between mb-1">
          <Text className="font-sans font-bold text-base text-text">
            Recurring Expenses
          </Text>
          <View className="flex-row items-center bg-primary-tint/60 px-2.5 py-1 rounded-full">
            <Info size={12} color="#144a32" className="mr-1" />
            <Text className="font-sans text-[11px] font-semibold text-primary">
              Tap to select
            </Text>
          </View>
        </View>
        <Text className="font-sans text-xs text-text-secondary mb-4 leading-relaxed">
          Tick the monthly costs you have and enter what you pay for each.
        </Text>

        <View className="gap-2.5">
          {PRESET_EXPENSES.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            const Icon = item.icon;
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => toggleExpense(item.id)}
                activeOpacity={0.8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={item.name}
                className={`flex-row items-center justify-between p-3.5 rounded-2xl border transition-all ${
                  isSelected
                    ? "bg-primary-tint border-primary shadow-sm"
                    : "bg-surface border-border active:bg-surface-cream"
                }`}
              >
                <View className="flex-row items-center flex-1 pr-2">
                  <View
                    className={`w-9 h-9 rounded-xl items-center justify-center mr-3 ${
                      isSelected ? "bg-primary" : "bg-surface-cream"
                    }`}
                  >
                    <Icon size={18} color={isSelected ? "#ffffff" : "#144a32"} />
                  </View>
                  <View>
                    <Text className="font-sans font-semibold text-sm text-text">
                      {item.name}
                    </Text>
                    {isSelected ? (
                      <View className="flex-row items-center">
                        <Text className="font-sans text-xs text-text-secondary mr-1">₹</Text>
                        <TextInput
                          value={amounts[item.id] || ""}
                          onChangeText={(val) =>
                            setAmounts((prev) => ({
                              ...prev,
                              [item.id]: val.replace(/[^0-9]/g, ""),
                            }))
                          }
                          keyboardType="number-pad"
                          placeholder="per month"
                          placeholderTextColor="#707773"
                          className="font-sans text-sm text-text min-w-[90px] py-0.5"
                          accessibilityLabel={`Monthly amount for ${item.name}`}
                        />
                      </View>
                    ) : (
                      <Text className="font-sans text-xs text-text-secondary">
                        Tap to add
                      </Text>
                    )}
                  </View>
                </View>

                <View
                  className={`w-6 h-6 rounded-full items-center justify-center border ${
                    isSelected ? "bg-primary border-primary" : "border-border bg-surface"
                  }`}
                >
                  {isSelected && <Check size={14} color="#ffffff" strokeWidth={3} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

      </Card>

      {/* Action Button */}
      <View className="w-full mb-6">
        <Button
          title={saving ? "Saving Setup…" : "Continue to Your Goal"}
          onPress={handleContinue}
          loading={saving}
          disabled={saving}
          variant="primary"
          size="lg"
          accessibilityLabel="Continue to Your Goal"
        />
      </View>
    </ScreenContainer>
  );
}
