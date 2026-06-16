import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { trpc, createTrpcClient } from "./src/lib/trpc";
import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";
import DailyEntryScreen from "./src/screens/DailyEntryScreen";
import ReportsScreen from "./src/screens/ReportsScreen";
import InvoicesScreen from "./src/screens/InvoicesScreen";

const Tab = createBottomTabNavigator();

function AppTabs() {
  const { logout } = useAuth();

  return (
    <>
      <SafeAreaView style={{ backgroundColor: "#1e293b" }} edges={["top"]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() =>
            Alert.alert("تسجيل الخروج", "هل تريد الخروج؟", [
              { text: "إلغاء", style: "cancel" },
              { text: "خروج", style: "destructive", onPress: logout },
            ])
          }>
            <Ionicons name="log-out-outline" size={22} color="#ef4444" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>NSR كاشير</Text>
        </View>
      </SafeAreaView>

      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: s.tabBar,
          tabBarActiveTintColor: "#6366f1",
          tabBarInactiveTintColor: "#475569",
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
          tabBarIcon: ({ color, size, focused }) => {
            const icons: Record<string, string> = {
              Entry: focused ? "create" : "create-outline",
              Reports: focused ? "bar-chart" : "bar-chart-outline",
              Invoices: focused ? "receipt" : "receipt-outline",
            };
            return <Ionicons name={icons[route.name] as any} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Entry" component={DailyEntryScreen} options={{ title: "إدخال اليوم" }} />
        <Tab.Screen name="Reports" component={ReportsScreen} options={{ title: "التقارير" }} />
        <Tab.Screen name="Invoices" component={InvoicesScreen} options={{ title: "الفواتير" }} />
      </Tab.Navigator>
    </>
  );
}

function AppWithAuth() {
  const { token, loading } = useAuth();
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
  }));
  const [trpcClient, setTrpcClient] = useState(() => createTrpcClient(token));

  React.useEffect(() => {
    setTrpcClient(createTrpcClient(token));
  }, [token]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "#6366f1", fontSize: 32, fontWeight: "900" }}>NSR</Text>
      </View>
    );
  }

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          {token ? <AppTabs /> : <LoginScreen />}
        </NavigationContainer>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#1e293b" />
      <AuthProvider>
        <AppWithAuth />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#1e293b",
    borderBottomWidth: 1, borderBottomColor: "#334155",
  },
  headerTitle: { color: "#f1f5f9", fontSize: 18, fontWeight: "800", letterSpacing: 1 },
  tabBar: {
    backgroundColor: "#1e293b", borderTopColor: "#334155", borderTopWidth: 1,
    paddingBottom: 4, height: 58,
  },
});
