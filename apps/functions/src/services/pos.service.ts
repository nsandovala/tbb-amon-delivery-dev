import {
  createOrder,
  findIdempotentOrder,
  type CreatedOrderMeta,
} from "../repositories/firestore-orders.repo";
import { deriveIdempotentOrderId, fingerprintOrderIntent } from "../lib/idempotency";
import type { CreatePosSaleInput } from "../schemas/order.shared";
import { logger } from "../lib/logger";
import { upsertCustomerFromOrder, normalizeChileanPhone } from "./customers.service";
import { ValidationError } from "../lib/errors";
import { assertStoreAcceptingOrders } from "./store-operation.service";
import { loadPricedProducts } from "./product-pricing";

const DELIVERY_FEE = 1500;

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
  fulfillmentType: "delivery" | "pickup"
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

  const delivery = resolveDeliveryFee(fulfillmentType);
  const total = subtotal + delivery;

  return {
    items: processedItems,
    subtotal,
    delivery,
    total,
  };
}

/**
 * POS sale creates an order with channel="admin_pos".
 * Totals are calculated server-side from DB product prices.
 */
export async function handleCreatePosSale(
  tenantId: string,
  input: CreatePosSaleInput
): Promise<CreatedOrderMeta> {
  // ORDER-IDEMPOTENCY: misma primitiva que la web, con canal propio. La
  // membresía ya se validó en la ruta; el reintento se responde antes de
  // leer productos o revisar tienda y caja.
  const orderId = deriveIdempotentOrderId(tenantId, "admin_pos", input.idempotencyKey);
  const fingerprint = fingerprintOrderIntent({
    channel: "admin_pos",
    items: input.items,
    customer: input.customer,
    fulfillmentType: input.fulfillmentType,
    paymentMethod: input.paymentMethod ?? "pending",
    acquisitionSource: input.acquisitionSource,
    acquisitionCampaign: input.acquisitionCampaign,
  });
  const previous = await findIdempotentOrder(tenantId, orderId, fingerprint);
  if (previous) {
    logger.info("POS sale replayed", { tenantId, orderId });
    return previous;
  }

  // Calculate totals server-side from DB prices
  const resolvedFulfillment = input.fulfillmentType;
  const { items: processedItems, subtotal, delivery, total } = await calculateTotals(
    tenantId,
    input.items,
    resolvedFulfillment
  );

  const rawPhone = input.customer.phone?.trim() ?? "";
  const normalizedPhone = rawPhone ? normalizeChileanPhone(rawPhone) : null;
  if (resolvedFulfillment === "delivery" && !normalizedPhone) {
    throw new ValidationError("El teléfono del cliente es obligatorio y debe ser un número chileno válido (+569XXXXXXXX)");
  }

  const orderMeta = await createOrder(tenantId, orderId, {
    items: processedItems,
    customer: input.customer,
    fulfillmentType: input.fulfillmentType,
    paymentMethod: input.paymentMethod ?? "pending",
    channel: "admin_pos",
    acquisitionSource: input.acquisitionSource,
    acquisitionCampaign: input.acquisitionCampaign,
    totals: { subtotal, delivery, total },
    customerId: normalizedPhone ?? undefined,
    customerPhoneNormalized: normalizedPhone ?? undefined,
  }, {
    guard: (tx, now) => assertStoreAcceptingOrders(tx, tenantId, now),
    idempotencyFingerprint: fingerprint,
  });

  if (orderMeta.replayed) {
    return orderMeta;
  }

  if (normalizedPhone) {
    await upsertCustomerFromOrder({
      tenantId,
      customer: {
        ...input.customer,
        phone: rawPhone,
      },
      orderTotal: total,
      paymentMethod: input.paymentMethod ?? "pending",
      fulfillmentType: resolvedFulfillment,
    });
  }

  logger.info("POS sale recorded", { tenantId, orderId, subtotal, total, customerId: normalizedPhone });

  return orderMeta;
}

