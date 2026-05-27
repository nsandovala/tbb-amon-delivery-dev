/**
 * Customer MVP type — identified by normalized phone number.
 * Stored at tenants/{tenantId}/customers/{normalizedPhone}.
 */
export type Customer = {
    id: string;
    phone: string;
    phoneNormalized: string;
    name: string;
    email?: string;
    addresses: string[];
    totalOrders: number;
    totalSpent: number;
    lastOrderAt: unknown;
    lastPaymentMethod: string;
    lastFulfillmentType: string;
    createdAt: unknown;
    updatedAt: unknown;
};
//# sourceMappingURL=customer.d.ts.map