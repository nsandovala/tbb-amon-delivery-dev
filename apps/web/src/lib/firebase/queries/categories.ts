import { adminDb } from "../admin";
import type { Category } from "@/types";

export async function getTenantCategories(
  tenantId: string
): Promise<Category[]> {
  const snapshot = await adminDb
    .collection(`tenants/${tenantId}/categories`)
    .orderBy("sortOrder", "asc")
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();

    return {
      id: doc.id,
      ...data,
      createdAt: data?.createdAt?.toDate?.()?.toISOString?.() ?? null,
      updatedAt: data?.updatedAt?.toDate?.()?.toISOString?.() ?? null,
    } as Category;
  });
}