export declare const TBB_ORDERS: ({
    id: string;
    status: string;
    channel: string;
    customer: {
        name: string;
        phone: string;
    };
    items: {
        productId: string;
        name: string;
        qty: number;
        unitPrice: number;
        subtotal: number;
        selectedModifiers: {
            modifierId: string;
            name: string;
            unitPrice: number;
            qty: number;
            subtotal: number;
        }[];
    }[];
    totals: {
        subtotal: number;
        deliveryFee: number;
        discount: number;
        total: number;
    };
    ui: {
        source: string;
    };
} | {
    id: string;
    status: string;
    channel: string;
    customer: {
        name: string;
        phone: string;
    };
    items: {
        productId: string;
        name: string;
        qty: number;
        unitPrice: number;
        subtotal: number;
    }[];
    totals: {
        subtotal: number;
        deliveryFee: number;
        discount: number;
        total: number;
    };
    ui: {
        source: string;
    };
})[];
//# sourceMappingURL=orders.d.ts.map