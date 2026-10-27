import type admin from "firebase-admin";
import { getDb } from "../lib/firebase-admin";
import { ValidationError } from "../lib/errors";

export type PricedProduct = {
  name: string;
  price: number;
  imageUrl: string | null;
  categoryId: string | null;
};

type ProductData = {
  name?: string;
  imageUrl?: string;
  categoryId?: string;
  price?: number;
  isActive?: boolean;
};

/**
 * COST-GUARD: lee cada producto distinto UNA sola vez (líneas repetidas no
 * multiplican lecturas) en un único `getAll`, y rechaza con 400 —no 500— los
 * productos inexistentes, sin precio válido o desactivados.
 */
export async function loadPricedProducts(
  tenantId: string,
  productIds: string[]
): Promise<Map<string, PricedProduct>> {
  const uniqueIds = [...new Set(productIds)];
  const products = getDb().collection("tenants").doc(tenantId).collection("products");
  const refs = uniqueIds.map((id) => products.doc(id));
  const snaps: admin.firestore.DocumentSnapshot[] = refs.length > 0 ? await getDb().getAll(...refs) : [];

  const priced = new Map<string, PricedProduct>();
  const unavailable: string[] = [];

  snaps.forEach((snap, index) => {
    const id = uniqueIds[index];
    const data = snap.exists ? (snap.data() as ProductData | undefined) : undefined;
    const price = data?.price;
    if (
      !data ||
      data.isActive === false ||
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      unavailable.push(id);
      return;
    }
    priced.set(id, {
      name: data.name || `Product ${id}`,
      price,
      imageUrl: data.imageUrl || null,
      categoryId: data.categoryId || null,
    });
  });

  if (unavailable.length > 0) {
    throw new ValidationError("Some products are not available", [{ productIds: unavailable }]);
  }

  return priced;
}
