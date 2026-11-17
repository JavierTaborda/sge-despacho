import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "zustand";

import { Button, Notice } from "@/components/ui";
import { dispatchPersistenceStatus } from "@/features/despacho/services/dispatch-api";

export function DispatchStorageNotice() {
  const error = useStore(dispatchPersistenceStatus, (state) => state.error);
  const [busy, setBusy] = useState(false);

  async function retryStorage() {
    const retry = dispatchPersistenceStatus.getState().retry;
    if (!retry) return;
    setBusy(true);
    try {
      await retry();
    } catch (reason) {
      console.error("Falló el reintento de almacenamiento de capturas.", reason);
    } finally {
      setBusy(false);
    }
  }

  if (!error) return null;
  return (
    <SafeAreaView edges={["top", "left", "right"]} className="bg-background">
      <View className="w-full max-w-content gap-2 self-center p-4">
        <Notice message={error} />
        <Button
          title="Reintentar almacenamiento local"
          secondary
          loading={busy}
          onPress={() => void retryStorage()}
        />
      </View>
    </SafeAreaView>
  );
}
