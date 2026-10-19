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
  TextInput,
  Modal,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { apiService } from "../../services/api";

export const BudgetsScreen = () => {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Budgets state
  const [budgets, setBudgets] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({
    total_budgeted: 0,
    total_spent: 0,
    remaining: 0,
  });

  // Modal forms state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBudget, setEditingBudget] = useState<any>(null); // null if creating, budget object if editing
  const [category, setCategory] = useState("Coffee");
  const [limitAmount, setLimitAmount] = useState("");

  const categories = ["Coffee", "Dining", "Textbooks", "Entertainment", "Shopping"];

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const loadBudgetData = async () => {
    try {
      setLoading(true);
      const res = await apiService.getBudgetsStatus();
      if (res) {
        setBudgets(res.budgets || []);
        setSummary({
          total_budgeted: Number(res.total_budgeted) || 0,
          total_spent: Number(res.total_spent) || 0,
          remaining: Number(res.remaining) || 0,
        });
      }
    } catch (e: any) {
      console.warn("Failed to load budgets:", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadBudgetData();
    setRefreshing(false);
  };

  useEffect(() => {
    loadBudgetData();
  }, []);

  const handleOpenCreate = () => {
    triggerHaptic();
    setEditingBudget(null);
    setCategory("Coffee");
    setLimitAmount("");
    setModalVisible(true);
  };

  const handleOpenEdit = (budget: any) => {
    triggerHaptic();
    setEditingBudget(budget);
    setCategory(budget.category);
    setLimitAmount(budget.limit_amount.toString());
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    triggerHaptic();
    if (!limitAmount.trim()) {
      Alert.alert("Error", "Please enter a limit amount.");
      return;
    }
    const limitNum = parseFloat(limitAmount);
    if (isNaN(limitNum) || limitNum <= 0) {
      Alert.alert("Error", "Please enter a valid positive amount.");
      return;
    }

    try {
      setLoading(true);
      if (editingBudget) {
        // Edit flow
        await apiService.updateBudget(editingBudget.id, {
          limit_amount: limitNum,
        });
        Alert.alert("Success", `Updated ${editingBudget.category} budget limit.`);
      } else {
        // Check duplicate category
        if (budgets.some((b) => b.category.toLowerCase() === category.toLowerCase())) {
          Alert.alert("Error", `A budget for category '${category}' already exists.`);
          return;
        }
        // Create flow
        await apiService.createBudget({
          category,
          limit_amount: limitNum,
        });
        Alert.alert("Success", `Created budget for ${category}.`);
      }
      setModalVisible(false);
      loadBudgetData();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save budget.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (budget: any) => {
    triggerHaptic();
    Alert.alert(
      "Delete Budget",
      `Are you sure you want to delete the budget for ${budget.category}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              await apiService.deleteBudget(budget.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("Deleted", `Budget for ${budget.category} deleted.`);
              loadBudgetData();
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to delete budget.");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f7f9ff]">
      {/* Header Banner */}
      <View className="flex-row items-center justify-between px-margin-mobile py-stack-md bg-white border-b border-slate-100">
        <View className="flex-row items-center space-x-2">
          <Pressable
            onPress={() => {
              triggerHaptic();
              navigation.goBack();
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-50 border border-slate-100"
          >
            <MaterialIcons name="arrow-back" size={20} color="#181c20" />
          </Pressable>
          <Text
            style={{ fontFamily: "Inter_700Bold" }}
            className="text-lg text-slate-800 font-bold ml-2"
          >
            Manage Budgets
          </Text>
        </View>
        <Pressable
          onPress={handleOpenCreate}
          className="px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 flex-row items-center space-x-1"
        >
          <MaterialIcons name="add" size={14} color="#005bc0" />
          <Text
            style={{ fontFamily: "WorkSans_600SemiBold" }}
            className="text-[10px] text-blue-700 font-bold uppercase tracking-wider"
          >
            Add Budget
          </Text>
        </Pressable>
      </View>

      <ScrollView
        className="flex-grow"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#005bbf" />
        }
      >
        {/* Total Aggregate Card */}
        <View style={styles.card} className="bg-white rounded-3xl p-5 border border-slate-100 mb-6">
          <Text
            style={{ fontFamily: "WorkSans_500Medium" }}
            className="text-slate-400 text-xs uppercase tracking-wider mb-2"
          >
            Total Budget Aggregate
          </Text>
          <View className="flex-row justify-between items-baseline mb-4">
            <Text
              style={{ fontFamily: "Inter_800ExtraBold" }}
              className="text-3xl text-slate-800 font-extrabold"
            >
              ₹{summary.total_spent.toLocaleString("en-IN")}
            </Text>
            <Text
              style={{ fontFamily: "WorkSans_400Regular" }}
              className="text-slate-500 text-xs"
            >
              spent of ₹{summary.total_budgeted.toLocaleString("en-IN")}
            </Text>
          </View>

          {/* Semicircle / straight indicator progress */}
          <View className="h-3 w-full bg-slate-100 rounded-full overflow-hidden mb-4">
            <View
              style={{
                width: `${Math.min(
                  (summary.total_spent / (summary.total_budgeted || 1)) * 100,
                  100
                )}%`,
                backgroundColor: summary.total_spent > summary.total_budgeted ? "#ba1a1a" : "#005bbf",
              }}
              className="h-full rounded-full"
            />
          </View>

          <View className="flex-row justify-between items-center">
            <View className="flex-row items-center space-x-1.5">
              <View
                style={{
                  backgroundColor: summary.remaining >= 0 ? "#e6f4ea" : "#fce8e6",
                }}
                className="w-2.5 h-2.5 rounded-full"
              />
              <Text
                style={{ fontFamily: "WorkSans_500Medium" }}
                className="text-slate-600 text-xs"
              >
                {summary.remaining >= 0 ? "Remaining Balance" : "Budget Overrun"}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: "Inter_700Bold",
                color: summary.remaining >= 0 ? "#137333" : "#c5221f",
              }}
              className="text-sm font-bold"
            >
              ₹{Math.abs(summary.remaining).toLocaleString("en-IN")}
            </Text>
          </View>
        </View>

        {/* Budgets List */}
        <View className="space-y-4">
          <Text
            style={{ fontFamily: "Inter_700Bold" }}
            className="text-base text-slate-800 mb-1"
          >
            Category Budgets
          </Text>

          {loading && budgets.length === 0 ? (
            <ActivityIndicator size="large" color="#005bbf" className="py-8" />
          ) : budgets.length === 0 ? (
            <View className="items-center justify-center py-12 bg-white rounded-3xl border border-slate-100 p-6">
              <MaterialIcons name="pie-chart-outlined" size={40} color="#94a3b8" className="mb-3" />
              <Text
                style={{ fontFamily: "Inter_700Bold" }}
                className="text-slate-800 text-sm mb-1"
              >
                No Budgets Setup
              </Text>
              <Text
                style={{ fontFamily: "WorkSans_400Regular" }}
                className="text-slate-400 text-xs text-center px-4"
              >
                Establish budget boundaries to receive custom micro-saving suggestions!
              </Text>
            </View>
          ) : (
            budgets.map((b) => {
              const limit = Number(b.limit_amount) || 1;
              const spent = Number(b.spent_amount) || 0;
              const percent = Math.min(Math.round((spent / limit) * 100), 150);
              const isOver = b.is_over_limit || spent > limit;
              const isWarning = !isOver && spent / limit >= 0.85;

              return (
                <View
                  key={b.id}
                  style={styles.card}
                  className="bg-white rounded-2xl p-4 border border-slate-100 space-y-3"
                >
                  <View className="flex-row justify-between items-center">
                    <View className="flex-row items-center space-x-3">
                      <View className="w-10 h-10 rounded-full bg-blue-50/50 flex items-center justify-center">
                        <MaterialIcons
                          name={
                            b.category.toLowerCase() === "coffee"
                              ? "local-cafe"
                              : b.category.toLowerCase() === "dining"
                              ? "restaurant"
                              : b.category.toLowerCase() === "textbooks"
                              ? "menu-book"
                              : b.category.toLowerCase() === "shopping"
                              ? "shopping-bag"
                              : "card-giftcard"
                          }
                          size={18}
                          color="#005bbf"
                        />
                      </View>
                      <View>
                        <Text
                          style={{ fontFamily: "Inter_700Bold" }}
                          className="text-sm text-slate-800"
                        >
                          {b.category}
                        </Text>
                        <Text
                          style={{ fontFamily: "WorkSans_400Regular" }}
                          className="text-[10px] text-slate-400 uppercase tracking-wider"
                        >
                          {b.period} Cycle
                        </Text>
                      </View>
                    </View>

                    {/* Status Pill Badge */}
                    <View
                      style={{
                        backgroundColor: isOver
                          ? "#fde8e8"
                          : isWarning
                          ? "#fef3c7"
                          : "#e6f4ea",
                      }}
                      className="px-2.5 py-0.5 rounded-full"
                    >
                      <Text
                        style={{
                          fontFamily: "WorkSans_600SemiBold",
                          color: isOver ? "#c5221f" : isWarning ? "#b06000" : "#137333",
                        }}
                        className="text-[8px] font-bold uppercase tracking-wider"
                      >
                        {isOver ? "Exceeded" : isWarning ? "Warning" : "Safe"}
                      </Text>
                    </View>
                  </View>

                  {/* Progress info */}
                  <View className="space-y-1.5">
                    <View className="flex-row justify-between text-[11px] text-slate-500">
                      <Text style={{ fontFamily: "WorkSans_400Regular" }}>
                        Spent: ₹{spent.toLocaleString("en-IN")}
                      </Text>
                      <Text style={{ fontFamily: "WorkSans_400Regular" }}>
                        Limit: ₹{limit.toLocaleString("en-IN")}
                      </Text>
                    </View>
                    <View className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <View
                        style={{
                          width: `${Math.min(percent, 100)}%`,
                          backgroundColor: isOver ? "#c5221f" : isWarning ? "#d97706" : "#1a73e8",
                        }}
                        className="h-full rounded-full"
                      />
                    </View>
                  </View>

                  {/* Modify/Delete actions */}
                  <View className="border-t border-slate-50 pt-2 flex-row justify-end space-x-2">
                    <Pressable
                      onPress={() => handleOpenEdit(b)}
                      className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 flex-row items-center space-x-1"
                    >
                      <MaterialIcons name="edit" size={12} color="#64748b" />
                      <Text
                        style={{ fontFamily: "WorkSans_500Medium" }}
                        className="text-[10px] text-slate-500 font-bold"
                      >
                        Edit
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleDelete(b)}
                      className="px-3 py-1.5 rounded-lg bg-red-50/50 border border-red-100 flex-row items-center space-x-1"
                    >
                      <MaterialIcons name="delete" size={12} color="#ba1a1a" />
                      <Text
                        style={{ fontFamily: "WorkSans_500Medium" }}
                        className="text-[10px] text-red-700 font-bold"
                      >
                        Delete
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Create / Edit Budget Modal Dialog */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay} className="flex-1 bg-slate-900/60 justify-center px-6">
          <View className="bg-white rounded-3xl p-5 border border-slate-100 space-y-4">
            <View className="flex-row justify-between items-center">
              <Text
                style={{ fontFamily: "Inter_700Bold" }}
                className="text-lg text-slate-800"
              >
                {editingBudget ? "Modify Budget limit" : "Establish new boundary"}
              </Text>
              <Pressable
                onPress={() => setModalVisible(false)}
                className="w-7 h-7 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center"
              >
                <MaterialIcons name="close" size={14} color="#181c20" />
              </Pressable>
            </View>

            {/* Category selection */}
            {!editingBudget ? (
              <View className="space-y-1.5">
                <Text
                  style={{ fontFamily: "WorkSans_500Medium" }}
                  className="text-[10px] text-slate-400 uppercase tracking-wider"
                >
                  Select Category
                </Text>
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
                          className={`text-[10px] font-semibold ${
                            isSelected ? "text-blue-700" : "text-slate-500"
                          }`}
                        >
                          {cat}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View className="space-y-1.5">
                <Text
                  style={{ fontFamily: "WorkSans_500Medium" }}
                  className="text-[10px] text-slate-400 uppercase tracking-wider"
                >
                  Category
                </Text>
                <Text
                  style={{ fontFamily: "Inter_700Bold" }}
                  className="text-sm text-slate-800 ml-1"
                >
                  {editingBudget.category}
                </Text>
              </View>
            )}

            {/* Limit Input field */}
            <View className="space-y-1.5">
              <Text
                style={{ fontFamily: "WorkSans_500Medium" }}
                className="text-[10px] text-slate-400 uppercase tracking-wider"
              >
                Limit amount (₹)
              </Text>
              <TextInput
                value={limitAmount}
                onChangeText={(val) => setLimitAmount(val.replace(/[^0-9.]/g, ""))}
                placeholder="e.g. 5000"
                placeholderTextColor="#94a3b8"
                keyboardType="decimal-pad"
                className="bg-slate-50 border border-slate-100 text-slate-800 rounded-xl px-4 py-3 text-xs"
              />
            </View>

            {/* Submit Action */}
            <Pressable
              style={({ pressed }) => [
                styles.modalSubmitBtn,
                { opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={handleSubmit}
              className="bg-blue-600 w-full h-12 rounded-xl items-center justify-center"
            >
              <Text
                style={{ fontFamily: "Inter_600SemiBold" }}
                className="text-white text-sm"
              >
                {editingBudget ? "Apply changes" : "Create Budget"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  modalOverlay: {
    justifyContent: "center",
  },
  modalSubmitBtn: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
});

export default BudgetsScreen;
