import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from "firebase/firestore";
import { updateOrderStatusApi } from "@/lib/api/orders";
import { db } from "../client";

export type OrderStatus =
  | "queued"
  | "preparing"
  | "ready"
  | "on_the_way"
  | "delivered"
  | "cancelled";

export interface AdminOrderItem {
  productId: string;
  qty: number;
  unitPrice: number;
}

export interface AdminOrderCustomer {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface AdminOrderTotals {
  subtotal: number;
  delivery: number;
  total: number;
}

export interface AdminOrder {
  id: string;
  tenantId: string;
  status: OrderStatus;
  paymentStatus?: string;
  paymentMethod?: string;
  channel?: string;
  fulfillmentType?: "delivery" | "pickup";
  displayOrderNumber?: number;
  displayCode?: string;
  operationalDate?: string;
  items?: AdminOrderItem[];
  modifiers?: unknown[];
  customer?: AdminOrderCustomer;
  totals?: AdminOrderTotals;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export function subscribeToOrders(
  tenantId: string,
  callback: (orders: AdminOrder[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const ref = collection(db, `tenants/${tenantId}/orders`);
  const q = query(ref, orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    (snapshot) => {
      const orders: AdminOrder[] = snapshot.docs.map((snapshotDoc) => ({
        id: snapshotDoc.id,
        ...(snapshotDoc.data() as Omit<AdminOrder, "id">),
      }));

      callback(orders);
    },
    (error) => {
      console.error("Error suscribiendo pedidos:", error);
      onError?.(error as Error);
    }
  );
}

export async function updateOrderStatus(
  _tenantId: string,
  orderId: string,
  nextStatus: OrderStatus
) {
  await updateOrderStatusApi(orderId, nextStatus);
}
