import {
  collection,
  getDocs,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { Product } from "@/types";
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

function mapProduct(snapshotDoc: QueryDocumentSnapshot<DocumentData>): Product {
  const data = snapshotDoc.data() as Omit<Product, "id">;

  return {
    id: snapshotDoc.id,
    ...data,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
  };
}

export async function getTenantProducts(
  tenantId: string
): Promise<Product[]> {
  const productsRef = collection(db, `tenants/${tenantId}/products`);
  const productsQuery = query(productsRef, where("isActive", "==", true));
  const snapshot = await getDocs(productsQuery);

  return snapshot.docs.map(mapProduct);
}
