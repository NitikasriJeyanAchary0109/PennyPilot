import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Bell } from "lucide-react-native";
import { PennyPilotLogoIcon } from "./SvgPlaceholders";

export interface HeaderProps {
  title?: string;
  subtitle?: string;
  showLogo?: boolean;
  showNotification?: boolean;
  hasUnreadNotifications?: boolean;
  onNotificationPress?: () => void;
  rightAction?: React.ReactNode;
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({
  title = "Penny Pilot",
  subtitle,
  showLogo = true,
  showNotification = true,
  hasUnreadNotifications = true,
  onNotificationPress,
  rightAction,
  className = "",
}) => {
  return (
    <View
      className={`w-full flex-row items-center justify-between py-3 px-4 bg-transparent ${className}`}
    >
      {/* Left: Logo & Title */}
      <View className="flex-row items-center">
        {showLogo && (
          <View className="mr-2">
            <PennyPilotLogoIcon size={26} />
          </View>
        )}
        <View>
          <Text className="text-lg font-bold text-primary tracking-tight">
            {title}
          </Text>
          {subtitle && (
            <Text className="text-xs text-text-secondary mt-0.5">{subtitle}</Text>
          )}
        </View>
      </View>

      {/* Right: Notification Bell or custom action */}
      {rightAction ? (
        rightAction
      ) : showNotification ? (
        <TouchableOpacity
          onPress={onNotificationPress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="w-10 h-10 rounded-full bg-surface border border-border items-center justify-center relative shadow-sm"
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <Bell size={18} color="#144a32" />
          {hasUnreadNotifications && (
            <View className="absolute top-2 right-2 w-2 h-2 rounded-full bg-badge ring-2 ring-white" />
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

export default Header;
