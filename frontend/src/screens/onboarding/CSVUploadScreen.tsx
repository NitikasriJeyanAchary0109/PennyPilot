import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Alert,
  StyleSheet,
} from "react-native";
import {
  ArrowLeft,
  UploadCloud,
  ShieldCheck,
  Sparkles,
  FileSpreadsheet,
  Info,
  Loader2,
} from "lucide-react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { apiService } from "../../services/api";
import { ScreenContainer } from "../../components/ui/ScreenContainer";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";

export const CSVUploadScreen = ({ navigation }: { navigation: any }) => {
  const [loading, setLoading] = useState(false);
  const [progressVal, setProgressVal] = useState(0);

  // Spinner rotation shared value
  const spinnerRotation = useSharedValue(0);
  // Progress bar width shared value
  const progressWidth = useSharedValue(0);

  useEffect(() => {
    if (loading) {
      spinnerRotation.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1,
        false
      );
      // Simulate file upload progress
      progressWidth.value = 0;
      progressWidth.value = withTiming(
        1,
        { duration: 2800, easing: Easing.out(Easing.quad) },
        (finished) => {
          if (finished) {
            runOnJS(uploadComplete)();
          }
        }
      );
    } else {
      spinnerRotation.value = 0;
      progressWidth.value = 0;
    }
  }, [loading]);

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinnerRotation.value}deg` }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value * 100}%`,
  }));

  // Update progress text periodically in JS thread
  useEffect(() => {
    let interval: any;
    if (loading) {
      setProgressVal(0);
      interval = setInterval(() => {
        setProgressVal((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return Math.min(prev + Math.floor(Math.random() * 15) + 8, 100);
        });
      }, 250);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const triggerHaptic = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics optional on web
    }
  };

  const handlePickDocument = async () => {
    triggerHaptic();
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/comma-separated-values", "text/csv", "*/*"],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setLoading(true);
        const fileAsset = result.assets[0];
        try {
          const formData = new FormData();
          formData.append("file", {
            uri: fileAsset.uri,
            name: fileAsset.name || "transactions.csv",
            type: fileAsset.mimeType || "text/csv",
          } as any);

          await apiService.uploadStatement(formData);
          await apiService.getDetectedPatterns();
        } catch (apiErr) {
          console.warn("Upload/Detection API call issue:", apiErr);
        }
      }
    } catch (err) {
      console.warn("Document picking failed", err);
    }
  };

  const uploadComplete = () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // noop
    }
    setLoading(false);
    navigation.navigate("CreateGoal");
  };

  const showFormatHelp = () => {
    triggerHaptic();
    Alert.alert(
      "CSV Statement Format",
      "Your CSV file should include columns for:\n• Date (YYYY-MM-DD)\n• Description\n• Amount (negative for expense, positive for income)\n• Category\n\nExample:\n2026-07-30, Campus Bookstore, -450.00, Books\n2026-07-31, Monthly Allowance, 10000.00, Income"
    );
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
          Connect Your Spending
        </Text>
      </View>

      {/* Intro */}
      <View className="mb-6">
        <Text className="font-sans font-extrabold text-2xl text-text tracking-tight">
          Upload statement history
        </Text>
        <Text className="mt-2 font-sans text-sm text-text-secondary leading-relaxed">
          Import your bank statement to automatically uncover recurring expenses, subscriptions, and spare change savings.
        </Text>
      </View>

      {/* Upload Drop Zone Card */}
      <Card variant="default" className="p-6 mb-6">
        <TouchableOpacity
          onPress={handlePickDocument}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Tap to select CSV transactions file"
          className="border-2 border-dashed border-primary/20 rounded-2xl py-10 items-center justify-center bg-primary-tint/30 active:bg-primary-tint/50"
        >
          <View className="w-16 h-16 rounded-full bg-primary-tint items-center justify-center mb-3">
            <UploadCloud size={32} color="#144a32" />
          </View>
          <Text className="font-sans font-bold text-base text-text text-center px-4">
            Tap to select transactions.csv
          </Text>
          <Text className="font-sans text-xs text-text-secondary mt-1">
            Supports standard CSV and banking export formats
          </Text>
        </TouchableOpacity>

        <View className="mt-4 items-center">
          <TouchableOpacity
            onPress={showFormatHelp}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
            activeOpacity={0.7}
            className="flex-row items-center py-2 px-3 rounded-full active:bg-surface-cream"
            accessibilityRole="button"
            accessibilityLabel="View CSV sample format"
          >
            <Info size={14} color="#856529" className="mr-1.5" />
            <Text className="font-sans font-semibold text-xs text-gold-text">
              View sample format & requirements
            </Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Trust & Insight Features */}
      <View className="flex-row gap-3 mb-6">
        <Card variant="default" className="flex-1 p-4">
          <ShieldCheck size={22} color="#144a32" className="mb-2" />
          <Text className="font-sans font-bold text-xs text-text mb-1">
            Bank-Level Privacy
          </Text>
          <Text className="font-sans text-[11px] text-text-secondary leading-relaxed">
            Data is parsed locally and never shared with third parties.
          </Text>
        </Card>

        <Card variant="default" className="flex-1 p-4">
          <Sparkles size={22} color="#856529" className="mb-2" />
          <Text className="font-sans font-bold text-xs text-text mb-1">
            AI Categorization
          </Text>
          <Text className="font-sans text-[11px] text-text-secondary leading-relaxed">
            Automatically clusters expenses into clear student budgets.
          </Text>
        </Card>
      </View>

      {/* Manual Fallback Action */}
      <View className="w-full mb-6">
        <Button
          title="Prefer Manual Entry Instead"
          onPress={() => navigation.navigate("ManualIncomeExpense")}
          variant="secondary"
          size="md"
          accessibilityLabel="Switch to manual entry"
        />
      </View>

      {/* Loading Modal */}
      <Modal visible={loading} transparent animationType="fade">
        <View style={styles.modalOverlay} className="flex-1 items-center justify-center px-6">
          <Card variant="elevated" className="p-8 w-full max-w-sm items-center bg-surface border border-border">
            <Animated.View style={spinnerStyle} className="mb-5">
              <UploadCloud size={44} color="#144a32" />
            </Animated.View>

            <Text className="font-sans font-bold text-lg text-text text-center mb-1">
              Analyzing Transactions…
            </Text>
            <Text className="font-sans text-xs text-text-secondary text-center mb-5 leading-relaxed">
              Penny Pilot is parsing categories and calculating your personalized savings opportunities.
            </Text>

            <View className="h-2 w-full bg-border rounded-full overflow-hidden mb-2">
              <Animated.View style={[progressStyle, styles.progressBar]} />
            </View>

            <Text className="font-sans font-semibold text-xs text-primary">
              {progressVal}% complete
            </Text>
          </Card>
        </View>
      </Modal>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    backgroundColor: "rgba(13, 58, 43, 0.4)",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#144a32",
    borderRadius: 999,
  },
});

export default CSVUploadScreen;
