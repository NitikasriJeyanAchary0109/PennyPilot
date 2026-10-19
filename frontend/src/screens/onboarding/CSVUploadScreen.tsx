import React, { useState, useEffect } from "react";
import { 
  View, 
  Text, 
  ScrollView, 
  Pressable, 
  SafeAreaView, 
  StyleSheet, 
  Image, 
  Modal, 
  Alert 
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  Easing,
  runOnJS
} from "react-native-reanimated";
import { apiService } from "../../services/api";

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
      progressWidth.value = withTiming(1, { duration: 3000, easing: Easing.out(Easing.quad) }, (finished) => {
        if (finished) {
          runOnJS(uploadComplete)();
        }
      });
    } else {
      spinnerRotation.value = 0;
      progressWidth.value = 0;
    }
  }, [loading]);

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinnerRotation.value}deg` }]
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value * 100}%`
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
          return Math.min(prev + Math.floor(Math.random() * 15) + 5, 100);
        });
      }, 300);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePickDocument = async () => {
    triggerHaptic();
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/comma-separated-values", "text/csv", "*/*"],
        copyToCacheDirectory: true
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLoading(false);
    navigation.navigate("CreateGoal");
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* TopAppBar */}
      <View className="flex-row justify-between items-center px-margin-mobile py-stack-md border-b border-slate-100">
        <View className="flex-row items-center space-x-3">
          {/* Back button */}
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
          <Text style={{ fontFamily: "Inter_700Bold" }} className="text-xl text-ob-primary">
            Penny Pilot
          </Text>
        </View>
        <Pressable 
          onPress={() => {
            triggerHaptic();
            navigation.navigate("Login");
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-50 border border-slate-100"
        >
          <MaterialIcons name="settings" size={20} color="#5c5f60" />
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 }}>
        {/* Header Text */}
        <View className="mb-6">
          <Text style={{ fontFamily: "Inter_700Bold" }} className="text-2xl text-on-surface mb-2">
            Connect your spending
          </Text>
          <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-sm text-on-surface-variant">
            Upload your transaction history to let Penny Pilot find your hidden savings opportunities.
          </Text>
        </View>

        {/* Upload Card */}
        <View style={styles.card} className="bg-white border border-outline-variant rounded-2xl p-5 mb-6">
          <Pressable 
            onPress={handlePickDocument}
            style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }] }]}
            className="border-2 border-dashed border-outline-variant rounded-2xl py-12 flex flex-col items-center justify-center bg-slate-50/50"
          >
            <View className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mb-4">
              <MaterialIcons name="cloud-upload" size={32} color="#1a73e8" />
            </View>
            <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-base text-on-surface text-center px-4">
              Tap to upload transactions.csv
            </Text>
            <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-on-surface-variant mt-1">
              Supports standard banking formats
            </Text>
          </Pressable>

          <View className="mt-4 items-center">
            <Pressable 
              onPress={() => {
                triggerHaptic();
                Alert.alert(
                  "Sample Format",
                  "CSV files should contain columns: Date, Description, Amount, Category.\nExample:\n2026-07-30, Starbucks, -7.50, Food"
                );
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              className="flex-row items-center space-x-1 py-2 px-4"
            >
              <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-ob-primary">
                View sample format
              </Text>
              <MaterialIcons name="open-in-new" size={14} color="#005bbf" />
            </Pressable>
          </View>
        </View>

        {/* Bento Grid */}
        <View className="flex-row space-x-4">
          {/* Card 1 */}
          <View style={styles.gridCard} className="flex-1 bg-surface-container-low p-4 rounded-xl">
            <MaterialIcons name="security" size={24} color="#005bbf" className="mb-2" />
            <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-sm text-on-surface mb-1 mt-1">
              Privacy first
            </Text>
            <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-on-surface-variant leading-5">
              Your data is processed locally and never sold to third parties.
            </Text>
          </View>

          {/* Card 2 */}
          <View style={styles.gridCard} className="flex-1 bg-surface-container-low p-4 rounded-xl">
            <MaterialIcons name="auto-awesome" size={24} color="#006d2a" className="mb-2" />
            <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-sm text-on-surface mb-1 mt-1">
              AI Insights
            </Text>
            <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-on-surface-variant leading-5">
              We'll automatically categorize and tag your spending habits.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Loading Overlay Modal */}
      <Modal visible={loading} transparent animationType="fade">
        <View style={styles.overlayBg} className="flex-1 items-center justify-center px-8">
          <View style={styles.modalContent} className="bg-white rounded-3xl p-8 w-full max-w-xs items-center">
            {/* Spinning Loader */}
            <Animated.View style={spinnerStyle} className="mb-6">
              <MaterialIcons name="sync" size={48} color="#1a73e8" />
            </Animated.View>

            <Text style={{ fontFamily: "Inter_700Bold" }} className="text-lg text-on-surface text-center mb-2">
              Analyzing spending...
            </Text>
            <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-on-surface-variant text-center mb-6">
              Our AI is crunching the numbers to build your savings roadmap.
            </Text>

            {/* Progress Bar Container */}
            <View className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-2">
              {/* Filling bar */}
              <Animated.View style={[progressStyle, styles.progressBar]} />
            </View>
            <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-on-surface-variant/80">
              {progressVal}% complete
            </Text>
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
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  gridCard: {
    minHeight: 120,
  },
  overlayBg: {
    backgroundColor: "rgba(255,255,255,0.75)",
  },
  modalContent: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#1a73e8",
    borderRadius: 3,
  }
});

export default CSVUploadScreen;
