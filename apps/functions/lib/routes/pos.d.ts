/**
 * PATCH /orders/:id/status
 * Transitions an order to a new status.
 * Validates transition rules at service/repository layer.
 */
export declare const updateOrderStatus: import("firebase-functions/v2/https").HttpsFunction;
/**
 * POST /pos/sale
 * Records a POS sale (creates order with channel=admin_pos).
 */
export declare const createPosSale: import("firebase-functions/v2/https").HttpsFunction;
