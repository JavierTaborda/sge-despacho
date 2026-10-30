import type {
  DispatchItem,
  DispatchOrder,
  DispatchStatus,
  Dtpredes,
} from "../domain/dispatch.ts";
import { DispatchError } from "../domain/dispatch.ts";

export interface BackendDispatchOrder {
  prednum: number;
  pednum: number;
  conformado: DispatchStatus;
  fecdesp: string;
  fecfinalStr: string | null;
  fecfinal: string | null;
  duracion: string | null;
  co_cli: string;
  Cliente: string | null;
  co_zon: string;
  Zona: string | null;
  co_ven: string;
  Vendedor: string | null;
  cantdesp: number;
  owneruser: string;
  supervisor: string | null;
}

export type BackendDispatchItem = Dtpredes;

export interface DispatchOrderParams {
  prednum: number;
  pednum: number;
}

export interface DispatchApi {
  listOrders: {
    method: "GET";
    path: "/api/dispatch/orders";
    response: BackendDispatchOrder[];
  };
  getOrder: {
    method: "GET";
    path: "/api/dispatch/orders/:prednum/:pednum";
    params: DispatchOrderParams;
    response: BackendDispatchOrder;
  };
  getOrderItems: {
    method: "GET";
    path: "/api/dispatch/orders/:prednum/:pednum/items";
    params: DispatchOrderParams;
    response: BackendDispatchItem[];
  };
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown, context: string) {
  if (!isRecord(value)) {
    throw new DispatchError(`Respuesta inválida del backend: ${context} debe ser un objeto.`, 502);
  }
  return value;
}

function field<T>(
  row: JsonRecord,
  key: string,
  guard: (value: unknown) => value is T,
  context: string,
): T {
  const value = row[key];
  if (!guard(value)) {
    throw new DispatchError(`Respuesta inválida del backend: ${context}.${key}.`, 502);
  }
  return value;
}

const isString = (value: unknown): value is string => typeof value === "string";
const isNullableString = (value: unknown): value is string | null =>
  value === null || isString(value);
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isIdentifier = (value: unknown): value is number =>
  isNumber(value) && Number.isSafeInteger(value) && value >= 0;
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isStatus = (value: unknown): value is DispatchStatus =>
  value === "En despacho" || value === "Finalizado";
const isLectura = (value: unknown): value is "Sin serial" | null =>
  value === null || value === "Sin serial";

function literal<T extends string | boolean>(
  row: JsonRecord,
  key: string,
  expected: T,
  context: string,
) {
  return field(row, key, (value): value is T => value === expected, context);
}

function parseHeader(value: unknown, context: string): BackendDispatchOrder {
  const row = record(value, context);
  return {
    prednum: field(row, "prednum", isIdentifier, context),
    pednum: field(row, "pednum", isIdentifier, context),
    conformado: field(row, "conformado", isStatus, context),
    fecdesp: field(row, "fecdesp", isString, context),
    fecfinalStr: field(row, "fecfinalStr", isNullableString, context),
    fecfinal: field(row, "fecfinal", isNullableString, context),
    duracion: field(row, "duracion", isNullableString, context),
    co_cli: field(row, "co_cli", isString, context),
    Cliente: field(row, "Cliente", isNullableString, context),
    co_zon: field(row, "co_zon", isString, context),
    Zona: field(row, "Zona", isNullableString, context),
    co_ven: field(row, "co_ven", isString, context),
    Vendedor: field(row, "Vendedor", isNullableString, context),
    cantdesp: field(row, "cantdesp", isNumber, context),
    owneruser: field(row, "owneruser", isString, context),
    supervisor: field(row, "supervisor", isNullableString, context),
  };
}

function parseItem(value: unknown, context: string): BackendDispatchItem {
  const row = record(value, context);
  return {
    prednum: field(row, "prednum", isIdentifier, context),
    itemnum: field(row, "itemnum", isIdentifier, context),
    pednum: field(row, "pednum", isIdentifier, context),
    rennum: field(row, "rennum", isIdentifier, context),
    codalma: field(row, "codalma", isString, context),
    codart: field(row, "codart", isString, context),
    artdes: field(row, "artdes", isNullableString, context),
    Articulo: field(row, "Articulo", isString, context),
    refbarra: field(row, "refbarra", isNullableString, context),
    compuesto: field(row, "compuesto", isNumber, context),
    manjser: field(row, "manjser", isBoolean, context),
    codbarra: field(row, "codbarra", isNullableString, context),
    serial1: field(row, "serial1", isNullableString, context),
    recouser: field(row, "recouser", isString, context),
    supervisor: field(row, "supervisor", isNullableString, context),
    horacapture: field(row, "horacapture", isNullableString, context),
    changed: literal(row, "changed", false, context),
    selected: literal(row, "selected", false, context),
    objectstate: literal(row, "objectstate", "None", context),
    objecticon: literal(row, "objecticon", "sap-icon://None", context),
    lectura: field(row, "lectura", isLectura, context),
    objectstate2: literal(row, "objectstate2", "Warning", context),
  };
}

export function getBackendOrderId(params: DispatchOrderParams) {
  return `${params.prednum}-${params.pednum}`;
}

export function parseBackendOrderId(id: string): DispatchOrderParams {
  const match = /^(\d+)-(\d+)$/.exec(id);
  if (!match) {
    throw new DispatchError("La orden requiere los identificadores prednum y pednum.", 400);
  }
  const prednum = Number(match[1]);
  const pednum = Number(match[2]);
  if (!isIdentifier(prednum) || !isIdentifier(pednum)) {
    throw new DispatchError("Los identificadores de la orden no son válidos.", 400);
  }
  return { prednum, pednum };
}

function displayText(value: string | null, fallback: string) {
  return value?.trim() || fallback;
}

function mapHeader(header: BackendDispatchOrder): DispatchOrder {
  return {
    ...header,
    profite: false,
    estatus: 0,
    fecemis: "",
    horainicio: null,
    horafinal: null,
    codcli: header.co_cli,
    codzon: header.co_zon,
    codven: header.co_ven,
    cantped: 0,
    cantreng: 0,
    cantcarga: 0,
    totneto: 0,
    parcial: false,
    compuesto: false,
    codtrans: null,
    codchofer: 0,
    placa: null,
    cerrado: header.conformado === "Finalizado",
    anulado: false,
    proceso: false,
    comentario: null,
    id: getBackendOrderId(header),
    customer: displayText(header.Cliente, header.co_cli || "Cliente sin nombre"),
    address: displayText(header.Zona, header.co_zon || "Zona no informada"),
    scheduledAt: displayText(header.fecdesp, "Sin fecha de despacho"),
    vendedor: displayText(header.Vendedor, header.co_ven || "Vendedor no informado"),
    supervisor: header.supervisor ?? "",
    completedAt: header.fecfinal,
    itemsLoaded: false,
    items: [],
  };
}

function mapItem(line: BackendDispatchItem): DispatchItem {
  const serial = line.serial1?.trim();
  return {
    ...line,
    id: `${getBackendOrderId(line)}-${line.itemnum}`,
    name: displayText(line.Articulo, displayText(line.artdes, line.codart)),
    sku: line.codart,
    barcode: line.refbarra?.trim() ?? "",
    quantity: 1,
    location: displayText(line.codalma, "Sin ubicación"),
    requiresSerial: line.manjser,
    barcodeChecked: !line.manjser && !!line.codbarra?.trim(),
    serials: serial ? [serial] : [],
  };
}

export function parseBackendDispatchOrders(payload: unknown): BackendDispatchOrder[] {
  if (!Array.isArray(payload)) {
    throw new DispatchError("Respuesta inválida del backend: se esperaba una lista de órdenes.", 502);
  }
  const ids = new Set<string>();
  return payload.map((value, index) => {
    const order = parseHeader(value, `orders[${index}]`);
    const id = getBackendOrderId(order);
    if (ids.has(id)) {
      throw new DispatchError(`Respuesta inválida del backend: orden duplicada ${id}.`, 502);
    }
    ids.add(id);
    return order;
  });
}

export function mapBackendDispatchPayload(payload: unknown): DispatchOrder[] {
  return parseBackendDispatchOrders(payload).map(mapHeader);
}

export function parseBackendDispatchItems(
  payload: unknown,
  params: DispatchOrderParams,
): BackendDispatchItem[] {
  if (!Array.isArray(payload)) {
    throw new DispatchError("Respuesta inválida del backend: se esperaba una lista de artículos.", 502);
  }
  const ids = new Set<number>();
  return payload.map((value, index) => {
    const line = parseItem(value, `items[${index}]`);
    if (line.prednum !== params.prednum || line.pednum !== params.pednum) {
      throw new DispatchError("El backend devolvió un artículo de otra orden.", 502);
    }
    if (ids.has(line.itemnum)) {
      throw new DispatchError(`Respuesta inválida del backend: itemnum duplicado ${line.itemnum}.`, 502);
    }
    ids.add(line.itemnum);
    return line;
  });
}

export function mapBackendDispatchDetail(
  payload: unknown,
  params: DispatchOrderParams,
  itemsPayload: unknown,
): DispatchOrder {
  const header = parseHeader(payload, "order");
  if (header.prednum !== params.prednum || header.pednum !== params.pednum) {
    throw new DispatchError("El backend devolvió una orden diferente a la solicitada.", 502);
  }
  const items = parseBackendDispatchItems(itemsPayload, params).map(mapItem);
  return { ...mapHeader(header), items, itemsLoaded: true, cantreng: items.length };
}
