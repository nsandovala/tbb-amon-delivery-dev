import { adminDb } from "../admin";
import type { Tenant } from "@/types";

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const snapshot = await adminDb
    .collection("tenants")
    .where("slug", "==", slug)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const data = doc.data();

  return {
    id: doc.id,
    ...data,
    createdAt: data?.createdAt?.toDate?.()?.toISOString?.() ?? null,
    updatedAt: data?.updatedAt?.toDate?.()?.toISOString?.() ?? null,
  } as Tenant;
}
