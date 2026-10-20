import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import {
  Send,
  Sparkles,
  ShieldCheck,
  RotateCcw,
  Bot,
  User,
  Info,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { apiService } from "../../services/api";
import { Card, Chip } from "../../components/ui";

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  time: string;
  isError?: boolean;
  investmentCard?: {
    fundName: string;
    risk: string;
    returnRate: string;
    disclaimer?: string;
  };
}

const COACH_PROMPTS = [
  "How do micro-savings and round-ups work?",
  "How can I save ₹1,000 extra this month?",
  "Tips for avoiding impulsive purchases on campus",
];

const ADVISOR_PROMPTS = [
  "What is a low-risk index fund?",
  "How does compounding interest work?",
  "Should I prioritize an emergency fund first?",
];

export const ChatScreen = () => {
  const [activeMode, setActiveMode] = useState<"coach" | "advisor">("coach");
  const [coachMessages, setCoachMessages] = useState<ChatMessage[]>([]);
  const [advisorMessages, setAdvisorMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const triggerHaptic = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore on web
    }
  };

  const activeMessages = activeMode === "coach" ? coachMessages : advisorMessages;

  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 120);
  }, [coachMessages, advisorMessages, isTyping, activeMode]);

  const handleSend = async (textToSend?: string) => {
    const messageText = (textToSend !== undefined ? textToSend : inputText).trim();
    if (!messageText || isTyping) return;

    triggerHaptic();
    setInputText("");

    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: "user",
      text: messageText,
      time: timestamp,
    };

    if (activeMode === "coach") {
      setCoachMessages((prev) => [...prev, userMsg]);
    } else {
      setAdvisorMessages((prev) => [...prev, userMsg]);
    }

    setIsTyping(true);

    try {
      if (activeMode === "coach") {
        const res = await apiService.chatWithCoach(messageText);
        const replyText =
          res?.response || res?.message || "Keep building your daily savings streak!";
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          sender: "ai",
          text: replyText,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        setCoachMessages((prev) => [...prev, aiMsg]);
      } else {
        const res = await apiService.askAdvisor(messageText);
        const replyText =
          res?.response ||
          res?.message ||
          "Here is personalized investment guidance based on your risk profile:";
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          sender: "ai",
          text: replyText,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          investmentCard: res?.recommendationCard,
        };
        setAdvisorMessages((prev) => [...prev, aiMsg]);
      }
    } catch (err: any) {
      console.warn("Chat API error:", err);
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: "ai",
        text: "Could not reach the assistant. Please check your network or try again.",
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        isError: true,
      };

      if (activeMode === "coach") {
        setCoachMessages((prev) => [...prev, errorMsg]);
      } else {
        setAdvisorMessages((prev) => [...prev, errorMsg]);
      }
    } finally {
      setIsTyping(false);
    }
  };

  const handleRetryLast = () => {
    const messages = activeMode === "coach" ? coachMessages : advisorMessages;
    // Find last user message
    const lastUser = [...messages].reverse().find((m) => m.sender === "user");
    if (lastUser) {
      handleSend(lastUser.text);
    }
  };

  const suggestionPrompts = activeMode === "coach" ? COACH_PROMPTS : ADVISOR_PROMPTS;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-cream"
    >
      {/* Top Controls Header */}
      <View className="bg-surface border-b border-border pt-3 pb-2.5 px-4 shadow-card">
        {/* Mode Switcher Tabs */}
        <View className="flex-row bg-cream p-1 rounded-2xl border border-border justify-center max-w-sm mx-auto">
          <TouchableOpacity
            onPress={() => {
              triggerHaptic();
              setActiveMode("coach");
            }}
            activeOpacity={0.8}
            className={`flex-1 py-2 px-3 rounded-xl items-center flex-row justify-center ${
              activeMode === "coach" ? "bg-white shadow-button border border-border/40" : ""
            }`}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeMode === "coach" }}
          >
            <Sparkles
              size={15}
              color={activeMode === "coach" ? "#144a32" : "#666e69"}
            />
            <Text
              className={`text-xs ml-1.5 font-sans ${
                activeMode === "coach"
                  ? "font-bold text-primary"
                  : "font-semibold text-text-muted"
              }`}
            >
              Savings Coach
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              triggerHaptic();
              setActiveMode("advisor");
            }}
            activeOpacity={0.8}
            className={`flex-1 py-2 px-3 rounded-xl items-center flex-row justify-center ${
              activeMode === "advisor" ? "bg-white shadow-button border border-border/40" : ""
            }`}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeMode === "advisor" }}
          >
            <ShieldCheck
              size={15}
              color={activeMode === "advisor" ? "#144a32" : "#666e69"}
            />
            <Text
              className={`text-xs ml-1.5 font-sans ${
                activeMode === "advisor"
                  ? "font-bold text-primary"
                  : "font-semibold text-text-muted"
              }`}
            >
              Wealth Advisor
            </Text>
          </TouchableOpacity>
        </View>

        {/* AI Calculation Disclaimer Banner */}
        <View className="flex-row items-center bg-sage-light/60 border border-border rounded-xl px-2.5 py-1.5 mt-2.5">
          <Info size={13} color="#144a32" className="mt-0.5 mr-1.5" />
          <Text className="text-[11px] text-primary font-sans flex-1 leading-4">
            Financial figures are verified by Penny Pilot's calculation engine, not fabricated by the AI.
          </Text>
        </View>
      </View>

      {/* Messages Scroll Area */}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 20,
          flexGrow: 1,
        }}
        className="flex-1"
      >
        {activeMessages.length === 0 ? (
          <View className="flex-1 justify-center my-4">
            <Card variant="default" padding="lg" className="shadow-card mb-4 items-center">
              <View className="w-12 h-12 rounded-full bg-sage-light items-center justify-center mb-3 border border-border">
                <Bot size={24} color="#144a32" />
              </View>
              <Text className="text-base font-bold text-text-primary font-sans text-center">
                {activeMode === "coach"
                  ? "Meet your Penny Pilot Coach"
                  : "Welcome to Wealth Advisor"}
              </Text>
              <Text className="text-xs text-text-secondary font-sans text-center mt-1 leading-relaxed max-w-xs">
                {activeMode === "coach"
                  ? "Ask about your spending patterns, micro-savings streaks, or get tips on reaching your goals faster."
                  : "Get educational guidance on index funds, long-term wealth compounding, and smart financial habits."}
              </Text>
            </Card>

            {/* Quick Suggestion Chips */}
            <Text className="text-xs font-bold text-text-muted uppercase tracking-wider font-sans mb-2 px-1">
              Suggested Questions:
            </Text>
            <View className="space-y-2">
              {suggestionPrompts.map((prompt, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => handleSend(prompt)}
                  activeOpacity={0.8}
                  className="bg-white p-3 rounded-2xl border border-border shadow-card mb-2"
                  accessibilityRole="button"
                  accessibilityLabel={prompt}
                >
                  <Text className="text-xs font-semibold text-text-primary font-sans">
                    "{prompt}"
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <View className="space-y-3">
            {activeMessages.map((msg) => {
              const isUser = msg.sender === "user";

              return (
                <View
                  key={msg.id}
                  className={`flex-row mb-3 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {!isUser && (
                    <View className="w-7 h-7 rounded-full bg-primary items-center justify-center mr-2 mt-1 shadow-button">
                      <Bot size={14} color="#ffffff" />
                    </View>
                  )}

                  <View className="max-w-[82%]">
                    <View
                      className={`p-3.5 rounded-2xl ${
                        isUser
                          ? "bg-primary rounded-tr-xs"
                          : msg.isError
                          ? "bg-danger-light border border-danger/30 rounded-tl-xs"
                          : "bg-white border border-border shadow-card rounded-tl-xs"
                      }`}
                    >
                      <Text
                        className={`text-xs font-sans leading-relaxed ${
                          isUser
                            ? "text-white font-medium"
                            : msg.isError
                            ? "text-danger font-medium"
                            : "text-text-primary"
                        }`}
                      >
                        {msg.text}
                      </Text>

                      {/* Optional Investment Recommendation Card */}
                      {msg.investmentCard && (
                        <View className="mt-2.5 p-3 rounded-xl bg-cream border border-border">
                          <Text className="text-xs font-bold text-primary font-sans">
                            {msg.investmentCard.fundName}
                          </Text>
                          <View className="flex-row items-center mt-1 space-x-2">
                            <Chip
                              label={msg.investmentCard.risk}
                              variant="success"
                              className="py-0 px-2 h-5 mr-2"
                            />
                            <Text className="text-[11px] font-bold text-gold font-sans">
                              {msg.investmentCard.returnRate}
                            </Text>
                          </View>
                          {msg.investmentCard.disclaimer && (
                            <Text className="text-[10px] text-text-muted font-sans mt-2 italic">
                              {msg.investmentCard.disclaimer}
                            </Text>
                          )}
                        </View>
                      )}

                      {/* Retry Button if error */}
                      {msg.isError && (
                        <TouchableOpacity
                          onPress={handleRetryLast}
                          className="flex-row items-center mt-2 self-start"
                        >
                          <RotateCcw size={12} color="#b3261e" />
                          <Text className="text-[11px] font-bold text-danger ml-1 font-sans">
                            Tap to retry
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <Text
                      className={`text-[10px] text-text-muted font-sans mt-1 ${
                        isUser ? "text-right mr-1" : "ml-1"
                      }`}
                    >
                      {msg.time}
                    </Text>
                  </View>

                  {isUser && (
                    <View className="w-7 h-7 rounded-full bg-sage-light items-center justify-center ml-2 mt-1 border border-border">
                      <User size={14} color="#144a32" />
                    </View>
                  )}
                </View>
              );
            })}

            {isTyping && (
              <View className="flex-row items-center mb-3">
                <View className="w-7 h-7 rounded-full bg-primary items-center justify-center mr-2 shadow-button">
                  <Bot size={14} color="#ffffff" />
                </View>
                <View className="bg-white border border-border px-3.5 py-2.5 rounded-2xl rounded-tl-xs flex-row items-center space-x-1.5 shadow-card">
                  <ActivityIndicator size="small" color="#144a32" />
                  <Text className="text-xs text-text-muted font-sans ml-2">
                    Penny Pilot is thinking...
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Input Bar */}
      <View className="bg-surface border-t border-border p-3 flex-row items-center">
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder={
            activeMode === "coach"
              ? "Ask coach anything about your savings..."
              : "Ask advisor about investments..."
          }
          placeholderTextColor="#707773"
          className="flex-1 bg-cream border border-border rounded-2xl px-4 py-2.5 text-xs text-text-primary font-sans mr-2 min-h-[44px]"
          multiline
          maxLength={500}
          onSubmitEditing={() => handleSend()}
        />
        <TouchableOpacity
          onPress={() => handleSend()}
          disabled={!inputText.trim() || isTyping}
          className={`w-11 h-11 rounded-2xl items-center justify-center shadow-button ${
            inputText.trim() && !isTyping ? "bg-primary" : "bg-text-muted/40"
          }`}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Send size={18} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

export default ChatScreen;
