import AsyncStorage from "@react-native-async-storage/async-storage";

import api from "@/lib/axios";
import { useAuthStore } from "@/stores/useAuthStore";

import { createDispatchService } from "./dispatch-client";
import { createDispatchDraftStorage } from "./dispatch-draft-storage";

const draftStorage = createDispatchDraftStorage(AsyncStorage);
export const dispatchPersistenceStatus = draftStorage.status;

const dispatch = createDispatchService(api, {
  getSessionScope: () => useAuthStore.getState().sessionEpoch,
  getDraftOwner: () => useAuthStore.getState().userId,
  draftStorage,
});

// Limpieza inmediata, incluso sin otra lectura del servicio. TOKEN_REFRESHED
// conserva las capturas; logout/cambio de usuario crea un ámbito nuevo.
useAuthStore.subscribe((state, previous) => {
  if (state.sessionEpoch !== previous.sessionEpoch) {
    dispatch.clearCaptures();
    if (previous.userId) {
      void draftStorage.clear(previous.userId).catch((reason: unknown) => {
        console.error("No se pudieron borrar las capturas locales al cambiar de sesión.", reason);
      });
    }
  }
});

export const {
  getDispatchOrders,
  refreshDispatchOrders,
  hasLocalCaptures,
  getDispatchOrder,
  getDispatchOrderItems,
  getNoSerialBarcodes,
  checkBarcode,
  checkSerial,
  discardDispatchCaptures,
  completeDispatch,
  submitPredispatch,
} = dispatch;

export { getErrorMessage, getErrorOrder } from "./dispatch-client";
