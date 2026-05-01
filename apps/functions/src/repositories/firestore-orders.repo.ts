import admin from "firebase-admin";
import { getDb } from "../lib/firebase-admin";
import { NotFoundError, ConflictError } from "../lib/errors";
import { logger } from "../lib/logger";
import type { CreateOrderInput, OrderStatus } from "../lib/order-contracts";
import { ILLEGAL_TRANSITIONS } from "../lib/order-contracts";

const ORDERS_COLLECTION = "orders";

/**
 * Tenant-scoped reference: tenants/{tenantId}/orders
 */
function ordersCol(tenantId: string): admin.firestore.CollectionReference {
  return getDb().collection("tenants").doc(tenantId).collection(ORDERS_COLLECTION);
}

function orderDoc(tenantId: string, orderId: string): admin.firestore.DocumentReference {
  return ordersCol(tenantId).doc(orderId);
}

export type OrderDoc = admin.firestore.DocumentSnapshot;

/**
 * Create an order document. Caller provides the orderId.
 * Totals are calculated server-side from product prices.
 */
export async function createOrder(
  tenantId: string,
  orderId: string,
  input: CreateOrderInput & {
    totals: { subtotal: number; delivery: number; total: number };
    paymentMethod: string;
    channel: string;
  }
): Promise<void> {
  const now = admin.firestore.FieldValue.serverTimestamp();

  await orderDoc(tenantId, orderId).set({
    id: orderId,
    tenantId,
    status: "queued",
    channel: input.channel,
    paymentMethod: input.paymentMethod,
    paymentStatus: "pending",
    customer: input.customer,
    items: input.items,
    totals: input.totals,
    fulfillmentType: input.fulfillmentType,
    createdAt: now,
    updatedAt: now,
  });

  logger.info("Order created", { tenantId, orderId });
}

/**
 * Generate a simple auto-id via Firestore.
 */
export function generateOrderId(tenantId: string): string {
  return ordersCol(tenantId).doc().id;
}

/**
 * Read a single order.
 */
export async function getOrder(
  tenantId: string,
  orderId: string
): Promise<admin.firestore.DocumentSnapshot> {
  const snap = await orderDoc(tenantId, orderId).get();
  if (!snap.exists) {
    throw new NotFoundError(`Order ${orderId}`);
  }
  return snap;
}

/**
 * Update order status with transition validation.
 */
export async function updateOrderStatus(
  tenantId: string,
  orderId: string,
  newStatus: OrderStatus
): Promise<void> {
  const snap = await getOrder(tenantId, orderId);
  const data = snap.data() as { status?: string } | undefined;
  const currentStatus = data?.status as OrderStatus | undefined;

  if (currentStatus && isIllegalTransition(currentStatus, newStatus)) {
    throw new ConflictError(
      `Illegal transition from "${currentStatus}" to "${newStatus}"`
    );
  }

  const now = admin.firestore.FieldValue.serverTimestamp();

  await orderDoc(tenantId, orderId).update({
    status: newStatus,
    statusChangedAt: now,
    updatedAt: now,
  });

  logger.info("Order status updated", {
    tenantId,
    orderId,
    from: currentStatus,
    to: newStatus,
  });
}

function isIllegalTransition(
  from: OrderStatus,
  to: OrderStatus
): boolean {
  const blocked = ILLEGAL_TRANSITIONS[from];
  if (!blocked) return false;
  return blocked.includes(to);
}
