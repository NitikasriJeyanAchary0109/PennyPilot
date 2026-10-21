import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Edit3, FileSpreadsheet, ChevronRight, ShieldCheck, ArrowLeft } from "lucide-react-native";
import { ScreenContainer } from "../../components/ui/ScreenContainer";
import { Card } from "../../components/ui/Card";

interface OptionCardProps {
  icon: React.ReactNode;
  badgeBg: string;
  title: string;
  detail: string;
  onPress: () => void;
  accessibilityLabel: string;
}

function OptionCard({
  icon,
  badgeBg,
  title,
  detail,
  onPress,
  accessibilityLabel,
}: OptionCardProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="mb-4"
    >
      <Card variant="default" className="p-5 flex-row items-center">
        <View className={`mr-4 w-12 h-12 rounded-2xl items-center justify-center ${badgeBg}`}>
          {icon}
        </View>
        <View className="flex-1 pr-2">
          <Text className="font-sans font-bold text-base text-text">
            {title}
          </Text>
          <Text className="mt-1 font-sans text-xs text-text-secondary leading-relaxed">
            {detail}
          </Text>
        </View>
        <ChevronRight size={20} color="#525956" />
      </Card>
    </TouchableOpacity>
  );
}

export default function SpendingEntryChoiceScreen({ navigation }: { navigation: any }) {
  return (
    <ScreenContainer scrollable={true} className="py-2">
      {/* Top Navigation Bar */}
      <View className="flex-row items-center py-3 mb-4">
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
          Your Spending
        </Text>
      </View>

      {/* Screen Title & Description */}
      <View className="mb-6">
        <Text className="font-sans font-extrabold text-2xl text-text tracking-tight">
          Tell us about your spending
        </Text>
        <Text className="mt-2 font-sans text-sm text-text-secondary leading-relaxed">
          Choose the quickest way to give your budget and savings plan an accurate starting point.
        </Text>
      </View>

      {/* Choice Options */}
      <OptionCard
        icon={<Edit3 size={22} color="#144a32" />}
        badgeBg="bg-primary-tint"
        title="Manual entry"
        detail="Add your monthly allowance/income and the recurring costs you already know."
        onPress={() => navigation.navigate("ManualIncomeExpense")}
        accessibilityLabel="Manual entry: Add monthly income and recurring costs"
      />

      <OptionCard
        icon={<FileSpreadsheet size={22} color="#856529" />}
        badgeBg="bg-gold-light"
        title="Upload CSV statement"
        detail="Upload a transaction history file to automatically import and categorize spending."
        onPress={() => navigation.navigate("CSVUpload")}
        accessibilityLabel="Upload CSV: Import transaction history file"
      />

      {/* Privacy Notice Card */}
      <Card variant="cream" className="p-4 mt-4 flex-row items-start">
        <ShieldCheck size={20} color="#144a32" className="mt-0.5 mr-3" />
        <View className="flex-1">
          <Text className="font-sans font-semibold text-xs text-text">
            Your data is strictly private
          </Text>
          <Text className="mt-0.5 font-sans text-[11px] text-text-secondary leading-relaxed">
            Penny Pilot processes your financial information securely to personalize your savings insights.
          </Text>
        </View>
      </Card>
    </ScreenContainer>
  );
}
