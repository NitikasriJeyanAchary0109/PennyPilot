import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  ArrowLeft,
  Plus,
  Edit3,
  Trash2,
  PieChart,
  Coffee,
  Utensils,
  BookOpen,
  ShoppingBag,
  Film,
  Tag,
  X,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { apiService } from "../../services/api";
import {
  ScreenContainer,
  Card,
  Chip,
  ProgressBar,
  Button,
  Skeleton,
  EmptyState,
} from "../../components/ui";

export const BudgetsScreen = () => {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [budgets, setBudgets] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({
    total_budgeted: 0,
    total_spent: 0,
    remaining: 0,
  });

  const [modalVisible, setModalVisible] = useState(false);
  const [editingBudget, setEditingBudget] = useState<any>(null);
  const [category, setCategory] = useState("Coffee");
  const [limitAmount, setLimitAmount] = useState("");

  const categories = ["Coffee", "Dining", "Textbooks", "Entertainment", "Shopping"];

  const triggerHaptic = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore on web
    }
  };

  const loadBudgetData = useCallback(async () => {
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
      console.warn("Failed to load budgets:", e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBudgetData();
  }, [loadBudgetData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadBudgetData();
    setRefreshing(false);
  };

  const formatINR = (val: number): string => {
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

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
    setLimitAmount(String(budget.limit_amount));
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    const amountVal = parseFloat(limitAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      Alert.alert("Invalid Limit", "Please enter a budget limit amount greater than ₹0.");
      return;
    }

    triggerHaptic();
    setLoading(true);
    setModalVisible(false);

    try {
      if (editingBudget) {
        await apiService.updateBudget(editingBudget.id, {
          limit_amount: amountVal,
        });
      } else {
        await apiService.createBudget({
          category,
          limit_amount: amountVal,
          period: "monthly",
        });
      }
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // Ignore on web
      }
      await loadBudgetData();
    } catch (e: any) {
      Alert.alert(
        "Action Failed",
        e?.message || "Failed to save budget changes. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (budget: any) => {
    triggerHaptic();
    Alert.alert(
      "Delete Budget",
      `Are you sure you want to remove the ${budget.category} budget limit?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              await apiService.deleteBudget(budget.id);
              await loadBudgetData();
            } catch (e: any) {
              Alert.alert("Error", e?.message || "Failed to delete budget.");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const getCategoryIcon = (catName: string) => {
    const c = (catName || "").toLowerCase();
    if (c === "coffee") return <Coffee size={16} color="#144a32" />;
    if (c === "dining") return <Utensils size={16} color="#144a32" />;
    if (c === "textbooks") return <BookOpen size={16} color="#144a32" />;
    if (c === "entertainment") return <Film size={16} color="#144a32" />;
    if (c === "shopping") return <ShoppingBag size={16} color="#144a32" />;
    return <Tag size={16} color="#144a32" />;
  };

  return (
    <ScreenContainer
      refreshing={refreshing}
      onRefresh={handleRefresh}
      className="pt-2 pb-8"
    >
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
          <Text className="text-lg font-bold text-text-primary font-sans">
            Budgets & Limits
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleOpenCreate}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          className="flex-row items-center px-3 py-2 rounded-xl bg-primary shadow-button"
          accessibilityRole="button"
          accessibilityLabel="Add new budget boundary"
        >
          <Plus size={16} color="#ffffff" />
          <Text className="text-xs font-bold text-white font-sans ml-1">
            New Budget
          </Text>
        </TouchableOpacity>
      </View>

      {/* Summary Card */}
      <Card variant="forest" padding="lg" className="shadow-card mb-4">
        <Text className="text-xs font-semibold text-sage-light uppercase tracking-wider font-sans mb-1">
          Monthly Budget Summary
        </Text>
        <View className="flex-row items-baseline mb-4">
          <Text className="text-3xl font-bold text-white font-sans">
            ₹{formatINR(summary.total_budgeted)}
          </Text>
          <Text className="text-xs text-sage-light font-sans ml-2">
            allocated
          </Text>
        </View>

        <View className="flex-row space-x-3 pt-3 border-t border-white/10">
          <View className="flex-1 bg-white/10 rounded-xl p-3 mr-1.5">
            <Text className="text-[10px] font-bold text-sage-light uppercase tracking-wider font-sans">
              Total Spent
            </Text>
            <Text className="text-base font-bold text-white font-sans mt-0.5">
              ₹{formatINR(summary.total_spent)}
            </Text>
          </View>
          <View className="flex-1 bg-white/10 rounded-xl p-3 ml-1.5">
            <Text className="text-[10px] font-bold text-sage-light uppercase tracking-wider font-sans">
              Remaining
            </Text>
            <Text className="text-base font-bold text-gold font-sans mt-0.5">
              ₹{formatINR(summary.remaining)}
            </Text>
          </View>
        </View>
      </Card>

      {/* Budgets List */}
      <View className="mb-2">
        <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans mb-3">
          Category Limits
        </Text>

        {loading && budgets.length === 0 ? (
          <View className="space-y-3 py-2">
            <Skeleton width="100%" height={90} className="rounded-card mb-3" />
            <Skeleton width="100%" height={90} className="rounded-card mb-3" />
            <Skeleton width="100%" height={90} className="rounded-card" />
          </View>
        ) : budgets.length === 0 ? (
          <Card variant="default" padding="lg" className="items-center shadow-card my-4">
            <EmptyState
              title="No budgets set yet"
              description="Establish category spending limits (e.g. Coffee, Dining) to receive smart micro-savings suggestions."
              actionTitle="+ Set first budget"
              onAction={handleOpenCreate}
              icon={<PieChart size={32} color="#144a32" />}
            />
          </Card>
        ) : (
          <View className="space-y-3">
            {budgets.map((b) => {
              const limit = Number(b.limit_amount) || 0;
              const spent = Number(b.spent_amount) || 0;
              const remaining = Number(b.remaining_amount) || 0;
              const isOver = Boolean(b.is_over_limit);

              return (
                <Card
                  key={b.id}
                  variant="default"
                  padding="md"
                  className={`shadow-card mb-3 ${isOver ? "border-danger/30" : ""}`}
                >
                  <View className="flex-row justify-between items-center mb-2.5">
                    <View className="flex-row items-center flex-1 mr-2">
                      <View className="w-9 h-9 rounded-full bg-sage-light border border-border items-center justify-center mr-2.5">
                        {getCategoryIcon(b.category)}
                      </View>
                      <View className="flex-1">
                        <Text
                          className="text-sm font-bold text-text-primary font-sans"
                          numberOfLines={1}
                        >
                          {b.category}
                        </Text>
                        <Text className="text-[11px] text-text-muted font-sans mt-0.5">
                          {b.period || "Monthly"} cycle
                        </Text>
                      </View>
                    </View>

                    {isOver ? (
                      <Chip
                        label="Exceeded"
                        variant="danger"
                        icon={<AlertTriangle size={12} color="#b3261e" />}
                      />
                    ) : (
                      <Chip
                        label="Within Limit"
                        variant="success"
                        icon={<CheckCircle2 size={12} color="#144a32" />}
                      />
                    )}
                  </View>

                  {/* Figure Row */}
                  <View className="flex-row justify-between items-center py-1">
                    <Text className="text-xs text-text-secondary font-sans">
                      Spent: <Text className="font-bold text-text-primary">₹{formatINR(spent)}</Text>
                    </Text>
                    <Text className="text-xs text-text-secondary font-sans">
                      Limit: <Text className="font-bold text-text-primary">₹{formatINR(limit)}</Text>
                    </Text>
                  </View>

                  {/* Remaining amount row */}
                  <View className="flex-row justify-between items-center mt-1 pt-2 border-t border-border/40">
                    <Text className="text-[11px] text-text-muted font-sans">
                      Remaining balance:
                    </Text>
                    <Text
                      className={`text-xs font-bold font-sans ${
                        isOver ? "text-danger" : "text-primary"
                      }`}
                    >
                      ₹{formatINR(remaining)}
                    </Text>
                  </View>

                  {/* Actions */}
                  <View className="flex-row justify-end space-x-2 mt-3 pt-2 border-t border-border/30">
                    <TouchableOpacity
                      onPress={() => handleOpenEdit(b)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      className="px-3 py-1.5 rounded-xl bg-sage-light border border-border mr-2 flex-row items-center"
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${b.category} budget`}
                    >
                      <Edit3 size={12} color="#144a32" />
                      <Text className="text-xs font-bold text-primary font-sans ml-1">
                        Edit
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleDelete(b)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      className="px-3 py-1.5 rounded-xl bg-danger-light border border-danger/20 flex-row items-center"
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${b.category} budget`}
                    >
                      <Trash2 size={12} color="#b3261e" />
                      <Text className="text-xs font-bold text-danger font-sans ml-1">
                        Delete
                      </Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </View>

      {/* Modal Dialog */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View className="flex-1 justify-center px-5 bg-black/40">
          <View className="bg-white rounded-3xl p-5 border border-border shadow-card">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-base font-bold text-text-primary font-sans">
                {editingBudget ? "Edit Budget Limit" : "New Spending Limit"}
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                className="w-8 h-8 rounded-full bg-cream border border-border items-center justify-center"
              >
                <X size={16} color="#707773" />
              </TouchableOpacity>
            </View>

            {/* Category selection */}
            {!editingBudget ? (
              <View className="mb-4">
                <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans mb-2">
                  Category
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {categories.map((cat) => {
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
            ) : (
              <View className="mb-4">
                <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans mb-1">
                  Category
                </Text>
                <Text className="text-sm font-bold text-text-primary font-sans">
                  {editingBudget.category}
                </Text>
              </View>
            )}

            {/* Limit Input */}
            <View className="mb-5">
              <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans mb-1.5">
                Monthly Limit Amount (₹)
              </Text>
              <TextInput
                value={limitAmount}
                onChangeText={(val) => setLimitAmount(val.replace(/[^0-9.]/g, ""))}
                placeholder="e.g. 5000"
                placeholderTextColor="#707773"
                keyboardType="decimal-pad"
                className="bg-cream border border-border rounded-2xl px-4 py-3 text-sm text-text-primary font-sans min-h-[44px]"
              />
            </View>

            <Button
              title={editingBudget ? "Save Changes" : "Create Budget"}
              variant="primary"
              size="lg"
              onPress={handleSubmit}
              className="min-h-[48px]"
            />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
};

export default BudgetsScreen;
