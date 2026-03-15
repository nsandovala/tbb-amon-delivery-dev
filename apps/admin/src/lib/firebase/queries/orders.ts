import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../client";

export type OrderStatus =
  | "queued"
  | "preparing"
  | "ready"
  | "on_the_way"
  | "delivered"
  | "cancelled";

export interface AdminOrder {
  id: string;
  tenantId: string;
  status: OrderStatus;
  paymentStatus?: string;
  paymentMethod?: string;
  channel?: string;
  fulfillmentType?: "delivery" | "pickup";
  items?: {
    productId: string;
    qty: number;
    unitPrice: number;
  }[];
  totals: {
    subtotal: number;
    delivery: number;
    total: number;
  };
  customer: {
    name: string;
    phone: string;
    address?: string;
    notes?: string;
  };
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
      const orders: AdminOrder[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<AdminOrder, "id">),
      }));

      callback(orders);
    },
    (error) => {
      console.error("subscribeToOrders error:", error);
      onError?.(error as Error);
    }
  );
}

export async function updateOrderStatus(
  tenantId: string,
  orderId: string,
  status: OrderStatus
) {
  const ref = doc(db, `tenants/${tenantId}/orders/${orderId}`);
  await updateDoc(ref, {
    status,
    updatedAt: new Date(),
  });
}
