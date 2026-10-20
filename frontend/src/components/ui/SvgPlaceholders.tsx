import React from "react";
import { View } from "react-native";
import Svg, {
  Path,
  Circle,
  Rect,
  G,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";

export const PennyPilotLogoIcon: React.FC<{ size?: number }> = ({
  size = 28,
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Circle leaf outline */}
      <Circle
        cx="16"
        cy="16"
        r="14"
        stroke="#144a32"
        strokeWidth="2.5"
        strokeDasharray="70 20"
      />
      {/* Chart bars in gold & green */}
      <Rect x="9" y="18" width="3" height="6" rx="1.5" fill="#144a32" />
      <Rect x="14" y="14" width="3" height="10" rx="1.5" fill="#a88544" />
      <Rect x="19" y="10" width="3" height="14" rx="1.5" fill="#d5ad64" />
      {/* Growth arrow / sprout leaf */}
      <Path
        d="M12 12C14 8 20 6 24 6M24 6L20 6M24 6L24 10"
        stroke="#144a32"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export const SavingsJarIllustration: React.FC<{
  width?: number;
  height?: number;
}> = ({ width = 200, height = 180 }) => {
  return (
    <Svg width={width} height={height} viewBox="0 0 200 180" fill="none">
      <Defs>
        <LinearGradient id="jarGlass" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
          <Stop offset="100%" stopColor="#f0f4ea" stopOpacity="0.3" />
        </LinearGradient>
        <LinearGradient id="goldCoin" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#efc780" />
          <Stop offset="100%" stopColor="#d5ad64" />
        </LinearGradient>
      </Defs>

      {/* Decorative sparkle stars in gold */}
      <Path
        d="M40 30L42 22L44 30L52 32L44 34L42 42L40 34L32 32Z"
        fill="#d5ad64"
        opacity="0.8"
      />
      <Path
        d="M165 45L166.5 39L168 45L174 46.5L168 48L166.5 54L165 48L159 46.5Z"
        fill="#a88544"
        opacity="0.7"
      />
      <Circle cx="55" cy="55" r="2" fill="#d5ad64" opacity="0.6" />
      <Circle cx="150" cy="25" r="2.5" fill="#d5ad64" opacity="0.6" />

      {/* Sprout Plant Leaves Growing Out of Jar */}
      {/* Main central stem */}
      <Path
        d="M100 85C100 55 98 30 100 20"
        stroke="#144a32"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {/* Left Leaf */}
      <Path
        d="M100 50C85 45 75 30 80 18C92 20 98 35 100 48"
        fill="#7f9e76"
        stroke="#144a32"
        strokeWidth="1.8"
      />
      {/* Right Leaf */}
      <Path
        d="M100 40C115 35 125 22 120 10C108 12 102 26 100 38"
        fill="#144a32"
        stroke="#144a32"
        strokeWidth="1.8"
      />
      {/* Sprout Top Little Bud */}
      <Path
        d="M100 20C96 14 97 8 100 5C103 8 104 14 100 20"
        fill="#a88544"
      />

      {/* Glass Jar Body */}
      <Rect
        x="65"
        y="75"
        width="70"
        height="90"
        rx="22"
        fill="url(#jarGlass)"
        stroke="#144a32"
        strokeWidth="2.5"
      />

      {/* Jar Neck and Rim */}
      <Rect
        x="72"
        y="68"
        width="56"
        height="10"
        rx="4"
        fill="#fbf7ee"
        stroke="#144a32"
        strokeWidth="2.5"
      />

      {/* Stacked Gold Coins inside Jar */}
      {/* Bottom row */}
      <Rect x="72" y="142" width="26" height="8" rx="4" fill="url(#goldCoin)" stroke="#a88544" strokeWidth="1" />
      <Rect x="102" y="142" width="26" height="8" rx="4" fill="url(#goldCoin)" stroke="#a88544" strokeWidth="1" />
      <Rect x="87" y="132" width="26" height="8" rx="4" fill="url(#goldCoin)" stroke="#a88544" strokeWidth="1" />
      <Rect x="75" y="122" width="26" height="8" rx="4" fill="url(#goldCoin)" stroke="#a88544" strokeWidth="1" />
      <Rect x="99" y="122" width="26" height="8" rx="4" fill="url(#goldCoin)" stroke="#a88544" strokeWidth="1" />
      <Rect x="87" y="112" width="26" height="8" rx="4" fill="url(#goldCoin)" stroke="#a88544" strokeWidth="1" />
      <Rect x="84" y="102" width="26" height="8" rx="4" fill="url(#goldCoin)" stroke="#a88544" strokeWidth="1" />

      {/* Currency ₹ symbol on center coin */}
      <Circle cx="97" cy="116" r="4" fill="#ffffff" opacity="0.3" />

      {/* Jar Glass Highlights (subtle white reflection lines) */}
      <Path
        d="M74 85C72 95 72 135 74 145"
        stroke="#ffffff"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.8"
      />

      {/* Student Figure Motif next to Jar */}
      <G transform="translate(135, 78)">
        {/* Head */}
        <Circle cx="16" cy="10" r="8" fill="#fdebd8" stroke="#144a32" strokeWidth="1.8" />
        {/* Hair */}
        <Path d="M9 10C9 4 14 2 20 2C24 2 25 6 24 11C20 9 14 11 9 10Z" fill="#144a32" />
        {/* Torso/Shirt */}
        <Path d="M8 22C12 18 20 18 24 22L26 40C20 42 12 42 6 40Z" fill="#7f9e76" stroke="#144a32" strokeWidth="1.8" />
        {/* Tablet/Book */}
        <Rect x="4" y="28" width="14" height="18" rx="2" fill="#144a32" transform="rotate(-15 4 28)" />
      </G>
    </Svg>
  );
};

export const PottedPlantIcon: React.FC<{ size?: number }> = ({ size = 38 }) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      {/* Little terracotta pot */}
      <Path d="M12 24L14 36H26L28 24H12Z" fill="#fdebd8" stroke="#144a32" strokeWidth="1.8" />
      <Rect x="10" y="21" width="20" height="4" rx="2" fill="#f7ceb2" stroke="#144a32" strokeWidth="1.8" />
      {/* Plant leaves */}
      <Path d="M20 21V11" stroke="#144a32" strokeWidth="2" strokeLinecap="round" />
      <Path d="M20 16C14 14 11 8 15 4C19 6 20 11 20 16Z" fill="#7f9e76" stroke="#144a32" strokeWidth="1.5" />
      <Path d="M20 13C25 11 28 5 24 2C20 4 20 9 20 13Z" fill="#144a32" stroke="#144a32" strokeWidth="1.5" />
    </Svg>
  );
};

export default {
  PennyPilotLogoIcon,
  SavingsJarIllustration,
  PottedPlantIcon,
};
