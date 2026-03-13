import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../client";
import type { Product } from "@/types";

export async function getTenantProducts(
  tenantId: string
): Promise<Product[]> {
  const productsRef = collection(db, `tenants/${tenantId}/products`);
  const q = query(productsRef, where("isActive", "==", true));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
    } as Product;
  });
}