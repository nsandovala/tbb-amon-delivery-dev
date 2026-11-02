import type * as Real from "@/lib/firebase/queries/tenants";
import { DEMO_TENANT } from "@/preview/demo-catalog";

/** TBB-TABLET-PREVIEW-01 — reemplaza `src/lib/firebase/queries/tenants.ts`. */
export const getTenantBySlug: typeof Real.getTenantBySlug = async (slug) =>
  slug === DEMO_TENANT.slug ? DEMO_TENANT : null;
