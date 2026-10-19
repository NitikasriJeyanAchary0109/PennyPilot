import React, { useState } from "react";
import { 
  View, 
  Text, 
  ScrollView, 
  Pressable, 
  SafeAreaView, 
  StyleSheet, 
  TextInput,
  Dimensions,
  Image,
  Alert
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

const { width } = Dimensions.get("window");
const numpadKeyWidth = (width - 60) / 3;

interface EmojiCategory {
  emoji: string;
  label: string;
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  { emoji: "🏠", label: "Home" },
  { emoji: "🚗", label: "Vehicle" },
  { emoji: "🎓", label: "Education" },
  { emoji: "✈️", label: "Travel" },
  { emoji: "💻", label: "Tech" },
  { emoji: "💍", label: "Wedding" },
  { emoji: "🚲", label: "Cycle" },
];

export const GoalCreationScreen = ({ navigation }: { navigation: any }) => {
  const [goalName, setGoalName] = useState("");
  const [currentAmount, setCurrentAmount] = useState("0");
  const [selectedEmoji, setSelectedEmoji] = useState("🏠");
  const [targetDate, setTargetDate] = useState("Dec 2026");

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const appendNum = (num: string) => {
    triggerHaptic();
    if (currentAmount === "0") {
      setCurrentAmount(num);
    } else if (currentAmount.length < 9) {
      setCurrentAmount(currentAmount + num);
    }
  };

  const deleteLast = () => {
    triggerHaptic();
    if (currentAmount.length > 1) {
      setCurrentAmount(currentAmount.slice(0, -1));
    } else {
      setCurrentAmount("0");
    }
  };

  const clearNum = () => {
    triggerHaptic();
    setCurrentAmount("0");
  };

  const addSuggestion = (val: number) => {
    triggerHaptic();
    const curr = parseInt(currentAmount) || 0;
    setCurrentAmount(Math.min(curr + val, 99999999).toString());
  };

  const cycleDate = () => {
    triggerHaptic();
    const dates = ["Dec 2026", "Jun 2027", "Dec 2027", "Mar 2028"];
    const nextIdx = (dates.indexOf(targetDate) + 1) % dates.length;
    setTargetDate(dates[nextIdx]);
  };

  const formattedAmount = (parseInt(currentAmount) || 0).toLocaleString("en-IN");

  return (
    <SafeAreaView className="flex-1 bg-[#f7f9ff]">
      {/* Header */}
      <View className="flex-row justify-between items-center px-margin-mobile py-stack-md bg-white border-b border-slate-100">
        <View className="flex-row items-center space-x-3">
          <Pressable 
            onPress={() => {
              triggerHaptic();
              navigation.goBack();
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            className="p-1"
          >
            <MaterialIcons name="close" size={24} color="#181c20" />
          </Pressable>
          <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-lg text-ob-primary">
            New Goal
          </Text>
        </View>
        <View className="w-10 h-10 rounded-full overflow-hidden border border-outline-variant">
          <Image 
            source={{ uri: "https://lh3.googleusercontent.com/aida-public/AB6AXuC23zGGmCbATv51DSmMKFuim_BM6NhvTkTlW_Fj_vWpU9Hwm-SdXl6u63UvOMJEGTAKpl62pwmPFnflWBlPpcL9yDWKyCVWtjgzO9QfYUrSU0zJiT1Jh-bpeThmqt23470_vcq_1qZGOtxHp-_MtmxDQudb8JQyUdfbJS_GaJ14u3zDnT8FUNym6YiKYSwnYN-hpGV8YoixxbXzZ_LuX-rWDbFjXnm_sT_nVyiRPCtEfI1B-8UPnaEz" }}
            style={{ width: "100%", height: "100%", resizeMode: "cover" }}
          />
        </View>
      </View>

      <ScrollView className="flex-grow" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 280 }}>
        {/* Dream Engine Header */}
        <View className="items-center mb-6">
          <View className="flex-row items-center space-x-2 bg-surface-container-low px-4 py-2 rounded-full border border-outline-variant mb-4">
            <MaterialIcons name="auto-awesome" size={16} color="#005bbf" />
            <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-on-surface-variant uppercase tracking-wider">
              Dream Engine AI
            </Text>
          </View>
          <Text style={{ fontFamily: "Inter_700Bold" }} className="text-2xl text-on-surface text-center mb-2">
            What are we saving for?
          </Text>
          <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-sm text-on-surface-variant text-center px-4">
            Define your vision and let AI calculate the smartest way to get there.
          </Text>
        </View>

        {/* Goal Name Input */}
        <View className="mb-6">
          <TextInput
            value={goalName}
            onChangeText={setGoalName}
            placeholder="Goal name (e.g. Europe Trip)"
            placeholderTextColor="#727785"
            style={{ fontFamily: "WorkSans_400Regular" }}
            className="w-full bg-surface-container-low border-none rounded-xl px-6 py-4 text-base text-center text-on-surface focus:border-ob-primary focus:ring-1"
          />
        </View>

        {/* Large Amount Input */}
        <View className="items-center mb-8">
          <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-ob-secondary uppercase tracking-wider mb-1">
            Target Amount
          </Text>
          <View className="flex-row items-baseline justify-center">
            <Text style={{ fontFamily: "Inter_800ExtraBold" }} className="text-3xl text-primary-container mr-1">
              ₹
            </Text>
            <Text style={{ fontFamily: "Inter_800ExtraBold" }} className="text-4xl text-on-surface">
              {formattedAmount}
            </Text>
          </View>
        </View>

        {/* Emoji/Icon Grid Selector */}
        <View className="flex-row flex-wrap gap-3 mb-6 justify-center">
          {EMOJI_CATEGORIES.map((cat) => {
            const isActive = selectedEmoji === cat.emoji;
            return (
              <Pressable
                key={cat.label}
                onPress={() => {
                  triggerHaptic();
                  setSelectedEmoji(cat.emoji);
                }}
                style={[
                  styles.emojiCard,
                  isActive ? styles.emojiCardActive : null
                ]}
                className="bg-white border border-outline-variant items-center justify-center rounded-2xl"
              >
                <Text className="text-2xl mb-1">{cat.emoji}</Text>
                <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] text-on-secondary-fixed-variant">
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
          
          {/* More icon */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }}
            style={styles.emojiCard}
            className="bg-white border border-outline-variant items-center justify-center rounded-2xl"
          >
            <MaterialIcons name="add" size={24} color="#727785" className="mb-0.5" />
            <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] text-on-secondary-fixed-variant">
              More
            </Text>
          </Pressable>
        </View>

        {/* Date Picker Row */}
        <View style={styles.card} className="flex-row justify-between items-center bg-white p-4 rounded-xl border border-outline-variant mb-6">
          <View className="flex-row items-center space-x-3">
            <View className="bg-primary-fixed w-10 h-10 rounded-full items-center justify-center">
              <MaterialIcons name="calendar-today" size={20} color="#005bbf" />
            </View>
            <View>
              <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-ob-secondary">
                Target Date
              </Text>
              <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-sm text-on-surface">
                {targetDate}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={cycleDate}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            className="py-2 px-4 bg-slate-50 border border-slate-100 rounded-full"
          >
            <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-ob-primary font-bold">
              CHANGE
            </Text>
          </Pressable>
        </View>

        {/* Quick Suggestion Chips */}
        <View className="flex-row space-x-2 mb-8">
          <Pressable
            onPress={() => addSuggestion(10000)}
            style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.95 : 1 }] }]}
            className="px-4 py-2 rounded-full border border-outline-variant bg-white"
          >
            <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-on-surface">
              +₹10,000
            </Text>
          </Pressable>
          <Pressable
            onPress={() => addSuggestion(50000)}
            style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.95 : 1 }] }]}
            className="px-4 py-2 rounded-full border border-outline-variant bg-white"
          >
            <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-on-surface">
              +₹50,000
            </Text>
          </Pressable>
          <Pressable
            onPress={() => addSuggestion(100000)}
            style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.95 : 1 }] }]}
            className="px-4 py-2 rounded-full border border-outline-variant bg-white"
          >
            <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-on-surface">
              +₹1,00,000
            </Text>
          </Pressable>
        </View>

        {/* Keypad */}
        <View className="flex-row flex-wrap justify-between max-w-[280px] mx-auto mb-6">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
            <Pressable
              key={num}
              onPress={() => appendNum(num)}
              style={({ pressed }) => [
                styles.numpadBtn,
                { transform: [{ scale: pressed ? 0.9 : 1 }] }
              ]}
              className="w-[80px] h-[48px] items-center justify-center mb-3"
            >
              <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-xl text-on-surface-variant">
                {num}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={clearNum}
            style={({ pressed }) => [
              styles.numpadBtn,
              { transform: [{ scale: pressed ? 0.9 : 1 }] }
            ]}
            className="w-[80px] h-[48px] items-center justify-center"
          >
            <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-lg text-on-surface-variant">
              C
            </Text>
          </Pressable>
          <Pressable
            onPress={() => appendNum("0")}
            style={({ pressed }) => [
              styles.numpadBtn,
              { transform: [{ scale: pressed ? 0.9 : 1 }] }
            ]}
            className="w-[80px] h-[48px] items-center justify-center"
          >
            <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-xl text-on-surface-variant">
              0
            </Text>
          </Pressable>
          <Pressable
            onPress={deleteLast}
            style={({ pressed }) => [
              styles.numpadBtn,
              { transform: [{ scale: pressed ? 0.9 : 1 }] }
            ]}
            className="w-[80px] h-[48px] items-center justify-center"
          >
            <MaterialIcons name="backspace" size={20} color="#727785" />
          </Pressable>
        </View>
      </ScrollView>

      {/* Fixed bottom actions */}
      <View style={styles.fixedBottom} className="px-margin-mobile py-4 bg-white border-t border-slate-100">
        <Pressable
          android_ripple={{ color: "rgba(255,255,255,0.2)" }}
          style={({ pressed }) => [
            styles.createBtn,
            { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }
          ]}
          onPress={() => {
            triggerHaptic();
            Alert.alert(
              "Goal Configured!",
              `Penny Pilot created your dream goal: "${goalName || "Savings Goal"}" with target ₹${formattedAmount}.`,
              [{ text: "Continue to Setup Spending", onPress: () => navigation.navigate("SpendingSetup") }]
            );
          }}
        >
          <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-white text-base mr-1">
            Create Goal
          </Text>
          <MaterialIcons name="arrow-forward" size={20} color="#ffffff" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  emojiCard: {
    width: (width - 76) / 4,
    aspectRatio: 1,
  },
  emojiCardActive: {
    backgroundColor: "#d8e2ff",
    borderColor: "#005bbf",
    borderWidth: 1.5,
  },
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  numpadBtn: {
    borderRadius: 24,
  },
  fixedBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  createBtn: {
    width: "100%",
    height: 52,
    backgroundColor: "#1a73e8",
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  }
});

export default GoalCreationScreen;
