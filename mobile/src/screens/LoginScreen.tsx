import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { trpc } from "../lib/trpc";
import { useAuth } from "../contexts/AuthContext";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = trpc.auth.mobileLogin.useMutation({
    onSuccess: async (data) => {
      await login(data.token, { name: data.name, email: data.email, role: data.role });
    },
    onError: (e) => Alert.alert("خطأ", e.message),
  });

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.card}>
        <Text style={s.logo}>NSR</Text>
        <Text style={s.title}>كاشير المطعم</Text>

        <TextInput
          style={s.input}
          placeholder="البريد الإلكتروني"
          placeholderTextColor="#888"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          textAlign="right"
        />
        <TextInput
          style={s.input}
          placeholder="كلمة المرور"
          placeholderTextColor="#888"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          textAlign="right"
        />

        <TouchableOpacity
          style={[s.btn, loginMutation.isPending && s.btnDisabled]}
          onPress={() => loginMutation.mutate({ email, password })}
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>تسجيل الدخول</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center" },
  card: { width: "85%", backgroundColor: "#1e293b", borderRadius: 16, padding: 28, alignItems: "center" },
  logo: { fontSize: 40, fontWeight: "900", color: "#6366f1", letterSpacing: 4, marginBottom: 4 },
  title: { fontSize: 18, color: "#94a3b8", marginBottom: 28, fontFamily: "System" },
  input: {
    width: "100%", height: 48, backgroundColor: "#0f172a", borderRadius: 10,
    paddingHorizontal: 16, color: "#f1f5f9", fontSize: 15,
    borderWidth: 1, borderColor: "#334155", marginBottom: 14,
  },
  btn: {
    width: "100%", height: 48, backgroundColor: "#6366f1", borderRadius: 10,
    justifyContent: "center", alignItems: "center", marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
