import type { CreatePosSaleInput } from "../schemas/order.shared";
/**
 * POS sale creates an order with channel="admin_pos".
 * Totals are calculated server-side from DB product prices.
 */
export declare function handleCreatePosSale(tenantId: string, input: CreatePosSaleInput & {
    fulfillmentType?: "delivery" | "pickup";
}): Promise<{
    orderId: string;
}>;
