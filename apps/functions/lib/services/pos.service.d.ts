import type { CreatePosSaleInput } from "../lib/order-contracts";
/**
 * POS sale creates an order with channel="admin_pos".
 * Totals are calculated server-side from DB product prices.
 */
export declare function handleCreatePosSale(tenantId: string, input: CreatePosSaleInput): Promise<{
    orderId: string;
}>;
