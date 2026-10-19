import React from "react";
import { View, Text, Pressable, SafeAreaView, StyleSheet, ScrollView, Alert, Image } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../hooks/useAuth";

export const ProfileScreen = () => {
  const { logout, userRole } = useAuth();
  const navigation = useNavigation<any>();

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleLogout = () => {
    triggerHaptic();
    Alert.alert("Logout", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Log Out", 
        style: "destructive", 
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await logout();
        } 
      }
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f7f9ff]">
      {/* Header */}
      <View className="flex-row items-center justify-between px-margin-mobile py-stack-md bg-white border-b border-slate-100">
        <Text style={{ fontFamily: "Inter_700Bold" }} className="text-lg text-slate-800 font-bold">
          Profile Settings
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 }}>
        {/* User Card */}
        <View style={styles.card} className="bg-white rounded-3xl p-6 border border-slate-100 items-center mb-6">
          <View className="w-20 h-20 rounded-full overflow-hidden border-2 border-blue-100 mb-4 shadow-sm">
            <Image 
              source={{ uri: "https://lh3.googleusercontent.com/aida-public/AB6AXuBTq3IY7xhV3aWDPgRwaxHD_oWLUlqJZeh_dgSAaRl9LT4Wx5jYETm1gOlx3SHUMh4mRl0BdLwxw6rFOlrx2rwcgmPCh-IY6JMbPXmHtprrjV8_bjgrB7tqKPCLhpMe86efjCbDKiPwruo_2qkvIBE6NsGGjq8-sKib0D0lahPSoeYRe9YSC9lkJeomNXRKZau3b4mhPFuLa5HCrNdk4ZBzVIzq1G6V239Ce_UKPuZcxnvdG_iAHAUb" }}
              style={{ width: "100%", height: "100%", resizeMode: "cover" }}
            />
          </View>
          <Text style={{ fontFamily: "Inter_700Bold" }} className="text-lg text-slate-800 font-bold mb-1">
            Alex Morgan
          </Text>
          <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-xs text-slate-400">
            alex.morgan@college.edu
          </Text>
          <View className="bg-blue-50 border border-blue-100 px-3.5 py-1 rounded-full mt-3">
            <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-[10px] text-blue-700 font-bold uppercase tracking-wider">
              {userRole === "student" ? "Student Saver" : "Educator Administrator"}
            </Text>
          </View>
        </View>

        {/* Options list */}
        <View style={styles.card} className="bg-white rounded-3xl border border-slate-100 p-4 mb-6">
          <Pressable 
            onPress={() => {
              triggerHaptic();
              navigation.navigate("Notifications");
            }} 
            className="flex-row justify-between items-center py-3.5 border-b border-slate-50"
          >
            <View className="flex-row items-center space-x-3">
              <MaterialIcons name="notifications-none" size={20} color="#64748b" />
              <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-slate-700 text-sm font-bold">Notifications</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
          </Pressable>

          <Pressable 
            onPress={() => {
              triggerHaptic();
              navigation.navigate("Budgets");
            }} 
            className="flex-row justify-between items-center py-3.5 border-b border-slate-50"
          >
            <View className="flex-row items-center space-x-3">
              <MaterialIcons name="pie-chart" size={20} color="#64748b" />
              <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-slate-700 text-sm font-bold">Budgets & Limits</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
          </Pressable>

          <Pressable onPress={triggerHaptic} className="flex-row justify-between items-center py-3.5 border-b border-slate-50">
            <View className="flex-row items-center space-x-3">
              <MaterialIcons name="security" size={20} color="#64748b" />
              <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-slate-700 text-sm font-bold">Security & Password</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
          </Pressable>

          <Pressable onPress={triggerHaptic} className="flex-row justify-between items-center py-3.5">
            <View className="flex-row items-center space-x-3">
              <MaterialIcons name="help-outline" size={20} color="#64748b" />
              <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-slate-700 text-sm font-bold">Help & Support</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
          </Pressable>
        </View>

        {/* Logout button */}
        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [
            styles.logoutBtn,
            { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }
          ]}
          className="bg-red-50 border border-red-100 py-4 rounded-2xl items-center flex-row justify-center"
        >
          <MaterialIcons name="logout" size={18} color="#ba1a1a" className="mr-1.5" />
          <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-red-700 text-sm font-bold uppercase tracking-wider">
            Log Out Account
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  logoutBtn: {
    elevation: 0,
  }
});

export default ProfileScreen;
