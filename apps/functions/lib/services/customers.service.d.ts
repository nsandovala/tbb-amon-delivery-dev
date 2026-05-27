/**
 * Normalize a Chilean phone number to "+56XXXXXXXXX" (E.164, 12 chars).
 *
 * Accepted inputs:
 *   +56912345678   → +56912345678
 *   56912345678    → +56912345678
 *   912345678      → +56912345678
 *   09 1234 5678   → +56912345678
 *
 * Returns null if the result doesn't look like a valid Chilean mobile.
 */
export declare function normalizeChileanPhone(raw: string): string | null;
export interface CustomerOrderContext {
    tenantId: string;
    customer: {
        name: string;
        phone: string;
        email?: string;
        address?: string;
        notes?: string;
    };
    orderTotal: number;
    paymentMethod: string;
    fulfillmentType: string;
}
/**
 * Upsert a customer record based on the phone from the order.
 * Returns the normalizedPhone (used as customerId) or null if the phone
 * couldn't be normalized.
 *
 * This is fire-and-forget safe — order creation should NOT fail if
 * customer upsert fails.
 */
export declare function upsertCustomerFromOrder(ctx: CustomerOrderContext): Promise<string | null>;
