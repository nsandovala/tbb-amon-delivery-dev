/**
 * @amon/functions — Entry point.
 * Exports Firebase Functions for orders, POS, and operating expenses.
 *
 * Route → Service → Repository.
 * All writes go through Firestore Admin SDK.
 * Tenant-aware under tenants/{tenantId}.
 */

import { createOrder, getOrder } from "./routes/orders";
import { updateOrderStatus, createPosSale } from "./routes/pos";
import { createExpense } from "./routes/expenses";

export {
  // Orders
  createOrder,
  getOrder,
  updateOrderStatus,

  // POS
  createPosSale,

  // Expenses
  createExpense,
};
