import React, { useState, useRef, useEffect } from "react";
import { 
  View, 
  Text, 
  ScrollView, 
  Pressable, 
  SafeAreaView, 
  StyleSheet, 
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { apiService } from "../../services/api";

interface ChatMessage {
  id: string;
  sender: "ai" | "user";
  text: string;
  time: string;
  card?: {
    title: string;
    saved: number;
    target: number;
    quote: string;
  };
  investmentCard?: {
    fundName: string;
    risk: string;
    returnRate: string;
    disclaimer?: string;
  };
}

interface ChatScreenProps {
  mode?: "coach" | "advisor";
}

const INITIAL_COACH_MESSAGES: ChatMessage[] = [
  {
    id: "m-1",
    sender: "ai",
    text: "Hi Alex! 👋 I've been looking at your transactions. You saved ₹1,245 from your round-ups this week just by rounding up your purchases. That's 15% more than last week!",
    time: "9:41 AM"
  },
  {
    id: "m-2",
    sender: "user",
    text: "That's awesome! How close am I to my Laptop goal?",
    time: "9:42 AM"
  },
  {
    id: "m-3",
    sender: "ai",
    text: "You're currently at 68% of your ₹50,000 goal. Based on your current savings rate, you'll reach it by October 12th.",
    time: "9:43 AM",
    card: {
      title: "Laptop Goal",
      saved: 34000,
      target: 50000,
      quote: "Keep the momentum! Skipping one ₹150 latte a week gets you there 2 weeks earlier."
    }
  }
];

const INITIAL_ADVISOR_MESSAGES: ChatMessage[] = [
  {
    id: "a-1",
    sender: "user",
    text: "I have ₹5,000 extra this month. Where should I start investing with low risk?",
    time: "4:30 PM"
  },
  {
    id: "a-2",
    sender: "ai",
    text: "For low risk and steady growth, index funds are a fantastic choice. Based on your profile, here's a top recommendation:",
    time: "4:31 PM",
    investmentCard: {
      fundName: "HDFC Nifty 50 Index Fund",
      risk: "Low Risk",
      returnRate: "12.5% p.a.",
      disclaimer: "Disclaimer: This AI tool is not a licensed financial advisor. Please conduct independent research before investing."
    }
  }
];

export const ChatScreen = ({ mode = "coach" }: ChatScreenProps) => {
  const [activeMode, setActiveMode] = useState<"coach" | "advisor">(mode);
  const [coachList, setCoachList] = useState<ChatMessage[]>(INITIAL_COACH_MESSAGES);
  const [advisorList, setAdvisorList] = useState<ChatMessage[]>(INITIAL_ADVISOR_MESSAGES);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    triggerHaptic();

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: "user",
      text,
      time: timestamp
    };

    if (activeMode === "coach") {
      setCoachList((prev) => [...prev, userMsg]);
    } else {
      setAdvisorList((prev) => [...prev, userMsg]);
    }

    setInputText("");
    setIsTyping(true);

    try {
      if (activeMode === "coach") {
        const res = await apiService.chatWithCoach(text);
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          sender: "ai",
          text: res.response || res.message || "Keep up your great savings habits!",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setCoachList((prev) => [...prev, aiMsg]);
      } else {
        const res = await apiService.askAdvisor(text);
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          sender: "ai",
          text: res.response || "Here is advice tailored for your portfolio:",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          investmentCard: res.recommendationCard || {
            fundName: "HDFC Nifty 50 Index Fund",
            risk: "Low Risk",
            returnRate: "12.5% p.a.",
            disclaimer: "Disclaimer: This AI tool is not a licensed financial advisor. Please conduct independent research before investing."
          }
        };
        setAdvisorList((prev) => [...prev, aiMsg]);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error("Chat API error:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      const errorReply: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: "ai",
        text: "I'm sorry, I ran into an error connecting to our AI server. Please try again.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      if (activeMode === "coach") {
        setCoachList((prev) => [...prev, errorReply]);
      } else {
        setAdvisorList((prev) => [...prev, errorReply]);
      }
    } finally {
      setIsTyping(false);
    }
  };

  const handleInvest = (fund: string) => {
    triggerHaptic();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "Investment Initialized",
      `Would you like to allocate ₹5,000 into ${fund} directly from your Penny Pilot savings balance?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm Buy", onPress: () => Alert.alert("Success", `Allocated ₹5,000 to ${fund}!`) }
      ]
    );
  };

  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [coachList, advisorList, isTyping, activeMode]);

  const activeMessages = activeMode === "coach" ? coachList : advisorList;

  return (
    <SafeAreaView className="flex-1 bg-[#f7f9ff]">
      {/* Header Bar */}
      <View className="bg-white border-b border-slate-100 py-3.5 px-margin-mobile flex-col items-center">
        {/* Toggle Controls */}
        <View className="flex-row bg-slate-100 rounded-full p-1 w-64 justify-between">
          <Pressable
            onPress={() => {
              triggerHaptic();
              setActiveMode("coach");
            }}
            className={`flex-1 py-1.5 rounded-full items-center ${activeMode === "coach" ? "bg-white shadow-sm" : ""}`}
          >
            <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold" }} className={`text-xs ${activeMode === "coach" ? "text-[#005bbf] font-bold" : "text-slate-500"}`}>
              AI Coach
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              triggerHaptic();
              setActiveMode("advisor");
            }}
            className={`flex-1 py-1.5 rounded-full items-center ${activeMode === "advisor" ? "bg-white shadow-sm" : ""}`}
          >
            <Text style={{ fontFamily: "PlusJakartaSans_600SemiBold" }} className={`text-xs ${activeMode === "advisor" ? "text-[#005bbf] font-bold" : "text-slate-500"}`}>
              AI Advisor
            </Text>
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {/* Chat Feed */}
        <ScrollView 
          ref={scrollRef}
          className="flex-1 px-margin-mobile"
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 150 }}
        >
          {activeMessages.map((c) => {
            const isAI = c.sender === "ai";
            return (
              <View 
                key={c.id} 
                className={`flex-col mb-4 ${isAI ? "items-start" : "items-end"}`}
              >
                {/* Bubble */}
                <View 
                  style={[
                    styles.bubble,
                    isAI ? styles.bubbleAI : styles.bubbleUser
                  ]}
                  className="p-4 rounded-2xl max-w-[85%]"
                >
                  <Text 
                    style={{ fontFamily: "WorkSans_400Regular" }} 
                    className={`text-sm leading-relaxed ${isAI ? "text-slate-800" : "text-white"}`}
                  >
                    {c.text}
                  </Text>
                </View>

                {/* Coach Goal Detail Card */}
                {c.card && (
                  <View 
                    style={styles.card} 
                    className="bg-white border border-outline-variant/30 p-4 rounded-2xl shadow-sm w-[85%] mt-2"
                  >
                    <View className="flex-row justify-between items-center mb-3">
                      <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-sm text-slate-800">
                        {c.card.title}
                      </Text>
                      <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-xs text-ob-primary">
                        ₹{c.card.saved.toLocaleString("en-IN")} / ₹{c.card.target.toLocaleString("en-IN")}
                      </Text>
                    </View>
                    <View className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <View 
                        style={{ width: `${Math.round((c.card.saved / c.card.target) * 100)}%` }}
                        className="h-full bg-blue-600 rounded-full"
                      />
                    </View>
                    <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-[10px] text-slate-500 italic mt-3 leading-relaxed">
                      "{c.card.quote}"
                    </Text>
                  </View>
                )}

                {/* Advisor Investment Pick Card */}
                {c.investmentCard && (
                  <View 
                    style={styles.card} 
                    className="bg-white border border-outline-variant/30 rounded-2xl p-4 w-[85%] mt-2 flex-col space-y-3"
                  >
                    <View className="flex-row justify-between items-start">
                      <View className="flex-1">
                        <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] text-slate-400 uppercase tracking-wider">
                          Top Pick
                        </Text>
                        <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-sm text-slate-800">
                          {c.investmentCard.fundName}
                        </Text>
                      </View>
                      <View className="bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                        <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[9px] text-emerald-800 uppercase font-bold">
                          {c.investmentCard.risk}
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row items-end justify-between border-t border-slate-100 pt-3">
                      <View>
                        <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-[10px] text-slate-500">
                          Expected Return
                        </Text>
                        <Text style={{ fontFamily: "PlusJakartaSans_700Bold" }} className="text-base text-emerald-600">
                          {c.investmentCard.returnRate}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => handleInvest(c.investmentCard!.fundName)}
                        style={({ pressed }) => [
                          styles.investBtn,
                          { opacity: pressed ? 0.8 : 1 }
                        ]}
                        className="bg-[#005bbf] rounded-full px-4 py-2"
                      >
                        <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-white">
                          Invest Now
                        </Text>
                      </Pressable>
                    </View>

                    {/* Disclaimer Text */}
                    <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-[9px] text-slate-400 italic mt-2 border-t border-slate-100 pt-2 leading-tight">
                      {c.investmentCard.disclaimer || "Disclaimer: This AI tool is not a licensed financial advisor. Please conduct independent research before investing."}
                    </Text>
                  </View>
                )}

                <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-[9px] text-slate-400 mt-1 px-1">
                  {c.time}
                </Text>
              </View>
            );
          })}

          {isTyping && (
            <View className="flex-row items-center space-x-1.5 ml-2 mt-1">
              <View className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
              <View className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ marginHorizontal: 2 }} />
              <View className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
            </View>
          )}
        </ScrollView>

        {/* Input Bar */}
        <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-margin-mobile">
          {/* Quick Suggestions */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row pb-3">
            {(activeMode === "coach"
              ? ["How am I doing?", "Savings tips", "Analyze my coffee spend"]
              : ["How do index funds work?", "What is Nifty 50?", "Other low risk options?"]
            ).map((chip) => (
              <Pressable
                key={chip}
                onPress={() => handleSend(chip)}
                style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.95 : 1 }] }]}
                className="px-4 py-2 border border-slate-200 bg-slate-50 rounded-full mr-2"
              >
                <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-xs text-slate-500">
                  {chip}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Input Bar */}
          <View className="flex-row items-center space-x-3">
            <View className="flex-1 flex-row items-center bg-slate-100 rounded-full px-4 border border-slate-200/50">
              <TextInput
                value={inputText}
                onChangeText={setInputText}
                placeholder={activeMode === "coach" ? "Ask your financial coach..." : "Ask your investment advisor..."}
                placeholderTextColor="#94a3b8"
                style={{ fontFamily: "WorkSans_400Regular", flex: 1, paddingVertical: 10 }}
                className="text-sm text-slate-800"
              />
            </View>
            <Pressable
              onPress={() => handleSend(inputText)}
              disabled={!inputText.trim()}
              style={[
                styles.sendBtn,
                { backgroundColor: inputText.trim() ? "#005bbf" : "#adc7ff" }
              ]}
              className="w-10 h-10 rounded-full items-center justify-center shadow-sm"
            >
              <MaterialIcons name="send" size={18} color="#ffffff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  bubble: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  bubbleAI: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e8eaed",
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: "#1a73e8",
    borderBottomRightRadius: 4,
  },
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  investBtn: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 1,
  },
  sendBtn: {
    alignItems: "center",
    justifyContent: "center",
  }
});

export default ChatScreen;
