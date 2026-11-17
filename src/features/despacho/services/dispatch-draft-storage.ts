import { createStore } from "zustand/vanilla";

import {
  hasCaptureChanges,
  isItemComplete,
  type DispatchDraft,
  type DispatchItem,
  type DispatchOrder,
} from "../../../domain/dispatch.ts";
import {
  getBackendOrderId,
  mapBackendDispatchDetail,
  parseBackendDispatchOrders,
  parseBackendNoSerialBarcodes,
  toBackendOrderHeader,
  type BackendDispatchOrder,
} from "../../../services/backend-dispatch.ts";

export interface DraftKeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface DispatchDraftStorage {
  load(userId: string): Promise<DispatchDraft[]>;
  save(userId: string, drafts: DispatchDraft[], errorMessage?: string): Promise<void>;
  clear(userId: string): Promise<void>;
}

export class DispatchStorageError extends Error {}

type StoredDispatchItem = [
  itemnum: number, rennum: number, codalma: string, codart: string,
  artdes: string | null, Articulo: string, refbarra: string | null,
  compuesto: number, manjser: boolean, codbarra: string | null,
  serial1: string | null, recouser: string, supervisor: string | null,
  horacapture: string | null, lectura: "Sin serial" | null,
];

type StoredCapture = [
  itemnum: number, codbarra: string | null, serial1: string | null,
  horacapture: string | null, barcodeChecked: boolean,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new DispatchStorageError("El guardado local tiene un formato inválido.");
  }
  return value;
}

function serializeOrder(order: DispatchOrder) {
  return {
    header: toBackendOrderHeader(order),
    items: order.items.map((item): StoredDispatchItem => [
      item.itemnum, item.rennum, item.codalma, item.codart,
      item.artdes, item.Articulo, item.refbarra, item.compuesto,
      item.manjser, item.codbarra, item.serial1, item.recouser,
      item.supervisor, item.horacapture, item.lectura,
    ]),
    noSerialBarcodes: [...new Set(
      order.items.filter((item) => !item.requiresSerial).map((item) => item.barcode),
    )],
    pendingSerialIds: order.items
      .filter((item) => item.requiresSerial && item.barcodeChecked)
      .map((item) => item.id),
  };
}

function expandItems(value: unknown, header: BackendDispatchOrder) {
  if (!Array.isArray(value)) {
    throw new DispatchStorageError("El guardado local no contiene una lista de artículos.");
  }
  return value.map((entry: unknown) => {
    if (!Array.isArray(entry) || entry.length !== 15) {
      throw new DispatchStorageError("El guardado local contiene un artículo inválido.");
    }
    const fields: unknown[] = entry;
    const [
      itemnum, rennum, codalma, codart, artdes, Articulo, refbarra,
      compuesto, manjser, codbarra, serial1, recouser, supervisor, horacapture, lectura,
    ] = fields;
    return {
      prednum: header.prednum, pednum: header.pednum,
      itemnum, rennum, codalma, codart, artdes, Articulo, refbarra,
      compuesto, manjser, codbarra, serial1, recouser, supervisor, horacapture, lectura,
      changed: false, selected: false, objectstate: "None",
      objecticon: "sap-icon://None", objectstate2: "Warning",
    };
  });
}

function restoreOrder(value: unknown, compact = false): DispatchOrder {
  const saved = record(value);
  const [header] = parseBackendDispatchOrders([saved.header]);
  const order = mapBackendDispatchDetail(
    header,
    header,
    compact ? expandItems(saved.items, header) : saved.items,
    new Set(parseBackendNoSerialBarcodes(saved.noSerialBarcodes)),
  );
  if (!Array.isArray(saved.pendingSerialIds)) {
    throw new DispatchStorageError("El guardado local no contiene las capturas pendientes.");
  }
  const items = new Map(order.items.map((item) => [item.id, item]));
  for (const id of saved.pendingSerialIds) {
    const item = typeof id === "string" ? items.get(id) : undefined;
    if (
      typeof id !== "string" || !item || !item.requiresSerial ||
      isItemComplete(item) || !item.barcode || item.codbarra?.trim() !== item.barcode
    ) {
      throw new DispatchStorageError("El guardado local contiene una captura pendiente inválida.");
    }
    item.barcodeChecked = true;
  }
  return order;
}

function serializeCaptures({ original, captured }: DispatchDraft): StoredCapture[] {
  const originals = new Map(original.items.map((item) => [item.id, item]));
  return captured.items.flatMap((item) => {
    const baseline = originals.get(item.id);
    if (!baseline) throw new DispatchStorageError("No encontramos el artículo original para guardar.");
    if (!hasCaptureChanges(item, baseline)) return [];
    const capture: StoredCapture = [
      item.itemnum, item.codbarra, item.serial1, item.horacapture, item.barcodeChecked,
    ];
    return [capture];
  });
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function restoreCaptures(original: DispatchOrder, value: unknown): DispatchOrder {
  if (!Array.isArray(value)) {
    throw new DispatchStorageError("El guardado local no contiene las capturas.");
  }
  const captured = {
    ...original,
    items: original.items.map((item) => ({ ...item, serials: [...item.serials] })),
  };
  const items = new Map<number, DispatchItem>(captured.items.map((item) => [item.itemnum, item]));
  const seen = new Set<number>();
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 5) {
      throw new DispatchStorageError("El guardado local contiene una captura inválida.");
    }
    const fields: unknown[] = entry;
    const [itemnum, codbarra, serial1, horacapture, barcodeChecked] = fields;
    if (
      typeof itemnum !== "number" || seen.has(itemnum) ||
      !isNullableString(codbarra) || !isNullableString(serial1) ||
      !isNullableString(horacapture) || typeof barcodeChecked !== "boolean"
    ) {
      throw new DispatchStorageError("El guardado local contiene una captura inválida.");
    }
    const item = items.get(itemnum);
    if (!item) throw new DispatchStorageError("La captura local pertenece a otro artículo.");
    seen.add(itemnum);
    item.codbarra = codbarra;
    item.serial1 = serial1;
    item.horacapture = horacapture;
    item.serials = serial1?.trim() ? [serial1.trim()] : [];
    item.barcodeChecked = barcodeChecked;
    if (
      (barcodeChecked && !codbarra?.trim()) ||
      (item.requiresSerial && barcodeChecked && isItemComplete(item)) ||
      (!item.requiresSerial && barcodeChecked !== !!codbarra?.trim())
    ) {
      throw new DispatchStorageError("El guardado local contiene un estado de captura inválido.");
    }
  }
  return captured;
}

function restoreDrafts(serialized: string): DispatchDraft[] {
  const saved = record(JSON.parse(serialized));
  if ((saved.version !== 1 && saved.version !== 2) || !Array.isArray(saved.drafts)) {
    throw new DispatchStorageError("La versión del guardado local no es compatible.");
  }
  const ids = new Set<string>();
  return saved.drafts.map((value: unknown) => {
    const entry = record(value);
    const original = restoreOrder(entry.original, saved.version === 2);
    const captured = saved.version === 1
      ? restoreOrder(entry.captured)
      : restoreCaptures(original, entry.captures);
    if (
      original.id !== captured.id || ids.has(captured.id) ||
      original.items.length !== captured.items.length ||
      captured.items.some((item, index) => {
        const baseline = original.items[index];
        return item.id !== baseline.id || item.sku !== baseline.sku || item.barcode !== baseline.barcode;
      })
    ) {
      throw new DispatchStorageError("Las capturas locales no corresponden a su orden original.");
    }
    ids.add(getBackendOrderId(captured));
    return { original, captured };
  });
}

export function createDispatchDraftStorage(storage: DraftKeyValueStorage) {
  const status = createStore<{
    error: string | null;
    retry: (() => Promise<unknown>) | null;
  }>(() => ({ error: null, retry: null }));
  const failures = new Map<string, { error: string; retry: () => Promise<unknown> }>();
  let queue: Promise<unknown> = Promise.resolve();

  function publish() {
    const latest = [...failures.values()].at(-1);
    status.setState({ error: latest?.error ?? null, retry: latest?.retry ?? null });
  }

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const request = queue.then(operation);
    // Cada llamada conserva su rechazo; la cola debe poder continuar tras un error.
    queue = request.then(() => undefined, () => undefined);
    return request;
  }

  async function perform<T>(
    userId: string,
    action: "read" | "write" | "clear",
    message: string,
    operation: (key: string) => Promise<T>,
  ): Promise<T> {
    const failureId = `${encodeURIComponent(userId)}:${action}`;
    try {
      const result = await operation(`sge-despacho:drafts:v1:${encodeURIComponent(userId)}`);
      if (action === "clear") {
        for (const kind of ["read", "write", "clear"]) {
          failures.delete(`${encodeURIComponent(userId)}:${kind}`);
        }
      } else {
        failures.delete(failureId);
      }
      publish();
      return result;
    } catch (reason) {
      const error = new DispatchStorageError(message, { cause: reason });
      const failure: { error: string; retry: () => Promise<unknown> } = {
        error: message,
        retry: () => enqueue(async () => {
          if (failures.get(failureId) !== failure) return;
          return perform(userId, action, message, operation);
        }),
      };
      failures.set(failureId, failure);
      publish();
      throw error;
    }
  }

  function run<T>(
    userId: string,
    action: "read" | "write" | "clear",
    message: string,
    operation: (key: string) => Promise<T>,
  ) {
    return enqueue(() => perform(userId, action, message, operation));
  }

  return {
    status,
    load: (userId: string) => run(
      userId,
      "read",
      "No pudimos restaurar tus capturas locales. Reintenta antes de continuar; no se han borrado.",
      async (key) => {
        const serialized = await storage.getItem(key);
        return serialized === null ? [] : restoreDrafts(serialized);
      },
    ),
    save(userId: string, drafts: DispatchDraft[], errorMessage?: string) {
      const serialized = JSON.stringify({
        version: 2,
        drafts: drafts.map((draft) => ({
          original: serializeOrder(draft.original),
          captures: serializeCaptures(draft),
        })),
      });
      return run(
        userId,
        "write",
        errorMessage ?? "No pudimos guardar las capturas en este dispositivo. Reintenta el guardado antes de cerrar la app.",
        (key) => drafts.length ? storage.setItem(key, serialized) : storage.removeItem(key),
      );
    },
    clear: (userId: string) => run(
      userId,
      "clear",
      "No pudimos borrar las capturas locales al cerrar sesión. Reintenta la limpieza.",
      (key) => storage.removeItem(key),
    ),
  };
}
