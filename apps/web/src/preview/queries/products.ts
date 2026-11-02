import type * as Real from "@/lib/firebase/queries/products";
import { DEMO_PRODUCTS } from "@/preview/demo-catalog";

/** TBB-TABLET-PREVIEW-01 — reemplaza `src/lib/firebase/queries/products.ts` (solo activos). */
export const getTenantProducts: typeof Real.getTenantProducts = async (tenantId) =>
  DEMO_PRODUCTS.filter((product) => product.tenantId === tenantId && product.isActive);
