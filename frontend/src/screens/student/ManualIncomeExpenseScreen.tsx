import React, { useMemo, useState } from "react";
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
import { apiService } from "../../services/api";
import { ScreenContainer } from "../../components/ui/ScreenContainer";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";

interface ExpenseItem {
  id: string;
  name: string;
  amount: number;
  icon: React.ComponentType<{ size: number; color: string }>;
}

const PRESET_EXPENSES: ExpenseItem[] = [
  { id: "rent", name: "Rent & Housing", amount: 8000, icon: Home },
  { id: "tuition", name: "Tuition & Books", amount: 12000, icon: GraduationCap },
  { id: "food", name: "Food & Groceries", amount: 3000, icon: Utensils },
  { id: "utilities", name: "Utilities & Wifi", amount: 1500, icon: Zap },
  { id: "transport", name: "Transport & Transit", amount: 1000, icon: Bus },
];

export default function ManualIncomeExpenseScreen({ navigation }: { navigation: any }) {
  const [income, setIncome] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const totalRecurring = useMemo(() => {
    return PRESET_EXPENSES
      .filter((item) => selectedIds.includes(item.id))
      .reduce((sum, item) => sum + item.amount, 0);
  }, [selectedIds]);

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

    setSaving(true);
    try {
      // 1. Record the baseline income credit
      await apiService.createTransaction({
        amount: monthlyIncome,
        category: "Income",
        merchant: "Monthly Income / Allowance",
        type: "credit",
        description: "Initial baseline added during onboarding",
      });

      // 2. Record selected recurring expenses
      const selectedExpenses = PRESET_EXPENSES.filter((item) => selectedIds.includes(item.id));
      await Promise.all(
        selectedExpenses.map((item) =>
          apiService.createTransaction({
            amount: item.amount,
            category: item.name,
            merchant: item.name,
            type: "debit",
            description: "Recurring monthly cost added during onboarding",
          })
        )
      );

      navigation.navigate("CreateGoal");
    } catch (error: any) {
      Alert.alert(
        "Could Not Save Setup",
        error?.response?.data?.detail || "An error occurred while saving. Please try again."
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
            placeholder="15000"
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
          Select typical monthly commitments you expect to pay.
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
                accessibilityLabel={`${item.name}, ₹${item.amount.toLocaleString("en-IN")} per month`}
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
                    <Text className="font-sans text-xs text-text-secondary">
                      ₹{item.amount.toLocaleString("en-IN")}/mo
                    </Text>
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

        {/* Total Summary Footer */}
        <View className="mt-5 pt-4 border-t border-border flex-row items-center justify-between">
          <Text className="font-sans text-xs font-medium text-text-secondary">
            Estimated Monthly Costs
          </Text>
          <Text className="font-sans font-extrabold text-base text-primary">
            ₹{totalRecurring.toLocaleString("en-IN")}
          </Text>
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
