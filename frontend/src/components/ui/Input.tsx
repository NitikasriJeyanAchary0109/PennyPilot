import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TextInputProps,
} from "react-native";
import { Eye, EyeOff, AlertCircle } from "lucide-react-native";

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
  helperText?: string;
  leftIcon?: React.ReactNode;
  isPassword?: boolean;
  required?: boolean;
  containerClassName?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  leftIcon,
  isPassword = false,
  required = false,
  containerClassName = "",
  secureTextEntry,
  placeholderTextColor = "#707773", // WCAG AA 4.59:1 on white inputs
  className = "",
  style,
  onFocus,
  onBlur,
  accessibilityLabel,
  accessibilityHint,
  ...rest
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isSecure = isPassword && !showPassword;

  return (
    <View className={`w-full mb-4 ${containerClassName}`}>
      {label && (
        <View className="flex-row items-center mb-1.5 ml-0.5">
          <Text className="text-xs font-semibold text-text-primary tracking-wide">
            {label}
          </Text>
          {required && <Text className="text-danger ml-0.5 text-xs">*</Text>}
        </View>
      )}

      <View
        className={`flex-row items-center w-full min-h-[48px] px-3.5 rounded-input bg-surface border transition-colors ${
          error
            ? "border-danger bg-danger-light/20"
            : isFocused
            ? "border-primary bg-surface"
            : "border-border bg-surface"
        }`}
      >
        {leftIcon && <View className="mr-2.5 text-text-muted">{leftIcon}</View>}

        <TextInput
          className={`flex-1 py-3 text-sm text-text-primary font-sans ${className}`}
          placeholderTextColor={placeholderTextColor}
          secureTextEntry={isSecure}
          onFocus={(e) => {
            setIsFocused(true);
            if (onFocus) onFocus(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            if (onBlur) onBlur(e);
          }}
          style={style}
          accessibilityLabel={accessibilityLabel || label}
          accessibilityHint={accessibilityHint}
          aria-invalid={!!error}
          {...rest}
        />

        {isPassword && (
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="p-1.5 ml-1"
            accessibilityRole="button"
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff size={18} color="#525956" />
            ) : (
              <Eye size={18} color="#525956" />
            )}
          </TouchableOpacity>
        )}
      </View>

      {error ? (
        <View className="flex-row items-center mt-1.5 ml-1">
          <AlertCircle size={13} color="#b91c1c" />
          <Text
            className="text-xs text-danger font-medium ml-1"
            accessibilityRole="alert"
          >
            {error}
          </Text>
        </View>
      ) : helperText ? (
        <Text className="text-xs text-text-muted mt-1 ml-1">{helperText}</Text>
      ) : null}
    </View>
  );
};

export default Input;
