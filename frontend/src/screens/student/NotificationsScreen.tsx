import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { apiService } from "../../services/api";
import { Notification } from "../../types";

export const NotificationsScreen = () => {
  const navigation = useNavigation<any>();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const res = await apiService.getNotifications();
      setNotifications(res);
    } catch (e: any) {
      console.warn("Failed to load notifications:", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await apiService.getNotifications();
      setNotifications(res);
    } catch (e: any) {
      console.warn("Failed to refresh notifications:", e.message);
    } finally {
      setRefreshing(false);
    }
  };

  const handleMarkAsRead = async (notifId: number) => {
    triggerHaptic();
    try {
      // Optimistically update UI
      setNotifications((prev) =>
        prev.map((n) => (n.notif_id === notifId ? { ...n, status: "read" } : n))
      );
      await apiService.markNotificationRead(notifId);
    } catch (e: any) {
      console.warn("Failed to mark notification as read:", e.message);
      // Reload on failure to sync
      loadNotifications();
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  // Mock notifications to display if none exist
  const mockNotifications: Notification[] = [
    {
      notif_id: 1,
      user_id: 1,
      title: "Goal Nearing Completion! 🎯",
      message: "You're 92% of the way to saving for your 'New Laptop'. One final roundup should do it!",
      status: "unread",
      created_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    },
    {
      notif_id: 2,
      user_id: 1,
      title: "Weekend Roundup Booster ⚡",
      message: "We automatically deposited ₹240 from 12 roundups into your Laptop savings goal this weekend.",
      status: "unread",
      created_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    },
    {
      notif_id: 3,
      user_id: 1,
      title: "Budget Warning ⚠️",
      message: "You have spent 95% of your food budget. Consider pausing premium purchases for the week.",
      status: "read",
      created_at: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
    },
  ];

  const displayedNotifications =
    notifications.length > 0 ? notifications : mockNotifications;

  return (
    <SafeAreaView className="flex-1 bg-[#f7f9ff]">
      {/* Header Banner */}
      <View className="flex-row items-center justify-between px-margin-mobile py-stack-md bg-white border-b border-slate-100">
        <View className="flex-row items-center space-x-2">
          <Pressable
            onPress={() => {
              triggerHaptic();
              navigation.goBack();
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-50 border border-slate-100"
          >
            <MaterialIcons name="arrow-back" size={20} color="#181c20" />
          </Pressable>
          <Text
            style={{ fontFamily: "Inter_700Bold" }}
            className="text-lg text-slate-800 font-bold ml-2"
          >
            Notifications
          </Text>
        </View>
        {displayedNotifications.some((n) => n.status === "unread") && (
          <Pressable
            onPress={async () => {
              triggerHaptic();
              try {
                const unreads = displayedNotifications.filter((n) => n.status === "unread");
                // Read all sequentially
                for (const u of unreads) {
                  await apiService.markNotificationRead(u.notif_id);
                }
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                loadNotifications();
              } catch (e: any) {
                console.warn(e.message);
              }
            }}
            className="px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100"
          >
            <Text
              style={{ fontFamily: "WorkSans_600SemiBold" }}
              className="text-[10px] text-blue-700 font-bold uppercase tracking-wider"
            >
              Mark all read
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#005bbf" />
        }
      >
        {loading && notifications.length === 0 ? (
          <ActivityIndicator size="large" color="#005bbf" className="py-8" />
        ) : displayedNotifications.length === 0 ? (
          <View className="flex-1 items-center justify-center py-20">
            <MaterialIcons name="notifications-none" size={48} color="#94a3b8" className="mb-4" />
            <Text
              style={{ fontFamily: "Inter_700Bold" }}
              className="text-slate-800 text-base mb-1"
            >
              All Caught Up!
            </Text>
            <Text
              style={{ fontFamily: "WorkSans_400Regular" }}
              className="text-slate-400 text-xs text-center px-6"
            >
              You don't have any notifications right now.
            </Text>
          </View>
        ) : (
          <View className="space-y-3">
            {displayedNotifications.map((item) => {
              const isUnread = item.status === "unread";
              const formattedTime = new Date(item.created_at).toLocaleDateString("en-IN", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <Pressable
                  key={item.notif_id}
                  onPress={() => isUnread && handleMarkAsRead(item.notif_id)}
                  style={[
                    styles.card,
                    isUnread ? styles.unreadCard : styles.readCard,
                  ]}
                  className="rounded-2xl p-4 border flex-row items-start space-x-3.5"
                >
                  {/* Status Indicator Dot */}
                  <View className="mt-1.5 w-6 h-6 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center">
                    <MaterialIcons
                      name={
                        item.title.includes("Goal")
                          ? "track-changes"
                          : item.title.includes("Budget")
                          ? "warning"
                          : "notifications"
                      }
                      size={14}
                      color={isUnread ? "#005bc0" : "#64748b"}
                    />
                  </View>

                  <View className="flex-1">
                    <View className="flex-row justify-between items-center mb-1">
                      <Text
                        style={{
                          fontFamily: isUnread
                            ? "Inter_700Bold"
                            : "Inter_600SemiBold",
                        }}
                        className={`text-sm ${
                          isUnread ? "text-slate-900" : "text-slate-700"
                        }`}
                      >
                        {item.title}
                      </Text>
                      {isUnread && <View className="w-2 h-2 rounded-full bg-[#005bc0]" />}
                    </View>

                    <Text
                      style={{ fontFamily: "WorkSans_400Regular" }}
                      className="text-xs text-slate-500 leading-5 mb-2"
                    >
                      {item.message}
                    </Text>

                    <Text
                      style={{ fontFamily: "WorkSans_500Medium" }}
                      className="text-[9px] text-slate-400 font-bold uppercase tracking-wider"
                    >
                      {formattedTime}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  unreadCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e0e8ff",
  },
  readCard: {
    backgroundColor: "#f8fafc",
    borderColor: "#f1f5f9",
    opacity: 0.8,
  },
});

export default NotificationsScreen;
