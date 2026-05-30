export type OrderStatus = "queued" | "preparing" | "ready" | "on_the_way" | "delivered" | "cancelled";
export type OrderChannel = "web" | "whatsapp" | "admin_pos" | "marketplace";
export type OrderItemModifier = {
    modifierId: string;
    name: string;
    unitPrice: number;
    qty: number;
    subtotal: number;
};
export type OrderItem = {
    productId: string;
    name: string;
    qty: number;
    unitPrice: number;
    subtotal: number;
    selectedModifiers?: OrderItemModifier[];
};
export type Order = {
    id: string;
    tenantId: string;
    status: OrderStatus;
    channel: OrderChannel;
    customer: {
        name?: string;
        phone?: string;
        email?: string;
        address?: string;
        notes?: string;
    };
    /** MVP customer identity — normalized phone used as doc ID */
    customerId?: string;
    customerPhoneNormalized?: string;
    items: OrderItem[];
    totals: {
        subtotal: number;
        deliveryFee: number;
        discount: number;
        total: number;
    };
    ui?: {
        source?: "storefront" | "admin";
    };
    createdAt?: unknown;
    updatedAt?: unknown;
};
//# sourceMappingURL=order.d.ts.map