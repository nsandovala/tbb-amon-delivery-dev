export const TBB_ORDERS = [
  {
    id: "DEMO01",
    status: "preparing",
    channel: "web",
    fulfillmentType: "delivery",
    paymentMethod: "pending",
    customer: { name: "Cliente Demo", phone: "+56900000000" },
    items: [
      {
        productId: "vader-burger",
        name: "Vader Burger",
        qty: 1,
        unitPrice: 7990,
        subtotal: 7990,
        selectedModifiers: [
          {
            modifierId: "papas-kaioken-addon",
            name: "Papas Kaioken",
            unitPrice: 1500,
            qty: 1,
            subtotal: 1500,
          },
        ],
      },
    ],
    totals: {
      subtotal: 9490,
      delivery: 1500,
      discount: 0,
      total: 10990,
    },
  },
  {
    id: "DEMO02",
    status: "queued",
    channel: "admin_pos",
    fulfillmentType: "pickup",
    paymentMethod: "cash",
    customer: { name: "Cliente Demo 2", phone: "+56900000001" },
    items: [
      {
        productId: "super-mechada",
        name: "Súper Mechada",
        qty: 2,
        unitPrice: 7490,
        subtotal: 14980,
      },
    ],
    totals: {
      subtotal: 14980,
      delivery: 0,
      discount: 0,
      total: 14980,
    },
  },
];
