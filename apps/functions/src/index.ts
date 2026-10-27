/**
 * @amon/functions — Entry point.
 * Exports Firebase Functions for orders, POS, operating expenses, store hours and cash close.
 *
 * Route → Service → Repository.
 * All writes go through Firestore Admin SDK.
 * Tenant-aware under tenants/{tenantId}.
 */

// COST-GUARD: las opciones globales deben registrarse antes de definir las rutas.
import "./lib/global-options";
import { createOrder, getOrder } from "./routes/orders";
import { updateOrderStatus, createPosSale } from "./routes/pos";
import { createExpense } from "./routes/expenses";
import { getMyMembership, listMyMemberships } from "./routes/membership";
import {
  getStoreStatus,
  getStoreControl,
  setStoreOperation,
  updateStoreHours,
  updateStoreDateException,
  deleteStoreDateException,
  getCashCloseSummary,
  closeCashSession,
} from "./routes/store";

export {
  // Orders
  createOrder,
  getOrder,
  updateOrderStatus,

  // POS
  createPosSale,

  // Expenses
  createExpense,

  // Store operation & cash close (M6J)
  getStoreStatus,
  getStoreControl,
  setStoreOperation,
  updateStoreHours,
  updateStoreDateException,
  deleteStoreDateException,
  getCashCloseSummary,
  closeCashSession,

  // Membership (SEC-BASE)
  getMyMembership,
  listMyMemberships,
};
