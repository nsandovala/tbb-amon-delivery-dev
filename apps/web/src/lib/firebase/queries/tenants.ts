import {
  collection,
  getDocs,
  limit,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { Tenant } from "@/types";
import { db } from "../client";

function serializeTimestamp(value: unknown): string | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }

  return null;
}

function mapTenant(snapshotDoc: QueryDocumentSnapshot<DocumentData>): Tenant {
  const data = snapshotDoc.data() as Omit<Tenant, "id">;

  return {
    id: snapshotDoc.id,
    ...data,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
  };
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const tenantsRef = collection(db, "tenants");
  const tenantsQuery = query(tenantsRef, where("slug", "==", slug), limit(1));
  const snapshot = await getDocs(tenantsQuery);

  if (snapshot.empty) return null;

  return mapTenant(snapshot.docs[0]);
}
