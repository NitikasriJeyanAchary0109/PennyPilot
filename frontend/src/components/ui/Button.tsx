import React from "react";
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  View,
  TouchableOpacityProps,
} from "react-native";

export interface ButtonProps extends TouchableOpacityProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "nudge" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  fullWidth = true,
  className = "",
  style,
  accessibilityLabel,
  accessibilityHint,
  ...rest
}) => {
  const isDisabled = disabled || loading;

  // Base styling ensuring 44pt minimum touch target per WCAG guidelines
  let containerStyles = "flex-row items-center justify-center rounded-pill ";
  let textStyles = "font-sans font-semibold text-center ";

  // Sizing
  if (size === "sm") {
    containerStyles += "min-h-[40px] py-2 px-4 ";
    textStyles += "text-xs ";
  } else if (size === "lg") {
    containerStyles += "min-h-[52px] py-3.5 px-6 ";
    textStyles += "text-base ";
  } else {
    // Default md
    containerStyles += "min-h-[48px] py-3 px-5 ";
    textStyles += "text-sm ";
  }

  // Width
  if (fullWidth) {
    containerStyles += "w-full ";
  }

  // Variant styles
  if (variant === "primary") {
    containerStyles += isDisabled
      ? "bg-primary/50 "
      : "bg-primary active:bg-primary-pressed shadow-button ";
    textStyles += "text-white ";
  } else if (variant === "secondary") {
    containerStyles += isDisabled
      ? "bg-surface border border-border/50 opacity-60 "
      : "bg-surface border border-border active:bg-surface-cream ";
    textStyles += "text-text ";
  } else if (variant === "nudge") {
    containerStyles += isDisabled
      ? "bg-nudge-peach/50 border border-nudge-border/50 "
      : "bg-nudge-peach border border-nudge-border active:opacity-90 ";
    textStyles += "text-nudge-text font-bold ";
  } else if (variant === "danger") {
    containerStyles += isDisabled
      ? "bg-danger/50 "
      : "bg-danger active:opacity-90 shadow-button ";
    textStyles += "text-white ";
  } else {
    // ghost
    containerStyles += isDisabled
      ? "bg-transparent opacity-50 "
      : "bg-transparent active:bg-primary-tint ";
    textStyles += "text-primary ";
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      className={`${containerStyles} ${className}`}
      style={style}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" || variant === "danger" ? "#ffffff" : "#144a32"}
        />
      ) : (
        <View className="flex-row items-center justify-center">
          {leftIcon && <View className="mr-2">{leftIcon}</View>}
          <Text className={textStyles}>{title}</Text>
          {rightIcon && <View className="ml-2">{rightIcon}</View>}
        </View>
      )}
    </TouchableOpacity>
  );
};

export default Button;
