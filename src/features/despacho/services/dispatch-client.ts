import type { AxiosAdapter, AxiosInstance } from "axios";
import { create, isAxiosError } from "axios";

import type { DispatchItem, DispatchOrder } from "../../../domain/dispatch.ts";
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
  type BackendDispatchItem,
  type BackendDispatchOrder,
} from "../../../services/backend-dispatch.ts";
import { normalizeBackendUrl } from "../../../utils/api-config.ts";

export { normalizeBackendUrl } from "../../../utils/api-config.ts";

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
  }: { requireConfiguration?: () => void; getSessionScope?: () => number } = {},
) {
  let localCaptures = createDispatchCaptureStore();
  let scope = getSessionScope();

  function clearCaptures() {
    localCaptures = createDispatchCaptureStore();
    scope = getSessionScope();
  }

  function captures() {
    if (scope !== getSessionScope()) clearCaptures();
    return localCaptures;
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

  return {
    clearCaptures,
    getDispatchOrderItems,
    getNoSerialBarcodes,
    async getDispatchOrders(): Promise<BackendDispatchOrder[]> {
      requireConfiguration();
      const { data } = await api.get<unknown>("/api/dispatch/orders");
      return parseBackendDispatchOrders(data);
    },
    async getDispatchOrder(orderId: string): Promise<DispatchOrder> {
      requireConfiguration();
      const params = parseBackendOrderId(orderId);
      const currentCaptures = captures();
      if (currentCaptures.hasOrder(orderId)) return currentCaptures.getOrder(orderId);
      const path = `/api/dispatch/orders/${params.prednum}/${params.pednum}`;
      const [header, items, noSerialBarcodes] = await Promise.all([
        api.get<unknown>(path),
        getDispatchOrderItems(orderId),
        getNoSerialBarcodes(),
      ]);
      if (currentCaptures !== captures()) {
        throw new DispatchError("La sesión cambió. Vuelve a cargar la orden.", 409);
      }
      return currentCaptures.registerOrder(
        mapBackendDispatchDetail(header.data, params, items, new Set(noSerialBarcodes)),
      );
    },
    async checkBarcode(orderId: string, itemId: string, code: string) {
      return captures().checkBarcode(orderId, itemId, code);
    },
    async checkSerial(orderId: string, itemId: string, code: string) {
      return captures().checkSerial(orderId, itemId, code);
    },
    async completeDispatch(orderId: string) {
      throw new DispatchError(backendReadOnlyMessage, 405);
    },
    async submitPredispatch(order: DispatchOrder) {
      requireConfiguration();
      if (!order.items.length || !order.items.every(isItemComplete)) {
        throw new DispatchError("Debes validar todos los artículos y sus seriales.", 409);
      }
      console.log(order);
      const payload = {
        ...toBackendOrderHeader(order),
        cantdesp: order.cantdesp,
        items: order.items.map(toBackendItem),
      };
      await api.post("/api/dispatch/orders/predispatch", payload);
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
