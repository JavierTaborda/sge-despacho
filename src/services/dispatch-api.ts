import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { AxiosError, AxiosHeaders, create } from "axios";

import { demoOrders } from "../data/demo-orders.ts";
import type { DispatchOrder } from "../domain/dispatch.ts";
import { createDispatchStore, DispatchError } from "../domain/dispatch.ts";
import {
  mapBackendDispatchDetail,
  mapBackendDispatchPayload,
} from "./backend-dispatch.ts";

const store = createDispatchStore(demoOrders);

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
      if (config.method === "get" && path === "/ordenes-despacho") {
        return { ...response, data: { orders: server.getOrders() } };
      }
      const orderMatch = path?.match(/^\/ordenes-despacho\/([^/]+)$/);
      if (config.method === "get" && orderMatch) {
        return { ...response, data: { order: server.getOrder(orderMatch[1]) } };
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
        data: { message: error.message },
      });
    }
  };
}

const backendUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

const api = create({
  baseURL: backendUrl || "https://demo.sge.invalid/api",
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
  ...(backendUrl ? {} : { adapter: createMockAdapter() }),
});

export async function getDispatchOrders() {
  const { data } = await api.get<unknown>("/ordenes-despacho");
  return mapBackendDispatchPayload(data);
}

export async function getDispatchOrder(orderId: string) {
  const { data } = await api.get<unknown>(
    `/ordenes-despacho/${encodeURIComponent(orderId)}`,
  );
  if (
    data &&
    typeof data === "object" &&
    "order" in data &&
    data.order &&
    typeof data.order === "object" &&
    "items" in data.order
  ) {
    return data.order as DispatchOrder;
  }
  const order = mapBackendDispatchDetail(data, orderId);
  if (!order) throw new DispatchError("No encontramos esta orden de despacho.", 404);
  return order;
}

export async function checkBarcode(orderId: string, itemId: string, code: string) {
  const { data } = await api.post<{
    valid: boolean;
    serial: boolean;
    order: DispatchOrder;
  }>("/check-codigo-barra", { orderId, itemId, code });
  return data;
}

export async function checkSerial(orderId: string, itemId: string, code: string) {
  const { data } = await api.post<{ valid: boolean; order: DispatchOrder }>(
    "/check-serial",
    { orderId, itemId, code },
  );
  return data;
}

export async function completeDispatch(orderId: string) {
  const { data } = await api.post<{ order: DispatchOrder }>(
    `/ordenes-despacho/${encodeURIComponent(orderId)}/confirmar`,
  );
  return data.order;
}

export const getDemoCode = (order: DispatchOrder) => store.getDemoCode(order);

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  console.error("Error de despacho no reconocido:", error);
  return "No pudimos procesar la solicitud. Inténtalo nuevamente.";
}
