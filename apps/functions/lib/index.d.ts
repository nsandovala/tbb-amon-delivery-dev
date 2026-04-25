/**
 * @amon/functions — Entry point.
 * Exports Firebase Functions for orders and POS.
 *
 * Route → Service → Repository.
 * All writes go through Firestore Admin SDK.
 * Tenant-aware under tenants/{tenantId}.
 */
import { createOrder, getOrder } from "./routes/orders";
import { updateOrderStatus, createPosSale } from "./routes/pos";
export { createOrder, getOrder, updateOrderStatus, createPosSale, };
