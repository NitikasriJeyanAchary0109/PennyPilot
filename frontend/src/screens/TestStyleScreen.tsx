import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, SafeAreaView } from "react-native";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

export const TestStyleScreen: React.FC<{ onDismiss?: () => void }> = ({ onDismiss }) => {
  const [testInput, setTestInput] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-slate-900">
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Header Badge */}
        <View className="mb-6 items-center">
          <View className="bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 rounded-full mb-2">
            <Text className="text-emerald-400 text-xs font-semibold tracking-wider uppercase">
              Pipeline Verification • Step 0
            </Text>
          </View>
          <Text className="text-white text-2xl font-bold text-center">
            Penny Pilot Styling Pipeline
          </Text>
          <Text className="text-slate-400 text-xs mt-1 text-center font-normal">
            NativeWind v4 • Tailwind CSS • Inter Typography • 480px Centered Frame
          </Text>
        </View>

        {/* Diagnostic Status Card */}
        <Card className="bg-slate-800 border-slate-700 mb-5">
          <Text className="text-white text-sm font-semibold mb-3">Pipeline Status Checks</Text>
          <View className="space-y-2">
            <View className="flex-row items-center justify-between py-1 border-b border-slate-700/60">
              <Text className="text-slate-300 text-xs">Tailwind / NativeWind</Text>
              <Text className="text-emerald-400 text-xs font-semibold">Active (v4.2.7)</Text>
            </View>
            <View className="flex-row items-center justify-between py-1 border-b border-slate-700/60">
              <Text className="text-slate-300 text-xs">Default Font Family</Text>
              <Text className="text-emerald-400 text-xs font-semibold">Inter (Google Fonts)</Text>
            </View>
            <View className="flex-row items-center justify-between py-1 border-b border-slate-700/60">
              <Text className="text-slate-300 text-xs">Web Container Constraint</Text>
              <Text className="text-emerald-400 text-xs font-semibold">max-w-[480px] Centered</Text>
            </View>
            <View className="flex-row items-center justify-between py-1">
              <Text className="text-slate-300 text-xs">Single Currency Enforcement</Text>
              <Text className="text-emerald-400 text-xs font-semibold">INR (₹) Only</Text>
            </View>
          </View>
        </Card>

        {/* Styled Inputs Section */}
        <Card className="bg-slate-800 border-slate-700 mb-5">
          <Text className="text-white text-sm font-semibold mb-3">Styled Input Components</Text>
          
          <View className="mb-4">
            <Text className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider mb-1.5 ml-0.5">
              Email Address
            </Text>
            <TextInput
              value={testInput}
              onChangeText={setTestInput}
              placeholder="student@university.ac.in"
              placeholderTextColor="#64748b"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:border-indigo-500"
            />
          </View>

          <View className="mb-2">
            <Text className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider mb-1.5 ml-0.5">
              Savings Target (₹)
            </Text>
            <TextInput
              defaultValue="5000"
              placeholder="₹ Amount"
              placeholderTextColor="#64748b"
              keyboardType="numeric"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-emerald-400 font-bold text-sm focus:border-emerald-500"
            />
          </View>
        </Card>

        {/* Styled Buttons Section */}
        <Card className="bg-slate-800 border-slate-700 mb-5">
          <Text className="text-white text-sm font-semibold mb-3">Styled Button Variants</Text>
          
          <Button
            title="Primary Action Button"
            onPress={() => setLoading(!loading)}
            loading={loading}
            variant="primary"
          />

          <Button
            title="Secondary Action Button"
            onPress={() => {}}
            variant="secondary"
          />

          <Button
            title="Outline Button"
            onPress={() => {}}
            variant="secondary"
          />
        </Card>

        {/* Dismiss / Return Button */}
        {onDismiss && (
          <TouchableOpacity
            onPress={onDismiss}
            className="py-3 px-6 rounded-xl bg-slate-800 border border-slate-700 items-center justify-center mt-2"
          >
            <Text className="text-slate-300 text-xs font-semibold">Back to Login / Dashboard</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default TestStyleScreen;
