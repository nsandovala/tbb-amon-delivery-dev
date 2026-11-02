import type * as Real from "@/lib/firebase/queries/categories";
import { DEMO_CATEGORIES } from "@/preview/demo-catalog";

/** TBB-TABLET-PREVIEW-01 — reemplaza `src/lib/firebase/queries/categories.ts` (mismo orden). */
export const getTenantCategories: typeof Real.getTenantCategories = async (tenantId) =>
  DEMO_CATEGORIES.filter((category) => category.tenantId === tenantId).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
