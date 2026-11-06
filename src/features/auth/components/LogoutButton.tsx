import { useState } from "react";
import { View } from "react-native";

import { Button, Notice } from "@/components/ui";
import { authErrorMessage } from "@/stores/auth-state";
import { useAuthStore } from "@/stores/useAuthStore";

export function LogoutButton() {
  const signOut = useAuthStore((state) => state.signOut);
  const busy = useAuthStore((state) => state.busy);
  const [error, setError] = useState("");

  async function logout() {
    setError("");
    try {
      await signOut();
    } catch (reason) {
      setError(authErrorMessage(reason));
    }
  }

  return (
    <View className="gap-3">
      {error ? <Notice message={error} /> : null}
      <Button title="Cerrar sesión" icon="log-out-outline" secondary loading={busy} onPress={() => void logout()} />
    </View>
  );
}
