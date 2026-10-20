import React from "react";
import { View, Text, ViewProps } from "react-native";
import { AlertCircle, RefreshCw } from "lucide-react-native";
import { Button } from "./Button";

export interface ErrorStateProps extends ViewProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Something went wrong",
  message,
  onRetry,
  className = "",
  style,
  ...rest
}) => {
  return (
    <View
      className={`items-center justify-center py-6 px-4 bg-danger-light/30 border border-danger/30 rounded-card my-3 ${className}`}
      style={style}
      accessibilityRole="alert"
      {...rest}
    >
      <View className="w-10 h-10 rounded-full bg-danger/10 items-center justify-center mb-2">
        <AlertCircle size={22} color="#b91c1c" />
      </View>
      <Text className="text-sm font-bold text-danger text-center mb-1">
        {title}
      </Text>
      <Text className="text-xs text-text-secondary text-center max-w-[280px] mb-3">
        {message}
      </Text>
      {onRetry && (
        <Button
          title="Try Again"
          onPress={onRetry}
          variant="secondary"
          size="sm"
          fullWidth={false}
          leftIcon={<RefreshCw size={14} color="#144a32" />}
        />
      )}
    </View>
  );
};

export default ErrorState;
