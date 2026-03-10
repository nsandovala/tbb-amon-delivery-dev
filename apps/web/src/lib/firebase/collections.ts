export const tenantsCollection = "tenants";

export const tenantCategories = (tenantId: string) =>
 `tenants/${tenantId}/categories`;

export const tenantProducts = (tenantId: string) =>
 `tenants/${tenantId}/products`;

export const tenantOrders = (tenantId: string) =>
 `tenants/${tenantId}/orders`;