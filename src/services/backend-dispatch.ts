import type { DispatchOrder } from "../domain/dispatch.ts";

export type BackendDispatchHeader = {
  prednum: number | string;
  pednum?: number | string | null;
  codcli?: string | null;
  codzon?: string | null;
  fecdesp?: string | null;
  fecfinal?: string | null;
  cerrado?: number | boolean | null;
  anulado?: number | boolean | null;
  cliente?: string | null;
  direccion?: string | null;
};

export type BackendDispatchLine = {
  prednum: number | string;
  itemnum?: number | string | null;
  codart?: string | null;
  codbarra?: string | null;
  refbarra?: string | null;
  codalma?: string | null;
  manjser?: number | boolean | null;
  serial1?: string | null;
  cantidad?: number | null;
  cantped?: number | null;
  nombre?: string | null;
  descripcion?: string | null;
};

type BackendDispatchPayload = {
  headers?: BackendDispatchHeader[];
  cabeceras?: BackendDispatchHeader[];
  cbpredes?: BackendDispatchHeader[];
  lines?: BackendDispatchLine[];
  items?: BackendDispatchLine[];
  detalles?: BackendDispatchLine[];
  mvpredes?: BackendDispatchLine[];
};

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isEnabled(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function headerRows(payload: BackendDispatchPayload) {
  return payload.headers ?? payload.cabeceras ?? payload.cbpredes ?? [];
}

function lineRows(payload: BackendDispatchPayload) {
  return payload.lines ?? payload.items ?? payload.detalles ?? payload.mvpredes ?? [];
}

function mapHeader(header: BackendDispatchHeader, lines: BackendDispatchLine[]): DispatchOrder {
  const orderId = String(header.prednum);
  const orderLines = lines.filter((line) => String(line.prednum) === orderId);
  const completed = header.fecfinal ?? (isEnabled(header.cerrado) ? header.fecdesp : null);

  return {
    id: orderId,
    customer: text(header.cliente, text(header.codcli, "Cliente sin nombre")),
    address: text(header.direccion, text(header.codzon, "Zona no informada")),
    scheduledAt: text(header.fecdesp, "Sin fecha de despacho"),
    priority: "Normal",
    completedAt: completed ?? null,
    items: orderLines.map((line, index) => {
      const barcode = text(line.codbarra, text(line.refbarra, ""));
      const serial = text(line.serial1, "");
      return {
        id: `${orderId}-${text(line.itemnum, String(index + 1))}`,
        name: text(line.nombre, text(line.descripcion, text(line.codart, "Artículo sin descripción"))),
        sku: text(line.codart, "SIN SKU"),
        barcode,
        quantity: Math.max(1, number(line.cantidad ?? line.cantped, 1)),
        location: text(line.codalma, "Sin ubicación"),
        requiresSerial: isEnabled(line.manjser) || Boolean(serial),
        barcodeChecked: false,
        serials: [],
      };
    }),
  };
}

export function mapBackendDispatchPayload(payload: unknown): DispatchOrder[] {
  if (!payload || typeof payload !== "object") return [];
  if ("orders" in payload && Array.isArray(payload.orders)) {
    return payload.orders as DispatchOrder[];
  }

  const data = "data" in payload && payload.data && typeof payload.data === "object"
    ? payload.data
    : payload;
  if (!data || typeof data !== "object") return [];

  const typed = data as BackendDispatchPayload;
  const headers = headerRows(typed);
  const lines = lineRows(typed);
  return headers
    .filter((header) => !isEnabled(header.anulado))
    .map((header) => mapHeader(header, lines));
}

export function mapBackendDispatchDetail(payload: unknown, orderId: string) {
  const orders = mapBackendDispatchPayload(payload);
  return orders.find((order) => order.id === orderId);
}
