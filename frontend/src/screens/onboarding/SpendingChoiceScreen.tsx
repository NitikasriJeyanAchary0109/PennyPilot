import React from "react";
import { View, Text, Pressable, SafeAreaView, StyleSheet, ScrollView } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

export const SpendingChoiceScreen = ({ navigation }: { navigation: any }) => {
  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header Bar */}
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
        <View className="w-6" />
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 32, paddingBottom: 40 }}>
        <View className="mb-8">
          <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-2xl text-slate-800 mb-2">
            Tell us about your spending
          </Text>
          <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-sm text-slate-500">
            Select how you would like to connect your income and expense data.
          </Text>
        </View>

        {/* Option 1: Manual Entry */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            navigation.navigate("SpendingSetup");
          }}
          style={({ pressed }) => [
            styles.card,
            { transform: [{ scale: pressed ? 0.98 : 1 }] }
          ]}
          className="bg-slate-50 border border-slate-200 rounded-3xl p-6 mb-5 flex-row items-center"
        >
          <View className="w-14 h-14 bg-blue-100 rounded-2xl items-center justify-center mr-4">
            <MaterialIcons name="edit" size={28} color="#005bbf" />
          </View>
          <View className="flex-1">
            <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-base text-slate-800 font-bold mb-1">
              Enter income manually
            </Text>
            <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-slate-500 leading-relaxed">
              Key in your monthly income and choose recurring expense chips.
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#94a3b8" />
        </Pressable>

        {/* Option 2: Upload CSV */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            navigation.navigate("CSVUpload");
          }}
          style={({ pressed }) => [
            styles.card,
            { transform: [{ scale: pressed ? 0.98 : 1 }] }
          ]}
          className="bg-slate-50 border border-slate-200 rounded-3xl p-6 flex-row items-center"
        >
          <View className="w-14 h-14 bg-emerald-100 rounded-2xl items-center justify-center mr-4">
            <MaterialIcons name="cloud-upload" size={28} color="#16893a" />
          </View>
          <View className="flex-1">
            <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-base text-slate-800 font-bold mb-1">
              Upload transaction CSV
            </Text>
            <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-slate-500 leading-relaxed">
              Upload bank statement files to automatically detect salary and subscriptions.
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#94a3b8" />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  }
});

export default SpendingChoiceScreen;
