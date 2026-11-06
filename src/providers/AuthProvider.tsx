import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Notice } from "@/components/ui";
import { colors } from "@/constants/theme";
import { supabase, supabaseConfigurationError } from "@/lib/supabase";
import { startAuthLifecycle } from "@/services/auth-lifecycle";
import { useAuthStore } from "@/stores/useAuthStore";

export function AuthProvider({ children }: { children: ReactNode }) {
  const loading = useAuthStore((state) => state.loading);
  const error = useAuthStore((state) => state.error);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!supabase) {
      useAuthStore.getState().finishRestoration(supabaseConfigurationError ?? "Configura Supabase.");
      return;
    }
    const lifecycle = startAuthLifecycle(
      supabase.auth,
      useAuthStore,
      Platform.OS === "web" ? undefined : {
        currentState: AppState.currentState ?? null,
        subscribe: (callback) => {
          const subscription = AppState.addEventListener("change", callback);
          return () => subscription.remove();
        },
      },
    );
    return lifecycle.dispose;
  }, [attempt]);

  // No montar guards ni pantallas de despacho antes de completar getSession.
  if (loading || error) {
    return (
      <SafeAreaView className="flex-1 justify-center bg-background px-6">
        <View className="w-full max-w-content gap-4 self-center">
          <Text className="text-[22px] font-bold text-ink">SGE Despacho</Text>
          {loading ? (
            <>
              <ActivityIndicator color={colors.primary} />
              <Text className="text-center text-muted">Restaurando sesión…</Text>
            </>
          ) : (
            <>
              <Notice message={error!} />
              <Button title="Reintentar restauración" onPress={() => setAttempt((value) => value + 1)} />
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }
  return children;
}
