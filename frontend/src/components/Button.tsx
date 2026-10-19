import React from "react";
import { TouchableOpacity, Text, ActivityIndicator } from "react-native";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline";
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  className = "",
}) => {
  let buttonStyle = "py-3.5 px-6 rounded-full flex-row justify-center items-center my-2 ";
  let textStyle = "font-bold text-base ";

  if (variant === "primary") {
    buttonStyle += disabled ? "bg-blue-300" : "bg-[#005bbf] active:bg-[#004493]";
    textStyle += "text-white";
  } else if (variant === "secondary") {
    buttonStyle += disabled ? "bg-emerald-300" : "bg-[#16893a] active:bg-[#116a2d]";
    textStyle += "text-white";
  } else if (variant === "outline") {
    buttonStyle += "border border-[#005bbf] bg-transparent active:bg-blue-50";
    textStyle += "text-[#005bbf]";
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      className={`${buttonStyle} ${className}`}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={variant === "outline" ? "#005bbf" : "#FFF"} size="small" />
      ) : (
        <Text style={{ fontFamily: "Inter_600SemiBold" }} className={textStyle}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

export default Button;
