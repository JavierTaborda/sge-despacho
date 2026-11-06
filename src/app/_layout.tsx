import "../../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colors } from "@/constants/theme";
import { AuthProvider } from "@/providers/AuthProvider";
import { useAuthStore } from "@/stores/useAuthStore";

function RootNavigator() {
  const session = useAuthStore((state) => state.session);
  const sessionEpoch = useAuthStore((state) => state.sessionEpoch);
  return (
      <Stack
        key={sessionEpoch}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "slide_from_right",
        }}
      >
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="index" />
          <Stack.Screen name="despacho/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
