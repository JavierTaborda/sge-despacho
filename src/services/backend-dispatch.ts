import type { DispatchOrder } from "../domain/dispatch.ts";

export type CbpredesPayload = {
  prednum: number | string;
  pednum?: number | string | null;
  profite?: number | boolean | null;
  estatus?: number | null;
  fecemis?: string | null;
  codcli?: string | null;
  codzon?: string | null;
  codven?: string | null;
  horainicio?: string | null;
  horafinal?: string | null;
  cantped?: number | null;
  cantreng?: number | null;
  cantdesp?: number | null;
  cantcarga?: number | null;
  totneto?: number | string | null;
  parcial?: number | boolean | null;
  compuesto?: number | boolean | null;
  codtrans?: string | null;
  codchofer?: number | null;
  placa?: string | null;
  proceso?: number | boolean | null;
  comentario?: string | null;
  owneruser?: number | null;
  fecdesp?: string | null;
  fecfinal?: string | null;
  cerrado?: number | boolean | null;
  anulado?: number | boolean | null;
  cliente?: string | null;
  Cliente?: string | null;
  direccion?: string | null;
  Zona?: string | null;
  Vendedor?: string | null;
  co_cli?: string | null;
  co_zon?: string | null;
  co_ven?: string | null;
  fecfinalStr?: string | null;
  supervisor?: string | null;
};

export type DtpredesPayload = {
  prednum: number | string;
  itemnum: number | string;
  pednum?: number | string | null;
  rennum?: number | string | null;
  codart?: string | null;
  compuesto?: number | boolean | null;
  manjser?: number | boolean | null;
  codalma?: string | null;
  codbarra?: string | null;
  serial1?: string | null;
  refbarra?: string | null;
  recouser?: number | null;
  horacapture?: string | null;
  artdes?: string | null;
  Articulo?: string | null;
};

type BackendDispatchPayload = {
  headers?: CbpredesPayload[];
  cabeceras?: CbpredesPayload[];
  cbpredes?: CbpredesPayload[];
  lines?: DtpredesPayload[];
  items?: DtpredesPayload[];
  detalles?: DtpredesPayload[];
  dtpredes?: DtpredesPayload[];
  mvpredes?: DtpredesPayload[];
};

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isEnabled(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function headerRows(payload: BackendDispatchPayload) {
  return payload.headers ?? payload.cabeceras ?? payload.cbpredes ?? [];
}

function lineRows(payload: BackendDispatchPayload) {
  return payload.lines
    ?? payload.items
    ?? payload.detalles
    ?? payload.dtpredes
    ?? payload.mvpredes
    ?? [];
}

function mapHeader(header: CbpredesPayload, lines: DtpredesPayload[]): DispatchOrder {
  const orderId = String(header.prednum);
  const orderLines = lines.filter((line) => String(line.prednum) === orderId);
  const completed = header.fecfinal ?? header.fecfinalStr ?? (isEnabled(header.cerrado) ? header.fecdesp : null);
  const firstLineByArticle = new Map<string, DtpredesPayload[]>();
  for (const line of orderLines) {
    const key = `${line.itemnum}:${line.codart ?? ""}:${line.codbarra ?? line.refbarra ?? ""}`;
    firstLineByArticle.set(key, [...(firstLineByArticle.get(key) ?? []), line]);
  }

  return {
    prednum: number(header.prednum, 0),
    pednum: number(header.pednum, 0),
    profite: isEnabled(header.profite),
    estatus: number(header.estatus, 0),
    fecemis: text(header.fecemis, ""),
    fecdesp: text(header.fecdesp, ""),
    fecfinal: header.fecfinal ?? header.fecfinalStr ?? null,
    horainicio: header.horainicio ?? null,
    horafinal: header.horafinal ?? null,
    codcli: text(header.co_cli, text(header.codcli, "")),
    codzon: text(header.co_zon, text(header.codzon, "")),
    codven: text(header.co_ven, text(header.codven, "")),
    cantped: number(header.cantped, 1),
    cantreng: number(header.cantreng, orderLines.length),
    cantdesp: number(header.cantdesp, 0),
    cantcarga: number(header.cantcarga, 0),
    totneto: number(header.totneto, 0),
    parcial: isEnabled(header.parcial),
    compuesto: isEnabled(header.compuesto),
    codtrans: header.codtrans ?? null,
    codchofer: number(header.codchofer, 0),
    placa: header.placa ?? null,
    cerrado: isEnabled(header.cerrado),
    anulado: isEnabled(header.anulado),
    proceso: isEnabled(header.proceso),
    comentario: header.comentario ?? null,
    owneruser: number(header.owneruser, 1),
    id: orderId,
    customer: text(header.Cliente, text(header.cliente, text(header.co_cli, text(header.codcli, "Cliente sin nombre")))),
    address: text(header.Zona, text(header.direccion, text(header.co_zon, text(header.codzon, "Zona no informada")))),
    scheduledAt: text(header.fecdesp, "Sin fecha de despacho"),
    vendedor: text(header.Vendedor, text(header.co_ven, text(header.codven, "Vendedor no informado"))),
    supervisor: text(header.supervisor, ""),
    completedAt: completed ?? null,
    items: [...firstLineByArticle.values()].map((lineGroup, index) => {
      const line = lineGroup[0];
      const barcode = text(line.refbarra, text(line.codbarra, ""));
      const serials = lineGroup
        .map((entry) => text(entry.serial1, ""))
        .filter(Boolean);
      return {
        prednum: number(line.prednum, number(header.prednum, 0)),
        itemnum: number(line.itemnum, index + 1),
        pednum: number(line.pednum, number(header.pednum, 0)),
        rennum: number(line.rennum, 0),
        codart: text(line.codart, ""),
        compuesto: isEnabled(line.compuesto),
        manjser: isEnabled(line.manjser),
        codalma: text(line.codalma, ""),
        codbarra: line.codbarra ?? null,
        serial1: line.serial1 ?? null,
        refbarra: line.refbarra ?? null,
        recouser: number(line.recouser, 1),
        horacapture: line.horacapture ?? null,
        id: `${orderId}-${text(line.itemnum, String(index + 1))}`,
        name: text(line.Articulo, text(line.artdes, text(line.codart, "Artículo sin descripción"))),
        sku: text(line.codart, "SIN SKU"),
        barcode,
        quantity: Math.max(1, lineGroup.length),
        location: text(line.codalma, "Sin ubicación"),
        requiresSerial: isEnabled(line.manjser) || serials.length > 0,
        barcodeChecked: false,
        serials,
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
