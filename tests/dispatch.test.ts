/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createDispatchCaptureStore,
    DispatchError,
    getCurrentItem,
    getOrderProgress,
    getOrderStatus,
    isItemComplete,
    type DispatchItem,
    type DispatchOrder,
} from "../src/domain/dispatch.ts";

function makeTestItem(item: {
  id: string;
  itemnum: number;
  name: string;
  sku: string;
  barcode: string;
  quantity: number;
  requiresSerial: boolean;
}): DispatchItem {
  return {
    prednum: 1048,
    pednum: 19665,
    rennum: item.itemnum,
    codart: item.sku,
    artdes: item.name,
    Articulo: item.name,
    compuesto: 0,
    manjser: item.requiresSerial,
    codalma: "0001",
    codbarra: null,
    serial1: null,
    refbarra: item.barcode,
    recouser: "1",
    supervisor: null,
    horacapture: null,
    changed: false,
    selected: false,
    objectstate: "None",
    objecticon: "sap-icon://None",
    lectura: item.requiresSerial ? null : "Sin serial",
    objectstate2: "Warning",
    ...item,
    location: "0001",
    barcodeChecked: false,
    serials: [],
  };
}

const testOrder: DispatchOrder = {
  prednum: 1048,
  pednum: 19665,
  profite: false,
  estatus: 0,
  fecemis: "",
  fecdesp: "2026-10-23 09:32:56",
  fecfinal: null,
  horainicio: null,
  horafinal: null,
  codcli: "00734",
  codzon: "0002",
  codven: "00004",
  cantped: 3,
  cantreng: 3,
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
  owneruser: "1",
  id: "OD-1048",
  customer: "Cliente de prueba",
  address: "TACHIRA",
  scheduledAt: "2026-10-23 09:32:56",
  items: [
    makeTestItem({ id: "item-1", itemnum: 1, name: "Aire de ventana", sku: "AVFR-8W", barcode: "7801234567012", quantity: 2, requiresSerial: true }),
    makeTestItem({ id: "item-2", itemnum: 2, name: "Sensor de temperatura", sku: "ST-100", barcode: "7801234567029", quantity: 2, requiresSerial: false }),
    makeTestItem({ id: "item-3", itemnum: 3, name: "Oxímetro de pulso", sku: "OP-50", barcode: "7801234567050", quantity: 1, requiresSerial: true }),
  ],
  completedAt: null,
  vendedor: "Vendedor de prueba",
  supervisor: "supervisor",
  conformado: "En despacho",
  fecfinalStr: null,
  duracion: null,
  itemsLoaded: true,
};

function setup() {
  return createDispatchCaptureStore([testOrder]);
}

test("capture store protects mutable order state", () => {
  const store = setup();
  const orders = store.getOrders();
  assert.equal(orders.length, 1);
  assert.equal(getOrderStatus(orders[0]), "pending");
  assert.deepEqual(getOrderProgress(orders[0]), { checked: 0, total: 5, percent: 0 });
  assert.equal(orders[0].items[0].refbarra, "7801234567012");
  assert.equal(orders[0].items[0].codbarra, null);
  orders[0].items[0].barcodeChecked = true;
  orders[0].items[0].serials.push("INVALID");
  assert.equal(store.getOrder("OD-1048").items[0].barcodeChecked, false);
  assert.deepEqual(store.getOrder("OD-1048").items[0].serials, []);
});

test("rejects incorrect and empty barcodes rather than returning serial: false", () => {
  const store = setup();
  for (const code of ["", "WRONG", "7801234567029"]) {
    assert.throws(() => store.checkBarcode("OD-1048", "item-1", code), DispatchError);
  }
  assert.equal(getOrderStatus(store.getOrder("OD-1048")), "pending");
});

test("rejects skipping lines and scanning serials before the barcode", () => {
  const store = setup();
  assert.throws(() => store.checkBarcode("OD-1048", "item-2", "7801234567029"), /saltar/);
  assert.throws(() => store.checkSerial("OD-1048", "item-1", "MSV2200-24081"), /Primero/);
});

test("serial: true requires a fresh barcode for each unit and accepts any serial", () => {
  const store = setup();
  const response = store.checkBarcode("OD-1048", "item-1", " 7801234567012\r\n");
  assert.equal(response.valid, true);
  assert.equal(response.serial, true);
  assert.equal(getOrderStatus(response.order), "in_progress");
  assert.equal(isItemComplete(response.order.items[0]), false);
  const refreshed = store.checkBarcode("OD-1048", "item-1", "7801234567012");
  assert.equal(refreshed.order.items[0].barcodeChecked, true);
  assert.equal(getOrderProgress(refreshed.order).checked, 0);
  const afterOne = store.checkSerial("OD-1048", "item-1", "msv2200-24082\r\n").order;
  assert.deepEqual(getOrderProgress(afterOne), { checked: 1, total: 5, percent: 20 });
  assert.equal(getCurrentItem(afterOne)?.id, "item-1");
  assert.equal(afterOne.items[0].barcodeChecked, false);
  assert.equal(afterOne.items[0].codbarra, "7801234567012");
  assert.equal(afterOne.items[0].serial1, "MSV2200-24082");
  assert.ok(afterOne.items[0].horacapture);
  assert.equal(getOrderStatus(afterOne), "in_progress");
  assert.throws(() => store.checkBarcode("OD-1048", "item-2", "7801234567029"), /saltar/);
  assert.throws(() => store.checkSerial("OD-1048", "item-1", "MSV2200-24081"), /Primero/);
  store.checkBarcode("OD-1048", "item-1", "7801234567012");
  assert.throws(() => store.checkSerial("OD-1048", "item-1", "MSV2200-24082"), /ya fue registrado/);
  store.checkBarcode("OD-1048", "item-1", "7801234567012");
  assert.throws(() => store.checkSerial("OD-1048", "item-1", ""), /escribe un serial/);
  store.checkBarcode("OD-1048", "item-1", "7801234567012");
  const afterTwo = store.checkSerial("OD-1048", "item-1", "BI500-77120").order;
  assert.equal(afterTwo.items[0].serials.length, 2);
  assert.equal(afterTwo.items[0].barcodeChecked, false);
  assert.equal(isItemComplete(afterTwo.items[0]), true);
  assert.throws(() => store.checkSerial("OD-1048", "item-1", "MSV2200-24083"), /saltar/);
});

test("serial: false completes all quantities of the line and advances automatically", () => {
  const store = setup();
  store.checkBarcode("OD-1048", "item-1", "7801234567012");
  store.checkSerial("OD-1048", "item-1", "MSV2200-24081");
  store.checkBarcode("OD-1048", "item-1", "7801234567012");
  store.checkSerial("OD-1048", "item-1", "MSV2200-24082");
  const response = store.checkBarcode("OD-1048", "item-2", "7801234567029");
  assert.equal(response.serial, false);
  assert.equal(isItemComplete(response.order.items[1]), true);
  assert.deepEqual(response.order.items[1].serials, []);
  assert.equal(getOrderProgress(response.order).checked, 4);
  assert.equal(getCurrentItem(response.order)?.id, "item-3");
});

test("empty and duplicate serials consume the barcode authorization", () => {
  for (const invalidSerial of ["", "   ", "MSV2200-24081"]) {
    const store = setup();
    store.checkBarcode("OD-1048", "item-1", "7801234567012");
    store.checkSerial("OD-1048", "item-1", "MSV2200-24081");
    store.checkBarcode("OD-1048", "item-1", "7801234567012");

    assert.throws(
      () => store.checkSerial("OD-1048", "item-1", invalidSerial),
      (error) => {
        assert.ok(error instanceof DispatchError);
        assert.ok(error.order);
        assert.equal(error.order.items[0].barcodeChecked, false);
        assert.deepEqual(error.order.items[0].serials, ["MSV2200-24081"]);
        error.order.items[0].barcodeChecked = true;
        error.order.items[0].serials.push("MUTATED");
        return true;
      },
    );
    const rejected = store.getOrder("OD-1048");
    assert.equal(rejected.items[0].barcodeChecked, false);
    assert.deepEqual(rejected.items[0].serials, ["MSV2200-24081"]);
    assert.deepEqual(getOrderProgress(rejected), { checked: 1, total: 5, percent: 20 });
    assert.throws(
      () => store.checkSerial("OD-1048", "item-1", "MSV2200-24082"),
      /Primero/,
    );

    store.checkBarcode("OD-1048", "item-1", "7801234567012");
    const accepted = store.checkSerial("OD-1048", "item-1", "MSV2200-24082").order;
    assert.equal(isItemComplete(accepted.items[0]), true);
    assert.equal(getCurrentItem(accepted)?.id, "item-2");
  }
});

test("a different product barcode revokes authorization without advancing the order", () => {
  const store = setup();
  store.checkBarcode("OD-1048", "item-1", "7801234567012");
  assert.throws(
    () => store.checkBarcode("OD-1048", "item-1", "7801234567029"),
    /Código incorrecto/,
  );
  const order = store.getOrder("OD-1048");
  assert.equal(order.items[0].barcodeChecked, false);
  assert.equal(getCurrentItem(order)?.id, "item-1");
  assert.equal(getOrderProgress(order).checked, 0);
  assert.throws(
    () => store.checkSerial("OD-1048", "item-1", "MSV2200-24081"),
    /Primero/,
  );
});

test("full sequential capture does not mark the backend order finalized", () => {
  const store = setup();
  while (getCurrentItem(store.getOrder(testOrder.id))) {
    const order = store.getOrder(testOrder.id);
    const item = getCurrentItem(order)!;
    if (item.requiresSerial && item.barcodeChecked) {
      store.checkSerial(order.id, item.id, `SN-${item.itemnum}-${item.serials.length + 1}`);
    } else {
      store.checkBarcode(order.id, item.id, item.barcode);
    }
  }
  const captured = store.getOrder(testOrder.id);
  assert.equal(getOrderProgress(captured).percent, 100);
  assert.equal(getOrderStatus(captured), "in_progress");
  assert.equal(captured.conformado, "En despacho");
});

test("unknown orders return an explicit 404", () => {
  const store = setup();
  assert.throws(
    () => store.getOrder("MISSING"),
    (error) => error instanceof DispatchError && error.status === 404,
  );
});

test("simultaneous requests cannot count the same serial twice", async () => {
  const store = setup();
  store.checkBarcode("OD-1048", "item-1", "7801234567012");
  const results = await Promise.allSettled([
    Promise.resolve().then(() => store.checkSerial("OD-1048", "item-1", "MSV2200-24081")),
    Promise.resolve().then(() => store.checkSerial("OD-1048", "item-1", "MSV2200-24081")),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(store.getOrder("OD-1048").items[0].serials.length, 1);
  assert.equal(store.getOrder("OD-1048").items[0].barcodeChecked, false);
});

test("simultaneous different serials cannot share a barcode authorization", async () => {
  const store = setup();
  store.checkBarcode("OD-1048", "item-1", "7801234567012");
  const results = await Promise.allSettled([
    Promise.resolve().then(() => store.checkSerial("OD-1048", "item-1", "MSV2200-24081")),
    Promise.resolve().then(() => store.checkSerial("OD-1048", "item-1", "MSV2200-24082")),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const order = store.getOrder("OD-1048");
  assert.equal(order.items[0].serials.length, 1);
  assert.equal(order.items[0].barcodeChecked, false);
  assert.equal(isItemComplete(order.items[0]), false);
  assert.equal(getCurrentItem(order)?.id, "item-1");
});
