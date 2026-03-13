import { db } from "../client";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

interface CreateOrderParams {
  tenantId: string;
  items: { productId: string; qty: number; unitPrice: number }[];
  subtotal: number;
}

export async function createOrder({ tenantId, items, subtotal }: CreateOrderParams) {
  // Estructura consistente con el seed
  const orderData = {
    tenantId,
    status: "queued",
    channel: "own",
    items,
    modifiers: [], // No implementado aún
    totals: {
      subtotal,
      delivery: 0,
      total: subtotal,
    },
    customer: {
      name: "Cliente Web (Demo)",
      phone: "+56900000000",
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, `tenants/${tenantId}/orders`), orderData);
  return docRef.id;
}
