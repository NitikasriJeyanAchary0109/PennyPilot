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
import ErrorBoundary from "./src/components/ErrorBoundary";
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
        <ActivityIndicator size="large" color="#144a32" />
      </View>
    );
  }

  return (
    <View style={styles.outerContainer}>
      <View style={styles.phoneFrame}>
        {__DEV__ && showTestScreen ? (
          <TestStyleScreen onDismiss={() => setShowTestScreen(false)} />
        ) : (
          <ErrorBoundary>
            <AuthProvider>
              <NavigationContainer>
                <RootNavigator />
              </NavigationContainer>
            </AuthProvider>
          </ErrorBoundary>
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
    backgroundColor: "#fbf7ee",
    alignItems: "center",
    justifyContent: "center",
  },
});