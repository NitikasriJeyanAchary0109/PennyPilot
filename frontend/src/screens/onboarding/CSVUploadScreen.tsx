import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { ArrowLeft, UploadCloud, ShieldCheck, FileSpreadsheet, Info } from "lucide-react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { apiService, getErrorMessage } from "../../services/api";
import { ScreenContainer } from "../../components/ui/ScreenContainer";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";

export const CSVUploadScreen = ({ navigation }: { navigation: any }) => {
  const [loading, setLoading] = useState(false);

  const triggerHaptic = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics optional on web
    }
  };

  // After an import, show what the student's past spending looks like. (That
  // screen then continues to goal creation during onboarding.)
  const goNext = () => navigation.navigate("SpendingAnalysis");

  const handlePickDocument = async () => {
    triggerHaptic();
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/comma-separated-values", "text/csv", "*/*"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const fileAsset = result.assets[0];
      setLoading(true);
      try {
        const formData = new FormData();
        formData.append("file", {
          uri: fileAsset.uri,
          name: fileAsset.name || "transactions.csv",
          type: fileAsset.mimeType || "text/csv",
        } as any);

        const summary = await apiService.uploadStatement(formData);
        const imported = String(summary.imported_count);
        const failedLines = summary.errors
          .slice(0, 3)
          .map((e) => `Row ${e.row}: ${e.error}`)
          .join("\n");

        try {
          Haptics.notificationAsync(
            summary.failed_count > 0
              ? Haptics.NotificationFeedbackType.Warning
              : Haptics.NotificationFeedbackType.Success
          );
        } catch {
          // noop
        }

        if (Number(imported) === 0) {
          Alert.alert(
            "Nothing new was imported",
            summary.duplicates_skipped > 0
              ? `All ${summary.duplicates_skipped} rows are already in your transactions, so nothing was added again.`
              : failedLines ||
                  "No valid rows were found. Check the file format and try again."
          );
          return;
        }

        const details = [
          `Imported ${imported} transaction${Number(imported) === 1 ? "" : "s"}.`,
          summary.roundups_triggered > 0
            ? `${summary.roundups_triggered} round-up${summary.roundups_triggered === 1 ? "" : "s"} saved toward your goal.`
            : null,
          summary.duplicates_skipped > 0
            ? `${summary.duplicates_skipped} row${summary.duplicates_skipped === 1 ? " was" : "s were"} already in your transactions and skipped.`
            : null,
          summary.failed_count > 0
            ? `${summary.failed_count} row${summary.failed_count === 1 ? "" : "s"} skipped:\n${failedLines}`
            : null,
        ]
          .filter(Boolean)
          .join("\n\n");

        Alert.alert("Import complete", details, [{ text: "See my spending", onPress: goNext }]);
      } catch (apiErr: any) {
        Alert.alert(
          "Import failed",
          getErrorMessage(apiErr, "We couldn't import that file. Please try again.")
        );
      } finally {
        setLoading(false);
      }
    } catch (err) {
      console.warn("Document picking failed", err);
      Alert.alert("Couldn't open file", "Please try selecting the file again.");
    }
  };

  const showFormatHelp = () => {
    triggerHaptic();
    Alert.alert(
      "CSV Statement Format",
      "Bank statements from HDFC, ICICI, SBI and similar banks work as they are (Date, Narration, Withdrawal / Deposit columns); categories are worked out from the narration.\n\nOr use this layout. Your CSV needs a header row with these columns:\n• amount (positive number)\n• category\n• description\n\nOptional columns:\n• transaction_date (or date), e.g. 2026-07-30\n• type: debit (default) or credit for money coming in\n\nExample:\namount,category,description,date,type\n450.00,Books,Campus Bookstore,2026-07-30,debit\n10000.00,Income,Monthly Allowance,2026-07-31,credit"
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
          Import a bank statement CSV to see where your money goes, find subscriptions and start rounding up.
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
            Bank statement or amount / category / description CSV
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
            Private by design
          </Text>
          <Text className="font-sans text-[11px] text-text-secondary leading-relaxed">
            Your statement is sent to your own Penny Pilot server and is not shared with third parties.
          </Text>
        </Card>

        <Card variant="default" className="flex-1 p-4">
          <FileSpreadsheet size={22} color="#856529" className="mb-2" />
          <Text className="font-sans font-bold text-xs text-text mb-1">
            Sorted for you
          </Text>
          <Text className="font-sans text-[11px] text-text-secondary leading-relaxed">
            Rows without a category are matched by keyword (Swiggy → Food). Check them later in your transactions.
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
            <ActivityIndicator size="large" color="#144a32" />
            <Text className="font-sans font-bold text-lg text-text text-center mt-5 mb-1">
              Importing transactions…
            </Text>
            <Text className="font-sans text-xs text-text-secondary text-center leading-relaxed">
              Reading your file and saving each row. This can take a few seconds.
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
});

export default CSVUploadScreen;
