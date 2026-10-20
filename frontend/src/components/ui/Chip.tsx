import React from "react";
import { TouchableOpacity, Text, View } from "react-native";
import {
  Utensils,
  BookOpen,
  Bus,
  Coffee,
  ShoppingBag,
  Film,
  Sparkles,
  MoreHorizontal,
} from "lucide-react-native";

export interface ChipProps {
  label: string;
  category?: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  className?: string;
}

export const Chip: React.FC<ChipProps> = ({
  label,
  category,
  selected = false,
  onPress,
  icon,
  className = "",
}) => {
  const normCategory = (category || label).toLowerCase();

  // Determine pastel tint & icon
  let bgClass = "bg-chip-more";
  let textClass = "text-chip-more-text";
  let iconColor = "#44403c";
  let defaultIcon: React.ReactNode = <Sparkles size={13} color={iconColor} />;

  if (
    normCategory.includes("food") ||
    normCategory.includes("dining") ||
    normCategory.includes("cafe")
  ) {
    bgClass = "bg-chip-food";
    textClass = "text-chip-food-text";
    iconColor = "#9a3412";
    defaultIcon = <Utensils size={13} color={iconColor} />;
  } else if (normCategory.includes("coffee")) {
    bgClass = "bg-chip-food";
    textClass = "text-chip-food-text";
    iconColor = "#9a3412";
    defaultIcon = <Coffee size={13} color={iconColor} />;
  } else if (
    normCategory.includes("edu") ||
    normCategory.includes("book") ||
    normCategory.includes("textbook")
  ) {
    bgClass = "bg-chip-edu";
    textClass = "text-chip-edu-text";
    iconColor = "#1e40af";
    defaultIcon = <BookOpen size={13} color={iconColor} />;
  } else if (
    normCategory.includes("transport") ||
    normCategory.includes("bus") ||
    normCategory.includes("transit")
  ) {
    bgClass = "bg-chip-transport";
    textClass = "text-chip-transport-text";
    iconColor = "#581c87";
    defaultIcon = <Bus size={13} color={iconColor} />;
  } else if (
    normCategory.includes("entertain") ||
    normCategory.includes("music") ||
    normCategory.includes("movie")
  ) {
    bgClass = "bg-chip-transport";
    textClass = "text-chip-transport-text";
    iconColor = "#581c87";
    defaultIcon = <Film size={13} color={iconColor} />;
  } else if (normCategory.includes("shop") || normCategory.includes("grocer")) {
    bgClass = "bg-sage-light";
    textClass = "text-sage-dark";
    iconColor = "#4a6344";
    defaultIcon = <ShoppingBag size={13} color={iconColor} />;
  } else if (normCategory.includes("more")) {
    bgClass = "bg-chip-more";
    textClass = "text-chip-more-text";
    iconColor = "#44403c";
    defaultIcon = <MoreHorizontal size={13} color={iconColor} />;
  }

  const renderIcon = icon !== undefined ? icon : defaultIcon;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      className={`flex-row items-center px-3.5 py-2 rounded-chip border transition-all ${
        selected
          ? "border-primary bg-primary/10 shadow-sm"
          : `border-transparent ${bgClass}`
      } ${className}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Category: ${label}`}
    >
      {renderIcon && <View className="mr-1.5">{renderIcon}</View>}
      <Text
        className={`text-xs font-semibold ${
          selected ? "text-primary font-bold" : textClass
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

export default Chip;
