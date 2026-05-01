import { generateOrderId, createOrder } from "../repositories/firestore-orders.repo";
import { getDb } from "../lib/firebase-admin";
import type { CreatePosSaleInput } from "../lib/order-contracts";
import { logger } from "../lib/logger";

const DEFAULT_DELIVERY_FEE = 0;

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
  items: { productId: string; qty: number }[]
): Promise<{
  items: ProcessedItem[];
  subtotal: number;
  delivery: number;
  total: number;
}> {
  const snaps = await Promise.all(
    items.map(item =>
      getDb()
        .collection("tenants")
        .doc(tenantId)
        .collection("products")
        .doc(item.productId)
        .get()
    )
  );

  const processedItems: ProcessedItem[] = [];
  let subtotal = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const snap = snaps[i];
    const data = snap.data() as {
      name?: string;
      imageUrl?: string;
      categoryId?: string;
      price?: number;
    } | undefined;

    const price = data?.price;
    if (price === undefined || price === null) {
      throw new Error(`Product ${item.productId} has no price`);
    }

    const lineTotal = price * item.qty;
    subtotal += lineTotal;

    processedItems.push({
      productId: item.productId,
      productName: data?.name || `Product ${item.productId}`,
      qty: item.qty,
      unitPrice: price,
      imageUrl: data?.imageUrl || null,
      categoryId: data?.categoryId || null,
    });
  }

  const delivery = DEFAULT_DELIVERY_FEE;
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
): Promise<{ orderId: string }> {
  const orderId = generateOrderId(tenantId);

  // Calculate totals server-side from DB prices
  const { items: processedItems, subtotal, delivery, total } = await calculateTotals(
    tenantId,
    input.items
  );

  await createOrder(tenantId, orderId, {
    tenantId,
    items: processedItems,
    customer: input.customer,
    fulfillmentType: "pickup",
    paymentMethod: input.paymentMethod ?? "pending",
    channel: "admin_pos",
    totals: { subtotal, delivery, total },
  });

  logger.info("POS sale recorded", { tenantId, orderId, subtotal, total });

  return { orderId };
}
