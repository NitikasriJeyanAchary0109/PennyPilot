import React from "react";
import { View, ViewProps } from "react-native";

export interface CardProps extends ViewProps {
  variant?: "default" | "elevated" | "nudge" | "sage" | "cream" | "forest" | "peach";
  padding?: "none" | "sm" | "md" | "lg";
  className?: string;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  variant = "default",
  padding = "md",
  className = "",
  children,
  style,
  ...rest
}) => {
  let baseStyles = "rounded-card overflow-hidden ";

  // Variant styling
  if (variant === "elevated") {
    baseStyles += "bg-surface border border-border shadow-card-elevated ";
  } else if (variant === "nudge" || variant === "peach") {
    baseStyles += "bg-nudge-peach border border-nudge-border shadow-nudge ";
  } else if (variant === "sage") {
    baseStyles += "bg-sage-light border border-[#d9e6d0] shadow-card ";
  } else if (variant === "cream") {
    baseStyles += "bg-surface-cream border border-border/80 shadow-card ";
  } else if (variant === "forest") {
    baseStyles += "bg-primary border border-primary shadow-card ";
  } else {
    // default
    baseStyles += "bg-surface border border-border shadow-card ";
  }

  // Padding
  if (padding === "none") {
    baseStyles += "p-0 ";
  } else if (padding === "sm") {
    baseStyles += "p-3 ";
  } else if (padding === "lg") {
    baseStyles += "p-6 ";
  } else {
    baseStyles += "p-4.5 "; // 18px
  }

  return (
    <View className={`${baseStyles} ${className}`} style={style} {...rest}>
      {children}
    </View>
  );
};

export default Card;
