import "./global.css";
import React, { useState } from "react";
import { View, StyleSheet, Platform, ActivityIndicator, TouchableOpacity, Text } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import { AuthProvider } from "./src/context/AuthContext";
import RootNavigator from "./src/navigation/RootNavigator";
import TestStyleScreen from "./src/screens/TestStyleScreen";

export default function App() {
  const [showTestScreen, setShowTestScreen] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <View style={styles.outerContainer}>
      <View style={styles.phoneFrame}>
        {__DEV__ && showTestScreen ? (
          <TestStyleScreen onDismiss={() => setShowTestScreen(false)} />
        ) : (
          <AuthProvider>
            <NavigationContainer>
              <RootNavigator />
            </NavigationContainer>
          </AuthProvider>
        )}

        {/* Floating Test Mode Pill for Step 0 styling verification (DEV only) */}
        {__DEV__ && Platform.OS === "web" && (
          <TouchableOpacity
            onPress={() => setShowTestScreen(!showTestScreen)}
            style={styles.testBadge}
            activeOpacity={0.8}
          >
            <Text style={styles.testBadgeText}>
              {showTestScreen ? "Show App" : "Step 0 Test Screen"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: "#0b0f19",
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  phoneFrame: {
    flex: 1,
    width: "100%",
    maxWidth: Platform.OS === "web" ? 480 : undefined,
    height: "100%",
    backgroundColor: "#ffffff",
    overflow: "hidden",
    position: "relative",
    ...(Platform.OS === "web"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.4,
          shadowRadius: 28,
          elevation: 20,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: "#1E293B",
        }
      : {}),
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  testBadge: {
    position: "absolute",
    bottom: 12,
    right: 12,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.4)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    zIndex: 9999,
  },
  testBadgeText: {
    color: "#818cf8",
    fontSize: 11,
    fontWeight: "600",
  },
});