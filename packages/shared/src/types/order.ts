export type OrderStatus =
  | "queued"
  | "accepted"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled";

export type OrderChannel = "web" | "whatsapp" | "manual" | "marketplace";

export type OrderItemModifier = {
  modifierId: string;
  name: string;
  unitPrice: number;
  qty: number;
  subtotal: number;
};

export type OrderItem = {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
  selectedModifiers?: OrderItemModifier[];
};

export type Order = {
  id: string;
  tenantId: string;
  status: OrderStatus;
  channel: OrderChannel;

  customer: {
    name?: string;
    phone?: string;
    notes?: string;
  };

  items: OrderItem[];

  totals: {
    subtotal: number;
    deliveryFee: number;
    discount: number;
    total: number;
  };

  ui?: {
    source?: "storefront" | "admin";
  };

  createdAt?: unknown;
  updatedAt?: unknown;
};