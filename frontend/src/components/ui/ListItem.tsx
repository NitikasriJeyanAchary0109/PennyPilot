import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import {
  Coffee,
  BookOpen,
  Bus,
  Utensils,
  ShoppingBag,
  Film,
  Sparkles,
  ChevronRight,
} from "lucide-react-native";

export interface ListItemProps {
  title: string;
  subtitle?: string;
  amount?: string | number; // Must already be pre-formatted or number (no client-side math)
  isDebit?: boolean;
  category?: string;
  icon?: React.ReactNode;
  onPress?: () => void;
  showDivider?: boolean;
  rightAccessory?: React.ReactNode;
  className?: string;
}

export const ListItem: React.FC<ListItemProps> = ({
  title,
  subtitle,
  amount,
  isDebit = true,
  category,
  icon,
  onPress,
  showDivider = true,
  rightAccessory,
  className = "",
}) => {
  const normCategory = (category || "").toLowerCase();

  // Pick category icon & badge bg
  let iconNode = icon;
  let badgeBg = "bg-chip-more";
  let iconColor = "#44403c";

  if (!iconNode) {
    if (normCategory.includes("coffee") || normCategory.includes("cafe")) {
      badgeBg = "bg-chip-food";
      iconColor = "#9a3412";
      iconNode = <Coffee size={16} color={iconColor} />;
    } else if (normCategory.includes("food") || normCategory.includes("dining")) {
      badgeBg = "bg-chip-food";
      iconColor = "#9a3412";
      iconNode = <Utensils size={16} color={iconColor} />;
    } else if (normCategory.includes("book") || normCategory.includes("edu")) {
      badgeBg = "bg-chip-edu";
      iconColor = "#1e40af";
      iconNode = <BookOpen size={16} color={iconColor} />;
    } else if (normCategory.includes("transport") || normCategory.includes("bus")) {
      badgeBg = "bg-chip-transport";
      iconColor = "#581c87";
      iconNode = <Bus size={16} color={iconColor} />;
    } else if (normCategory.includes("entertain") || normCategory.includes("movie")) {
      badgeBg = "bg-chip-transport";
      iconColor = "#581c87";
      iconNode = <Film size={16} color={iconColor} />;
    } else if (normCategory.includes("shop") || normCategory.includes("grocer")) {
      badgeBg = "bg-sage-light";
      iconColor = "#4a6344";
      iconNode = <ShoppingBag size={16} color={iconColor} />;
    } else {
      badgeBg = "bg-surface-cream";
      iconColor = "#144a32";
      iconNode = <Sparkles size={16} color={iconColor} />;
    }
  }

  // Format amount string strictly in INR (zero arithmetic)
  let amountStr: string | null = null;
  if (amount !== undefined && amount !== null) {
    if (typeof amount === "number") {
      const formatted = new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Math.abs(amount));
      amountStr = `${isDebit ? "-" : "+"}₹${formatted}`;
    } else {
      amountStr = String(amount);
    }
  }

  const Content = (
    <View
      className={`flex-row items-center py-3.5 ${
        showDivider ? "border-b border-border-light" : ""
      } ${className}`}
    >
      {/* Icon Badge */}
      <View
        className={`w-10 h-10 rounded-full items-center justify-center mr-3.5 ${badgeBg}`}
      >
        {iconNode}
      </View>

      {/* Main Info */}
      <View className="flex-1 justify-center mr-2">
        <Text
          className="text-sm font-semibold text-text-primary tracking-tight"
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle && (
          <Text className="text-xs text-text-secondary mt-0.5" numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      {/* Right Column: Amount or Custom Accessory */}
      {rightAccessory ? (
        rightAccessory
      ) : amountStr ? (
        <Text
          className={`text-sm font-bold tracking-tight ${
            isDebit ? "text-text-primary" : "text-success"
          }`}
        >
          {amountStr}
        </Text>
      ) : onPress ? (
        <ChevronRight size={18} color="#707773" />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${subtitle || ""}, ${amountStr || ""}`}
      >
        {Content}
      </TouchableOpacity>
    );
  }

  return Content;
};

export default ListItem;
