import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../client";

export interface AdminCreateOrderItem {
  productId: string;
  qty: number;
  unitPrice: number;
}

interface CreateAdminOrderParams {
  tenantId: string;
  items: AdminCreateOrderItem[];
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
  channel?: "admin_pos" | "own" | "web" | "whatsapp";
  paymentMethod?: "manual" | "cash" | "card" | "transfer";
}

export async function createAdminOrder({
  tenantId,
  items,
  subtotal,
  delivery,
  total,
  fulfillmentType,
  customer,
  channel = "admin_pos",
  paymentMethod = "manual",
}: CreateAdminOrderParams) {
  const orderData = {
    tenantId,
    status: "queued",
    paymentStatus: "pending",
    paymentMethod,
    channel,
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
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(
    collection(db, `tenants/${tenantId}/orders`),
    orderData
  );

  return docRef.id;
}