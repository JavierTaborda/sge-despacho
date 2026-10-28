import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { AxiosError, AxiosHeaders, create, isAxiosError } from "axios";

import { demoOrders } from "../data/demo-orders.ts";
import type { DispatchItem, DispatchOrder } from "../domain/dispatch.ts";
import {
  createDispatchCaptureStore,
  createDispatchStore,
  DispatchError,
} from "../domain/dispatch.ts";
import {
  getBackendOrderId,
  mapBackendDispatchDetail,
  parseBackendDispatchOrders,
  parseBackendDispatchItems,
  parseBackendOrderId,
  type BackendDispatchOrder,
  type BackendDispatchItem,
} from "./backend-dispatch.ts";

const store = createDispatchStore(demoOrders);

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

function readScanBody(config: InternalAxiosRequestConfig) {
  const raw: unknown = config.data;
  let body: unknown = raw;
  if (typeof raw === "string") {
    try {
      body = JSON.parse(raw);
    } catch {
      throw new DispatchError("El cuerpo de la petición debe ser JSON válido.", 400);
    }
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("orderId" in body) ||
    typeof body.orderId !== "string" ||
    !("itemId" in body) ||
    typeof body.itemId !== "string" ||
    !("code" in body) ||
    typeof body.code !== "string"
  ) {
    throw new DispatchError("La petición requiere orderId, itemId y code.", 400);
  }
  return { orderId: body.orderId, itemId: body.itemId, code: body.code };
}

// El adaptador sustituye al servidor; ninguna petición sale a Internet.
export function createMockAdapter(
  server = store,
  latency = 400,
): AxiosAdapter {
  return async (config) => {
    await new Promise((resolve) => setTimeout(resolve, latency));
    const response = {
      config,
      headers: new AxiosHeaders(),
      status: 200,
      statusText: "OK",
    };
    try {
      const path = config.url;
      if (config.method === "get" && path === "/api/dispatch/orders") {
        return { ...response, data: server.getOrders().map(toBackendOrderHeader) };
      }
      const backendMatch = path?.match(/^\/api\/dispatch\/orders\/(\d+)\/(\d+)(\/items)?$/);
      if (config.method === "get" && backendMatch) {
        const order = server.getOrders().find(
          (entry) => entry.prednum === Number(backendMatch[1]) && entry.pednum === Number(backendMatch[2]),
        );
        if (!order) throw new DispatchError("No encontramos esta orden de despacho.", 404);
        return {
          ...response,
          data: backendMatch[3] ? order.items.map(toBackendItem) : toBackendOrderHeader(order),
        };
      }
      const orderMatch = path?.match(/^\/ordenes-despacho\/([^/]+)$/);
      if (config.method === "get" && orderMatch) {
        const requestedId = decodeURIComponent(orderMatch[1]);
        const order = server.getOrders().find(
          (entry) => entry.id === requestedId || getBackendOrderId(entry) === requestedId,
        );
        if (!order) throw new DispatchError("No encontramos esta orden de despacho.", 404);
        return { ...response, data: { order } };
      }
      if (
        config.method === "post" &&
        (path === "/check-codigo-barra" || path === "/check-serial")
      ) {
        const { orderId, itemId, code } = readScanBody(config);
        const data =
          path === "/check-codigo-barra"
            ? server.checkBarcode(orderId, itemId, code)
            : server.checkSerial(orderId, itemId, code);
        return { ...response, data };
      }
      const completeMatch = path?.match(/^\/ordenes-despacho\/([^/]+)\/confirmar$/);
      if (config.method === "post" && completeMatch) {
        return {
          ...response,
          data: { order: server.completeOrder(completeMatch[1]) },
        };
      }
      throw new DispatchError("El endpoint solicitado no existe.", 404);
    } catch (error) {
      if (!(error instanceof DispatchError)) throw error;
      throw new AxiosError(error.message, "ERR_BAD_REQUEST", config, undefined, {
        ...response,
        status: error.status,
        statusText: "Error",
        data: {
          message: error.message,
          ...(error.order ? { order: error.order } : {}),
        },
      });
    }
  };
}

export function normalizeBackendUrl(value: string) {
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
  "No se puede confirmar el despacho: las capturas son locales y la API todavía no incluye endpoints para guardarlas ni finalizar.";

export function createDispatchClient(backendUrl?: string, adapter?: AxiosAdapter) {
  const configuredUrl = backendUrl?.trim();
  const isBackendMode = !!configuredUrl;
  const localCaptures = createDispatchCaptureStore();
  const api = create({
    baseURL: configuredUrl ? normalizeBackendUrl(configuredUrl) : "https://demo.sge.invalid",
    timeout: 15_000,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...(adapter
      ? { adapter }
      : isBackendMode
        ? {}
        : { adapter: createMockAdapter() }),
  });

  function requireWritableBackend() {
    if (isBackendMode) throw new DispatchError(backendReadOnlyMessage, 405);
  }

  async function getDispatchOrderItems(orderId: string): Promise<BackendDispatchItem[]> {
    const params = parseBackendOrderId(orderId);
    const { data } = await api.get<unknown>(
      `/api/dispatch/orders/${params.prednum}/${params.pednum}/items`,
    );
    return parseBackendDispatchItems(data, params);
  }

  return {
    isBackendMode,
    canWriteDispatch: !isBackendMode,
    getDispatchOrderItems,
    async getDispatchOrders(): Promise<BackendDispatchOrder[]> {
      const { data } = await api.get<unknown>("/api/dispatch/orders");
      return parseBackendDispatchOrders(data);
    },
    async getDispatchOrder(orderId: string): Promise<DispatchOrder> {
      if (!isBackendMode) {
        const { data } = await api.get<{ order: DispatchOrder }>(
          `/ordenes-despacho/${encodeURIComponent(orderId)}`,
        );
        return data.order;
      }
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
      if (isBackendMode) return localCaptures.checkBarcode(orderId, itemId, code);
      const { data } = await api.post<{
        valid: boolean;
        serial: boolean;
        order: DispatchOrder;
      }>("/check-codigo-barra", { orderId, itemId, code });
      return data;
    },
    async checkSerial(orderId: string, itemId: string, code: string) {
      if (isBackendMode) return localCaptures.checkSerial(orderId, itemId, code);
      const { data } = await api.post<{ valid: boolean; order: DispatchOrder }>(
        "/check-serial",
        { orderId, itemId, code },
      );
      return data;
    },
    async completeDispatch(orderId: string) {
      requireWritableBackend();
      const { data } = await api.post<{ order: DispatchOrder }>(
        `/ordenes-despacho/${encodeURIComponent(orderId)}/confirmar`,
      );
      return data.order;
    },
    getDemoCode(order: DispatchOrder) {
      return isBackendMode ? null : store.getDemoCode(order);
    },
  };
}

export const {
  isBackendMode,
  canWriteDispatch,
  getDispatchOrders,
  getDispatchOrder,
  getDispatchOrderItems,
  checkBarcode,
  checkSerial,
  completeDispatch,
  getDemoCode,
} = createDispatchClient(process.env.EXPO_PUBLIC_API_URL);

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
