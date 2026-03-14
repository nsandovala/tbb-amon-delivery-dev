import { adminDb } from "../admin";
import type { Product } from "@/types";

export async function getTenantProducts(
  tenantId: string
): Promise<Product[]> {
  const snapshot = await adminDb
    .collection(`tenants/${tenantId}/products`)
    .where("isActive", "==", true)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();

    return {
      id: doc.id,
      ...data,
      createdAt: data?.createdAt?.toDate?.()?.toISOString?.() ?? null,
      updatedAt: data?.updatedAt?.toDate?.()?.toISOString?.() ?? null,
    } as Product;
  });
}