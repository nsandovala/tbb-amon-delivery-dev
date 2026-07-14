export interface AdminOrderItem {
  productId: string;
  productName?: string;
  qty?: number;
  unitPrice?: number;
  imageUrl?: string;
  categoryId?: string;
}

export interface AdminOrderCustomer {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface AdminOrderTotals {
  subtotal?: number;
  delivery?: number;
  total?: number;
}

export type OrderStatus =
  | "queued"
  | "preparing"
  | "ready"
  | "on_the_way"
  | "delivered"
  | "cancelled";

export interface AdminOrder {
  id: string;
  tenantId?: string;
  status?: OrderStatus;
  channel?: string;
  paymentMethod?: "pending" | "cash" | "card" | "transfer";
  paymentStatus?: string;
  fulfillmentType?: string;
  displayOrderNumber?: number;
  displayCode?: string;
  operationalDate?: string;
  items?: AdminOrderItem[];
  customer?: AdminOrderCustomer;
  totals?: AdminOrderTotals;
  createdAt?: unknown;
  updatedAt?: unknown;
}
