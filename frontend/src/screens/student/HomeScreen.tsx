import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TextInput, Alert, ActivityIndicator, TouchableOpacity, RefreshControl } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../hooks/useAuth";
import { useIsFocused } from "@react-navigation/native";
import { apiService } from "../../services/api";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Transaction } from "../../types";

export const HomeScreen = ({ navigation }: { navigation: any }) => {
  const { logout } = useAuth();
  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // States for stats
  const [totalSaved, setTotalSaved] = useState<number>(0);
  const [roundupCount, setRoundupCount] = useState<number>(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // States for logging transaction
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Coffee");
  const [logLoading, setLogLoading] = useState(false);

  // States for negotiator modal
  const isFocused = useIsFocused();
  const [showNegotiator, setShowNegotiator] = useState(false);
  const [hasCheckedSubscription, setHasCheckedSubscription] = useState(false);
  const [suggestInfo, setSuggestInfo] = useState<{ name: string; amount: number; daysWithout: number; daysWith: number; text: string } | null>(null);

  // States for roundup result modal / alert
  const [roundupAlert, setRoundupAlert] = useState<{ amount: number; desc: string } | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const stats = await apiService.getRoundupStats();
      setTotalSaved(Number(stats.total_saved));
      setRoundupCount(stats.roundup_transactions_count);

      const txs = await apiService.getTransactions();
      setTransactions(txs.slice(0, 5)); // show top 5
    } catch (e: any) {
      console.warn("Failed to load dashboard data:", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Contextual check for pausable subscription on screen focus
  useEffect(() => {
    if (isFocused && !hasCheckedSubscription) {
      const checkNegotiator = async () => {
        try {
          const subs = await apiService.getNegotiatorSubscriptions();
          const pausable = Array.isArray(subs) ? subs.find((s: any) => s.pausable) : null;
          if (pausable) {
            const suggestData = await apiService.getNegotiatorSuggest({ subscription_name: pausable.name });
            setSuggestInfo({
              name: pausable.name,
              amount: pausable.amount,
              daysWithout: suggestData.days_without_pausing || 30,
              daysWith: suggestData.days_with_pausing || 18,
              text: suggestData.suggestion_text || `Struggling with your Laptop goal? Try pausing ${pausable.name} for a month.`
            });
            setShowNegotiator(true);
            setHasCheckedSubscription(true);
          }
        } catch (e) {
          console.warn("Negotiator focus check failed:", e);
        }
      };
      checkNegotiator();
    }
  }, [isFocused]);

  const handleLogTransaction = async () => {
    if (!desc || !amount) {
      Alert.alert("Error", "Please provide a description and amount.");
      return;
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert("Error", "Please provide a valid positive amount.");
      return;
    }

    setLogLoading(true);
    try {
      const response = await apiService.createTransaction({
        description: desc,
        amount: numericAmount,
        category: category,
        merchant: desc,
        type: "debit"
      });

      if (response.roundup_applied && response.roundup_details?.success) {
        const amt = response.roundup_details.roundup_amount;
        const explanation = response.roundup_details.explanation;
        
        setRoundupAlert({
          amount: Number(amt),
          desc: explanation
        });
      } else {
        Alert.alert("Success", "Transaction logged! No roundup applied this time.");
      }

      // Reset form
      setDesc("");
      setAmount("");
      
      // Reload stats
      loadData();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to log transaction.");
    } finally {
      setLogLoading(false);
    }
  };

  return (
    <ScrollView 
      className="flex-1 bg-surface px-4 pt-4"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#005bbf" />
      }
    >
      {/* Header */}
      <View className="flex-row justify-between items-center mb-6">
        <View>
          <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider">Welcome Student</Text>
          <Text className="text-on-surface text-2xl font-black">Penny Pilot Dashboard</Text>
        </View>
        <TouchableOpacity 
          onPress={logout}
          className="bg-white border border-outline-variant py-2 px-4 rounded-xl"
        >
          <Text className="text-red-400 text-xs font-bold">Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Cards */}
      <View className="flex-row gap-x-4 mb-6">
        <Card className="flex-1 my-0 py-4 items-center">
          <Text className="text-on-surface-variant text-xs font-semibold mb-1">Total Auto-Saved</Text>
          {loading ? (
            <ActivityIndicator size="small" color="#10B981" />
          ) : (
            <Text className="text-tertiary text-2xl font-black">₹{totalSaved.toFixed(2)}</Text>
          )}
        </Card>

        <Card className="flex-1 my-0 py-4 items-center">
          <Text className="text-on-surface-variant text-xs font-semibold mb-1">Round-Up Triggers</Text>
          {loading ? (
            <ActivityIndicator size="small" color="#4F46E5" />
          ) : (
            <Text className="text-ob-primary text-2xl font-black">{roundupCount}</Text>
          )}
        </Card>
      </View>

      {/* AI Roundup Alert Banner */}
      {roundupAlert && (
        <View className="bg-tertiary-fixed border border-tertiary-fixed-dim p-5 rounded-2xl mb-6">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-on-tertiary-fixed-variant text-sm font-bold">🎉 Micro-savings automated!</Text>
            <TouchableOpacity onPress={() => setRoundupAlert(null)}>
              <Text className="text-on-surface-variant font-bold text-xs px-2">Dismiss</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-on-surface text-xl font-black mb-1">+₹{roundupAlert.amount.toFixed(2)}</Text>
          <Text className="text-on-surface-variant text-xs italic">"{roundupAlert.desc}"</Text>
        </View>
      )}

      {/* AI Purchase Negotiator Banner */}
      <TouchableOpacity 
        onPress={() => {
          triggerHaptic();
          navigation.navigate("SubscriptionNegotiator");
        }}
        className="bg-primary-fixed border border-primary-fixed-dim p-4 rounded-2xl mb-6 flex-row justify-between items-center"
      >
        <View className="flex-1 pr-2">
          <Text style={{ fontFamily: "Inter_700Bold" }} className="text-ob-primary text-sm">🤔 Thinking of buying something?</Text>
          <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-on-primary-fixed-variant text-xs mt-1">Let Penny Pilot evaluate the delay it will cause to your savings goals.</Text>
        </View>
        <MaterialIcons name="chevron-right" size={20} color="#005bbf" />
      </TouchableOpacity>

      {/* Log Transaction Section */}
      <Card className="mb-6">
        <Text style={{ fontFamily: "Inter_700Bold" }} className="text-on-surface text-lg mb-4">Simulate card swipe / purchase</Text>
        
        <View className="flex-row gap-x-4 mb-3">
          <View className="flex-1">
            <Text className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1">Store / Item</Text>
            <TextInput
              value={desc}
              onChangeText={setDesc}
              placeholder="e.g. Campus Coffee"
              placeholderTextColor="#64748B"
              className="bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2.5 text-xs"
            />
          </View>

          <View className="w-1/3">
            <Text className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1">Amount ($)</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="e.g. 4.25"
              placeholderTextColor="#64748B"
              keyboardType="decimal-pad"
              className="bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2.5 text-xs"
            />
          </View>
        </View>

        <View className="mb-4">
          <Text className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-2">Category</Text>
          <View className="flex-row gap-x-2">
            {["Coffee", "Dining", "Textbooks", "Entertainment"].map((cat) => (
              <TouchableOpacity
                key={cat}
                onPress={() => setCategory(cat)}
                className={`py-1.5 px-3 rounded-lg border ${
                  category === cat ? "bg-indigo-600/20 border-indigo-500" : "bg-slate-900 border-slate-700"
                }`}
              >
                <Text className={`text-[10px] font-semibold ${category === cat ? "text-indigo-400" : "text-slate-400"}`}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Button 
          title="Swipe Card & Round-Up" 
          onPress={handleLogTransaction} 
          loading={logLoading} 
          variant="secondary"
          className="py-2.5"
        />
      </Card>

      {/* Recent Purchases List */}
      <Card className="mb-10">
        <Text className="text-on-surface text-lg font-bold mb-3">Recent Transactions</Text>
        {loading && transactions.length === 0 ? (
          <ActivityIndicator size="small" color="#4F46E5" />
        ) : transactions.length === 0 ? (
          <Text className="text-slate-400 text-xs italic text-center py-4">No recent swipes. Try logging one above!</Text>
        ) : (
          transactions.map((t) => {
            const date = new Date(t.date).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            });
            return (
              <View key={t.trans_id} className="flex-row justify-between items-center py-3 border-b border-slate-700/60 last:border-b-0">
                <View>
                  <Text className="text-slate-100 text-sm font-semibold">{t.merchant || t.description}</Text>
                  <Text className="text-slate-400 text-[10px]">{t.category} • {date}</Text>
                </View>
                <Text className="text-slate-300 font-bold text-sm">-${Number(t.amount).toFixed(2)}</Text>
              </View>
            );
          })
        )}
      </Card>
    </ScrollView>
  );
};

export default HomeScreen;
