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
import { assertCashCloseOpen } from "../lib/cash-close-guard";
import {
  IDEMPOTENCY_VERSION,
  IdempotencyKeyReusedError,
} from "../lib/idempotency";

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

/** Resultado de crear (o reproducir) un pedido idempotente. */
export type CreatedOrderMeta = OperationalOrderMeta & {
  orderId: string;
  /** true si la clave ya existía y se devolvió el pedido original sin escribir. */
  replayed: boolean;
};

/**
 * ORDER-IDEMPOTENCY: compara un pedido existente con la huella del intento.
 * Huella igual → metadatos originales (replay). Distinta, o un pedido sin
 * huella (creado sin clave) → 409 sin filtrar su contenido.
 */
function replayFromSnapshot(
  snap: admin.firestore.DocumentSnapshot,
  fingerprint: string
): CreatedOrderMeta {
  const data = snap.data() ?? {};
  const stored = (data.idempotency as { fingerprint?: unknown } | undefined)?.fingerprint;
  if (stored !== fingerprint) {
    throw new IdempotencyKeyReusedError();
  }
  return {
    orderId: snap.id,
    displayOrderNumber: data.displayOrderNumber as number,
    displayCode: data.displayCode as string,
    operationalDate: data.operationalDate as string,
    replayed: true,
  };
}

/**
 * ORDER-IDEMPOTENCY (O-01): verificación de solo lectura de un intento. Solo
 * devuelve identificadores del pedido, nunca su contenido. 1 lectura.
 */
export async function lookupOrderAttempt(
  tenantId: string,
  orderId: string
): Promise<Omit<CreatedOrderMeta, "replayed"> | null> {
  const snap = await orderDoc(tenantId, orderId).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  return {
    orderId: snap.id,
    displayOrderNumber: data.displayOrderNumber as number,
    displayCode: data.displayCode as string,
    operationalDate: data.operationalDate as string,
  };
}

/**
 * Lectura previa (fuera de transacción) para responder un reintento sin
 * revalidar tienda, caja ni productos: un pedido ya creado se recupera aunque
 * después cierre la tienda, se cierre la caja o cambie el día operacional.
 * Devuelve null si el intento todavía no existe.
 */
export async function findIdempotentOrder(
  tenantId: string,
  orderId: string,
  fingerprint: string
): Promise<CreatedOrderMeta | null> {
  const snap = await orderDoc(tenantId, orderId).get();
  return snap.exists ? replayFromSnapshot(snap, fingerprint) : null;
}

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
    acquisitionSource?: "instagram" | "facebook" | "whatsapp" | "in_person" | "other";
    acquisitionCampaign?: string;
    customerId?: string;
    customerPhoneNormalized?: string;
  },
  options: {
    /**
     * Runs inside the same transaction, after the counter read and before any
     * write. Used by M6J to reject orders while the store is closed.
     */
    guard?: (transaction: admin.firestore.Transaction, now: Date) => Promise<unknown>;
    /**
     * ORDER-IDEMPOTENCY: huella del intento. El `orderId` debe derivarse de la
     * clave (`deriveIdempotentOrderId`). Dentro de la misma transacción se lee
     * el pedido ANTES del contador y del guard: si existe se reproduce (o 409)
     * sin escribir nada; si no, se crea con `tx.create`.
     */
    idempotencyFingerprint: string;
  }
): Promise<CreatedOrderMeta> {
  const capturedNow = new Date();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const operationalDate = getOperationalDate(capturedNow);

  const runCreate = () => getDb().runTransaction(async (transaction): Promise<CreatedOrderMeta> => {
    const existing = await transaction.get(orderDoc(tenantId, orderId));
    if (existing.exists) {
      return replayFromSnapshot(existing, options.idempotencyFingerprint);
    }

    const counterRef = orderCounterDoc(tenantId, operationalDate);
    const counterSnap = await transaction.get(counterRef);
    if (options.guard) {
      await options.guard(transaction, capturedNow);
    }
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

    // `create` falla si una solicitud concurrente con la misma clave ya creó
    // el pedido: nunca se sobrescribe un pedido existente.
    transaction.create(orderDoc(tenantId, orderId), {
      id: orderId,
      tenantId,
      status: "queued",
      channel: input.channel,
      paymentMethod: input.paymentMethod,
      paymentStatus: "pending",
      ...(input.acquisitionSource ? { acquisitionSource: input.acquisitionSource } : {}),
      ...(input.acquisitionCampaign ? { acquisitionCampaign: input.acquisitionCampaign } : {}),
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
      idempotency: {
        version: IDEMPOTENCY_VERSION,
        fingerprint: options.idempotencyFingerprint,
      },
      createdAt: now,
      updatedAt: now,
    });

    return { orderId, displayOrderNumber, displayCode, operationalDate, replayed: false };
  });

  let meta: CreatedOrderMeta;
  try {
    meta = await runCreate();
  } catch (err) {
    // Carrera con la misma clave: otra solicitud creó el pedido entre la
    // lectura y el commit. Se responde con el pedido ganador.
    if ((err as { code?: unknown }).code === 6 /* ALREADY_EXISTS */) {
      const winner = await findIdempotentOrder(tenantId, orderId, options.idempotencyFingerprint);
      if (winner) {
        logger.info("Order idempotent race resolved", { tenantId, orderId });
        return winner;
      }
    }
    throw err;
  }

  logger.info(meta.replayed ? "Order replayed" : "Order created", { tenantId, ...meta });
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
  let previousStatus: OrderStatus | undefined;
  await getDb().runTransaction(async (transaction) => {
    const ref = orderDoc(tenantId, orderId);
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new NotFoundError(`Order ${orderId}`);

    const data = snap.data() as { status?: string; operationalDate?: string } | undefined;
    const currentStatus = data?.status as OrderStatus | undefined;
    previousStatus = currentStatus;

    if (currentStatus && isIllegalTransition(currentStatus, newStatus)) {
      throw new ConflictError(
        `Illegal transition from "${currentStatus}" to "${newStatus}"`
      );
    }

    if (data?.operationalDate) {
      await assertCashCloseOpen(transaction, tenantId, data.operationalDate);
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(ref, {
      status: newStatus,
      statusChangedAt: now,
      updatedAt: now,
    });
  });

  logger.info("Order status updated", {
    tenantId,
    orderId,
    from: previousStatus,
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
