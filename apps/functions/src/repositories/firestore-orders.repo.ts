import admin from "firebase-admin";
import { getDb } from "../lib/firebase-admin";
import { NotFoundError, ConflictError } from "../lib/errors";
import { logger } from "../lib/logger";
import type { OrderStatus } from "../schemas/order.shared";
import { ILLEGAL_TRANSITIONS } from "../schemas/order.shared";
import {
  formatDisplayCode,
  getOperationalDate,
  type OperationalOrderMeta,
} from "../lib/operational-order";

const ORDERS_COLLECTION = "orders";
const ORDER_COUNTERS_COLLECTION = "orderCounters";

/**
 * Tenant-scoped reference: tenants/{tenantId}/orders
 */
function ordersCol(tenantId: string): admin.firestore.CollectionReference {
  return getDb().collection("tenants").doc(tenantId).collection(ORDERS_COLLECTION);
}

function orderDoc(tenantId: string, orderId: string): admin.firestore.DocumentReference {
  return ordersCol(tenantId).doc(orderId);
}

function orderCounterDoc(
  tenantId: string,
  operationalDate: string
): admin.firestore.DocumentReference {
  return getDb()
    .collection("tenants")
    .doc(tenantId)
    .collection(ORDER_COUNTERS_COLLECTION)
    .doc(operationalDate);
}

export type OrderDoc = admin.firestore.DocumentSnapshot;

/**
 * Create an order document. Caller provides the orderId.
 * Totals are calculated server-side from product prices.
 */
export async function createOrder(
  tenantId: string,
  orderId: string,
  input: {
    items: Array<{
      productId: string;
      productName: string;
      qty: number;
      unitPrice: number;
      imageUrl?: string | null;
      categoryId?: string | null;
    }>;
    customer: {
      name: string;
      phone?: string;
      email?: string;
      address?: string;
      notes?: string;
    };
    fulfillmentType: "delivery" | "pickup";
    totals: { subtotal: number; delivery: number; total: number };
    paymentMethod: string;
    channel: string;
    customerId?: string;
    customerPhoneNormalized?: string;
  }
): Promise<OperationalOrderMeta> {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const operationalDate = getOperationalDate();

  const meta = await getDb().runTransaction(async (transaction) => {
    const counterRef = orderCounterDoc(tenantId, operationalDate);
    const counterSnap = await transaction.get(counterRef);
    const currentValue = (counterSnap.data()?.lastDisplayOrderNumber as number | undefined) ?? 0;
    const displayOrderNumber = currentValue + 1;
    const displayCode = formatDisplayCode(displayOrderNumber);

    transaction.set(counterRef, {
      tenantId,
      operationalDate,
      lastDisplayOrderNumber: displayOrderNumber,
      updatedAt: now,
      createdAt: counterSnap.exists ? counterSnap.get("createdAt") ?? now : now,
    }, { merge: true });

    transaction.set(orderDoc(tenantId, orderId), {
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
      displayOrderNumber,
      displayCode,
      operationalDate,
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.customerPhoneNormalized
        ? { customerPhoneNormalized: input.customerPhoneNormalized }
        : {}),
      createdAt: now,
      updatedAt: now,
    });

    return { displayOrderNumber, displayCode, operationalDate };
  });

  logger.info("Order created", { tenantId, orderId, ...meta });
  return meta;
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
