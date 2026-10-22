import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ArrowLeft, Bell, CheckCheck, Clock } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { apiService, getErrorMessage } from "../../services/api";
import { Notification } from "../../types";
import {
  ScreenContainer,
  Card,
  Chip,
  Skeleton,
  EmptyState,
} from "../../components/ui";

export const NotificationsScreen = () => {
  const navigation = useNavigation<any>();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerHaptic = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore on web
    }
  };

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiService.getNotifications();
      setNotifications(Array.isArray(res) ? res : []);
      setError(null);
    } catch (e: any) {
      console.warn("Failed to load notifications:", e.message);
      setError(getErrorMessage(e, "Couldn't load your notifications."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
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
      loadNotifications();
    }
  };

  const handleMarkAllRead = async () => {
    triggerHaptic();
    try {
      setNotifications((prev) => prev.map((n) => ({ ...n, status: "read" })));
      await apiService.markAllNotificationsRead();
    } catch (e: any) {
      console.warn("Failed to mark all as read:", e.message);
      loadNotifications();
    }
  };

  const unreadCount = notifications.filter((n) => n.status !== "read").length;

  return (
    <ScreenContainer
      refreshing={refreshing}
      onRefresh={handleRefresh}
      className="pt-2 pb-8"
    >
      {/* Header Bar */}
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => {
              triggerHaptic();
              navigation.goBack();
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="w-10 h-10 rounded-full bg-white border border-border items-center justify-center mr-3 shadow-card"
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={20} color="#144a32" />
          </TouchableOpacity>
          <View>
            <Text className="text-lg font-bold text-text-primary font-sans">
              Notifications
            </Text>
            {unreadCount > 0 && (
              <Text className="text-[11px] text-text-muted font-sans">
                {unreadCount} unread update{unreadCount > 1 ? "s" : ""}
              </Text>
            )}
          </View>
        </View>

        {unreadCount > 0 && (
          <TouchableOpacity
            onPress={handleMarkAllRead}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="flex-row items-center px-3 py-2 rounded-xl bg-sage-light border border-border"
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
          >
            <CheckCheck size={14} color="#144a32" />
            <Text className="text-xs font-bold text-primary font-sans ml-1.5">
              Read all
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {error && (
        <Card variant="peach" padding="md" className="mb-3">
          <Text className="text-xs text-text-secondary font-sans">{error}</Text>
        </Card>
      )}

      {loading && notifications.length === 0 ? (
        <View className="space-y-3 py-4">
          <Skeleton width="100%" height={88} className="rounded-card mb-3" />
          <Skeleton width="100%" height={88} className="rounded-card mb-3" />
          <Skeleton width="100%" height={88} className="rounded-card" />
        </View>
      ) : notifications.length === 0 && !error ? (
        <Card variant="default" padding="lg" className="my-6 shadow-card">
          <EmptyState
            title="All caught up!"
            description="You have no notifications. You'll be alerted here when a goal is reached, a budget is exceeded, or a withdrawal is recorded."
            icon={<Bell size={32} color="#144a32" />}
          />
        </Card>
      ) : notifications.length === 0 ? null : (
        <View className="space-y-3">
          {notifications.map((item) => {
            const isUnread = item.status !== "read";
            const dateStr = item.created_at
              ? new Date(item.created_at).toLocaleDateString("en-IN", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "";

            return (
              <TouchableOpacity
                key={item.notif_id}
                onPress={() => isUnread && handleMarkAsRead(item.notif_id)}
                activeOpacity={0.8}
                className="mb-3"
                accessibilityRole="button"
                accessibilityLabel={`${item.title}: ${item.message}`}
              >
                <Card
                  variant={isUnread ? "peach" : "default"}
                  padding="md"
                  className={`shadow-card ${isUnread ? "border-gold/40" : ""}`}
                >
                  <View className="flex-row items-start justify-between mb-1.5">
                    <View className="flex-row items-center flex-1 mr-2">
                      <View
                        className={`w-8 h-8 rounded-full items-center justify-center mr-2.5 ${
                          isUnread ? "bg-primary" : "bg-sage-light"
                        }`}
                      >
                        <Bell
                          size={15}
                          color={isUnread ? "#ffffff" : "#144a32"}
                        />
                      </View>
                      <Text
                        className={`text-sm flex-1 font-sans ${
                          isUnread
                            ? "font-bold text-text-primary"
                            : "font-semibold text-text-secondary"
                        }`}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                    </View>

                    {isUnread && (
                      <Chip
                        label="New"
                        variant="warning"
                        className="py-0 px-2 h-5"
                      />
                    )}
                  </View>

                  <Text className="text-xs text-text-secondary font-sans leading-relaxed pl-10 mb-2">
                    {item.message}
                  </Text>

                  {dateStr ? (
                    <View className="flex-row items-center pl-10">
                      <Clock size={11} color="#666e69" />
                      <Text className="text-[11px] text-text-muted font-sans ml-1">
                        {dateStr}
                      </Text>
                    </View>
                  ) : null}
                </Card>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScreenContainer>
  );
};

export default NotificationsScreen;
