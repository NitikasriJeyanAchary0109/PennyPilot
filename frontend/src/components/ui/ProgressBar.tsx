import React from "react";
import { View, ViewProps } from "react-native";

export interface ProgressBarProps extends ViewProps {
  progress: number; // 0 to 100 percentage
  height?: number;
  trackColor?: string;
  fillColor?: string;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  height = 6,
  trackColor = "bg-border-light",
  fillColor = "bg-primary",
  className = "",
  style,
  ...rest
}) => {
  // Clamp progress between 0 and 100
  const clampedProgress = Math.max(0, Math.min(100, isNaN(progress) ? 0 : progress));

  return (
    <View
      className={`w-full overflow-hidden rounded-full ${trackColor} ${className}`}
      style={[{ height }, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: clampedProgress }}
      {...rest}
    >
      <View
        className={`h-full rounded-full ${fillColor}`}
        style={{ width: `${clampedProgress}%` }}
      />
    </View>
  );
};

export default ProgressBar;
