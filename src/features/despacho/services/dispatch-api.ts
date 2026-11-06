import api from "@/lib/axios";
import { useAuthStore } from "@/stores/useAuthStore";

import { createDispatchService } from "./dispatch-client";

const dispatch = createDispatchService(api, {
  getSessionScope: () => useAuthStore.getState().sessionEpoch,
});

// Limpieza inmediata, incluso sin otra lectura del servicio. TOKEN_REFRESHED
// conserva las capturas; logout/cambio de usuario crea un ámbito nuevo.
useAuthStore.subscribe((state, previous) => {
  if (state.sessionEpoch !== previous.sessionEpoch) dispatch.clearCaptures();
});

export const {
  getDispatchOrders,
  getDispatchOrder,
  getDispatchOrderItems,
  getNoSerialBarcodes,
  checkBarcode,
  checkSerial,
  completeDispatch,
  submitPredispatch,
} = dispatch;

export { getErrorMessage, getErrorOrder } from "./dispatch-client";
