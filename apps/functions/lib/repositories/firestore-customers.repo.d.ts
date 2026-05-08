export interface CustomerUpsertData {
    rawPhone: string;
    name: string;
    email?: string;
    address?: string;
    orderTotal: number;
    paymentMethod: string;
    fulfillmentType: string;
}
/**
 * Upsert a customer document.
 * - Doc ID = normalizedPhone
 * - If exists: increment counters, update optional fields if better informed
 * - If new: create from scratch
 */
export declare function upsertCustomer(tenantId: string, normalizedPhone: string, data: CustomerUpsertData): Promise<void>;
