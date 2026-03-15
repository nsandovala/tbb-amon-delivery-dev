import { db } from "../client";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

interface CreateOrderParams {
  tenantId: string;
  items: {
    productId: string;
    qty: number;
    unitPrice: number;
  }[];
  subtotal: number;
  delivery: number;
  total: number;
  fulfillmentType: "delivery" | "pickup";
  customer: {
    name: string;
    phone: string;
    address?: string;
    notes?: string;
  };
}

export async function createOrder({
  tenantId,
  items,
  subtotal,
  delivery,
  total,
  fulfillmentType,
  customer,
}: CreateOrderParams) {
  const orderData = {
  tenantId,
  status: "queued",
  paymentStatus: "pending",
  paymentMethod: "manual",
  channel: "own",
  fulfillmentType,
  items,
  modifiers: [],
  totals: {
    subtotal,
    delivery,
    total,
  },
  customer: {
    name: customer.name,
    phone: customer.phone,
    address: customer.address ?? "",
    notes: customer.notes ?? "",
  },
  timeline: {
    queuedAt: serverTimestamp(),
    preparingAt: null,
    readyAt: null,
    onTheWayAt: null,
    deliveredAt: null,
    cancelledAt: null,
  },
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
};


  const docRef = await addDoc(collection(db, `tenants/${tenantId}/orders`), orderData);
  return docRef.id;
}
