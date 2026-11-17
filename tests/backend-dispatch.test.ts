/// <reference types="node" />

import type { AxiosAdapter } from "axios";
import { AxiosError, AxiosHeaders, create } from "axios";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

import {
    DispatchError,
    getCurrentItem,
    getOrderProgress,
    getOrderStatus,
    getPendingSerialItem,
    isItemComplete,
    isOrderComplete,
} from "../src/domain/dispatch.ts";
import {
    getBackendOrderId,
    mapBackendDispatchDetail,
    mapBackendDispatchPayload,
    parseBackendDispatchItems,
    parseBackendDispatchOrders,
    parseBackendNoSerialBarcodes,
    parseBackendOrderId,
    type BackendDispatchItem,
    type BackendDispatchOrder,
} from "../src/services/backend-dispatch.ts";
import {
    createDispatchClient,
    createDispatchService,
    getErrorMessage,
    getErrorOrder,
    normalizeBackendUrl,
} from "../src/services/dispatch-api.ts";
import {
  createDispatchDraftStorage,
  type DraftKeyValueStorage,
} from "../src/features/despacho/services/dispatch-draft-storage.ts";

function scopedFixture() {
  let epoch = 0;
  const adapter: AxiosAdapter = async (config) => ({
    data: config.url === "/api/dispatch/list" ? []
      : config.url === "/api/dispatch/orders" ? [header]
      : config.url?.endsWith("/items") ? [line] : header,
    status: 200, statusText: "OK", headers: new AxiosHeaders(), config,
  });
  const api = create({ adapter });
  return {
    client: createDispatchService(api, { getSessionScope: () => epoch }),
    changeSession: () => { epoch++; },
  };
}

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

function backendFixture(
  items: BackendDispatchItem[],
  orderHeader = header,
  noSerialBarcodes: string[] = [],
  options?: Parameters<typeof createDispatchService>[1],
) {
  const requests: string[] = [];
  const basePath = `/api/dispatch/orders/${orderHeader.prednum}/${orderHeader.pednum}`;
  const adapter: AxiosAdapter = async (config) => {
    requests.push(`${config.method} ${config.url}`);
    assert.equal(config.method, "get");
    let data: unknown;
    if (config.url === "/api/dispatch/orders") data = [orderHeader];
    else if (config.url === "/api/dispatch/list") data = noSerialBarcodes;
    else if (config.url === basePath) data = orderHeader;
    else if (config.url === `${basePath}/items`) data = items;
    else throw new Error(`Unexpected request: ${config.url}`);
    return { data, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
  };
  return {
    client: options
      ? createDispatchService(create({ adapter }), options)
      : createDispatchClient("https://api.example.test/api", adapter),
    requests,
  };
}

function memoryDraftStorage() {
  const values = new Map<string, string>();
  const storage: DraftKeyValueStorage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
  return { values, storage, drafts: createDispatchDraftStorage(storage) };
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

test("no-serial list parser trims, deduplicates and rejects invalid entries", () => {
  assert.deepEqual(
    parseBackendNoSerialBarcodes([" 07590020007163 ", "07590020007163", ""]),
    ["07590020007163"],
  );
  assert.deepEqual(parseBackendNoSerialBarcodes([]), []);
  for (const payload of [null, {}, ["123", 456]]) {
    assert.throws(() => parseBackendNoSerialBarcodes(payload), DispatchError);
  }
});

test("no-serial list endpoint requests /api/dispatch/list", async () => {
  const requests: string[] = [];
  const adapter: AxiosAdapter = async (config) => {
    requests.push(`${config.method} ${config.url}`);
    return {
      data: ["07590020007163"],
      status: 200,
      statusText: "OK",
      headers: new AxiosHeaders(),
      config,
    };
  };
  const client = createDispatchClient("https://api.example.test/api", adapter);
  assert.deepEqual(await client.getNoSerialBarcodes(), ["07590020007163"]);
  assert.deepEqual(requests, ["get /api/dispatch/list"]);
});

test("barcodes in the no-serial list skip serial capture even when manjser is true", async () => {
  let submitted: unknown;
  const basePath = `/api/dispatch/orders/${header.prednum}/${header.pednum}`;
  const adapter: AxiosAdapter = async (config) => {
    let data: unknown;
    if (config.method === "post" && config.url === "/api/dispatch/orders/predispatch") {
      submitted = JSON.parse(String(config.data));
      data = null;
    } else if (config.method === "get") {
      data = config.url === "/api/dispatch/list" ? [line.refbarra]
        : config.url?.endsWith("/items") ? [line] : header;
    } else {
      throw new Error(`Unexpected request: ${config.method} ${config.url}`);
    }
    return { data, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
  };
  const client = createDispatchClient("https://api.example.test", adapter);
  const order = await client.getDispatchOrder("6242-19665");
  assert.equal(order.items[0].requiresSerial, false);

  const result = await client.checkBarcode(order.id, order.items[0].id, line.refbarra!);
  assert.equal(result.serial, false);
  assert.equal(isItemComplete(result.order.items[0]), true);
  assert.equal(getCurrentItem(result.order), undefined);
  const captureTime = result.order.items[0].horacapture;
  assert.ok(captureTime);
  assert.equal(Number.isNaN(Date.parse(captureTime)), false);

  await client.submitPredispatch(result.order);
  assert.ok(submitted && typeof submitted === "object" && "items" in submitted);
  assert.ok(Array.isArray(submitted.items));
  assert.equal(submitted.items[0].horacapture, captureTime);
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

test("submits the complete predispatch payload with captured barcode and serial", async () => {
  let submitted: unknown;
  const basePath = `/api/dispatch/orders/${header.prednum}/${header.pednum}`;
  const adapter: AxiosAdapter = async (config) => {
    if (config.method === "get" && config.url === basePath) {
      return { data: header, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
    }
    if (config.method === "get" && config.url === `${basePath}/items`) {
      return { data: [line], status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
    }
    if (config.method === "get" && config.url === "/api/dispatch/list") {
      return { data: [], status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
    }
    if (config.method === "post" && config.url === "/api/dispatch/orders/predispatch") {
      submitted = JSON.parse(String(config.data));
      return { data: null, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
    }
    throw new Error(`Unexpected request: ${config.method} ${config.url}`);
  };
  const client = createDispatchClient("https://api.example.test", adapter);
  const order = await client.getDispatchOrder("6242-19665");
  const barcodeResult = await client.checkBarcode(order.id, order.items[0].id, line.refbarra!);
  const serialResult = await client.checkSerial(order.id, order.items[0].id, "SERIAL-001");
  await client.submitPredispatch(serialResult.order);

  assert.deepEqual(submitted, {
    ...header,
    items: [{
      ...line,
      codbarra: line.refbarra,
      serial1: "SERIAL-001",
      horacapture: serialResult.order.items[0].horacapture,
    }],
  });
  assert.equal(barcodeResult.serial, true);
});

test("existing backend serials make the order ready to submit without rescanning", async () => {
  const capturedLine = {
    ...line,
    codbarra: line.refbarra,
    serial1: "EXISTING-SN",
    horacapture: "2026-10-23 10:00:00",
  };
  let submitted: unknown;
  const adapter: AxiosAdapter = async (config) => {
    let data: unknown;
    if (config.method === "post" && config.url === "/api/dispatch/orders/predispatch") {
      submitted = JSON.parse(String(config.data));
      data = null;
    } else if (config.method === "get") {
      data = config.url === "/api/dispatch/list" ? []
        : config.url?.endsWith("/items") ? [capturedLine] : header;
    } else {
      throw new Error(`Unexpected request: ${config.method} ${config.url}`);
    }
    return { data, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
  };
  const client = createDispatchClient("https://api.example.test", adapter);
  const order = await client.getDispatchOrder("6242-19665");
  assert.equal(order.items.every(isItemComplete), true);
  assert.equal(getCurrentItem(order), undefined);
  assert.equal(getPendingSerialItem(order), undefined);
  assert.deepEqual(getOrderProgress(order), { checked: 1, total: 1, percent: 100 });
  assert.equal(isOrderComplete(order), false);

  await client.submitPredispatch(order);
  assert.deepEqual(submitted, { ...header, items: [capturedLine] });
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

test("counts existing serials as captured while leaving missing and blank serials pending", () => {
  const order = mapBackendDispatchDetail(header, params, [
    { ...line, codbarra: "CAPTURADO", serial1: " SN-001 ", horacapture: "2026-10-23 10:00:00" },
    { ...line, itemnum: 2, codbarra: "7590020007163", serial1: null },
    { ...line, itemnum: 3, refbarra: null, codbarra: "NO-ES-REFERENCIA" },
    { ...line, itemnum: 4, serial1: " \r\n " },
    { ...line, itemnum: 5, serial1: "SN-005" },
  ]);
  assert.equal(order.items[0].barcode, "7590020007163");
  assert.equal(order.items[0].codbarra, "CAPTURADO");
  assert.equal(order.items[0].serial1, " SN-001 ");
  assert.deepEqual(order.items[0].serials, ["SN-001"]);
  assert.equal(order.items[0].horacapture, "2026-10-23 10:00:00");
  assert.equal(order.items[0].recouser, "operador01");
  assert.equal(isItemComplete(order.items[0]), true);
  assert.equal(order.items[0].barcodeChecked, false);
  assert.equal(isItemComplete(order.items[1]), false);
  assert.equal(order.items[1].barcodeChecked, false);
  assert.equal(order.items[2].barcode, "");
  assert.deepEqual(order.items[3].serials, []);
  assert.equal(isItemComplete(order.items[3]), false);
  assert.equal(isItemComplete(order.items[4]), true);
  assert.equal(getCurrentItem(order)?.itemnum, 2);
  assert.equal(getPendingSerialItem(order), undefined);
  assert.deepEqual(getOrderProgress(order), { checked: 2, total: 5, percent: 40 });
});

test("no-serial list alone determines serial capture, and Sin serial is not a capture", () => {
  const withoutNoSerialList = mapBackendDispatchDetail(header, params, [
    { ...line, manjser: false, lectura: "Sin serial" },
    { ...line, itemnum: 2, manjser: false, lectura: "Sin serial", codbarra: line.refbarra },
  ]);
  assert.equal(withoutNoSerialList.items[0].requiresSerial, true);
  assert.equal(withoutNoSerialList.items[1].requiresSerial, true);
  assert.equal(withoutNoSerialList.items[1].barcodeChecked, false);
  assert.equal(isItemComplete(withoutNoSerialList.items[0]), false);
  assert.equal(isItemComplete(withoutNoSerialList.items[1]), false);

  const withNoSerialList = mapBackendDispatchDetail(
    header,
    params,
    [{ ...line, manjser: true, lectura: "Sin serial", codbarra: line.refbarra }],
    new Set([line.refbarra!]),
  );
  assert.equal(withNoSerialList.items[0].requiresSerial, false);
  assert.equal(withNoSerialList.items[0].barcodeChecked, true);
  assert.equal(isItemComplete(withNoSerialList.items[0]), true);
  assert.equal(getOrderProgress(withNoSerialList).checked, 1);
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

test("real client calls the exact GET endpoints without N+1 list requests or duplicate /api", async (t) => {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/dispatch/orders") {
      res.end(JSON.stringify([header]));
    } else if (req.url === "/api/dispatch/list") {
      res.end(JSON.stringify([]));
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
      "GET /api/dispatch/list",
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
  assert.equal(typeof client.getDispatchOrders, "function");
  const [order] = mapBackendDispatchPayload([header]);
  for (const promise of [
    client.checkBarcode(order.id, "1", "123"),
    client.checkSerial(order.id, "1", "SN"),
  ]) {
    await assert.rejects(promise, (error) =>
      error instanceof DispatchError && error.status === 404);
  }
  await assert.rejects(client.completeDispatch(order.id), (error) =>
    error instanceof DispatchError && error.status === 405 && /no incluye un endpoint para finalizar/.test(error.message));
  await assert.rejects(client.getDispatchOrder("6242"), /prednum y pednum/);
  await assert.rejects(client.getDispatchOrderItems("6242"), /prednum y pednum/);
  assert.equal(requests, 0);
});

test("backend local scans accept random barcode order and serialize each item", async () => {
  const payload = [
    { ...line, itemnum: 7 },
    { ...line, itemnum: 2 },
    { ...line, itemnum: 9, refbarra: "BARCODE-NO-SERIAL", manjser: false, lectura: "Sin serial" as const },
  ];
  const { client, requests } = backendFixture(payload, header, ["BARCODE-NO-SERIAL"]);
  const order = await client.getDispatchOrder("6242-19665");
  const [first, second, third] = order.items;
  assert.deepEqual(order.items.map((item) => item.itemnum), [7, 2, 9]);
  await assert.rejects(client.checkSerial(order.id, second.id, "SN-002"), /Primero/);
  await assert.rejects(client.checkBarcode(order.id, first.id, "OTRO-CODIGO"), /Código incorrecto/);

  const checked = await client.checkBarcode(order.id, second.id, ` ${second.barcode}\r\n`);
  assert.equal(checked.valid, true);
  assert.equal(checked.serial, true);
  assert.equal(checked.order.items[1].codbarra, second.barcode);
  assert.equal(checked.order.items[1].serial1, null);
  assert.equal(getCurrentItem(checked.order)?.id, first.id);
  await assert.rejects(client.checkBarcode(order.id, first.id, first.barcode), /Completa el serial/);

  const capturedSecond = (await client.checkSerial(order.id, second.id, " sn-002\r\n")).order;
  assert.equal(capturedSecond.items[1].serial1, "SN-002");
  assert.deepEqual(capturedSecond.items[1].serials, ["SN-002"]);
  assert.equal(capturedSecond.items[1].barcodeChecked, false);
  assert.ok(capturedSecond.items[1].horacapture);
  assert.equal(Number.isNaN(Date.parse(capturedSecond.items[1].horacapture)), false);
  assert.equal(capturedSecond.items[1].recouser, line.recouser);
  assert.equal(capturedSecond.items[1].changed, false);
  assert.equal(getCurrentItem(capturedSecond)?.id, first.id);

  await client.checkBarcode(order.id, first.id, first.barcode);
  await assert.rejects(client.checkSerial(order.id, first.id, "sn-002"), (error) => {
    assert.match(getErrorMessage(error), /ya fue registrado/);
    const updated = getErrorOrder(error);
    assert.ok(updated);
    assert.equal(updated.items[0].barcodeChecked, true);
    assert.equal(updated.items[0].serial1, null);
    return true;
  });
  const capturedFirst = (await client.checkSerial(order.id, first.id, "SN-001")).order;
  assert.equal(capturedFirst.items[0].serial1, "SN-001");
  assert.equal(getCurrentItem(capturedFirst)?.id, third.id);

  const last = await client.checkBarcode(order.id, third.id, third.barcode);
  assert.equal(last.serial, false);
  assert.equal(last.order.items[2].codbarra, third.barcode);
  assert.equal(last.order.items[2].serial1, null);
  assert.ok(last.order.items[2].horacapture);
  assert.deepEqual(getOrderProgress(last.order), { checked: 3, total: 3, percent: 100 });
  assert.equal(getCurrentItem(last.order), undefined);
  assert.equal(last.order.conformado, "En despacho");
  assert.equal(last.order.fecfinal, null);
  await assert.rejects(client.completeDispatch(order.id), /no incluye un endpoint para finalizar/);
  assert.equal((await client.getDispatchOrders())[0].conformado, "En despacho");
  assert.equal((await client.getDispatchOrderItems(order.id))[0].serial1, null);
  assert.equal(payload[0].serial1, null);
  assert.deepEqual(requests, [
    "get /api/dispatch/orders/6242/19665",
    "get /api/dispatch/orders/6242/19665/items",
    "get /api/dispatch/list",
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
  assert.equal(requests.length, 3);

  const { client: newSession } = backendFixture([line, { ...line, itemnum: 2 }]);
  const reloaded = await newSession.getDispatchOrder(original.id);
  assert.equal(reloaded.items[0].serial1, null);
  assert.equal(getOrderProgress(reloaded).checked, 0);
});

test("discarding local captures resets codes, serials and pending authorization without changing server captures", async () => {
  const { client, requests } = backendFixture([
    line,
    { ...line, itemnum: 2, refbarra: "NO-SERIAL" },
    { ...line, itemnum: 3 },
    { ...line, itemnum: 4, codbarra: line.refbarra, serial1: "SERVER-SN" },
    { ...line, itemnum: 5, refbarra: "SERVER-FREE", codbarra: "SERVER-FREE" },
  ], header, ["NO-SERIAL", "SERVER-FREE"]);
  const original = await client.getDispatchOrder("6242-19665");
  await client.checkBarcode(original.id, original.items[0].id, original.items[0].barcode);
  await client.checkSerial(original.id, original.items[0].id, "LOCAL-SN");
  await client.checkBarcode(original.id, original.items[1].id, original.items[1].barcode);
  await client.checkBarcode(original.id, original.items[2].id, original.items[2].barcode);
  requests.length = 0;

  const reset = await client.discardDispatchCaptures(original.id);
  assert.deepEqual(reset, original);
  assert.deepEqual(await client.getDispatchOrder(original.id), original);
  assert.equal(getPendingSerialItem(reset), undefined);
  assert.equal(getOrderProgress(reset).checked, 2);
  assert.equal(await client.hasLocalCaptures(), false);
  assert.deepEqual(requests, []);
  await assert.rejects(client.checkSerial(reset.id, reset.items[0].id, "LOCAL-SN"), /Primero/);
  await client.checkBarcode(reset.id, reset.items[0].id, reset.items[0].barcode);
  const recaptured = await client.checkSerial(reset.id, reset.items[0].id, "LOCAL-SN");
  assert.equal(recaptured.order.items[0].serial1, "LOCAL-SN");
});

test("discarding one persistent order leaves other orders' drafts intact after reopening", async () => {
  const { storage, values } = memoryDraftStorage();
  const otherHeader = { ...header, pednum: 19666 };
  const adapter: AxiosAdapter = async (config) => {
    assert.equal(config.method, "get");
    const orderHeader = config.url?.includes("/6242/19666") ? otherHeader : header;
    const data = config.url === "/api/dispatch/list" ? []
      : config.url?.endsWith("/items") ? [{ ...line, pednum: orderHeader.pednum }] : orderHeader;
    return { data, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
  };
  const newClient = () => createDispatchService(create({ adapter }), {
    draftStorage: createDispatchDraftStorage(storage),
    getDraftOwner: () => "operator-a",
  });
  const client = newClient();
  const first = await client.getDispatchOrder("6242-19665");
  const second = await client.getDispatchOrder("6242-19666");
  for (const [order, serial] of [[first, "LOCAL-A"], [second, "LOCAL-B"]] as const) {
    await client.checkBarcode(order.id, order.items[0].id, order.items[0].barcode);
    await client.checkSerial(order.id, order.items[0].id, serial);
  }
  await client.discardDispatchCaptures(first.id);

  const reopened = newClient();
  assert.equal((await reopened.getDispatchOrder(first.id)).items[0].serial1, null);
  assert.equal((await reopened.getDispatchOrder(second.id)).items[0].serial1, "LOCAL-B");
  assert.equal(await reopened.hasLocalCaptures(), true);
  await reopened.discardDispatchCaptures(second.id);
  assert.equal(values.size, 0);
  assert.equal(await newClient().hasLocalCaptures(), false);
});

test("failed persistent discard reports the error and can retry the saved draft removal", async () => {
  const { storage, drafts, values } = memoryDraftStorage();
  const { client } = backendFixture([line], header, [], {
    draftStorage: drafts, getDraftOwner: () => "operator-a",
  });
  const original = await client.getDispatchOrder("6242-19665");
  await client.checkBarcode(original.id, original.items[0].id, original.items[0].barcode);
  await client.checkSerial(original.id, original.items[0].id, "LOCAL-SN");
  const remove = storage.removeItem;
  storage.removeItem = async () => { throw new Error("Disk unavailable"); };

  await assert.rejects(client.discardDispatchCaptures(original.id), (error: unknown) => {
    assert.match(getErrorMessage(error), /No pudimos guardar/);
    assert.deepEqual(getErrorOrder(error), original);
    return true;
  });
  assert.equal(values.size, 1);
  assert.ok(drafts.status.getState().error);
  storage.removeItem = remove;
  const retry = drafts.status.getState().retry;
  assert.ok(retry);
  await retry();
  assert.equal(values.size, 0);
  const { client: reopened } = backendFixture([line], header, [], {
    draftStorage: createDispatchDraftStorage(storage), getDraftOwner: () => "operator-a",
  });
  assert.equal(await reopened.hasLocalCaptures(), false);
});

test("discarding captures waits for an ongoing refresh and restores its latest server values", async () => {
  let releaseItems: (() => void) | undefined;
  const delayedItems = new Promise<void>((resolve) => { releaseItems = resolve; });
  let itemRequests = 0;
  const serverItem = { ...line };
  const adapter: AxiosAdapter = async (config) => {
    const isItems = config.url?.endsWith("/items");
    if (isItems && ++itemRequests === 2) await delayedItems;
    const data = config.url === "/api/dispatch/orders" ? [header]
      : config.url === "/api/dispatch/list" ? [] : isItems ? [serverItem] : header;
    return { data, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
  };
  const client = createDispatchClient("https://api.example.test", adapter);
  const original = await client.getDispatchOrder("6242-19665");
  await client.checkBarcode(original.id, original.items[0].id, original.items[0].barcode);
  await client.checkSerial(original.id, original.items[0].id, "LOCAL-SN");
  serverItem.serial1 = "SERVER-FRESH";
  const refresh = client.refreshDispatchOrders();
  const cancel = client.discardDispatchCaptures(original.id);
  assert.ok(releaseItems);
  releaseItems();
  const [, reset] = await Promise.all([refresh, cancel]);

  assert.equal(reset.items[0].serial1, "SERVER-FRESH");
  assert.deepEqual(reset.items[0].serials, ["SERVER-FRESH"]);
  assert.equal(await client.hasLocalCaptures(), false);
});

test("discarding captures rejects unknown or finalized orders", async () => {
  const { client } = backendFixture(
    [{ ...line, serial1: "SERVER-SN" }], { ...header, conformado: "Finalizado" },
  );
  await assert.rejects(client.discardDispatchCaptures("6242-19665"), { status: 404 });
  const original = await client.getDispatchOrder("6242-19665");
  await assert.rejects(client.discardDispatchCaptures(original.id), { status: 409 });
  assert.deepEqual(await client.getDispatchOrder(original.id), original);
});

test("persistent drafts restore completed captures and pending serials after reopening the app", async () => {
  const { storage, drafts } = memoryDraftStorage();
  const serverHeader = { ...header };
  const serverItems = [
    { ...line },
    { ...line, itemnum: 2, refbarra: "NO-SERIAL" },
    { ...line, itemnum: 3 },
    { ...line, itemnum: 4, serial1: "SERVER-SN" },
  ];
  const options = { draftStorage: drafts, getDraftOwner: () => "operator-a" };
  const { client } = backendFixture(serverItems, serverHeader, ["NO-SERIAL"], options);
  const original = await client.getDispatchOrder("6242-19665");
  assert.equal(await client.hasLocalCaptures(), false);
  await client.checkBarcode(original.id, original.items[0].id, original.items[0].barcode);
  const captured = (await client.checkSerial(original.id, original.items[0].id, "LOCAL-SN")).order;
  await client.checkBarcode(original.id, original.items[1].id, original.items[1].barcode);
  await client.checkBarcode(original.id, original.items[2].id, original.items[2].barcode);

  const { client: reopened, requests } = backendFixture(
    serverItems, serverHeader, ["NO-SERIAL"],
    { ...options, draftStorage: createDispatchDraftStorage(storage) },
  );
  assert.equal(await reopened.hasLocalCaptures(), true);
  const restored = await reopened.getDispatchOrder(original.id);
  assert.equal(restored.items[0].serial1, "LOCAL-SN");
  assert.equal(restored.items[0].horacapture, captured.items[0].horacapture);
  assert.equal(isItemComplete(restored.items[1]), true);
  assert.equal(getPendingSerialItem(restored)?.itemnum, 3);
  assert.deepEqual(requests, []);

  serverHeader.Cliente = "CLIENTE ACTUALIZADO";
  serverItems[3].serial1 = null;
  await reopened.refreshDispatchOrders();
  const { client: reopenedAgain } = backendFixture(serverItems, serverHeader, ["NO-SERIAL"], {
    ...options, draftStorage: createDispatchDraftStorage(storage),
  });
  const refreshed = await reopenedAgain.getDispatchOrder(original.id);
  assert.equal(refreshed.customer, "CLIENTE ACTUALIZADO");
  assert.equal(refreshed.items[0].serial1, "LOCAL-SN");
  assert.equal(refreshed.items[3].serial1, null);
  assert.equal(getPendingSerialItem(refreshed)?.itemnum, 3);
  const continued = await reopenedAgain.checkSerial(original.id, restored.items[2].id, "CONTINUED-SN");
  assert.equal(continued.order.items[2].serial1, "CONTINUED-SN");
});

test("5000-item drafts stay compact and preserve captures, refresh and cancellation after reopening", async () => {
  const { storage, drafts, values } = memoryDraftStorage();
  const items = Array.from({ length: 5000 }, (_, index) => ({
    ...line, itemnum: index + 1, rennum: index + 1,
    refbarra: String(1000000000000 + index),
  }));
  items[0].serial1 = "SERVER-SN";
  const noSerial = [items[2500].refbarra];
  const options = { draftStorage: drafts, getDraftOwner: () => "operator-a" };
  const { client } = backendFixture(items, header, noSerial, options);
  const original = await client.getDispatchOrder("6242-19665");
  const last = original.items[4999];
  await client.checkBarcode(original.id, last.id, last.barcode);
  await client.checkSerial(original.id, last.id, "LOCAL-LAST-SN");
  await client.checkBarcode(original.id, original.items[2500].id, original.items[2500].barcode);
  await client.checkBarcode(original.id, original.items[4998].id, original.items[4998].barcode);
  const bytes = Buffer.byteLength([...values.values()][0], "utf8");
  assert.ok(bytes < 1024 * 1024, `A sparse 5000-item draft used ${bytes} bytes`);

  const { client: reopened } = backendFixture(items, header, noSerial, {
    ...options, draftStorage: createDispatchDraftStorage(storage),
  });
  const restored = await reopened.getDispatchOrder(original.id);
  assert.deepEqual(restored.items.map((item) => item.id), original.items.map((item) => item.id));
  assert.equal(restored.items[0].serial1, "SERVER-SN");
  assert.equal(restored.items[4999].serial1, "LOCAL-LAST-SN");
  assert.equal(getOrderProgress(restored).checked, 3);
  assert.equal(getPendingSerialItem(restored)?.itemnum, 4999);
  assert.deepEqual(restored.items[1234], original.items[1234]);
  await reopened.refreshDispatchOrders();
  const { client: refreshed } = backendFixture(items, header, noSerial, {
    ...options, draftStorage: createDispatchDraftStorage(storage),
  });
  const continued = await refreshed.checkSerial(original.id, restored.items[4998].id, "RESUMED-SN");
  assert.equal(continued.order.items[4998].serial1, "RESUMED-SN");
  assert.equal(continued.order.items[4999].serial1, "LOCAL-LAST-SN");
  const reset = await refreshed.discardDispatchCaptures(original.id);
  assert.deepEqual(reset, original);
  assert.equal(values.size, 0);
});

test("legacy persistent drafts resume pending serials and migrate without losing the server baseline", async () => {
  const { storage, values } = memoryDraftStorage();
  const key = "sge-despacho:drafts:v1:operator-a";
  values.set(key, JSON.stringify({
    version: 1,
    drafts: [{
      original: { header, items: [line], noSerialBarcodes: [], pendingSerialIds: [] },
      captured: {
        header, items: [{ ...line, codbarra: line.refbarra }],
        noSerialBarcodes: [], pendingSerialIds: ["6242-19665-1"],
      },
    }],
  }));
  const options = {
    getDraftOwner: () => "operator-a", draftStorage: createDispatchDraftStorage(storage),
  };
  const { client } = backendFixture([line], header, [], options);
  const restored = await client.getDispatchOrder("6242-19665");
  assert.equal(getPendingSerialItem(restored)?.id, restored.items[0].id);
  const captured = (await client.checkSerial(restored.id, restored.items[0].id, "MIGRATED-SN")).order;
  const { client: reopened } = backendFixture([line], header, [], {
    ...options, draftStorage: createDispatchDraftStorage(storage),
  });
  assert.deepEqual(await reopened.getDispatchOrder(restored.id), captured);
  const reset = await reopened.discardDispatchCaptures(restored.id);
  assert.equal(reset.items[0].serial1, null);
  assert.equal(reset.items[0].codbarra, null);
  assert.equal(values.size, 0);
});

test("invalid compact captures are reported without overwriting the persistent draft", async () => {
  const validCapture = [1, line.refbarra, null, null, true];
  for (const invalidCaptures of [
    [validCapture, validCapture],
    [[999, line.refbarra, null, null, true]],
    [[1, null, null, null, true]],
  ]) {
    const { drafts, storage, values } = memoryDraftStorage();
    const options = { getDraftOwner: () => "operator-a", draftStorage: drafts };
    const { client } = backendFixture([line], header, [], options);
    const order = await client.getDispatchOrder("6242-19665");
    await client.checkBarcode(order.id, order.items[0].id, order.items[0].barcode);
    const key = [...values.keys()][0];
    const saved: { drafts: { captures: unknown[] }[] } = JSON.parse(values.get(key)!);
    saved.drafts[0].captures = invalidCaptures;
    const invalid = JSON.stringify(saved);
    values.set(key, invalid);
    const restoredStorage = createDispatchDraftStorage(storage);
    const { client: reopened } = backendFixture([line], header, [], {
      ...options, draftStorage: restoredStorage,
    });
    await assert.rejects(reopened.getDispatchOrder(order.id), /No pudimos restaurar tus capturas/);
    assert.ok(restoredStorage.status.getState().error);
    assert.equal(values.get(key), invalid);
  }
});

test("server-only captures do not create persistent drafts or require refresh confirmation", async () => {
  const { values, drafts } = memoryDraftStorage();
  const { client } = backendFixture([{ ...line, serial1: "SERVER-SN" }], header, [], {
    draftStorage: drafts, getDraftOwner: () => "operator-a",
  });
  await client.getDispatchOrder("6242-19665");
  assert.equal(await client.hasLocalCaptures(), false);
  assert.equal(values.size, 0);
});

test("storage write failures retain the capture in memory, report it and allow retry", async () => {
  const { storage, values, drafts } = memoryDraftStorage();
  const { client } = backendFixture([line], header, [], {
    draftStorage: drafts, getDraftOwner: () => "operator-a",
  });
  const original = await client.getDispatchOrder("6242-19665");
  const write = storage.setItem;
  storage.setItem = async () => { throw new Error("Disk unavailable"); };
  await assert.rejects(
    client.checkBarcode(original.id, original.items[0].id, original.items[0].barcode),
    (error: unknown) => {
      assert.match(getErrorMessage(error), /No pudimos guardar/);
      assert.equal(getErrorOrder(error)?.items[0].barcodeChecked, true);
      return true;
    },
  );
  assert.equal(values.size, 0);
  assert.match(drafts.status.getState().error ?? "", /antes de cerrar la app/);
  assert.equal(await client.hasLocalCaptures(), true);

  storage.setItem = write;
  const retry = drafts.status.getState().retry;
  assert.ok(retry);
  await retry();
  assert.equal(drafts.status.getState().error, null);
  const { client: reopened } = backendFixture([line], header, [], {
    draftStorage: createDispatchDraftStorage(storage), getDraftOwner: () => "operator-a",
  });
  assert.equal(getPendingSerialItem(await reopened.getDispatchOrder(original.id))?.id, original.items[0].id);
});

test("a stale storage retry cannot overwrite a more recent successful capture", async () => {
  const { storage, drafts } = memoryDraftStorage();
  const options = { draftStorage: drafts, getDraftOwner: () => "operator-a" };
  const { client } = backendFixture([line], header, [], options);
  const original = await client.getDispatchOrder("6242-19665");
  const write = storage.setItem;
  storage.setItem = async () => { throw new Error("Disk unavailable"); };
  await assert.rejects(
    client.checkBarcode(original.id, original.items[0].id, original.items[0].barcode),
    /No pudimos guardar/,
  );
  const staleRetry = drafts.status.getState().retry;
  assert.ok(staleRetry);
  storage.setItem = write;
  await client.checkSerial(original.id, original.items[0].id, "NEWER-SN");
  await staleRetry();

  const { client: reopened } = backendFixture([line], header, [], {
    ...options, draftStorage: createDispatchDraftStorage(storage),
  });
  assert.equal((await reopened.getDispatchOrder(original.id)).items[0].serial1, "NEWER-SN");
});

test("invalid saved data is reported without overwriting it and restoration can be retried", async () => {
  const { storage, values, drafts } = memoryDraftStorage();
  const options = { draftStorage: drafts, getDraftOwner: () => "operator-a" };
  const { client } = backendFixture([line], header, [], options);
  const original = await client.getDispatchOrder("6242-19665");
  await client.checkBarcode(original.id, original.items[0].id, original.items[0].barcode);
  const [[key, saved]] = [...values];
  values.set(key, "invalid-json");

  const newStorage = createDispatchDraftStorage(storage);
  const { client: reopened, requests } = backendFixture([line], header, [], {
    ...options, draftStorage: newStorage,
  });
  await assert.rejects(reopened.getDispatchOrder(original.id), /No pudimos restaurar/);
  assert.equal(values.get(key), "invalid-json");
  assert.deepEqual(requests, []);
  values.set(key, saved);
  assert.equal(await reopened.hasLocalCaptures(), true);
  assert.equal(newStorage.status.getState().error, null);
});

test("persistent drafts are isolated by user and logout removes the previous user's data", async () => {
  const { drafts } = memoryDraftStorage();
  let owner = "operator-a";
  let epoch = 0;
  const { client } = backendFixture([line], header, [], {
    draftStorage: drafts, getDraftOwner: () => owner, getSessionScope: () => epoch,
  });
  const original = await client.getDispatchOrder("6242-19665");
  await client.checkBarcode(original.id, original.items[0].id, original.items[0].barcode);
  await client.checkSerial(original.id, original.items[0].id, "PRIVATE-SN");
  owner = "operator-b";
  epoch++;
  client.clearCaptures();
  await drafts.clear("operator-a");

  assert.equal(await client.hasLocalCaptures(), false);
  assert.equal((await client.getDispatchOrder(original.id)).items[0].serial1, null);
  assert.deepEqual(await drafts.load("operator-a"), []);
});

test("logout cleanup is queued after pending writes so they cannot restore deleted drafts", async () => {
  const { storage, drafts, values } = memoryDraftStorage();
  let owner: string | null = "operator-a";
  let epoch = 0;
  const { client } = backendFixture([line], header, [], {
    draftStorage: drafts, getDraftOwner: () => owner, getSessionScope: () => epoch,
  });
  const original = await client.getDispatchOrder("6242-19665");
  let releaseWrite: (() => void) | undefined;
  let startedWrite: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => { releaseWrite = resolve; });
  const started = new Promise<void>((resolve) => { startedWrite = resolve; });
  const write = storage.setItem;
  storage.setItem = async (key, value) => {
    startedWrite?.();
    await blocked;
    await write(key, value);
  };
  const pending = client.checkBarcode(original.id, original.items[0].id, original.items[0].barcode);
  await started;
  owner = null;
  epoch++;
  client.clearCaptures();
  const cleanup = drafts.clear("operator-a");
  assert.ok(releaseWrite);
  releaseWrite();
  await Promise.all([pending, cleanup]);
  assert.equal(values.size, 0);
});

test("a draft restoration from an old session cannot repopulate the new user's cache", async () => {
  const { storage, drafts } = memoryDraftStorage();
  const { client: initial } = backendFixture([line], header, [], {
    draftStorage: drafts, getDraftOwner: () => "operator-a",
  });
  const original = await initial.getDispatchOrder("6242-19665");
  await initial.checkBarcode(original.id, original.items[0].id, original.items[0].barcode);
  let owner = "operator-a";
  let epoch = 0;
  let releaseRead: (() => void) | undefined;
  let startedRead: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => { releaseRead = resolve; });
  const started = new Promise<void>((resolve) => { startedRead = resolve; });
  const read = storage.getItem;
  storage.getItem = async (key) => {
    startedRead?.();
    await blocked;
    return read(key);
  };
  const { client } = backendFixture([line], header, [], {
    draftStorage: drafts, getDraftOwner: () => owner, getSessionScope: () => epoch,
  });
  const pending = client.getDispatchOrder(original.id);
  const rejected = assert.rejects(pending, /La sesión cambió/);
  await started;
  owner = "operator-b";
  epoch++;
  client.clearCaptures();
  assert.ok(releaseRead);
  releaseRead();
  await rejected;
  assert.equal(await client.hasLocalCaptures(), false);
});

test("successful submission clears persistent drafts and cleanup failures never repeat the POST", async () => {
  const { storage, drafts, values } = memoryDraftStorage();
  let posts = 0;
  const adapter: AxiosAdapter = async (config) => {
    if (config.method === "post") posts++;
    const data = config.url === "/api/dispatch/list" ? []
      : config.url?.endsWith("/items") ? [line] : header;
    return { data, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
  };
  const client = createDispatchService(create({ adapter }), {
    draftStorage: drafts, getDraftOwner: () => "operator-a",
  });
  const original = await client.getDispatchOrder("6242-19665");
  await client.checkBarcode(original.id, original.items[0].id, original.items[0].barcode);
  const captured = await client.checkSerial(original.id, original.items[0].id, "LOCAL-SN");
  assert.equal(values.size, 1);
  const remove = storage.removeItem;
  storage.removeItem = async () => { throw new Error("Disk unavailable"); };
  await client.submitPredispatch(captured.order);
  assert.equal(posts, 1);
  assert.equal(await client.hasLocalCaptures(), false);
  assert.match(drafts.status.getState().error ?? "", /El predespacho ya se envió/);
  storage.removeItem = remove;
  const retry = drafts.status.getState().retry;
  assert.ok(retry);
  await retry();
  assert.equal(values.size, 0);
  assert.equal(posts, 1);
  assert.equal(drafts.status.getState().error, null);
});

test("full refresh updates server data and serial rules while preserving only local captures", async () => {
  const serverHeader = { ...header };
  const serverItems = [
    { ...line },
    { ...line, itemnum: 2 },
    { ...line, itemnum: 3, refbarra: "NO-SERIAL" },
    { ...line, itemnum: 4, serial1: "OLD-SERVER" },
    { ...line, itemnum: 5 },
  ];
  const noSerialBarcodes = ["NO-SERIAL"];
  const { client, requests } = backendFixture(serverItems, serverHeader, noSerialBarcodes);
  const original = await client.getDispatchOrder("6242-19665");
  await client.checkBarcode(original.id, original.items[0].id, original.items[0].barcode);
  const captured = (await client.checkSerial(original.id, original.items[0].id, "LOCAL-SN")).order;
  await client.checkBarcode(original.id, original.items[2].id, original.items[2].barcode);
  await client.checkBarcode(original.id, original.items[1].id, original.items[1].barcode);

  serverHeader.Cliente = "CLIENTE ACTUALIZADO";
  serverHeader.cantdesp = 12;
  serverItems[0].Articulo = "DESCRIPCIÓN ACTUALIZADA";
  serverItems[0].codalma = "0002";
  serverItems[3].serial1 = "NEW-SERVER";
  serverItems.splice(4, 1, { ...line, itemnum: 6, refbarra: "NEW-NO-SERIAL" });
  noSerialBarcodes.push("NEW-NO-SERIAL");
  requests.length = 0;

  assert.deepEqual(await client.refreshDispatchOrders(), [serverHeader]);
  const refreshed = await client.getDispatchOrder(original.id);
  assert.equal(refreshed.customer, "CLIENTE ACTUALIZADO");
  assert.equal(refreshed.cantdesp, 12);
  assert.equal(refreshed.items[0].name, "DESCRIPCIÓN ACTUALIZADA");
  assert.equal(refreshed.items[0].location, "0002");
  assert.equal(refreshed.items[0].serial1, "LOCAL-SN");
  assert.deepEqual(refreshed.items[0].serials, ["LOCAL-SN"]);
  assert.equal(refreshed.items[0].horacapture, captured.items[0].horacapture);
  assert.equal(getPendingSerialItem(refreshed)?.itemnum, 2);
  assert.equal(refreshed.items[2].codbarra, "NO-SERIAL");
  assert.equal(isItemComplete(refreshed.items[2]), true);
  assert.equal(refreshed.items[3].serial1, "NEW-SERVER");
  assert.equal(refreshed.items[4].itemnum, 6);
  assert.equal(refreshed.items[4].requiresSerial, false);
  assert.deepEqual(requests.sort(), [
    "get /api/dispatch/list",
    "get /api/dispatch/orders",
    "get /api/dispatch/orders/6242/19665",
    "get /api/dispatch/orders/6242/19665/items",
  ]);

  serverItems[3].serial1 = null;
  serverHeader.conformado = "Finalizado";
  await client.refreshDispatchOrders();
  const finalized = await client.getDispatchOrder(original.id);
  assert.equal(finalized.conformado, "Finalizado");
  assert.equal(finalized.items[0].serial1, "LOCAL-SN");
  assert.equal(finalized.items[3].serial1, null);
  assert.deepEqual(finalized.items[3].serials, []);
  await assert.rejects(
    client.checkBarcode(finalized.id, finalized.items[1].id, finalized.items[1].barcode),
    /ya fue despachada/,
  );
});

test("refresh reloads every cached order and shares a single no-serial request", async () => {
  const headers = [header, { ...header, prednum: 6243, pednum: 19666 }];
  const requests: string[] = [];
  const adapter: AxiosAdapter = async (config) => {
    requests.push(`${config.method} ${config.url}`);
    const order = headers.find((entry) =>
      config.url?.startsWith(`/api/dispatch/orders/${entry.prednum}/${entry.pednum}`),
    );
    const data = config.url === "/api/dispatch/orders" ? headers
      : config.url === "/api/dispatch/list" ? []
      : order && config.url?.endsWith("/items")
        ? [{ ...line, prednum: order.prednum, pednum: order.pednum }] : order;
    return { data, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
  };
  const client = createDispatchClient("https://api.example.test", adapter);
  for (const order of headers) await client.getDispatchOrder(getBackendOrderId(order));
  headers[1] = { ...headers[1], Cliente: "OTRO CLIENTE ACTUALIZADO" };
  requests.length = 0;

  assert.deepEqual(await client.refreshDispatchOrders(), headers);
  assert.equal((await client.getDispatchOrder("6243-19666")).customer, "OTRO CLIENTE ACTUALIZADO");
  assert.equal(requests.filter((request) => request === "get /api/dispatch/list").length, 1);
  assert.equal(requests.length, 6);
});

test("refresh handles an empty list without requesting unopened details", async () => {
  const requests: string[] = [];
  const adapter: AxiosAdapter = async (config) => {
    requests.push(`${config.method} ${config.url}`);
    return { data: [], status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
  };
  const client = createDispatchClient("https://api.example.test", adapter);
  assert.deepEqual(await client.refreshDispatchOrders(), []);
  assert.deepEqual(requests.sort(), ["get /api/dispatch/list", "get /api/dispatch/orders"]);
});

test("failed refresh reports errors, retains drafts and can be retried", async () => {
  const serverHeader = { ...header };
  const serverItems = [{ ...line }];
  const { client } = backendFixture(serverItems, serverHeader);
  const original = await client.getDispatchOrder("6242-19665");
  await client.checkBarcode(original.id, original.items[0].id, original.items[0].barcode);
  await client.checkSerial(original.id, original.items[0].id, "LOCAL-SN");
  serverHeader.Cliente = "CLIENTE ACTUALIZADO";
  serverItems.push({ ...line });

  await assert.rejects(client.refreshDispatchOrders(), /itemnum duplicado/);
  const retained = await client.getDispatchOrder(original.id);
  assert.equal(retained.customer, header.Cliente);
  assert.equal(retained.items[0].serial1, "LOCAL-SN");
  serverItems.pop();
  await client.refreshDispatchOrders();
  const retried = await client.getDispatchOrder(original.id);
  assert.equal(retried.customer, "CLIENTE ACTUALIZADO");
  assert.equal(retried.items[0].serial1, "LOCAL-SN");
});

test("refresh refuses to discard captures when their item is removed or replaced", async () => {
  for (const replacement of [[], [{ ...line, refbarra: "REPLACEMENT" }]]) {
    const serverItems = [{ ...line }];
    const { client } = backendFixture(serverItems);
    const original = await client.getDispatchOrder("6242-19665");
    await client.checkBarcode(original.id, original.items[0].id, original.items[0].barcode);
    await client.checkSerial(original.id, original.items[0].id, "LOCAL-SN");
    serverItems.splice(0, serverItems.length, ...replacement);

    await assert.rejects(client.refreshDispatchOrders(), /cambió en el servidor/);
    assert.equal((await client.getDispatchOrder(original.id)).items[0].serial1, "LOCAL-SN");
  }
});

test("overlapping refreshes share requests and detail reads wait for updated data", async () => {
  let releaseItems: (() => void) | undefined;
  const delayedItems = new Promise<void>((resolve) => { releaseItems = resolve; });
  let itemRequests = 0;
  const serverHeader = { ...header };
  const adapter: AxiosAdapter = async (config) => {
    const isItems = config.url?.endsWith("/items");
    if (isItems && ++itemRequests === 2) await delayedItems;
    const data = config.url === "/api/dispatch/orders" ? [serverHeader]
      : config.url === "/api/dispatch/list" ? [] : isItems ? [line] : serverHeader;
    return { data, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
  };
  const client = createDispatchClient("https://api.example.test", adapter);
  const original = await client.getDispatchOrder("6242-19665");
  serverHeader.Cliente = "CLIENTE ACTUALIZADO";
  const firstRefresh = client.refreshDispatchOrders();
  const secondRefresh = client.refreshDispatchOrders();
  const reopened = client.getDispatchOrder(original.id);
  assert.ok(releaseItems);
  releaseItems();

  await Promise.all([firstRefresh, secondRefresh]);
  assert.equal((await reopened).customer, "CLIENTE ACTUALIZADO");
  assert.equal(itemRequests, 2);
});

test("a detail request started before refresh cannot restore stale cached data", async () => {
  let releaseItems: (() => void) | undefined;
  const delayedItems = new Promise<void>((resolve) => { releaseItems = resolve; });
  let itemRequests = 0;
  const serverHeader = { ...header };
  const adapter: AxiosAdapter = async (config) => {
    const isItems = config.url?.endsWith("/items");
    const data = config.url === "/api/dispatch/orders" ? [{ ...serverHeader }]
      : config.url === "/api/dispatch/list" ? [] : isItems ? [line] : { ...serverHeader };
    if (isItems && ++itemRequests === 1) await delayedItems;
    return { data, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
  };
  const client = createDispatchClient("https://api.example.test", adapter);
  const pending = client.getDispatchOrder("6242-19665");
  const rejected = assert.rejects(pending, /Los datos se actualizaron/);
  serverHeader.Cliente = "CLIENTE ACTUALIZADO";
  await client.refreshDispatchOrders();
  assert.ok(releaseItems);
  releaseItems();
  await rejected;
  assert.equal((await client.getDispatchOrder("6242-19665")).customer, "CLIENTE ACTUALIZADO");
});

test("concurrent detail loads do not overwrite a captured local serial with stale data", async () => {
  let releaseItems: (() => void) | undefined;
  const delayedItems = new Promise<void>((resolve) => { releaseItems = resolve; });
  let itemRequests = 0;
  const adapter: AxiosAdapter = async (config) => {
    const isItems = config.url?.endsWith("/items");
    if (isItems && ++itemRequests === 2) await delayedItems;
    return {
      data: config.url === "/api/dispatch/list" ? [] : isItems ? [line] : header,
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

test("preserves existing serials and only captures pending items", async () => {
  const { client } = backendFixture([
    { ...line, serial1: "existing-sn", codbarra: line.refbarra },
    { ...line, itemnum: 2, codbarra: line.refbarra },
  ]);
  const order = await client.getDispatchOrder("6242-19665");
  const [ready, current] = order.items;
  assert.equal(isItemComplete(ready), true);
  assert.deepEqual(ready.serials, ["existing-sn"]);
  await assert.rejects(client.checkBarcode(order.id, ready.id, ready.barcode), /no está pendiente/);
  await assert.rejects(client.checkSerial(order.id, ready.id, "REPLACEMENT-SN"), /no está pendiente/);
  assert.equal(getCurrentItem(order)?.id, current.id);
  assert.equal(current.codbarra, line.refbarra);
  assert.equal(current.barcodeChecked, false);
  assert.deepEqual(current.serials, []);
  await assert.rejects(client.checkSerial(order.id, current.id, "NEW-SN"), /Primero/);
  await client.checkBarcode(order.id, current.id, current.barcode);
  await assert.rejects(client.checkSerial(order.id, current.id, " EXISTING-SN "), /ya fue registrado/);
  await assert.rejects(client.checkSerial(order.id, current.id, " \r\n"), /escribe un serial/);
  const rejected = await client.getDispatchOrder(order.id);
  assert.equal(rejected.items[1].barcodeChecked, true);
  assert.deepEqual(rejected.items[1].serials, []);
  const captured = (await client.checkSerial(order.id, current.id, "NEW-SN")).order;
  assert.equal(captured.items[0].serial1, "existing-sn");
  assert.deepEqual(captured.items[0].serials, ["existing-sn"]);
  assert.equal(captured.items[1].barcodeChecked, false);
  assert.equal(captured.items[1].serial1, "NEW-SN");
  assert.deepEqual(captured.items[1].serials, ["NEW-SN"]);
  assert.equal(getCurrentItem(captured), undefined);
  const reopened = await client.getDispatchOrder(order.id);
  assert.deepEqual(getOrderProgress(reopened), { checked: 2, total: 2, percent: 100 });
  assert.equal(isOrderComplete(reopened), false);
});

test("serials may repeat across different products but not within the same product", async () => {
  const adapter: AxiosAdapter = async (config) => {
    let data: unknown;
    if (config.url === "/api/dispatch/list") {
      data = [];
    } else {
      const match = config.url?.match(/^\/api\/dispatch\/orders\/(\d+)\/(\d+)(\/items)?$/);
      assert.ok(match, `Unexpected request: ${config.url}`);
      const keys = { prednum: Number(match[1]), pednum: Number(match[2]) };
      data = match[3]
        ? [
          { ...line, ...keys },
          { ...line, ...keys, itemnum: 2, codart: "OTHER-PRODUCT", refbarra: "OTHER-BARCODE" },
          {
            ...line,
            ...keys,
            itemnum: 3,
            codart: " avfr-12w ",
            refbarra: "SAME-PRODUCT-BARCODE",
          },
        ]
        : { ...header, ...keys };
    }
    return { data, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
  };
  const client = createDispatchClient("https://api.example.test", adapter);
  const orders = await Promise.all(
    ["6242-19665", "6242-19666", "6243-19665"].map((id) => client.getDispatchOrder(id)),
  );
  for (const order of orders) {
    const [first, otherProduct, sameProduct] = order.items;
    await client.checkBarcode(order.id, first.id, first.barcode);
    const captured = (await client.checkSerial(order.id, first.id, " shared-sn\r\n")).order;
    assert.deepEqual(captured.items[0].serials, ["SHARED-SN"]);
    await client.checkBarcode(order.id, otherProduct.id, otherProduct.barcode);
    const repeatedAcrossProducts =
      (await client.checkSerial(order.id, otherProduct.id, "SHARED-SN")).order;
    assert.deepEqual(repeatedAcrossProducts.items[1].serials, ["SHARED-SN"]);

    await client.checkBarcode(order.id, sameProduct.id, sameProduct.barcode);
    const before = await client.getDispatchOrder(order.id);
    for (const invalid of ["SHARED-SN", " shared-sn ", "7590000012345", " \r\n"]) {
      await assert.rejects(client.checkSerial(order.id, sameProduct.id, invalid), (error) => {
        assert.ok(error instanceof DispatchError);
        assert.equal(
          error.status,
          invalid.trim() && !invalid.trim().startsWith("759") ? 409 : 422,
        );
        assert.deepEqual(getErrorOrder(error), before);
        return true;
      });
    }
    assert.deepEqual(await client.getDispatchOrder(order.id), before);
    const accepted = (await client.checkSerial(order.id, sameProduct.id, "UNIQUE-SN")).order;
    assert.deepEqual(accepted.items[2].serials, ["UNIQUE-SN"]);
    assert.equal(accepted.items[2].barcodeChecked, false);
    assert.equal(getCurrentItem(accepted), undefined);
  }
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
    if (config.url === "/api/dispatch/list") {
      return { data: [], status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
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

test("backend URL is required for data requests", async () => {
  await assert.rejects(createDispatchClient("  ").getDispatchOrders(), /EXPO_PUBLIC_API_URL/);
});

test("injected production service isolates drafts on logout, same-user re-login or account switch", async () => {
  const { client, changeSession } = scopedFixture();
  const order = await client.getDispatchOrder("6242-19665");
  await client.checkBarcode(order.id, order.items[0].id, line.refbarra!);
  await client.checkSerial(order.id, order.items[0].id, "LOCAL-SERIAL");
  assert.deepEqual((await client.getDispatchOrder(order.id)).items[0].serials, ["LOCAL-SERIAL"]);
  // TOKEN_REFRESHED mantiene el mismo epoch y no pierde avance.
  assert.deepEqual((await client.getDispatchOrder(order.id)).items[0].serials, ["LOCAL-SERIAL"]);
  changeSession();
  await assert.rejects(client.checkBarcode(order.id, order.items[0].id, line.refbarra!), /No encontramos/);
  const reloaded = await client.getDispatchOrder(order.id);
  assert.deepEqual(reloaded.items[0].serials, []);
  assert.equal(reloaded.items[0].barcodeChecked, false);
  client.clearCaptures();
  await assert.rejects(client.checkSerial(order.id, order.items[0].id, "OTHER"), /No encontramos/);
});

test("an in-flight detail from an old session cannot repopulate cleared capture cache", async () => {
  const { client, changeSession } = scopedFixture();
  const pending = client.getDispatchOrder("6242-19665");
  changeSession();
  client.clearCaptures();
  await assert.rejects(pending, /La sesión cambió/);
  await assert.rejects(client.checkBarcode("6242-19665", "6242-19665-1", line.refbarra!), /No encontramos/);
  const order = await client.getDispatchOrder("6242-19665");
  assert.deepEqual(order.items[0].serials, []);
});

test("an in-flight refresh cannot restore another session's data or captures", async () => {
  const { client, changeSession } = scopedFixture();
  const original = await client.getDispatchOrder("6242-19665");
  await client.checkBarcode(original.id, original.items[0].id, original.items[0].barcode);
  await client.checkSerial(original.id, original.items[0].id, "LOCAL-SN");
  const pending = client.refreshDispatchOrders();
  changeSession();
  client.clearCaptures();

  await assert.rejects(pending, /La sesión cambió/);
  assert.equal((await client.getDispatchOrder(original.id)).items[0].serial1, null);
});
