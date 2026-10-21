import React from "react";
import {
  View,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ViewProps,
} from "react-native";

export interface ScreenContainerProps extends ViewProps {
  scrollable?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  maxWidth?: number;
  className?: string;
  contentContainerClassName?: string;
  header?: React.ReactNode;
  children: React.ReactNode;
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({
  scrollable = true,
  refreshing = false,
  onRefresh,
  maxWidth = 480,
  className = "",
  contentContainerClassName = "",
  header,
  children,
  style,
  ...rest
}) => {
  const innerContent = (
    <View
      className={`w-full self-center px-4 ${className}`}
      style={[{ maxWidth }, style]}
      {...rest}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-cream">
      {header}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        {scrollable ? (
          <ScrollView
            className="flex-1"
            contentContainerClassName={`flex-grow pb-10 ${contentContainerClassName}`}
            showsVerticalScrollIndicator={false}
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#144a32"
                  colors={["#144a32"]}
                />
              ) : undefined
            }
          >
            {innerContent}
          </ScrollView>
        ) : (
          <View className={`flex-1 ${contentContainerClassName}`}>{innerContent}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ScreenContainer;
