import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import {
  User,
  Bell,
  PieChart,
  Shield,
  HelpCircle,
  LogOut,
  ChevronRight,
} from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../hooks/useAuth";
import { apiService } from "../../services/api";
import { ScreenContainer, Header, Card, Chip } from "../../components/ui";

export const ProfileScreen = () => {
  const { logout, userRole } = useAuth();
  const navigation = useNavigation<any>();

  const [userProfile, setUserProfile] = useState<{
    full_name?: string;
    email?: string;
    role?: string;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const triggerHaptic = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore on web
    }
  };

  const loadProfile = useCallback(async () => {
    try {
      const data = await apiService.getCurrentUser();
      if (data) {
        setUserProfile(data);
      }
    } catch (e) {
      console.warn("Failed to load user profile:", e);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  };

  const handleLogout = () => {
    triggerHaptic();
    Alert.alert("Logout", "Are you sure you want to log out of Penny Pilot?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            // Ignore on web
          }
          await logout();
        },
      },
    ]);
  };

  const displayName = userProfile?.full_name || "Penny Pilot User";
  const displayEmail = userProfile?.email || "Student Account";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const roleLabel =
    (userProfile?.role || userRole) === "educator"
      ? "Educator Administrator"
      : "Student Saver";

  return (
    <ScreenContainer
      refreshing={refreshing}
      onRefresh={handleRefresh}
      className="pt-2 pb-8"
    >
      {/* Brand Header */}
      <Header
        title="Settings & Profile"
        subtitle="Manage your Penny Pilot account"
        showLogo
        showNotification={false}
        className="px-0 mb-4"
      />

      {/* User Hero Card */}
      <Card variant="default" padding="lg" className="items-center shadow-card mb-4">
        <View className="w-20 h-20 rounded-full bg-sage-light border-2 border-border items-center justify-center mb-3 shadow-card">
          <Text className="text-2xl font-bold text-primary font-sans">
            {initials || <User size={32} color="#144a32" />}
          </Text>
        </View>

        <Text className="text-lg font-bold text-text-primary font-sans mb-0.5">
          {displayName}
        </Text>
        <Text className="text-xs text-text-muted font-sans mb-3">
          {displayEmail}
        </Text>

        <Chip
          label={roleLabel}
          variant="success"
          className="px-3 py-1"
        />
      </Card>

      {/* Settings Navigation List */}
      <Card variant="default" padding="sm" className="shadow-card mb-4">
        {/* Notifications */}
        <TouchableOpacity
          onPress={() => {
            triggerHaptic();
            navigation.navigate("Notifications");
          }}
          activeOpacity={0.7}
          className="flex-row items-center justify-between p-3.5 border-b border-border/50 min-h-[50px]"
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <View className="flex-row items-center">
            <View className="w-8 h-8 rounded-full bg-sage-light items-center justify-center mr-3">
              <Bell size={16} color="#144a32" />
            </View>
            <Text className="text-sm font-semibold text-text-primary font-sans">
              Notifications & Alerts
            </Text>
          </View>
          <ChevronRight size={18} color="#707773" />
        </TouchableOpacity>

        {/* Budgets & Limits */}
        <TouchableOpacity
          onPress={() => {
            triggerHaptic();
            navigation.navigate("Budgets");
          }}
          activeOpacity={0.7}
          className="flex-row items-center justify-between p-3.5 border-b border-border/50 min-h-[50px]"
          accessibilityRole="button"
          accessibilityLabel="Budgets and Spending Limits"
        >
          <View className="flex-row items-center">
            <View className="w-8 h-8 rounded-full bg-sage-light items-center justify-center mr-3">
              <PieChart size={16} color="#144a32" />
            </View>
            <Text className="text-sm font-semibold text-text-primary font-sans">
              Budgets & Limits
            </Text>
          </View>
          <ChevronRight size={18} color="#707773" />
        </TouchableOpacity>

        {/* Security & Password */}
        <TouchableOpacity
          onPress={triggerHaptic}
          activeOpacity={0.7}
          className="flex-row items-center justify-between p-3.5 border-b border-border/50 min-h-[50px]"
          accessibilityRole="button"
          accessibilityLabel="Security and Privacy"
        >
          <View className="flex-row items-center">
            <View className="w-8 h-8 rounded-full bg-sage-light items-center justify-center mr-3">
              <Shield size={16} color="#144a32" />
            </View>
            <Text className="text-sm font-semibold text-text-primary font-sans">
              Security & Privacy
            </Text>
          </View>
          <ChevronRight size={18} color="#707773" />
        </TouchableOpacity>

        {/* Help & Support */}
        <TouchableOpacity
          onPress={triggerHaptic}
          activeOpacity={0.7}
          className="flex-row items-center justify-between p-3.5 min-h-[50px]"
          accessibilityRole="button"
          accessibilityLabel="Help and Support"
        >
          <View className="flex-row items-center">
            <View className="w-8 h-8 rounded-full bg-sage-light items-center justify-center mr-3">
              <HelpCircle size={16} color="#144a32" />
            </View>
            <Text className="text-sm font-semibold text-text-primary font-sans">
              Help & FAQ
            </Text>
          </View>
          <ChevronRight size={18} color="#707773" />
        </TouchableOpacity>
      </Card>

      {/* Logout Row */}
      <TouchableOpacity
        onPress={handleLogout}
        activeOpacity={0.8}
        className="flex-row items-center justify-center p-3.5 rounded-2xl bg-white border border-danger/30 shadow-card min-h-[48px]"
        accessibilityRole="button"
        accessibilityLabel="Log out of Penny Pilot"
      >
        <LogOut size={16} color="#b3261e" className="mr-2" />
        <Text className="text-sm font-bold text-danger font-sans ml-1.5">
          Sign Out
        </Text>
      </TouchableOpacity>
    </ScreenContainer>
  );
};

export default ProfileScreen;
