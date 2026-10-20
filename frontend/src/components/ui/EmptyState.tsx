import React from "react";
import { View, Text, ViewProps } from "react-native";
import { Sprout } from "lucide-react-native";
import { Button } from "./Button";

export interface EmptyStateProps extends ViewProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionTitle?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionTitle,
  onAction,
  className = "",
  style,
  ...rest
}) => {
  return (
    <View
      className={`items-center justify-center py-8 px-4 ${className}`}
      style={style}
      {...rest}
    >
      <View className="w-14 h-14 rounded-full bg-sage-light items-center justify-center mb-3">
        {icon || <Sprout size={28} color="#144a32" />}
      </View>
      <Text className="text-base font-bold text-text-primary text-center mb-1">
        {title}
      </Text>
      <Text className="text-xs text-text-secondary text-center max-w-[280px] leading-relaxed mb-4">
        {description}
      </Text>
      {actionTitle && onAction && (
        <Button
          title={actionTitle}
          onPress={onAction}
          variant="secondary"
          size="sm"
          fullWidth={false}
        />
      )}
    </View>
  );
};

export default EmptyState;
