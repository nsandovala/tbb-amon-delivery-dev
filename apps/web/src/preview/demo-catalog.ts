import { TBB_CATEGORIES } from "../../../../packages/shared/src/data/tbb/categories";
import { TBB_PRODUCTS } from "../../../../packages/shared/src/data/tbb/products";
import { TBB_TENANT } from "../../../../packages/shared/src/data/tbb/tenant";
import type { Category, Product, Tenant } from "@/types";

/**
 * TBB-TABLET-PREVIEW-01 — carta demo de la vista previa, tomada del seed de TBB
 * (`packages/shared/src/data/tbb`). Sin Firestore: los datos van dentro del bundle.
 * El seed no tiene datos personales; el contacto se reduce al Instagram público.
 */
export const DEMO_TENANT: Tenant = {
  ...(TBB_TENANT as Omit<Tenant, "contact">),
  contact: { instagram: TBB_TENANT.contact.instagram },
};

export const DEMO_CATEGORIES: Category[] = TBB_CATEGORIES.map((category) => ({
  ...category,
  tenantId: DEMO_TENANT.id,
}));

export const DEMO_PRODUCTS: Product[] = TBB_PRODUCTS.map((product) => ({ ...product }) as Product);
