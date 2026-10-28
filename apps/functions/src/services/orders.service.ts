import {
  createOrder,
  findIdempotentOrder,
  getOrder,
  updateOrderStatus,
  type CreatedOrderMeta,
} from "../repositories/firestore-orders.repo";
import { deriveIdempotentOrderId, fingerprintOrderIntent } from "../lib/idempotency";
import type { CreateOrderInput, UpdateOrderStatusInput } from "../schemas/order.shared";
import { logger } from "../lib/logger";
import { upsertCustomerFromOrder, normalizeChileanPhone } from "./customers.service";
import { ValidationError } from "../lib/errors";
import { assertStoreAcceptingOrders, assertStoreAcceptingOrdersNow } from "./store-operation.service";
import { loadPricedProducts } from "./product-pricing";

const DELIVERY_FEE = 1500;
const MAX_DELIVERY_FEE = 10000;

/** Single source of truth for delivery fee based on fulfillment type */
function resolveDeliveryFee(fulfillmentType: "delivery" | "pickup"): number {
  return fulfillmentType === "delivery" ? DELIVERY_FEE : 0;
}

type ProcessedItem = {
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  imageUrl: string | null;
  categoryId: string | null;
};

async function calculateTotals(
  tenantId: string,
  items: { productId: string; qty: number }[],
  deliveryFee: number
): Promise<{
  items: ProcessedItem[];
  subtotal: number;
  delivery: number;
  total: number;
}> {
  // COST-GUARD: una lectura por producto distinto; 400 si alguno no está disponible.
  const products = await loadPricedProducts(
    tenantId,
    items.map((item) => item.productId)
  );

  const processedItems: ProcessedItem[] = [];
  let subtotal = 0;

  for (const item of items) {
    const product = products.get(item.productId)!;
    subtotal += product.price * item.qty;
    processedItems.push({
      productId: item.productId,
      productName: product.name,
      qty: item.qty,
      unitPrice: product.price,
      imageUrl: product.imageUrl,
      categoryId: product.categoryId,
    });
  }

  const safeDeliveryFee =
    typeof deliveryFee === "number" && deliveryFee >= 0 && deliveryFee <= MAX_DELIVERY_FEE
      ? deliveryFee
      : 0;
  const total = subtotal + safeDeliveryFee;

  return {
    items: processedItems,
    subtotal,
    delivery: safeDeliveryFee,
    total,
  };
}

export async function handleCreateOrder(
  tenantId: string,
  input: CreateOrderInput
): Promise<CreatedOrderMeta> {
  // COST-GUARD: validaciones sin costo primero (cero lecturas de Firestore).
  // Normalize phone for customer identity — reject if invalid
  const normalizedPhone = normalizeChileanPhone(input.customer.phone);
  if (!normalizedPhone) {
    throw new ValidationError("El teléfono del cliente es obligatorio y debe ser un número chileno válido (+569XXXXXXXX)");
  }

  // ORDER-IDEMPOTENCY: el ID del pedido se deriva de la clave del intento y
  // la huella cubre el contenido validado. Un reintento equivalente se
  // responde aquí (1 lectura), antes de revisar tienda, caja o productos.
  const orderId = deriveIdempotentOrderId(tenantId, "web", input.idempotencyKey);
  const fingerprint = fingerprintOrderIntent({
    channel: "web",
    items: input.items,
    customer: input.customer,
    fulfillmentType: input.fulfillmentType,
    paymentMethod: input.paymentMethod ?? "pending",
  });
  const previous = await findIdempotentOrder(tenantId, orderId, fingerprint);
  if (previous) {
    logger.info("Order replayed via service", { tenantId, orderId });
    return previous;
  }

  // COST-GUARD: con la tienda cerrada (o un tenant inexistente, que queda
  // fail-closed) se rechaza antes de leer productos o abrir la transacción.
  // Es solo un atajo: el guard transaccional de abajo sigue siendo la fuente
  // de verdad ante un cierre que ocurra entre ambas lecturas.
  await assertStoreAcceptingOrdersNow(tenantId);

  // Derive delivery fee from fulfillmentType (single source of truth)
  const fee = resolveDeliveryFee(input.fulfillmentType);

  // Calculate totals server-side from DB prices
  const { items: processedItems, subtotal, delivery, total } = await calculateTotals(
    tenantId,
    input.items,
    fee
  );

  const orderMeta = await createOrder(tenantId, orderId, {
    items: processedItems,
    customer: input.customer,
    fulfillmentType: input.fulfillmentType,
    paymentMethod: input.paymentMethod ?? "pending",
    channel: "web",
    totals: { subtotal, delivery, total },
    customerId: normalizedPhone,
    customerPhoneNormalized: normalizedPhone,
  }, {
    guard: (tx, now) => assertStoreAcceptingOrders(tx, tenantId, now),
    idempotencyFingerprint: fingerprint,
  });

  // Carrera con la misma clave resuelta en la transacción: no se repiten
  // efectos secundarios (estadísticas del cliente).
  if (orderMeta.replayed) {
    return orderMeta;
  }

  // Upsert customer (non-blocking — order is already persisted)
  await upsertCustomerFromOrder({
    tenantId,
    customer: input.customer,
    orderTotal: total,
    paymentMethod: input.paymentMethod ?? "pending",
    fulfillmentType: input.fulfillmentType,
  });

  logger.info("Order created via service", { tenantId, orderId, subtotal, delivery, total, customerId: normalizedPhone });

  return orderMeta;
}

export async function handleUpdateOrderStatus(
  tenantId: string,
  orderId: string,
  input: UpdateOrderStatusInput
): Promise<void> {
  await updateOrderStatus(tenantId, orderId, input.status);
}

export async function handleGetOrder(
  tenantId: string,
  orderId: string
) {
  const snap = await getOrder(tenantId, orderId);
  return { id: snap.id, ...snap.data() };
}
