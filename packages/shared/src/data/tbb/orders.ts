export const TBB_ORDERS = [
  {
    id: "order-001",
    status: "preparing",
    channel: "web",
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
      deliveryFee: 0,
      discount: 0,
      total: 9490,
    },
    ui: { source: "storefront" },
  },
  {
    id: "order-002",
    status: "queued",
    channel: "web",
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
      deliveryFee: 0,
      discount: 0,
      total: 14980,
    },
    ui: { source: "storefront" },
  },
];