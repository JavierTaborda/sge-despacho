export type Dtpredes = {
  prednum: number;
  itemnum: number;
  pednum: number;
  rennum: number;
  codart: string;
  compuesto: boolean;
  manjser: boolean;
  codalma: string;
  codbarra: string | null;
  serial1: string | null;
  refbarra: string | null;
  recouser: string | number;
  horacapture: string | null;
};

export type Mvpredes = Dtpredes;

export type DispatchItem = Dtpredes & {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  quantity: number;
  location: string;

  requiresSerial: boolean;
  // For serialized items, this authorizes only the next serial attempt.
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
  owneruser: number;
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
};

export type DemoItem = Omit<DispatchItem, keyof Dtpredes | "barcodeChecked" | "serials"> & {
  prednum: number;
  itemnum: number;
  pednum: number;
  rennum: number;
  recouser: string | number;
  expectedSerials: string[];
};

export type DemoOrder = Omit<DispatchOrder, keyof Cbpredes | "items" | "completedAt"> &
  Pick<Cbpredes, "pednum" | "codcli" | "codzon" | "codven"> & {
    items: DemoItem[];
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
  return order.items.find((item) => !isItemComplete(item));
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
  if (order.completedAt) return "completed";
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

export function createDispatchStore(seeds: DemoOrder[]) {
  const orders: DispatchOrder[] = seeds.map((seed) => ({
    prednum: Number(seed.id.replace(/\D/g, "")) || 0,
    profite: false,
    estatus: 0,
    fecemis: "",
    fecdesp: seed.scheduledAt,
    fecfinal: null,
    horainicio: null,
    horafinal: null,
    cantped: seed.items.length,
    cantreng: seed.items.length,
    cantdesp: 0,
    cantcarga: 0,
    totneto: 0,
    parcial: false,
    compuesto: false,
    codtrans: null,
    codchofer: 0,
    placa: null,
    cerrado: false,
    anulado: false,
    proceso: false,
    comentario: null,
    owneruser: 1,
    ...seed,
    completedAt: null,
    items: seed.items.map(({ expectedSerials: _, ...item }) => ({
      ...item,
      codart: item.sku,
      compuesto: false,
      manjser: item.requiresSerial,
      codalma: item.location,
      codbarra: null,
      serial1: null,
      refbarra: item.barcode,
      horacapture: null,
      barcodeChecked: false,
      serials: [],
    })),
  }));

  function findOrder(orderId: string) {
    const order = orders.find((entry) => entry.id === orderId);
    if (!order) throw new DispatchError("No encontramos esta orden de despacho.", 404);
    return order;
  }

  function requireCurrentItem(orderId: string, itemId: string) {
    const order = findOrder(orderId);
    if (order.completedAt) {
      throw new DispatchError("Esta orden ya fue despachada.", 409, order);
    }
    const item = getCurrentItem(order);
    if (!item || item.id !== itemId) {
      throw new DispatchError(
        "No puedes saltar artículos. Completa el artículo actual antes de continuar.",
        409,
        order,
      );
    }
    return { order, item };
  }

  function expectedSerials(orderId: string, itemId: string) {
    const item = seeds
      .find((order) => order.id === orderId)
      ?.items.find((entry) => entry.id === itemId);
    if (!item) throw new DispatchError("No encontramos este artículo.", 404);
    return item.expectedSerials;
  }

  return {
    getOrders: () => orders.map(copyOrder),
    getOrder: (orderId: string) => copyOrder(findOrder(orderId)),
    checkBarcode(orderId: string, itemId: string, barcode: string) {
      const { order, item } = requireCurrentItem(orderId, itemId);
      item.barcodeChecked = false;
      item.codbarra = null;
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
      const { order, item } = requireCurrentItem(orderId, itemId);
      if (!item.barcodeChecked || !item.requiresSerial) {
        throw new DispatchError(
          "Primero valida el código de barras de esta unidad.",
          409,
          order,
        );
      }
      item.barcodeChecked = false;
      const serial = input.trim().toUpperCase();
      if (!serial) throw new DispatchError("Escanea o escribe un serial.", 422, order);
      if (
        orders.some((entry) =>
          entry.items.some((line) => line.serials.includes(serial)),
        )
      ) {
        throw new DispatchError(
          "Este serial ya fue registrado. Escanea uno diferente.",
          409,
          order,
        );
      }
      item.serials.push(serial);
      item.serial1 = serial;
      item.horacapture = new Date().toISOString();
      return { valid: true, order: copyOrder(order) };
    },
    completeOrder(orderId: string) {
      const order = findOrder(orderId);
      if (!order.items.length || !order.items.every(isItemComplete)) {
        throw new DispatchError("Debes validar todos los artículos y sus seriales.", 409);
      }
      order.completedAt ??= new Date().toISOString();
      return copyOrder(order);
    },
    getDemoCode(order: DispatchOrder) {
      const item = getCurrentItem(order);
      if (!item) return null;
      if (!item.barcodeChecked) return item.barcode;
      return (
        expectedSerials(order.id, item.id).find(
          (serial) => !item.serials.includes(serial),
        ) ?? `DEMO-${item.id}`
      );
    },
  };
}
