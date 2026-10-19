import React, { useMemo, useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { apiService } from "../../services/api";

const expenses = [
  { name: "Rent", amount: 8000, icon: "home" },
  { name: "Tuition", amount: 12000, icon: "school" },
  { name: "Food", amount: 3000, icon: "restaurant" },
  { name: "Utilities", amount: 1500, icon: "bolt" },
  { name: "Transport", amount: 1000, icon: "directions-bus" },
] as const;

export default function ManualIncomeExpenseScreen({ navigation }: { navigation: any }) {
  const [income, setIncome] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const total = useMemo(() => expenses.filter((item) => selected.includes(item.name)).reduce((sum, item) => sum + item.amount, 0), [selected]);
  const toggle = (name: string) => setSelected((items) => items.includes(name) ? items.filter((item) => item !== name) : [...items, name]);

  const continueToGoal = async () => {
    const monthlyIncome = Number(income.replace(/,/g, ""));
    if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) {
      Alert.alert("Enter monthly income", "Please enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    try {
      await apiService.createTransaction({ amount: monthlyIncome, category: "Income", merchant: "Monthly income", type: "credit", description: "Added during onboarding" });
      await Promise.all(expenses.filter((item) => selected.includes(item.name)).map((item) => apiService.createTransaction({ amount: item.amount, category: item.name, merchant: item.name, type: "debit", description: "Recurring expense added during onboarding" })));
      navigation.navigate("CreateGoal");
    } catch (error: any) {
      Alert.alert("Could not save spending", error?.response?.data?.detail || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return <SafeAreaView className="flex-1 bg-white">
    <View className="flex-row items-center border-b border-surface-container-high px-margin-mobile py-stack-md"><Pressable onPress={() => navigation.goBack()} className="mr-4"><MaterialIcons name="arrow-back" size={24} color="#181c20" /></Pressable><Text className="font-jakarta-semibold text-lg text-ob-primary">Penny Pilot</Text></View>
    <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 32, paddingBottom: 40 }}>
      <View className="items-center"><Text className="font-worksans-medium text-xs uppercase tracking-wider text-on-surface-variant">Enter your monthly income</Text><View className="mt-2 flex-row items-center"><Text className="font-jakarta-extrabold text-4xl text-on-surface">₹</Text><TextInput value={income} onChangeText={(value) => setIncome(value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="0" placeholderTextColor="#c1c6d6" className="min-w-[150px] font-jakarta-extrabold text-4xl text-on-surface" /></View></View>
      <View className="mt-stack-xl rounded-3xl border border-outline-variant bg-surface-container-lowest p-5"><View className="flex-row items-center justify-between"><Text className="font-jakarta-semibold text-lg text-on-surface">Add recurring expenses</Text><MaterialIcons name="info-outline" size={20} color="#005bbf" /></View><Text className="mt-1 font-worksans text-sm text-on-surface-variant">Tap any costs you expect every month.</Text>
        <View className="mt-5 flex-row flex-wrap gap-2">{expenses.map((item) => { const active = selected.includes(item.name); return <Pressable key={item.name} onPress={() => toggle(item.name)} className={`flex-row items-center rounded-full border px-4 py-2.5 ${active ? "border-teal-700 bg-teal-700" : "border-outline-variant bg-surface-container"}`}><MaterialIcons name={item.icon} size={17} color={active ? "#fff" : "#414754"} /><Text className={`ml-1.5 font-worksans-medium text-sm ${active ? "text-white" : "text-on-surface-variant"}`}>{item.name}</Text></Pressable>; })}</View>
        <View className="mt-5 flex-row justify-between border-t border-outline-variant pt-4"><Text className="font-worksans text-sm text-on-surface-variant">Recurring expenses</Text><Text className="font-jakarta-bold text-lg text-on-surface">₹{total.toLocaleString("en-IN")}</Text></View>
      </View>
      <Pressable disabled={saving} onPress={continueToGoal} className={`mt-stack-xl h-14 items-center justify-center rounded-full ${saving ? "bg-primary-fixed-dim" : "bg-primary-container"}`}><Text className="font-jakarta-semibold text-base text-white">{saving ? "Saving…" : "Continue to your goal"}</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}
