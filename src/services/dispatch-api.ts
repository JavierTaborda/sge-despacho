import type { AxiosAdapter } from "axios";
import { create, isAxiosError } from "axios";

import type { DispatchItem, DispatchOrder } from "../domain/dispatch.ts";
import {
    createDispatchCaptureStore,
    DispatchError,
    isItemComplete,
} from "../domain/dispatch.ts";
import {
    mapBackendDispatchDetail,
    parseBackendDispatchItems,
    parseBackendDispatchOrders,
    parseBackendOrderId,
    type BackendDispatchItem,
    type BackendDispatchOrder,
} from "./backend-dispatch.ts";

function toBackendOrderHeader(order: DispatchOrder): BackendDispatchOrder {
  return {
    prednum: order.prednum,
    pednum: order.pednum,
    conformado: order.conformado,
    fecdesp: order.fecdesp,
    fecfinalStr: order.fecfinalStr,
    fecfinal: order.fecfinal,
    duracion: order.duracion,
    co_cli: order.codcli,
    Cliente: order.customer,
    co_zon: order.codzon,
    Zona: order.address,
    co_ven: order.codven,
    Vendedor: order.vendedor,
    cantdesp: order.items.reduce((sum, item) => sum + item.quantity, 0),
    owneruser: String(order.owneruser),
    supervisor: order.supervisor || null,
  };
}

function toBackendItem(item: DispatchItem): BackendDispatchItem {
  return {
    prednum: item.prednum,
    pednum: item.pednum,
    itemnum: item.itemnum,
    rennum: item.rennum,
    codalma: item.codalma,
    codart: item.codart,
    artdes: item.artdes,
    Articulo: item.Articulo,
    refbarra: item.refbarra,
    compuesto: item.compuesto,
    manjser: item.manjser,
    codbarra: item.codbarra,
    serial1: item.serial1,
    recouser: item.recouser,
    supervisor: item.supervisor,
    horacapture: item.horacapture,
    changed: item.changed,
    selected: item.selected,
    objectstate: item.objectstate,
    objecticon: item.objecticon,
    lectura: item.lectura,
    objectstate2: item.objectstate2,
  };
}

export function normalizeBackendUrl(value: string) {
  if (!value.trim()) {
    throw new DispatchError("Configura EXPO_PUBLIC_API_URL para conectar con el backend.", 500);
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new DispatchError("EXPO_PUBLIC_API_URL debe ser una URL HTTP o HTTPS válida.", 500);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash) {
    throw new DispatchError("EXPO_PUBLIC_API_URL debe usar HTTP o HTTPS, sin query ni fragmento.", 500);
  }
  return value.trim().replace(/\/+$/, "").replace(/\/api$/, "");
}

export const backendReadOnlyMessage =
  "El backend permite enviar el predespacho, pero no incluye un endpoint para finalizar la orden.";

export function createDispatchClient(backendUrl: string, adapter?: AxiosAdapter) {
  const configuredUrl = backendUrl.trim();
  const normalizedUrl = configuredUrl ? normalizeBackendUrl(configuredUrl) : null;
  const localCaptures = createDispatchCaptureStore();
  const api = create({
    ...(normalizedUrl ? { baseURL: normalizedUrl } : {}),
    timeout: 15_000,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...(adapter ? { adapter } : {}),
  });

  function requireBackendConfiguration() {
    if (!normalizedUrl) {
      throw new DispatchError("Configura EXPO_PUBLIC_API_URL para conectar con el backend.", 500);
    }
  }

  async function getDispatchOrderItems(orderId: string): Promise<BackendDispatchItem[]> {
    requireBackendConfiguration();
    const params = parseBackendOrderId(orderId);
    const { data } = await api.get<unknown>(
      `/api/dispatch/orders/${params.prednum}/${params.pednum}/items`,
    );
    return parseBackendDispatchItems(data, params);
  }

  return {
    getDispatchOrderItems,
    async getDispatchOrders(): Promise<BackendDispatchOrder[]> {
      requireBackendConfiguration();
      const { data } = await api.get<unknown>("/api/dispatch/orders");
      return parseBackendDispatchOrders(data);
    },
    async getDispatchOrder(orderId: string): Promise<DispatchOrder> {
      requireBackendConfiguration();
      const params = parseBackendOrderId(orderId);
      if (localCaptures.hasOrder(orderId)) return localCaptures.getOrder(orderId);
      const path = `/api/dispatch/orders/${params.prednum}/${params.pednum}`;
      const [header, items] = await Promise.all([
        api.get<unknown>(path),
        getDispatchOrderItems(orderId),
      ]);
      return localCaptures.registerOrder(mapBackendDispatchDetail(header.data, params, items));
    },
    async checkBarcode(orderId: string, itemId: string, code: string) {
      return localCaptures.checkBarcode(orderId, itemId, code);
    },
    async checkSerial(orderId: string, itemId: string, code: string) {
      return localCaptures.checkSerial(orderId, itemId, code);
    },
    async completeDispatch(orderId: string) {
      throw new DispatchError(backendReadOnlyMessage, 405);
    },
    async submitPredispatch(order: DispatchOrder) {
      requireBackendConfiguration();
      if (!order.items.length || !order.items.every(isItemComplete)) {
        throw new DispatchError("Debes validar todos los artículos y sus seriales.", 409);
      }
      const payload = {
        ...toBackendOrderHeader(order),
        cantdesp: order.cantdesp,
        items: order.items.map(toBackendItem),
      };
      await api.post("/api/dispatch/orders/predispatch", payload);
    },
  };
}

export const {
  getDispatchOrders,
  getDispatchOrder,
  getDispatchOrderItems,
  checkBarcode,
  checkSerial,
  completeDispatch,
  submitPredispatch,
} = createDispatchClient(process.env.EXPO_PUBLIC_API_URL ?? "");

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
  console.error("Error de despacho no reconocido:", error);
  return "No pudimos procesar la solicitud. Inténtalo nuevamente.";
}

export function getErrorOrder(error: unknown) {
  if (error instanceof DispatchError) return error.order;
  if (isAxiosError<{ order?: DispatchOrder }>(error)) {
    return error.response?.data?.order;
  }
}
