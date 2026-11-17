import type { AxiosAdapter, AxiosInstance } from "axios";
import { create, isAxiosError } from "axios";

import type { DispatchOrder } from "../../../domain/dispatch.ts";
import {
  createDispatchCaptureStore,
  DispatchError,
  isItemComplete,
} from "../../../domain/dispatch.ts";
import {
  mapBackendDispatchDetail,
  parseBackendDispatchItems,
  parseBackendDispatchOrders,
  parseBackendNoSerialBarcodes,
  parseBackendOrderId,
  toBackendItem,
  toBackendOrderHeader,
  type BackendDispatchItem,
  type BackendDispatchOrder,
} from "../../../services/backend-dispatch.ts";
import { normalizeBackendUrl } from "../../../utils/api-config.ts";
import {
  DispatchStorageError,
  type DispatchDraftStorage,
} from "./dispatch-draft-storage.ts";

export { normalizeBackendUrl } from "../../../utils/api-config.ts";

export const backendReadOnlyMessage =
  "El backend permite enviar el predespacho, pero no incluye un endpoint para finalizar la orden.";

export function createDispatchClient(backendUrl: string, adapter?: AxiosAdapter) {
  const configuredUrl = backendUrl.trim();
  const normalizedUrl = configuredUrl ? normalizeBackendUrl(configuredUrl) : null;
  const api = create({
    ...(normalizedUrl ? { baseURL: normalizedUrl } : {}),
    timeout: 15_000,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...(adapter ? { adapter } : {}),
  });

  // Compatibilidad para tests/consumidores aislados. Producción inyecta lib/axios.
  return createDispatchService(api, {
    requireConfiguration: () => {
      if (!normalizedUrl) normalizeBackendUrl("");
    },
  });
}

export function createDispatchService(
  api: AxiosInstance,
  {
    requireConfiguration = () => {},
    getSessionScope = () => 0,
    getDraftOwner = () => null,
    draftStorage,
  }: {
    requireConfiguration?: () => void;
    getSessionScope?: () => number;
    getDraftOwner?: () => string | null;
    draftStorage?: DispatchDraftStorage;
  } = {},
) {
  let localCaptures = createDispatchCaptureStore();
  let scope = getSessionScope();
  let refreshVersion = 0;
  let refreshRequest: Promise<BackendDispatchOrder[]> | undefined;
  let hydrated = !draftStorage;
  let hydration: Promise<void> | undefined;

  function clearCaptures() {
    localCaptures = createDispatchCaptureStore();
    scope = getSessionScope();
    refreshVersion += 1;
    refreshRequest = undefined;
    hydrated = !draftStorage;
    hydration = undefined;
  }

  function captures() {
    if (scope !== getSessionScope()) clearCaptures();
    return localCaptures;
  }

  async function restoreCaptures() {
    const current = captures();
    if (hydrated || !draftStorage) return current;
    if (!hydration) {
      const owner = getDraftOwner();
      if (!owner) throw new DispatchError("Inicia sesión para restaurar tus capturas.", 401);
      const request = draftStorage.load(owner).then((drafts) => {
        if (current !== captures()) {
          throw new DispatchError("La sesión cambió. Vuelve a cargar la orden.", 409);
        }
        localCaptures = createDispatchCaptureStore(
          drafts.map((draft) => draft.captured),
          drafts.map((draft) => draft.original),
        );
        hydrated = true;
      });
      hydration = request;
    }
    const request = hydration;
    try {
      await request;
    } finally {
      if (hydration === request) hydration = undefined;
    }
    return captures();
  }

  async function saveCaptures(
    current: ReturnType<typeof createDispatchCaptureStore>,
    orderId?: string,
    errorMessage?: string,
  ) {
    if (!draftStorage) return;
    if (current !== captures()) {
      throw new DispatchError("La sesión cambió. Vuelve a cargar la orden.", 409);
    }
    const owner = getDraftOwner();
    if (!owner) throw new DispatchError("Inicia sesión para guardar tus capturas.", 401);
    try {
      await draftStorage.save(owner, current.getDrafts(), errorMessage);
    } catch (reason) {
      if (reason instanceof DispatchStorageError && orderId && current.hasOrder(orderId)) {
        throw new DispatchError(reason.message, 507, current.getOrder(orderId));
      }
      throw reason;
    }
  }

  async function capture<T>(
    orderId: string,
    operation: (current: ReturnType<typeof createDispatchCaptureStore>) => T,
  ) {
    const current = draftStorage ? await restoreCaptures() : captures();
    try {
      return operation(current);
    } finally {
      await saveCaptures(current, orderId);
    }
  }

  async function getDispatchOrderItems(orderId: string): Promise<BackendDispatchItem[]> {
    requireConfiguration();
    const params = parseBackendOrderId(orderId);
    const { data } = await api.get<unknown>(
      `/api/dispatch/orders/${params.prednum}/${params.pednum}/items`,
    );
    return parseBackendDispatchItems(data, params);
  }

  async function getNoSerialBarcodes(): Promise<string[]> {
    requireConfiguration();
    const { data } = await api.get<unknown>("/api/dispatch/list");
    return parseBackendNoSerialBarcodes(data);
  }

  async function getDispatchOrders(): Promise<BackendDispatchOrder[]> {
    requireConfiguration();
    if (draftStorage) await restoreCaptures();
    const { data } = await api.get<unknown>("/api/dispatch/orders");
    return parseBackendDispatchOrders(data);
  }

  async function fetchDispatchOrder(
    orderId: string,
    noSerialBarcodes?: Promise<string[]>,
  ): Promise<DispatchOrder> {
    const params = parseBackendOrderId(orderId);
    const path = `/api/dispatch/orders/${params.prednum}/${params.pednum}`;
    const [header, items, barcodes] = await Promise.all([
      api.get<unknown>(path),
      getDispatchOrderItems(orderId),
      noSerialBarcodes ?? getNoSerialBarcodes(),
    ]);
    return mapBackendDispatchDetail(header.data, params, items, new Set(barcodes));
  }

  function requireCurrentCaptures(
    current: ReturnType<typeof createDispatchCaptureStore>,
    version: number,
  ) {
    if (current !== captures()) {
      throw new DispatchError("La sesión cambió. Vuelve a cargar la orden.", 409);
    }
    if (version !== refreshVersion) {
      throw new DispatchError("Los datos se actualizaron. Vuelve a cargar la orden.", 409);
    }
  }

  async function reloadDispatchOrders() {
    requireConfiguration();
    const currentCaptures = draftStorage ? await restoreCaptures() : captures();
    const version = ++refreshVersion;
    const noSerialBarcodes = getNoSerialBarcodes();
    const [orders, updates] = await Promise.all([
      getDispatchOrders(),
      Promise.all(currentCaptures.getOrders().map((order) =>
        fetchDispatchOrder(order.id, noSerialBarcodes),
      )),
      noSerialBarcodes,
    ]);
    requireCurrentCaptures(currentCaptures, version);
    currentCaptures.refreshOrders(updates);
    await saveCaptures(currentCaptures);
    return orders;
  }

  async function refreshDispatchOrders() {
    captures();
    if (refreshRequest) return refreshRequest;
    const request = reloadDispatchOrders();
    refreshRequest = request;
    try {
      return await request;
    } finally {
      if (refreshRequest === request) refreshRequest = undefined;
    }
  }

  return {
    clearCaptures,
    getDispatchOrderItems,
    getNoSerialBarcodes,
    getDispatchOrders,
    refreshDispatchOrders,
    async hasLocalCaptures() {
      const current = draftStorage ? await restoreCaptures() : captures();
      return current.getDrafts().length > 0;
    },
    async getDispatchOrder(orderId: string): Promise<DispatchOrder> {
      requireConfiguration();
      parseBackendOrderId(orderId);
      if (refreshRequest) await refreshRequest;
      const currentCaptures = draftStorage ? await restoreCaptures() : captures();
      const version = refreshVersion;
      requireCurrentCaptures(currentCaptures, version);
      if (currentCaptures.hasOrder(orderId)) return currentCaptures.getOrder(orderId);
      const order = await fetchDispatchOrder(orderId);
      requireCurrentCaptures(currentCaptures, version);
      return currentCaptures.registerOrder(order);
    },
    async checkBarcode(orderId: string, itemId: string, code: string) {
      return capture(orderId, (current) => current.checkBarcode(orderId, itemId, code));
    },
    async checkSerial(orderId: string, itemId: string, code: string) {
      return capture(orderId, (current) => current.checkSerial(orderId, itemId, code));
    },
    async discardDispatchCaptures(orderId: string) {
      if (refreshRequest) await refreshRequest;
      return capture(orderId, (current) => current.discardOrderCaptures(orderId));
    },
    async completeDispatch(orderId: string) {
      throw new DispatchError(backendReadOnlyMessage, 405);
    },
    async submitPredispatch(order: DispatchOrder) {
      requireConfiguration();
      const current = draftStorage ? await restoreCaptures() : captures();
      if (!order.items.length || !order.items.every(isItemComplete)) {
        throw new DispatchError("Debes validar todos los artículos y sus seriales.", 409);
      }
    
      const payload = {
        ...toBackendOrderHeader(order),
        cantdesp: order.cantdesp,
        items: order.items.map(toBackendItem),
      };
      await api.post("/api/dispatch/orders/predispatch", payload);
      if (current !== captures()) return;
      if (current.hasOrder(order.id)) current.acknowledgeOrder(order);
      try {
        await saveCaptures(
          current,
          undefined,
          "El predespacho ya se envió. No pudimos actualizar el guardado local; reintenta el guardado y no vuelvas a enviarlo.",
        );
      } catch (reason) {
        // El error de almacenamiento se muestra globalmente; no simular un fallo del envío.
        if (!(reason instanceof DispatchStorageError)) throw reason;
      }
    },
  };
}

export function getErrorMessage(error: unknown) {
  if (isAxiosError<unknown>(error)) {
    const data = error.response?.data;
    if (
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof data.message === "string" &&
      data.message.trim()
    ) {
      return data.message;
    }
  }
  if (error instanceof Error) return error.message;
  return "No pudimos procesar la solicitud. Inténtalo nuevamente.";
}

export function getErrorOrder(error: unknown) {
  if (error instanceof DispatchError) return error.order;
  if (isAxiosError<{ order?: DispatchOrder }>(error)) {
    return error.response?.data?.order;
  }
}
