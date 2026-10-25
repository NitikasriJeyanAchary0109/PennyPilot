import React from "react";
import { View, ActivityIndicator } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useAuth } from "../hooks/useAuth";
import { Home, Target, LineChart, MessageSquare, User, LayoutDashboard, TrendingUp, GraduationCap } from "lucide-react-native";

// Authentication Screens
import LoginScreen from "../screens/auth/LoginScreen";
import RegisterScreen from "../screens/auth/RegisterScreen";

// Onboarding Screens
import CSVUploadScreen from "../screens/onboarding/CSVUploadScreen";
import OnboardingSetupScreen from "../screens/student/OnboardingSetupScreen";
import SpendingEntryChoiceScreen from "../screens/student/SpendingEntryChoiceScreen";
import ManualIncomeExpenseScreen from "../screens/student/ManualIncomeExpenseScreen";
import CreateGoalScreen from "../screens/student/CreateGoalScreen";
import SpendingAnalysisScreen from "../screens/student/SpendingAnalysisScreen";

// Student Screens
import HomeScreen from "../screens/student/HomeScreen";
import GoalsScreen from "../screens/student/GoalsScreen";
import GoalDetailScreen from "../screens/student/GoalDetailScreen";
import ChatScreen from "../screens/student/ChatScreen";
import InsightsScreen from "../screens/student/InsightsScreen";
import SubscriptionNegotiatorScreen from "../screens/student/SubscriptionNegotiatorScreen";
import RoundupTrackerScreen from "../screens/student/RoundupTrackerScreen";
import EmergencyWithdrawalScreen from "../screens/student/EmergencyWithdrawalScreen";
import ProfileScreen from "../screens/student/ProfileScreen";
import NotificationsScreen from "../screens/student/NotificationsScreen";
import BudgetsScreen from "../screens/student/BudgetsScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const studentScreenOptions = {
  headerShown: false,
  headerStyle: {
    backgroundColor: "#fbf7ee",
  },
  headerTintColor: "#144a32",
  headerTitleStyle: {
    fontWeight: "bold" as const,
    color: "#144a32",
  },
  tabBarStyle: {
    backgroundColor: "#ffffff",
    borderTopColor: "#e8e4d9",
    paddingBottom: 6,
    paddingTop: 6,
    height: 62,
  },
  tabBarActiveTintColor: "#144a32",
  tabBarInactiveTintColor: "#666e69",
  tabBarLabelStyle: {
    fontSize: 11,
    fontWeight: "600" as const,
  },
};


// ==========================
// STUDENT TABS (5 Bottom Tabs)
// ==========================
function StudentTabs() {
  return (
    <Tab.Navigator screenOptions={studentScreenOptions}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: "Home",
          tabBarLabel: "Home",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Home size={size || 22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Goals"
        component={GoalsScreen}
        options={{
          title: "Goals",
          tabBarLabel: "Goals",
          tabBarIcon: ({ color, size }) => (
            <Target size={size || 22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Insights"
        component={InsightsScreen}
        options={{
          title: "Insights",
          tabBarLabel: "Insights",
          tabBarIcon: ({ color, size }) => (
            <LineChart size={size || 22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          title: "AI Chat",
          tabBarLabel: "Chat",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MessageSquare size={size || 22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: "Profile",
          tabBarLabel: "Profile",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <User size={size || 22} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// ==========================
// STUDENT STACK (Nests Tabs + Details Screens)
// ==========================
const StudentStackNavigator = createNativeStackNavigator();

function StudentStackScreen() {
  return (
    <StudentStackNavigator.Navigator screenOptions={{ headerShown: false }}>
      <StudentStackNavigator.Screen
        name="StudentTabs" 
        component={StudentTabs} 
      />
      <StudentStackNavigator.Screen
        name="GoalDetail" 
        component={GoalDetailScreen} 
      />
      <StudentStackNavigator.Screen
        name="GoalCreation" 
        component={CreateGoalScreen}
      />
      <StudentStackNavigator.Screen 
        name="CSVUpload" 
        component={CSVUploadScreen} 
      />
      <StudentStackNavigator.Screen
        name="SpendingAnalysis"
        component={SpendingAnalysisScreen}
      />
      <StudentStackNavigator.Screen 
        name="SubscriptionNegotiator" 
        component={SubscriptionNegotiatorScreen} 
      />
      <StudentStackNavigator.Screen 
        name="RoundupTracker" 
        component={RoundupTrackerScreen} 
      />
      <StudentStackNavigator.Screen 
        name="EmergencyWithdrawal" 
        component={EmergencyWithdrawalScreen} 
      />
      <StudentStackNavigator.Screen 
        name="Notifications" 
        component={NotificationsScreen} 
      />
      <StudentStackNavigator.Screen 
        name="Budgets" 
        component={BudgetsScreen} 
      />
    </StudentStackNavigator.Navigator>
  );
}

const OnboardingStackNavigator = createNativeStackNavigator();

function OnboardingStackScreen() {
  return (
    <OnboardingStackNavigator.Navigator screenOptions={{ headerShown: false }}>
      <OnboardingStackNavigator.Screen name="OnboardingSetup" component={OnboardingSetupScreen} />
      <OnboardingStackNavigator.Screen name="SpendingEntryChoice" component={SpendingEntryChoiceScreen} />
      <OnboardingStackNavigator.Screen name="ManualIncomeExpense" component={ManualIncomeExpenseScreen} />
      <OnboardingStackNavigator.Screen name="CSVUpload" component={CSVUploadScreen} />
      <OnboardingStackNavigator.Screen name="SpendingAnalysis" component={SpendingAnalysisScreen} />
      <OnboardingStackNavigator.Screen name="CreateGoal" component={CreateGoalScreen} />
    </OnboardingStackNavigator.Navigator>
  );
}

// ==========================
// ROOT NAVIGATOR
// ==========================
export const RootNavigator = () => {
  const { userToken, isLoading, hasCompletedOnboarding } = useAuth();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#fbf7ee",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color="#144a32" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {userToken === null ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      ) : hasCompletedOnboarding ? (
        <Stack.Screen
          name="StudentHome"
          component={StudentStackScreen}
        />
      ) : (
        <Stack.Screen name="Onboarding" component={OnboardingStackScreen} />
      )}
    </Stack.Navigator>
  );
};

export default RootNavigator;
