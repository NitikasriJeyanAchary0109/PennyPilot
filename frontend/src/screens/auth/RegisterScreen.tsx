import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform } from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";

export const RegisterScreen = ({ navigation }: { navigation: any }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"student" | "educator">("student");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();

  const handleRegister = async () => {
    if (!name || !email || !password) {
      setErrorMsg("Please fill in all fields.");
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      await register(name.trim(), email.trim().toLowerCase(), password, role);
      setSuccessMsg("Account registered successfully! Redirecting to login...");
      setTimeout(() => {
        navigation.navigate("Login");
      }, 2000);
    } catch (e: any) {
      setErrorMsg(e.message || "Registration failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f7f9ff" }}>
      {/* Header Bar */}
      <View style={{ width: "100%", paddingVertical: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: "#f1f5f9" }}>
        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 20, color: "#005bbf" }}>
          Penny Pilot
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView 
          style={{ flex: 1 }} 
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20, paddingVertical: 24 }}
        >
          <View style={{ width: "100%", maxWidth: 440 }}>
            <View style={{ marginBottom: 24, alignItems: "center" }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: "#1e293b", textAlign: "center" }}>
                Create Account
              </Text>
              <Text style={{ fontFamily: "WorkSans_400Regular", fontSize: 14, color: "#64748b", marginTop: 4, textAlign: "center" }}>
                Join the micro-savings automation platform
              </Text>
            </View>

            <Card className="my-0">
              {errorMsg && (
                <View className="bg-red-50 border border-red-200 p-3.5 rounded-xl mb-4">
                  <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-red-700 text-xs text-center">{errorMsg}</Text>
                </View>
              )}

              {successMsg && (
                <View className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl mb-4">
                  <Text style={{ fontFamily: "WorkSans_500Medium" }} className="text-emerald-700 text-xs text-center">{successMsg}</Text>
                </View>
              )}

              <View className="mb-4">
                <Text style={{ fontFamily: "WorkSans_600SemiBold" }} className="text-slate-500 text-[10px] uppercase tracking-wider mb-2 ml-1">
                  Full Name
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Alex Morgan"
                  placeholderTextColor="#94a3b8"
                  style={{ fontFamily: "WorkSans_400Regular" }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-slate-800 text-sm focus:border-[#005bbf]"
                />
              </View>

              <View className="mb-4">
                <Text style={{ fontFamily: "WorkSans_600SemiBold" }} className="text-slate-500 text-[10px] uppercase tracking-wider mb-2 ml-1">
                  Email Address
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="alex@college.edu"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ fontFamily: "WorkSans_400Regular" }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-slate-800 text-sm focus:border-[#005bbf]"
                />
              </View>

              <View className="mb-4">
                <Text style={{ fontFamily: "WorkSans_600SemiBold" }} className="text-slate-500 text-[10px] uppercase tracking-wider mb-2 ml-1">
                  Password
                </Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Minimum 6 characters"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ fontFamily: "WorkSans_400Regular" }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-slate-800 text-sm focus:border-[#005bbf]"
                />
              </View>

              {/* Role selection */}
              <View className="mb-6">
                <Text style={{ fontFamily: "WorkSans_600SemiBold" }} className="text-slate-500 text-[10px] uppercase tracking-wider mb-2 ml-1">
                  Account Type
                </Text>
                <View className="flex-row gap-x-3">
                  <TouchableOpacity
                    onPress={() => setRole("student")}
                    activeOpacity={0.8}
                    className={`flex-1 py-3 px-4 rounded-xl border flex-row justify-center items-center ${
                      role === "student" ? "bg-blue-50 border-[#005bbf]" : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <Text style={{ fontFamily: "Inter_600SemiBold" }} className={`text-xs ${role === "student" ? "text-[#005bbf] font-bold" : "text-slate-500"}`}>
                      Student
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setRole("educator")}
                    activeOpacity={0.8}
                    className={`flex-1 py-3 px-4 rounded-xl border flex-row justify-center items-center ${
                      role === "educator" ? "bg-blue-50 border-[#005bbf]" : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <Text style={{ fontFamily: "Inter_600SemiBold" }} className={`text-xs ${role === "educator" ? "text-[#005bbf] font-bold" : "text-slate-500"}`}>
                      Educator
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Button title="Register" onPress={handleRegister} loading={loading} variant="primary" />

              <View className="flex-row justify-center items-center mt-5">
                <Text style={{ fontFamily: "WorkSans_400Regular" }} className="text-slate-500 text-xs">Already have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate("Login")}>
                  <Text style={{ fontFamily: "Inter_600SemiBold" }} className="text-[#005bbf] text-xs font-bold">Login</Text>
                </TouchableOpacity>
              </View>
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default RegisterScreen;
