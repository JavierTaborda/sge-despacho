import type { DemoOrder } from "../domain/dispatch.ts";

type ItemSeed = {
  itemnum: number;
  rennum: number;
  codart: string;
  description: string;
  refbarra: string;
  requiresSerial: boolean;
};

function makeOrder(
  prednum: number,
  pednum: number,
  customerCode: string,
  customer: string,
  scheduledAt: string,
  items: ItemSeed[],
): DemoOrder {
  return {
    id: String(prednum),
    pednum,
    codcli: customerCode,
    codzon: "0002",
    codven: "00004",
    customer,
    address: "TACHIRA",
    scheduledAt,
    vendedor: "DESSIRE MARTINEZ",
    supervisor: "ogarcia",
    items: items.map((item) => ({
      id: `${prednum}-${item.itemnum}`,
      prednum,
      itemnum: item.itemnum,
      pednum,
      rennum: item.rennum,
      name: `${item.codart} - ${item.description}`,
      sku: item.codart,
      barcode: item.refbarra,
      quantity: 1,
      location: "0001",
      requiresSerial: item.requiresSerial,
      recouser: "0",
      expectedSerials: [],
    })),
  };
}

function repeatItem(
  count: number,
  item: Omit<ItemSeed, "itemnum">,
  startItemnum: number,
): ItemSeed[] {
  return Array.from({ length: count }, (_, index) => ({
    ...item,
    itemnum: startItemnum + index,
  }));
}

export const demoOrders: DemoOrder[] = [
  makeOrder(
    6242,
    19665,
    "00734",
    "AVIR AL BOUNNAY DE AL PONY (VARIEDADES SHEDA, FP)",
    "2026-10-23 09:32:56",
    [
      ...repeatItem(2, {
        rennum: 1,
        codart: "AVFR-12W",
        description: "AIRE DE VENTANA FRIGILUX 12.000BTU C/ WIFI  110V",
        refbarra: "7590020007163",
        requiresSerial: true,
      }, 1),
      ...repeatItem(4, {
        rennum: 2,
        codart: "AVFR-5W",
        description: "AIRE DE VENTANA FRIGILUX 5.000BTU C/ MANUAL  110V",
        refbarra: "7590020011382",
        requiresSerial: true,
      }, 3),
      ...repeatItem(2, {
        rennum: 3,
        codart: "AVFR-8W",
        description: "AIRE DE VENTANA FRIGILUX 8.000BTU C/ REMOTO  110V",
        refbarra: "7590020011399",
        requiresSerial: true,
      }, 7),
      ...repeatItem(1, {
        rennum: 4,
        codart: "BFR-5015",
        description: "BATIDORA FRIGILUX 10 VELOC BASE METAL",
        refbarra: "7590020010965",
        requiresSerial: false,
      }, 9),
    ],
  ),
  makeOrder(
    6243,
    19641,
    "00852",
    "DANIEL ALEXANDER RAMPIRA SERNA (INVERSIONES RAMPIRA GARCIA)",
    "2026-10-23 09:33:05",
    [
      ...repeatItem(2, {
        rennum: 1,
        codart: "HEFR-4IX",
        description: "HORNOS P/EMPOTRAR ELECTRICOS FRIGILUX INOX",
        refbarra: "7590020009839",
        requiresSerial: true,
      }, 1),
      ...repeatItem(2, {
        rennum: 2,
        codart: "HEFRAF-6IX",
        description: "HORNOS P/EMPOTRAR ELECT FRIGILUX C/FREIDORA DE AIRE INTEGRADO INOX",
        refbarra: "7590020009853",
        requiresSerial: true,
      }, 3),
      ...repeatItem(2, {
        rennum: 3,
        codart: "HEGFR-2IX",
        description: "HORNO P/EMP. MIXTO MOD. 2IX FRIGILUX",
        refbarra: "7590020005671",
        requiresSerial: true,
      }, 5),
      ...repeatItem(4, {
        rennum: 4,
        codart: "NFR-187D-G",
        description: "NEVERA FRIGILUX 187LTS CON DISPENSADOR GRIS",
        refbarra: "7590020010903",
        requiresSerial: true,
      }, 7),
      ...repeatItem(4, {
        rennum: 5,
        codart: "RHFR-198B",
        description: "REFRIGERADOR HORIZONTAL FRIGILUX 198 LIT BLANCO",
        refbarra: "7590020010934",
        requiresSerial: true,
      }, 11),
    ],
  ),
];











