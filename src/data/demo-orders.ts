import type { DemoOrder } from "../domain/dispatch.ts";

export const demoOrders: DemoOrder[] = [
  {
    id: "OD-1048",
    customer: "Clínica Santa María",
    address: "Av. Providencia 1250, Santiago",
    scheduledAt: "09:30 – 12:00",
    priority: "Alta",
    items: [
      {
        id: "item-1",
        name: "Monitor de signos vitales",
        sku: "MSV-2200",
        barcode: "7801234567012",
        quantity: 2,
        location: "A-01",
        requiresSerial: true,
        expectedSerials: ["MSV2200-24081", "MSV2200-24082"],
      },
      {
        id: "item-2",
        name: "Sensor de temperatura",
        sku: "ST-100",
        barcode: "7801234567029",
        quantity: 2,
        location: "A-04",
        requiresSerial: false,
        expectedSerials: [],
      },
      {
        id: "item-3",
        name: "Oxímetro de pulso",
        sku: "OP-50",
        barcode: "7801234567050",
        quantity: 1,
        location: "B-02",
        requiresSerial: true,
        expectedSerials: ["OP50-88301"],
      },
    ],
  },
  {
    id: "OD-1047",
    customer: "Hospital del Valle",
    address: "Los Leones 890, Santiago",
    scheduledAt: "12:00 – 14:00",
    priority: "Normal",
    items: [
      {
        id: "item-4",
        name: "Bomba de infusión",
        sku: "BI-500",
        barcode: "7801234567036",
        quantity: 1,
        location: "B-08",
        requiresSerial: true,
        expectedSerials: ["BI500-77120"],
      },
    ],
  },
  {
    id: "OD-1046",
    customer: "Red Salud Norte",
    address: "Ruta 5 Norte 4300, Quilicura",
    scheduledAt: "14:00 – 17:00",
    priority: "Normal",
    items: [
      {
        id: "item-5",
        name: "Kit de oxígeno portátil",
        sku: "KO-80",
        barcode: "7801234567043",
        quantity: 3,
        location: "C-03",
        requiresSerial: true,
        expectedSerials: ["KO80-11001", "KO80-11002", "KO80-11003"],
      },
    ],
  },
];




