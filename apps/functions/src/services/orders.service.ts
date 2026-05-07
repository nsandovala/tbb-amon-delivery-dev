import { generateOrderId, createOrder, getOrder, updateOrderStatus } from "../repositories/firestore-orders.repo";
import { getDb } from "../lib/firebase-admin";
import type { CreateOrderInput, UpdateOrderStatusInput } from "../schemas/order.shared";
import { logger } from "../lib/logger";

const DEFAULT_DELIVERY_FEE = 1500;
const MAX_DELIVERY_FEE = 10000;

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

  const safeDeliveryFee =
    typeof deliveryFee === "number" && deliveryFee >= 0 && deliveryFee <= MAX_DELIVERY_FEE
      ? deliveryFee
      : DEFAULT_DELIVERY_FEE;
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
  input: CreateOrderInput & { deliveryFee?: number }
): Promise<{ orderId: string }> {
  const orderId = generateOrderId(tenantId);

  // Calculate totals server-side from DB prices
  const { items: processedItems, subtotal, delivery, total } = await calculateTotals(
    tenantId,
    input.items,
    input.deliveryFee ?? DEFAULT_DELIVERY_FEE
  );

  await createOrder(tenantId, orderId, {
    tenantId,
    items: processedItems,
    customer: input.customer,
    fulfillmentType: input.fulfillmentType,
    paymentMethod: input.paymentMethod ?? "pending",
    channel: "web",
    totals: { subtotal, delivery, total },
  });

  logger.info("Order created via service", { tenantId, orderId, subtotal, delivery, total });

  return { orderId };
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
