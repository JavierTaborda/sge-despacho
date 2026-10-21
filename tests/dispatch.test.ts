/// <reference types="node" />

import { create, isAxiosError } from "axios";
import assert from "node:assert/strict";
import { test } from "node:test";

import { demoOrders } from "../src/data/demo-orders.ts";
import {
  createDispatchStore,
  DispatchError,
  getCurrentItem,
  getOrderProgress,
  getOrderStatus,
  isItemComplete,
} from "../src/domain/dispatch.ts";
import { mapBackendDispatchPayload } from "../src/services/backend-dispatch.ts";
import { createMockAdapter, getErrorOrder } from "../src/services/dispatch-api.ts";

function setup() {
  return createDispatchStore(demoOrders);
}

test("returns test orders without exposing expected serials or mutable internal state", () => {
  const store = setup();
  const orders = store.getOrders();
  assert.equal(orders.length, 4);
  assert.equal(getOrderStatus(orders[0]), "pending");
  assert.deepEqual(getOrderProgress(orders[0]), { checked: 0, total: 1, percent: 0 });
  assert.equal("expectedSerials" in orders[0].items[0], false);
  orders[0].items[0].barcodeChecked = true;
  orders[0].items[0].serials.push("INVALID");
  assert.equal(store.getOrder("OD-1048").items[0].barcodeChecked, false);
  assert.deepEqual(store.getOrder("OD-1048").items[0].serials, []);
});

test("maps cbpredes and mvpredes rows to dispatch orders", () => {
  const orders = mapBackendDispatchPayload({
    cbpredes: [{
      prednum: 603011,
      pednum: 946216,
      codcli: "COFR-20",
      codzon: "N01000",
      fecdesp: "2026-10-21",
    }],
    dtpredes: [{
      prednum: 603011,
      itemnum: 1,
      codart: "7590020007170",
      codbarra: "7590020007170",
      codalma: "01",
      manjser: 1,
      serial1: "SN-001",
      cantped: 1,
    }],
  });

  assert.equal(orders.length, 1);
  assert.equal(orders[0].id, "603011");
  assert.equal(orders[0].customer, "COFR-20");
  assert.equal(orders[0].items[0].id, "603011-1");
  assert.equal(orders[0].items[0].barcode, "7590020007170");
  assert.equal(orders[0].items[0].requiresSerial, true);
  assert.equal(orders[0].items[0].location, "01");
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
  assert.throws(() => store.completeOrder("OD-1048"), /todos/);
});

test("serial: true requires a fresh barcode for each unit and blocks the next line", () => {
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
  assert.equal(getOrderStatus(afterOne), "in_progress");
  assert.throws(() => store.checkBarcode("OD-1048", "item-2", "7801234567029"), /saltar/);
  assert.throws(() => store.checkSerial("OD-1048", "item-1", "MSV2200-24081"), /Primero/);
  store.checkBarcode("OD-1048", "item-1", "7801234567012");
  assert.throws(() => store.checkSerial("OD-1048", "item-1", "MSV2200-24082"), /ya fue registrado/);
  store.checkBarcode("OD-1048", "item-1", "7801234567012");
  assert.throws(() => store.checkSerial("OD-1048", "item-1", "BI500-77120"), /no pertenece/);
  store.checkBarcode("OD-1048", "item-1", "7801234567012");
  assert.throws(() => store.checkSerial("OD-1048", "item-1", ""), /escribe un serial/);
  store.checkBarcode("OD-1048", "item-1", "7801234567012");
  const afterTwo = store.checkSerial("OD-1048", "item-1", "MSV2200-24081").order;
  assert.equal(afterTwo.items[0].serials.length, 2);
  assert.equal(afterTwo.items[0].barcodeChecked, false);
  assert.equal(isItemComplete(afterTwo.items[0]), true);
  assert.equal(getCurrentItem(afterTwo)?.id, "item-2");
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
  assert.throws(() => store.completeOrder("OD-1048"), /todos/);
});

test("empty, foreign and duplicate serials consume the barcode authorization", () => {
  for (const invalidSerial of ["", "   ", "BI500-77120", "MSV2200-24081"]) {
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

test("demo suggestions alternate barcode and serial for units of the same product", () => {
  const store = setup();
  const codes: string[] = [];
  for (let scan = 0; scan < 4; scan += 1) {
    const order = store.getOrder("OD-1048");
    const item = getCurrentItem(order)!;
    const code = store.getDemoCode(order)!;
    codes.push(code);
    if (item.barcodeChecked) store.checkSerial(order.id, item.id, code);
    else store.checkBarcode(order.id, item.id, code);
  }
  assert.deepEqual(codes, [
    "7801234567012", "MSV2200-24081",
    "7801234567012", "MSV2200-24082",
  ]);
  assert.equal(getCurrentItem(store.getOrder("OD-1048"))?.id, "item-2");
});

test("full sequential flow, confirmation, idempotence, and completed order protection", () => {
  const store = setup();
  for (const seed of demoOrders) {
    while (getCurrentItem(store.getOrder(seed.id))) {
      const order = store.getOrder(seed.id);
      const item = getCurrentItem(order)!;
      const code = store.getDemoCode(order)!;
      if (item.barcodeChecked) store.checkSerial(order.id, item.id, code);
      else store.checkBarcode(order.id, item.id, code);
    }
    assert.equal(store.getDemoCode(store.getOrder(seed.id)), null);
    assert.equal(getOrderProgress(store.getOrder(seed.id)).percent, 100);
    assert.equal(getOrderStatus(store.getOrder(seed.id)), "in_progress");
    const complete = store.completeOrder(seed.id);
    assert.equal(getOrderStatus(complete), "completed");
    assert.ok(complete.completedAt);
    assert.equal(store.completeOrder(seed.id).completedAt, complete.completedAt);
    assert.throws(() => store.checkBarcode(seed.id, seed.items[0].id, seed.items[0].barcode), /ya fue despachada/);
    assert.throws(() => store.checkSerial(seed.id, seed.items[0].id, "ANY"), /ya fue despachada/);
  }
  assert.equal(store.getOrders().filter((order) => order.completedAt).length, 4);
});

test("unknown orders return an explicit 404", () => {
  const store = setup();
  assert.throws(
    () => store.getOrder("MISSING"),
    (error) => error instanceof DispatchError && error.status === 404,
  );
});

test("Axios mock handles real JSON-transformed requests and error responses", async () => {
  const store = setup();
  const api = create({ adapter: createMockAdapter(store, 0) });
  const list = await api.get("/ordenes-despacho");
  assert.equal(list.status, 200);
  assert.equal(list.data.orders.length, 4);
  const detail = await api.get("/ordenes-despacho/OD-1048");
  assert.equal(detail.data.order.id, "OD-1048");
  const scan = await api.post("/check-codigo-barra", {
    orderId: "OD-1048", itemId: "item-1", code: "7801234567012",
  });
  assert.equal(scan.data.serial, true);
  await assert.rejects(
    api.post("/check-serial", { orderId: "OD-1048", itemId: "item-1", code: "WRONG" }),
    (error) => {
      assert.ok(isAxiosError(error));
      assert.equal(error.response?.status, 422);
      const order = getErrorOrder(error);
      assert.equal(order?.id, "OD-1048");
      assert.equal(order?.items[0].barcodeChecked, false);
      assert.deepEqual(order?.items[0].serials, []);
      return true;
    },
  );
  await assert.rejects(
    api.post("/check-serial", { orderId: "OD-1048", itemId: "item-1", code: "MSV2200-24081" }),
    (error) => isAxiosError(error) && error.response?.status === 409,
  );
  await assert.rejects(
    api.post("/ordenes-despacho/OD-1048/confirmar"),
    (error) => isAxiosError(error) && error.response?.status === 409,
  );
  await assert.rejects(
    api.get("/missing"),
    (error) => isAxiosError(error) && error.response?.status === 404,
  );
  await assert.rejects(
    api.post("/check-codigo-barra", { orderId: "OD-1048" }),
    (error) => isAxiosError(error) && error.response?.status === 400,
  );
  await assert.rejects(
    api.post("/check-codigo-barra", "{invalid-json", { transformRequest: [(data) => data] }),
    (error) => isAxiosError(error) && error.response?.status === 400,
  );
});

test("simultaneous requests cannot count the same serial twice", async () => {
  const store = setup();
  store.checkBarcode("OD-1048", "item-1", "7801234567012");
  const api = create({ adapter: createMockAdapter(store, 0) });
  const results = await Promise.allSettled([
    api.post("/check-serial", { orderId: "OD-1048", itemId: "item-1", code: "MSV2200-24081" }),
    api.post("/check-serial", { orderId: "OD-1048", itemId: "item-1", code: "MSV2200-24081" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(store.getOrder("OD-1048").items[0].serials.length, 1);
  assert.equal(store.getOrder("OD-1048").items[0].barcodeChecked, false);
});

test("simultaneous different serials cannot share a barcode authorization", async () => {
  const store = setup();
  store.checkBarcode("OD-1048", "item-1", "7801234567012");
  const api = create({ adapter: createMockAdapter(store, 0) });
  const results = await Promise.allSettled([
    api.post("/check-serial", { orderId: "OD-1048", itemId: "item-1", code: "MSV2200-24081" }),
    api.post("/check-serial", { orderId: "OD-1048", itemId: "item-1", code: "MSV2200-24082" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const order = store.getOrder("OD-1048");
  assert.equal(order.items[0].serials.length, 1);
  assert.equal(order.items[0].barcodeChecked, false);
  assert.equal(isItemComplete(order.items[0]), false);
  assert.equal(getCurrentItem(order)?.id, "item-1");
});
