import {
  collection,
  getDocs,
  orderBy,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { Category } from "@/types";
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

function mapCategory(snapshotDoc: QueryDocumentSnapshot<DocumentData>): Category {
  const data = snapshotDoc.data() as Omit<Category, "id">;

  return {
    id: snapshotDoc.id,
    ...data,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
  };
}

export async function getTenantCategories(
  tenantId: string
): Promise<Category[]> {
  const categoriesRef = collection(db, `tenants/${tenantId}/categories`);
  const categoriesQuery = query(categoriesRef, orderBy("sortOrder", "asc"));
  const snapshot = await getDocs(categoriesQuery);

  return snapshot.docs.map(mapCategory);
}
