/**
 * POST /orders
 * Creates a new order in tenants/{tenantId}/orders.
 */
export declare const createOrder: import("firebase-functions/v2/https").HttpsFunction;
/**
 * GET /orders/:id
 * Reads an order from tenants/{tenantId}/orders.
 * tenantId passed as query param or defaults to pilot tenant.
 */
export declare const getOrder: import("firebase-functions/v2/https").HttpsFunction;
