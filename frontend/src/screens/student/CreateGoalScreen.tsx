import React, { useState } from "react";
import { View, Text, TouchableOpacity, Alert, TextInput } from "react-native";
import {
  ArrowLeft,
  Target,
  Sparkles,
  Lightbulb,
  Check,
  ChevronRight,
} from "lucide-react-native";
import { useAuth } from "../../hooks/useAuth";
import { apiService, getErrorMessage } from "../../services/api";
import { ScreenContainer } from "../../components/ui/ScreenContainer";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";

const QUICK_GOAL_TEMPLATES = [
  { name: "💻 Tech & Laptop", target: 50000 },
  { name: "✈️ Semester Trip", target: 20000 },
  { name: "🛡️ Safety Cushion", target: 15000 },
  { name: "📚 Books & Courseware", target: 8000 },
];

export default function CreateGoalScreen({ navigation }: { navigation: any }) {
  const { completeOnboarding, hasCompletedOnboarding } = useAuth();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);

  const applyTemplate = (templateName: string, templateTarget: number) => {
    setName(templateName);
    setTarget(templateTarget.toString());
  };

  const handleCreateGoal = async () => {
    const targetAmount = Number(target.replace(/,/g, ""));
    if (!name.trim()) {
      Alert.alert("Goal Name Required", "Please name your savings goal.");
      return;
    }
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      Alert.alert(
        "Target Amount Required",
        "Please enter a target amount in Rupees greater than ₹0."
      );
      return;
    }

    setSaving(true);
    try {
      await apiService.createGoal({
        goal_name: name.trim(),
        target: targetAmount,
      });
      if (hasCompletedOnboarding) {
        // Created from the Goals tab: return to it (it refreshes on focus).
        navigation.goBack();
      } else {
        await completeOnboarding();
      }
    } catch (error: any) {
      Alert.alert(
        "Could Not Create Goal",
        getErrorMessage(error, "Please check your inputs and try again.")
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer scrollable={true} className="py-2">
      {/* Header */}
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
          {hasCompletedOnboarding ? "New Savings Goal" : "Step 2: Set First Goal"}
        </Text>
      </View>

      {/* Intro Hero */}
      <View className="items-center mb-6 pt-2">
        <View className="w-14 h-14 rounded-full bg-primary-tint items-center justify-center mb-3">
          <Target size={28} color="#144a32" />
        </View>
        <Text className="font-sans font-extrabold text-2xl text-text text-center tracking-tight">
          What are you saving for?
        </Text>
        <Text className="mt-2 text-center font-sans text-sm text-text-secondary leading-relaxed max-w-[310px]">
          Give your savings purpose. Spare change and micro-deposits will automatically route toward this target.
        </Text>
      </View>

      {/* Quick Templates */}
      <View className="mb-5">
        <View className="flex-row items-center justify-between mb-2.5">
          <Text className="font-sans font-semibold text-xs text-text-secondary uppercase tracking-wider">
            Popular Student Goals
          </Text>
          <View className="flex-row items-center bg-primary-tint/70 px-2.5 py-0.5 rounded-full">
            <Text className="text-[10px] font-semibold text-primary font-sans">
              ✍️ Or type custom goal
            </Text>
          </View>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {QUICK_GOAL_TEMPLATES.map((tmpl) => {
            const isMatch = name === tmpl.name;
            return (
              <TouchableOpacity
                key={tmpl.name}
                onPress={() => applyTemplate(tmpl.name, tmpl.target)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Template: ${tmpl.name}, ₹${tmpl.target.toLocaleString("en-IN")}`}
                className={`py-2 px-3.5 rounded-full border transition-all ${
                  isMatch
                    ? "bg-primary border-primary shadow-sm"
                    : "bg-surface border-border active:bg-surface-cream"
                }`}
              >
                <Text
                  className={`font-sans text-xs ${
                    isMatch ? "text-white font-bold" : "text-text font-medium"
                  }`}
                >
                  {tmpl.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text className="text-[11px] text-text-muted font-sans mt-2">
          💡 You can choose a preset above or directly type any custom goal name and amount below.
        </Text>
      </View>

      {/* Form Card */}
      <Card variant="default" className="p-5 mb-5">
        {/* Goal Name Input */}
        <View className="mb-4">
          <Text className="font-sans font-semibold text-xs text-text mb-1.5">
            Goal Name
          </Text>
          <View className="bg-surface-cream rounded-input border border-border px-3.5 py-1">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Next Semester Rent or Laptop"
              placeholderTextColor="#707773"
              className="font-sans text-sm text-text py-2.5"
              accessibilityLabel="Goal name"
            />
          </View>
        </View>

        {/* Target Amount Input */}
        <View className="mb-2">
          <Text className="font-sans font-semibold text-xs text-text mb-1.5">
            Target Amount (₹)
          </Text>
          <View className="flex-row items-center bg-surface-cream rounded-input border border-border px-4 py-2">
            <Text className="font-sans font-extrabold text-2xl text-primary mr-2">
              ₹
            </Text>
            <TextInput
              value={target}
              onChangeText={(val) => setTarget(val.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              placeholder="10000"
              placeholderTextColor="#707773"
              className="flex-1 font-sans font-bold text-xl text-text py-1.5"
              accessibilityLabel="Target amount in Rupees"
            />
          </View>
        </View>
      </Card>

      {/* Motivational Note */}
      <Card variant="cream" className="p-4 mb-6 flex-row items-start">
        <Lightbulb size={20} color="#856529" className="mt-0.5 mr-3" />
        <View className="flex-1">
          <Text className="font-sans font-semibold text-xs text-text">
            Start small, build momentum
          </Text>
          <Text className="mt-0.5 font-sans text-[11px] text-text-secondary leading-relaxed">
            You can adjust this target, pause deposits, or create additional custom goals anytime from the Goals tab.
          </Text>
        </View>
      </Card>

      {/* Submit Button */}
      <View className="w-full mb-6">
        <Button
          title={
            saving
              ? "Creating Your Goal…"
              : hasCompletedOnboarding
              ? "Create Goal"
              : "Complete Setup & Launch"
          }
          onPress={handleCreateGoal}
          loading={saving}
          disabled={saving}
          variant="primary"
          size="lg"
          accessibilityLabel="Complete Setup and Launch Penny Pilot"
        />
      </View>
    </ScreenContainer>
  );
}
