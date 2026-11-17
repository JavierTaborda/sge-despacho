export type Dtpredes = {
  prednum: number;
  itemnum: number;
  pednum: number;
  rennum: number;
  codart: string;
  artdes: string | null;
  Articulo: string;
  compuesto: number;
  manjser: boolean;
  codalma: string;
  codbarra: string | null;
  serial1: string | null;
  refbarra: string | null;
  recouser: string;
  supervisor: string | null;
  horacapture: string | null;
  changed: false;
  selected: false;
  objectstate: "None";
  objecticon: "sap-icon://None";
  lectura: "Sin serial" | null;
  objectstate2: "Warning";
};

export type Mvpredes = Dtpredes;

export type DispatchStatus = "En despacho" | "Finalizado";

export type DispatchItem = Dtpredes & {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  quantity: number;
  location: string;

  requiresSerial: boolean;
  // For serialized items, this remains valid until a serial is accepted.
  barcodeChecked: boolean;
  serials: string[];
};

export type Cbpredes = {
  prednum: number;
  pednum: number;
  profite: boolean;
  estatus: number;
  fecemis: string;
  fecdesp: string;
  fecfinal: string | null;
  horainicio: string | null;
  horafinal: string | null;
  codcli: string;
  codzon: string;
  codven: string;
  cantped: number;
  cantreng: number;
  cantdesp: number;
  cantcarga: number;
  totneto: number;
  parcial: boolean;
  compuesto: boolean;
  codtrans: string | null;
  codchofer: number;
  placa: string | null;
  cerrado: boolean;
  anulado: boolean;
  proceso: boolean;
  comentario: string | null;
  owneruser: string | number;
};

export type DispatchOrder = Cbpredes & {
  id: string;
  customer: string;
  address: string;
  scheduledAt: string;
  items: DispatchItem[];
  completedAt: string | null;
  vendedor: string;
  supervisor: string;
  conformado: DispatchStatus;
  fecfinalStr: string | null;
  duracion: string | null;
  itemsLoaded: boolean;
};

export class DispatchError extends Error {
  readonly status: number;
  readonly order?: DispatchOrder;

  constructor(message: string, status = 422, order?: DispatchOrder) {
    super(message);
    this.name = "DispatchError";
    this.status = status;
    this.order = order ? copyOrder(order) : undefined;
  }
}

export function isItemComplete(item: DispatchItem) {
  return item.requiresSerial
    ? item.serials.length === item.quantity
    : item.barcodeChecked;
}

export function getCurrentItem(order: DispatchOrder) {
  if (isOrderComplete(order)) return undefined;
  return order.items.find((item) => !isItemComplete(item));
}

export function getPendingSerialItem(order: DispatchOrder) {
  if (isOrderComplete(order)) return undefined;
  return order.items.find((item) => item.requiresSerial && item.barcodeChecked);
}

export function isOrderComplete(order: DispatchOrder) {
  return order.conformado === "Finalizado";
}

export function getOrderProgress(order: DispatchOrder) {
  const total = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const checked = order.items.reduce(
    (sum, item) =>
      sum +
      (item.requiresSerial
        ? item.serials.length
        : item.barcodeChecked
          ? item.quantity
          : 0),
    0,
  );
  return { total, checked, percent: total ? Math.round((checked / total) * 100) : 0 };
}

export function getOrderStatus(order: DispatchOrder) {
  if (isOrderComplete(order)) return "completed";
  return order.items.some((item) => item.barcodeChecked || item.serials.length > 0)
    ? "in_progress"
    : "pending";
}

function copyOrder(order: DispatchOrder): DispatchOrder {
  return {
    ...order,
    items: order.items.map((item) => ({ ...item, serials: [...item.serials] })),
  };
}

export type DispatchDraft = { original: DispatchOrder; captured: DispatchOrder };

export function hasCaptureChanges(item: DispatchItem, original: DispatchItem) {
  return item.codbarra !== original.codbarra ||
    item.serial1 !== original.serial1 ||
    item.horacapture !== original.horacapture ||
    item.barcodeChecked !== original.barcodeChecked ||
    item.serials.length !== original.serials.length ||
    item.serials.some((serial, index) => serial !== original.serials[index]);
}

export function createDispatchCaptureStore(
  initialOrders: DispatchOrder[] = [],
  originalOrders: DispatchOrder[] = initialOrders,
) {
  let orders = initialOrders.map(copyOrder);
  const serverOrders = new Map(originalOrders.map((order) => [order.id, copyOrder(order)]));

  function findOrder(orderId: string) {
    const order = orders.find((entry) => entry.id === orderId);
    if (!order) throw new DispatchError("No encontramos esta orden de despacho.", 404);
    return order;
  }

  function requirePendingItem(orderId: string, itemId: string) {
    const order = findOrder(orderId);
    if (isOrderComplete(order)) {
      throw new DispatchError("Esta orden ya fue despachada.", 409, order);
    }
    const item = order.items.find((entry) => entry.id === itemId);
    if (!item || isItemComplete(item)) {
      throw new DispatchError(
        "Este artículo no está pendiente de captura.",
        409,
        order,
      );
    }
    const pendingSerialItem = getPendingSerialItem(order);
    if (pendingSerialItem && pendingSerialItem.id !== item.id) {
      throw new DispatchError(
        "Completa el serial del artículo escaneado antes de leer otro código de barras.",
        409,
        order,
      );
    }
    return { order, item };
  }

  return {
    hasOrder: (orderId: string) => orders.some((order) => order.id === orderId),
    registerOrder(order: DispatchOrder) {
      if (!orders.some((entry) => entry.id === order.id)) {
        orders.push(copyOrder(order));
        serverOrders.set(order.id, copyOrder(order));
      }
      return copyOrder(findOrder(order.id));
    },
    refreshOrders(updates: DispatchOrder[]) {
      const replacements = new Map(updates.map((fresh) => {
        const previous = findOrder(fresh.id);
        const baseline = serverOrders.get(fresh.id);
        if (!baseline) throw new DispatchError("Vuelve a cargar la orden antes de actualizar.", 409);
        const merged = copyOrder(fresh);
        const originalItems = new Map(baseline.items.map((item) => [item.id, item]));
        const mergedItems = new Map(merged.items.map((item) => [item.id, item]));

        for (const captured of previous.items) {
          const original = originalItems.get(captured.id);
          if (!original) throw new DispatchError("No encontramos el artículo original.", 409);
          if (!hasCaptureChanges(captured, original)) continue;

          const item = mergedItems.get(captured.id);
          if (
            !item || item.sku !== captured.sku ||
            item.barcode !== captured.barcode || item.quantity !== captured.quantity
          ) {
            throw new DispatchError(
              `El artículo ${captured.name} cambió en el servidor. No se actualizó la información para conservar tus capturas locales.`,
              409,
            );
          }
          if (captured.codbarra !== original.codbarra) item.codbarra = captured.codbarra;
          if (captured.serial1 !== original.serial1) item.serial1 = captured.serial1;
          if (captured.horacapture !== original.horacapture) item.horacapture = captured.horacapture;
          if (
            captured.serials.length !== original.serials.length ||
            captured.serials.some((serial, index) => serial !== original.serials[index])
          ) item.serials = [...captured.serials];
          item.barcodeChecked = item.requiresSerial
            ? captured.barcodeChecked && !isItemComplete(item)
            : !!item.codbarra?.trim();
        }
        return [fresh.id, merged] as const;
      }));

      orders = orders.map((order) => replacements.get(order.id) ?? order);
      for (const order of updates) serverOrders.set(order.id, copyOrder(order));
    },
    getDrafts(): DispatchDraft[] {
      return orders.flatMap((order) => {
        const original = serverOrders.get(order.id);
        if (!original) throw new DispatchError("No encontramos los datos originales de la orden.", 409);
        const originalItems = new Map(original.items.map((item) => [item.id, item]));
        const changed = order.items.some((item) => {
          const baseline = originalItems.get(item.id);
          return !baseline || hasCaptureChanges(item, baseline);
        });
        return changed ? [{ original: copyOrder(original), captured: copyOrder(order) }] : [];
      });
    },
    acknowledgeOrder(order: DispatchOrder) {
      findOrder(order.id);
      serverOrders.set(order.id, copyOrder(order));
    },
    discardOrderCaptures(orderId: string) {
      const current = findOrder(orderId);
      if (isOrderComplete(current)) {
        throw new DispatchError("Esta orden ya fue despachada.", 409, current);
      }
      const original = serverOrders.get(orderId);
      if (!original) {
        throw new DispatchError("No encontramos los datos originales de la orden.", 409);
      }
      orders = orders.map((order) => order.id === orderId ? copyOrder(original) : order);
      return copyOrder(original);
    },
    getOrders: () => orders.map(copyOrder),
    getOrder: (orderId: string) => copyOrder(findOrder(orderId)),
    checkBarcode(orderId: string, itemId: string, barcode: string) {
      const { order, item } = requirePendingItem(orderId, itemId);
      item.barcodeChecked = false;
      item.codbarra = null;
      if (!item.barcode) {
        throw new DispatchError(
          "El artículo no tiene referencia de código de barras. Completa refbarra en el backend antes de escanear.",
          422,
          order,
        );
      }
      if (barcode.trim() !== item.barcode) {
        throw new DispatchError(
          `Código incorrecto. Debes escanear el artículo: ${item.name}.`,
          422,
          order,
        );
      }
      item.barcodeChecked = true;
      item.codbarra = barcode.trim();
      if (!item.requiresSerial) item.horacapture = new Date().toISOString();
      return { valid: true, serial: item.requiresSerial, order: copyOrder(order) };
    },
    checkSerial(orderId: string, itemId: string, input: string) {
      const { order, item } = requirePendingItem(orderId, itemId);
      if (!item.barcodeChecked || !item.requiresSerial) {
        throw new DispatchError(
          "Primero valida el código de barras de esta unidad.",
          409,
          order,
        );
      }
      const serial = input.trim().toUpperCase();
      if (!serial) throw new DispatchError("Escanea o escribe un serial.", 422, order);
      if (serial.startsWith("759")) {
        throw new DispatchError("El serial no puede comenzar con 759.", 422, order);
      }
      if (
        order.items.some(
          (line) => line.barcode.trim().toUpperCase() === serial,
        )
      ) {
        throw new DispatchError(
          "Escaneaste un código de barras; captura el serial del artículo.",
          422,
          order,
        );
      }
      if (
        order.items.some(
          (line) =>
            // line.sku.trim().toUpperCase() === item.sku.trim().toUpperCase() &&
            (line.serial1?.trim().toUpperCase() === serial ||
              line.serials.some(
                (captured) => captured.trim().toUpperCase() === serial,
              )),
        )
      ) {
        throw new DispatchError( 
          "Este serial ya fue registrado en esta orden. Escanea uno diferente.",
          409,
          order,
        );
      }
      item.barcodeChecked = false;
      item.serials.push(serial);
      item.serial1 = serial;
      item.horacapture = new Date().toISOString();
      return { valid: true, order: copyOrder(order) };
    },
  };
}
