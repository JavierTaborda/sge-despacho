/// <reference types="node" />

import { AxiosError, AxiosHeaders } from "axios";
import type { AxiosAdapter } from "axios";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

import {
  DispatchError,
  getCurrentItem,
  getOrderProgress,
  getOrderStatus,
  isItemComplete,
  isOrderComplete,
} from "../src/domain/dispatch.ts";
import {
  getBackendOrderId,
  mapBackendDispatchDetail,
  mapBackendDispatchPayload,
  parseBackendDispatchOrders,
  parseBackendDispatchItems,
  parseBackendOrderId,
  type BackendDispatchItem,
  type BackendDispatchOrder,
} from "../src/services/backend-dispatch.ts";
import {
  createDispatchClient,
  getErrorMessage,
  getErrorOrder,
  normalizeBackendUrl,
} from "../src/services/dispatch-api.ts";

const header: BackendDispatchOrder = {
  prednum: 6242,
  pednum: 19665,
  conformado: "En despacho",
  fecdesp: "2026-10-23 09:32:56",
  fecfinalStr: null,
  fecfinal: null,
  duracion: null,
  co_cli: "00734",
  Cliente: "CLIENTE DE PRUEBA",
  co_zon: "0002",
  Zona: "TACHIRA",
  co_ven: "00004",
  Vendedor: "VENDEDOR DE PRUEBA",
  cantdesp: 9,
  owneruser: "operador01",
  supervisor: null,
};

const line: BackendDispatchItem = {
  prednum: 6242,
  pednum: 19665,
  itemnum: 1,
  rennum: 1,
  codalma: "0001",
  codart: "AVFR-12W",
  artdes: "AIRE DE VENTANA FRIGILUX",
  Articulo: "AVFR-12W - AIRE DE VENTANA FRIGILUX",
  refbarra: "7590020007163",
  compuesto: 0,
  manjser: true,
  codbarra: null,
  serial1: null,
  recouser: "operador01",
  supervisor: null,
  horacapture: null,
  changed: false,
  selected: false,
  objectstate: "None",
  objecticon: "sap-icon://None",
  lectura: null,
  objectstate2: "Warning",
};

const params = { prednum: 6242, pednum: 19665 };

function backendFixture(items: BackendDispatchItem[], orderHeader = header) {
  const requests: string[] = [];
  const basePath = `/api/dispatch/orders/${orderHeader.prednum}/${orderHeader.pednum}`;
  const adapter: AxiosAdapter = async (config) => {
    requests.push(`${config.method} ${config.url}`);
    assert.equal(config.method, "get");
    let data: unknown;
    if (config.url === "/api/dispatch/orders") data = [orderHeader];
    else if (config.url === basePath) data = orderHeader;
    else if (config.url === `${basePath}/items`) data = items;
    else throw new Error(`Unexpected request: ${config.url}`);
    return { data, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
  };
  return { client: createDispatchClient("https://api.example.test/api", adapter), requests };
}

test("list endpoint returns the exact shared header shape without items or a wrapper", async () => {
  const payload: BackendDispatchOrder[] = [{
    prednum: 6242,
    pednum: 19665,
    conformado: "En despacho",
    fecdesp: "2026-10-23 09:32:56",
    fecfinalStr: "string",
    fecfinal: "2026-10-27T20:12:55.646Z",
    duracion: "01:30:00",
    co_cli: "00734",
    Cliente: "string",
    co_zon: "0002",
    Zona: "TACHIRA",
    co_ven: "00004",
    Vendedor: "string",
    cantdesp: 9,
    owneruser: "43",
    supervisor: "string",
  }];
  const requests: string[] = [];
  const adapter: AxiosAdapter = async (config) => {
    requests.push(`${config.method} ${config.url}`);
    return { data: payload, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
  };
  const result = await createDispatchClient("https://api.example.test/api", adapter).getDispatchOrders();
  assert.deepEqual(result, payload);
  assert.deepEqual(requests, ["get /api/dispatch/orders"]);
  assert.equal(result[0].conformado, "En despacho");
  assert.equal(result[0].cantdesp, 9);
  assert.equal(result[0].owneruser, "43");
  assert.equal("items" in result[0], false);
  assert.equal("customer" in result[0], false);
  assert.equal("id" in result[0], false);
});

test("list parser returns separate headers and preserves nulls and an empty array", () => {
  assert.deepEqual(parseBackendDispatchOrders([header]), [header]);
  assert.deepEqual(parseBackendDispatchOrders([]), []);
  const result = parseBackendDispatchOrders([{ ...header, Cliente: null, Zona: null, Vendedor: null }]);
  assert.equal(result[0].Cliente, null);
  assert.equal(result[0].Zona, null);
  assert.equal(result[0].Vendedor, null);
  assert.equal(result[0].supervisor, null);
  result[0].Cliente = "Modificado";
  assert.equal(header.Cliente, "CLIENTE DE PRUEBA");
});

test("item endpoint accepts the exact shared array and sends Accept application/json", async () => {
  const payload: BackendDispatchItem[] = [{
    prednum: 6242,
    itemnum: 1,
    pednum: 19665,
    rennum: 1,
    codalma: "0001",
    codart: "AVFR-12W",
    artdes: "string",
    Articulo: "AVFR-12W - AIRE DE VENTANA FRIGILUX 12.000BTU",
    refbarra: "7590020007163",
    compuesto: 0,
    manjser: true,
    codbarra: "string",
    serial1: "string",
    recouser: "0",
    supervisor: "string",
    horacapture: null,
    changed: false,
    selected: false,
    objectstate: "None",
    objecticon: "sap-icon://None",
    lectura: "Sin serial",
    objectstate2: "Warning",
  }];
  const requests: string[] = [];
  const adapter: AxiosAdapter = async (config) => {
    requests.push(`${config.method} ${config.url}`);
    assert.equal(config.headers.get("Accept"), "application/json");
    return { data: payload, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
  };
  const result = await createDispatchClient("https://api.example.test/api", adapter)
    .getDispatchOrderItems("6242-19665");
  assert.deepEqual(result, payload);
  assert.deepEqual(requests, ["get /api/dispatch/orders/6242/19665/items"]);
  assert.equal("items" in result, false);
  assert.equal("name" in result[0], false);
  const mapped = mapBackendDispatchDetail(header, params, result).items[0];
  assert.equal(mapped.name, payload[0].Articulo);
  assert.equal(mapped.barcode, "7590020007163");
  assert.equal(mapped.compuesto, 0);
  assert.equal(mapped.requiresSerial, true);
  assert.equal(mapped.lectura, "Sin serial");
  assert.equal(mapped.recouser, "0");
  assert.equal(mapped.supervisor, "string");
  assert.equal(mapped.changed, false);
  assert.equal(mapped.selected, false);
  assert.equal(mapped.objectstate, "None");
  assert.equal(mapped.objecticon, "sap-icon://None");
  assert.equal(mapped.objectstate2, "Warning");
});

test("item parser preserves duplicate products as distinct rows, order and null values", () => {
  const payload: BackendDispatchItem[] = [
    { ...line, itemnum: 7, artdes: null, refbarra: null, codbarra: null, serial1: null },
    { ...line, itemnum: 2 },
  ];
  assert.deepEqual(parseBackendDispatchItems(payload, params), payload);
  assert.deepEqual(parseBackendDispatchItems([], params), []);
  const result = parseBackendDispatchItems(payload, params);
  result[0].Articulo = "Modificado";
  assert.equal(payload[0].Articulo, line.Articulo);
});

test("item endpoint rejects malformed wrappers and rows from a different order", async () => {
  for (const payload of [
    { items: [line] },
    [line, line],
    [{ ...line, pednum: 19666 }],
    [{ ...line, manjser: "true" }],
    [{ ...line, compuesto: false }],
    [{ ...line, recouser: 0 }],
  ]) {
    const adapter: AxiosAdapter = async (config) => ({
      data: payload, status: 200, statusText: "OK", headers: new AxiosHeaders(), config,
    });
    await assert.rejects(
      createDispatchClient("https://api.example.test", adapter).getDispatchOrderItems("6242-19665"),
      (error) => error instanceof DispatchError && error.status === 502,
    );
  }
});

test("maps the raw header array, preserves string users and distinguishes unloaded items", () => {
  const [order] = mapBackendDispatchPayload([header]);
  assert.equal(order.id, "6242-19665");
  assert.equal(order.customer, header.Cliente);
  assert.equal(order.codcli, "00734");
  assert.equal(order.address, "TACHIRA");
  assert.equal(order.vendedor, header.Vendedor);
  assert.equal(order.owneruser, "operador01");
  assert.equal(order.supervisor, "");
  assert.equal(order.cantdesp, 9);
  assert.equal(order.itemsLoaded, false);
  assert.deepEqual(order.items, []);
  assert.equal(order.conformado, "En despacho");
  assert.equal(isOrderComplete(order), false);
});

test("uses conformado rather than nullable or inconsistent completion dates", () => {
  const [completed] = mapBackendDispatchPayload([{
    ...header, conformado: "Finalizado", duracion: "00:12:34",
  }]);
  assert.equal(completed.completedAt, null);
  assert.equal(completed.duracion, "00:12:34");
  assert.equal(isOrderComplete(completed), true);
  assert.equal(getOrderStatus(completed), "completed");
  assert.equal(getCurrentItem(completed), undefined);
  const [open] = mapBackendDispatchPayload([{ ...header, fecfinal: "2026-10-23T12:00:00Z" }]);
  assert.equal(isOrderComplete(open), false);
});

test("maps null display fields without discarding identifiers or replacing user names", () => {
  const [order] = mapBackendDispatchPayload([{
    ...header, Cliente: null, Zona: null, Vendedor: null, supervisor: "jefe01",
  }]);
  assert.equal(order.customer, "00734");
  assert.equal(order.address, "0002");
  assert.equal(order.vendedor, "00004");
  assert.equal(order.supervisor, "jefe01");
});

test("uses prednum and pednum together for order and item identity", () => {
  const orders = mapBackendDispatchPayload([header, { ...header, pednum: 19666 }]);
  assert.notEqual(orders[0].id, orders[1].id);
  assert.deepEqual(parseBackendOrderId(getBackendOrderId(params)), params);
  for (const id of ["6242", "6242-abc", "-1-2", "1.5-2", "9007199254740992-1"]) {
    assert.throws(() => parseBackendOrderId(id), DispatchError);
  }
});

test("maps each API row as one unit and preserves exact server sequence", () => {
  const order = mapBackendDispatchDetail(header, params, [
    { ...line, itemnum: 7 },
    { ...line, itemnum: 2 },
    { ...line, itemnum: 8, codart: "OTRO", refbarra: "222" },
  ]);
  assert.equal(order.itemsLoaded, true);
  assert.deepEqual(order.items.map((item) => item.itemnum), [7, 2, 8]);
  assert.deepEqual(order.items.map((item) => item.quantity), [1, 1, 1]);
  assert.equal(order.items[0].id, "6242-19665-7");
  assert.equal(order.items[0].name, line.Articulo);
  assert.equal(order.items[0].location, "0001");
  assert.equal(order.items[0].requiresSerial, true);
  assert.equal(getOrderProgress(order).total, 3);
  assert.equal(getCurrentItem(order)?.itemnum, 7);
});

test("keeps refbarra separate from captured codbarra and restores captured serials", () => {
  const order = mapBackendDispatchDetail(header, params, [
    { ...line, codbarra: "CAPTURADO", serial1: "SN-001", horacapture: "2026-10-23 10:00:00" },
    { ...line, itemnum: 2, codbarra: "7590020007163", serial1: null },
    { ...line, itemnum: 3, refbarra: null, codbarra: "NO-ES-REFERENCIA" },
  ]);
  assert.equal(order.items[0].barcode, "7590020007163");
  assert.equal(order.items[0].codbarra, "CAPTURADO");
  assert.deepEqual(order.items[0].serials, ["SN-001"]);
  assert.equal(order.items[0].horacapture, "2026-10-23 10:00:00");
  assert.equal(order.items[0].recouser, "operador01");
  assert.equal(isItemComplete(order.items[0]), true);
  assert.equal(isItemComplete(order.items[1]), false);
  assert.equal(order.items[1].barcodeChecked, false);
  assert.equal(order.items[2].barcode, "");
  assert.equal(getCurrentItem(order)?.itemnum, 2);
  assert.equal(getOrderProgress(order).checked, 1);
});

test("Sin serial is not a capture, and manjser is authoritative", () => {
  const order = mapBackendDispatchDetail(header, params, [
    { ...line, manjser: false, lectura: "Sin serial" },
    { ...line, itemnum: 2, manjser: false, lectura: "Sin serial", codbarra: line.refbarra },
  ]);
  assert.equal(order.items[0].requiresSerial, false);
  assert.equal(isItemComplete(order.items[0]), false);
  assert.equal(isItemComplete(order.items[1]), true);
  assert.equal(getOrderProgress(order).checked, 1);
});

test("accepts genuinely empty arrays but rejects invalid payloads explicitly", () => {
  assert.deepEqual(mapBackendDispatchPayload([]), []);
  const empty = mapBackendDispatchDetail(header, params, []);
  assert.equal(empty.itemsLoaded, true);
  assert.deepEqual(empty.items, []);
  for (const invalid of [null, {}, { orders: [header] }, { cbpredes: [header] }, [null], [{ ...header, conformado: "Otro" }]]) {
    assert.throws(() => mapBackendDispatchPayload(invalid), DispatchError);
  }
  assert.throws(() => mapBackendDispatchPayload([{ ...header, owneruser: 1 }]), /owneruser/);
  assert.throws(() => mapBackendDispatchPayload([{ ...header, prednum: "6242" }]), /prednum/);
  assert.throws(() => mapBackendDispatchDetail(header, params, null), /lista de artículos/);
  assert.throws(() => mapBackendDispatchDetail(header, params, [{ ...line, manjser: 1 }]), /manjser/);
});

test("rejects mismatched order keys and duplicates instead of mixing orders or quantities", () => {
  assert.throws(() => mapBackendDispatchDetail({ ...header, pednum: 7 }, params, []), /diferente/);
  assert.throws(() => mapBackendDispatchDetail(header, params, [{ ...line, pednum: 7 }]), /otra orden/);
  assert.throws(() => mapBackendDispatchDetail(header, params, [line, line]), /itemnum duplicado/);
  assert.throws(() => mapBackendDispatchPayload([header, header]), /orden duplicada/);
});

test("normalizes API origins and /api suffixes without losing reverse proxy prefixes", () => {
  assert.equal(normalizeBackendUrl(" https://api.example.test/api/ "), "https://api.example.test");
  assert.equal(normalizeBackendUrl("https://api.example.test/"), "https://api.example.test");
  assert.equal(normalizeBackendUrl("https://api.example.test/mobile/api"), "https://api.example.test/mobile");
  for (const url of ["not-a-url", "file:///tmp/api", "https://api.example.test?key=value", "https://api.example.test/#hash"]) {
    assert.throws(() => normalizeBackendUrl(url), DispatchError);
  }
});

test("real client calls the three exact GET endpoints without N+1 list requests or duplicate /api", async (t) => {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/dispatch/orders") {
      res.end(JSON.stringify([header]));
    } else if (req.url === "/api/dispatch/orders/6242/19665") {
      res.end(JSON.stringify(header));
    } else if (req.url === "/api/dispatch/orders/6242/19665/items") {
      res.end(JSON.stringify([line]));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ message: "Ruta incorrecta" }));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  for (const baseURL of [origin, `${origin}/api/`]) {
    requests.length = 0;
    const client = createDispatchClient(baseURL);
    const [order] = await client.getDispatchOrders();
    assert.deepEqual(requests, ["GET /api/dispatch/orders"]);
    assert.deepEqual(order, header);
    const detail = await client.getDispatchOrder(getBackendOrderId(order));
    assert.equal(detail.items.length, 1);
    assert.equal(detail.prednum, 6242);
    assert.equal(detail.pednum, 19665);
    assert.deepEqual([...requests].sort(), [
      "GET /api/dispatch/orders",
      "GET /api/dispatch/orders/6242/19665",
      "GET /api/dispatch/orders/6242/19665/items",
    ]);
  }
});

test("backend blocks confirmation and rejects scans of unloaded orders without HTTP writes", async () => {
  let requests = 0;
  const adapter: AxiosAdapter = async (config) => {
    requests += 1;
    return { data: [], status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
  };
  const client = createDispatchClient("https://api.example.test/api", adapter);
  assert.equal(client.isBackendMode, true);
  assert.equal(client.canWriteDispatch, false);
  const [order] = mapBackendDispatchPayload([header]);
  assert.equal(client.getDemoCode(order), null);
  for (const promise of [
    client.checkBarcode(order.id, "1", "123"),
    client.checkSerial(order.id, "1", "SN"),
  ]) {
    await assert.rejects(promise, (error) =>
      error instanceof DispatchError && error.status === 404);
  }
  await assert.rejects(client.completeDispatch(order.id), (error) =>
    error instanceof DispatchError && error.status === 405 && /capturas son locales/.test(error.message));
  await assert.rejects(client.getDispatchOrder("6242"), /prednum y pednum/);
  await assert.rejects(client.getDispatchOrderItems("6242"), /prednum y pednum/);
  assert.equal(requests, 0);
});

test("backend local scans fill codbarra and serial1 in exact sequence without sending writes", async () => {
  const payload = [
    { ...line, itemnum: 7 },
    { ...line, itemnum: 2 },
    { ...line, itemnum: 9, manjser: false, lectura: "Sin serial" as const },
  ];
  const { client, requests } = backendFixture(payload);
  const order = await client.getDispatchOrder("6242-19665");
  const [first, second, third] = order.items;
  assert.deepEqual(order.items.map((item) => item.itemnum), [7, 2, 9]);
  assert.equal(client.canWriteDispatch, false);
  assert.equal(client.getDemoCode(order), null);
  await assert.rejects(client.checkBarcode(order.id, second.id, second.barcode), /saltar/);
  await assert.rejects(client.checkSerial(order.id, first.id, "SN-001"), /Primero/);
  await assert.rejects(client.checkBarcode(order.id, first.id, "OTRO-CODIGO"), /Código incorrecto/);

  const checked = await client.checkBarcode(order.id, first.id, ` ${first.barcode}\r\n`);
  assert.equal(checked.valid, true);
  assert.equal(checked.serial, true);
  assert.equal(checked.order.items[0].codbarra, first.barcode);
  assert.equal(checked.order.items[0].serial1, null);
  assert.equal(getCurrentItem(checked.order)?.id, first.id);

  const captured = (await client.checkSerial(order.id, first.id, " sn-001\r\n")).order;
  assert.equal(captured.items[0].serial1, "SN-001");
  assert.deepEqual(captured.items[0].serials, ["SN-001"]);
  assert.equal(captured.items[0].barcodeChecked, false);
  assert.ok(captured.items[0].horacapture);
  assert.equal(Number.isNaN(Date.parse(captured.items[0].horacapture)), false);
  assert.equal(captured.items[0].recouser, line.recouser);
  assert.equal(captured.items[0].changed, false);
  assert.equal(getCurrentItem(captured)?.id, second.id);
  await assert.rejects(client.checkSerial(order.id, first.id, "SN-REPETIDO"), /saltar/);

  await client.checkBarcode(order.id, second.id, second.barcode);
  await assert.rejects(client.checkSerial(order.id, second.id, "sn-001"), (error) => {
    assert.match(getErrorMessage(error), /ya fue registrado/);
    const updated = getErrorOrder(error);
    assert.equal(updated?.items[1].barcodeChecked, false);
    assert.equal(updated?.items[1].serial1, null);
    return true;
  });
  await assert.rejects(client.checkSerial(order.id, second.id, "SN-002"), /Primero/);
  await client.checkBarcode(order.id, second.id, second.barcode);
  const afterSecond = (await client.checkSerial(order.id, second.id, "SN-002")).order;
  assert.equal(getCurrentItem(afterSecond)?.id, third.id);

  const last = await client.checkBarcode(order.id, third.id, third.barcode);
  assert.equal(last.serial, false);
  assert.equal(last.order.items[2].codbarra, third.barcode);
  assert.equal(last.order.items[2].serial1, null);
  assert.ok(last.order.items[2].horacapture);
  assert.deepEqual(getOrderProgress(last.order), { checked: 3, total: 3, percent: 100 });
  assert.equal(getCurrentItem(last.order), undefined);
  assert.equal(last.order.conformado, "En despacho");
  assert.equal(last.order.fecfinal, null);
  await assert.rejects(client.completeDispatch(order.id), /capturas son locales/);
  assert.equal((await client.getDispatchOrders())[0].conformado, "En despacho");
  assert.equal((await client.getDispatchOrderItems(order.id))[0].serial1, null);
  assert.equal(payload[0].serial1, null);
  assert.deepEqual(requests, [
    "get /api/dispatch/orders/6242/19665",
    "get /api/dispatch/orders/6242/19665/items",
    "get /api/dispatch/orders",
    "get /api/dispatch/orders/6242/19665/items",
  ]);
});

test("local drafts survive returning to the detail but not a new app session", async () => {
  const { client, requests } = backendFixture([line, { ...line, itemnum: 2 }]);
  const original = await client.getDispatchOrder("6242-19665");
  const first = original.items[0];
  await client.checkBarcode(original.id, first.id, first.barcode);
  const scanned = (await client.checkSerial(original.id, first.id, "LOCAL-001")).order;
  scanned.items[0].serial1 = "MUTATED";
  scanned.items[0].serials.push("MUTATED");
  const reopened = await client.getDispatchOrder(original.id);
  assert.equal(reopened.items[0].serial1, "LOCAL-001");
  assert.deepEqual(reopened.items[0].serials, ["LOCAL-001"]);
  assert.equal(getCurrentItem(reopened)?.itemnum, 2);
  assert.equal(requests.length, 2);

  const { client: newSession } = backendFixture([line, { ...line, itemnum: 2 }]);
  const reloaded = await newSession.getDispatchOrder(original.id);
  assert.equal(reloaded.items[0].serial1, null);
  assert.equal(getOrderProgress(reloaded).checked, 0);
});

test("concurrent detail loads do not overwrite a captured local serial with stale data", async () => {
  let releaseItems: (() => void) | undefined;
  const delayedItems = new Promise<void>((resolve) => { releaseItems = resolve; });
  let itemRequests = 0;
  const adapter: AxiosAdapter = async (config) => {
    const isItems = config.url?.endsWith("/items");
    if (isItems && ++itemRequests === 2) await delayedItems;
    return {
      data: isItems ? [line] : header,
      status: 200, statusText: "OK", headers: new AxiosHeaders(), config,
    };
  };
  const client = createDispatchClient("https://api.example.test", adapter);
  const firstLoad = client.getDispatchOrder("6242-19665");
  const secondLoad = client.getDispatchOrder("6242-19665");
  const order = await firstLoad;
  await client.checkBarcode(order.id, order.items[0].id, order.items[0].barcode);
  await client.checkSerial(order.id, order.items[0].id, "LOCAL-001");
  assert.ok(releaseItems);
  releaseItems();
  assert.equal((await secondLoad).items[0].serial1, "LOCAL-001");
});

test("existing captures cannot authorize a fresh serial or be duplicated by local scans", async () => {
  const { client } = backendFixture([
    { ...line, serial1: "existing-sn", codbarra: line.refbarra },
    { ...line, itemnum: 2, codbarra: line.refbarra },
  ]);
  const order = await client.getDispatchOrder("6242-19665");
  const current = order.items[1];
  assert.equal(getCurrentItem(order)?.id, current.id);
  assert.equal(current.codbarra, line.refbarra);
  assert.equal(current.barcodeChecked, false);
  await assert.rejects(client.checkSerial(order.id, current.id, "NEW-SN"), /Primero/);
  await client.checkBarcode(order.id, current.id, current.barcode);
  await assert.rejects(client.checkSerial(order.id, current.id, "EXISTING-SN"), /ya fue registrado/);
  await client.checkBarcode(order.id, current.id, current.barcode);
  await assert.rejects(client.checkSerial(order.id, current.id, " \r\n"), /escribe un serial/);
  await assert.rejects(client.checkSerial(order.id, current.id, "NEW-SN"), /Primero/);
  assert.deepEqual((await client.getDispatchOrder(order.id)).items[0].serials, ["existing-sn"]);
});

test("local scanning rejects missing barcode references and finalized orders", async () => {
  const { client } = backendFixture([{ ...line, refbarra: null }]);
  const order = await client.getDispatchOrder("6242-19665");
  for (const code of ["", "7590020007163"]) {
    await assert.rejects(client.checkBarcode(order.id, order.items[0].id, code), /refbarra/);
  }
  assert.equal((await client.getDispatchOrder(order.id)).items[0].serial1, null);
  const { client: finished } = backendFixture([line], { ...header, conformado: "Finalizado" });
  const finalized = await finished.getDispatchOrder(order.id);
  await assert.rejects(finished.checkBarcode(order.id, finalized.items[0].id, "123"), /ya fue despachada/);
  await assert.rejects(finished.checkSerial(order.id, finalized.items[0].id, "SN"), /ya fue despachada/);
});

test("detail errors propagate instead of creating an empty or completed order", async () => {
  const adapter: AxiosAdapter = async (config) => {
    if (config.url?.endsWith("/items")) {
      throw new AxiosError("No se pudieron cargar los artículos");
    }
    return { data: header, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
  };
  await assert.rejects(
    createDispatchClient("https://api.example.test", adapter).getDispatchOrder("6242-19665"),
    /No se pudieron cargar los artículos/,
  );
});

test("surfaces API message bodies for HTTP errors", () => {
  const error = new AxiosError("Request failed with status code 401");
  error.response = {
    data: { message: "Sesión vencida" },
    status: 401,
    statusText: "Unauthorized",
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
  assert.equal(getErrorMessage(error), "Sesión vencida");
});

test("unset backend configuration preserves the working demo and its write capabilities", async () => {
  const client = createDispatchClient("  ");
  assert.equal(client.isBackendMode, false);
  assert.equal(client.canWriteDispatch, true);
  const orders = await client.getDispatchOrders();
  assert.equal(orders.length, 2);
  assert.equal(orders[0].cantdesp, 9);
  assert.equal("items" in orders[0], false);
  const detail = await client.getDispatchOrder(getBackendOrderId(orders[0]));
  assert.equal(detail.itemsLoaded, true);
  assert.equal(detail.items.length, 9);
  assert.ok(client.getDemoCode(detail));
  const items = await client.getDispatchOrderItems(getBackendOrderId(orders[0]));
  assert.equal(items.length, 9);
  assert.equal(items[0].itemnum, 1);
  assert.equal(items[0].compuesto, 0);
  assert.equal(items[0].Articulo, detail.items[0].name);
  assert.equal(items[0].refbarra, detail.items[0].barcode);
  assert.equal(items[0].codbarra, null);
  assert.equal(items[0].serial1, null);
  assert.equal("quantity" in items[0], false);
  assert.equal("requiresSerial" in items[0], false);
  await assert.rejects(client.getDispatchOrderItems("9999-9999"), /No encontramos/);
});
