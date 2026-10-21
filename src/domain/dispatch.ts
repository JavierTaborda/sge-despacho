export type DispatchItem = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  quantity: number;
  location: string;
  requiresSerial: boolean;
  barcodeChecked: boolean;
  serials: string[];
};

export type DispatchOrder = {
  id: string;
  customer: string;
  address: string;
  scheduledAt: string;
  priority: "Alta" | "Normal";
  items: DispatchItem[];
  completedAt: string | null;
};

export type DemoItem = Omit<DispatchItem, "barcodeChecked" | "serials"> & {
  expectedSerials: string[];
};

export type DemoOrder = Omit<DispatchOrder, "items" | "completedAt"> & {
  items: DemoItem[];
};

export class DispatchError extends Error {
  readonly status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = "DispatchError";
    this.status = status;
  }
}

export function isItemComplete(item: DispatchItem) {
  return (
    item.barcodeChecked &&
    (!item.requiresSerial || item.serials.length === item.quantity)
  );
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
  return order.items.some((item) => item.barcodeChecked) ? "in_progress" : "pending";
}

function copyOrder(order: DispatchOrder): DispatchOrder {
  return {
    ...order,
    items: order.items.map((item) => ({ ...item, serials: [...item.serials] })),
  };
}

export function createDispatchStore(seeds: DemoOrder[]) {
  const orders: DispatchOrder[] = seeds.map((seed) => ({
    ...seed,
    completedAt: null,
    items: seed.items.map(({ expectedSerials: _, ...item }) => ({
      ...item,
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
      throw new DispatchError("Esta orden ya fue despachada.", 409);
    }
    const item = getCurrentItem(order);
    if (!item || item.id !== itemId) {
      throw new DispatchError(
        "No puedes saltar artículos. Completa el artículo actual antes de continuar.",
        409,
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
      if (item.barcodeChecked) {
        throw new DispatchError("El código ya fue validado. Escanea los seriales.", 409);
      }
      if (barcode.trim() !== item.barcode) {
        throw new DispatchError(
          `Código incorrecto. Debes escanear el artículo: ${item.name}.`,
        );
      }
      item.barcodeChecked = true;
      return { valid: true, serial: item.requiresSerial, order: copyOrder(order) };
    },
    checkSerial(orderId: string, itemId: string, input: string) {
      const { order, item } = requireCurrentItem(orderId, itemId);
      if (!item.barcodeChecked || !item.requiresSerial) {
        throw new DispatchError("Primero valida el código de barras del artículo.", 409);
      }
      const serial = input.trim().toUpperCase();
      if (!serial) throw new DispatchError("Escanea o escribe un serial.");
      if (
        orders.some((entry) =>
          entry.items.some((line) => line.serials.includes(serial)),
        )
      ) {
        throw new DispatchError("Este serial ya fue registrado. Escanea uno diferente.", 409);
      }
      if (!expectedSerials(orderId, itemId).includes(serial)) {
        throw new DispatchError("Este serial no pertenece al artículo actual.");
      }
      item.serials.push(serial);
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
        ) ?? null
      );
    },
  };
}
