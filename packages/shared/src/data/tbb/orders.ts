import type { Order } from "../../schemas/order.schema.js";

export const TBB_ORDERS = [
  {
    id: "order-001",
    tenantId: "tbb",
    status: "preparing" as const,
    paymentStatus: "pending" as const,
    paymentMethod: "pending" as const,
    channel: "web" as const,
    fulfillmentType: "pickup" as const,
    customer: { name: "Cliente Demo", phone: "+56900000000", address: "", notes: "" },
    items: [
      {
        productId: "vader-burger",
        productName: "Vader Burger",
        qty: 1,
        unitPrice: 7990,
      },
    ],
    modifiers: [
      {
        modifierId: "papas-kaioken-addon",
        name: "Papas Kaioken",
        unitPrice: 1500,
        qty: 1,
      },
    ],
    totals: {
      subtotal: 9490,
      delivery: 0,
      total: 9490,
    },
  },
  {
    id: "order-002",
    tenantId: "tbb",
    status: "queued" as const,
    paymentStatus: "pending" as const,
    paymentMethod: "pending" as const,
    channel: "web" as const,
    fulfillmentType: "pickup" as const,
    customer: { name: "Cliente Demo 2", phone: "+56900000001", address: "", notes: "" },
    items: [
      {
        productId: "super-mechada",
        productName: "Súper Mechada",
        qty: 2,
        unitPrice: 7490,
      },
    ],
    modifiers: [],
    totals: {
      subtotal: 14980,
      delivery: 0,
      total: 14980,
    },
  },
] satisfies Array<{ id: string } & Order>;
