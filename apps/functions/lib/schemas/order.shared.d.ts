import { z } from "zod";
export declare const ORDER_STATUSES: readonly ["queued", "preparing", "ready", "on_the_way", "delivered", "cancelled"];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export declare const ILLEGAL_TRANSITIONS: Record<OrderStatus, OrderStatus[]>;
export declare const paymentMethodSchema: z.ZodEnum<{
    pending: "pending";
    cash: "cash";
    card: "card";
    transfer: "transfer";
}>;
export declare const paymentStatusSchema: z.ZodEnum<{
    pending: "pending";
    paid: "paid";
    failed: "failed";
    refunded: "refunded";
}>;
export declare const fulfillmentTypeSchema: z.ZodEnum<{
    delivery: "delivery";
    pickup: "pickup";
}>;
export declare const orderStatusSchema: z.ZodEnum<{
    queued: "queued";
    preparing: "preparing";
    ready: "ready";
    on_the_way: "on_the_way";
    delivered: "delivered";
    cancelled: "cancelled";
}>;
export declare const orderChannelSchema: z.ZodEnum<{
    web: "web";
    whatsapp: "whatsapp";
    admin_pos: "admin_pos";
    marketplace: "marketplace";
}>;
export declare const orderItemSchema: z.ZodObject<{
    productId: z.ZodString;
    productName: z.ZodString;
    qty: z.ZodNumber;
    unitPrice: z.ZodNumber;
    imageUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    categoryId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export declare const orderTotalsSchema: z.ZodObject<{
    subtotal: z.ZodNumber;
    delivery: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strip>;
export declare const orderCustomerSchema: z.ZodObject<{
    name: z.ZodString;
    phone: z.ZodString;
    email: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    address: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    notes: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export declare const orderSchema: z.ZodObject<{
    tenantId: z.ZodString;
    status: z.ZodEnum<{
        queued: "queued";
        preparing: "preparing";
        ready: "ready";
        on_the_way: "on_the_way";
        delivered: "delivered";
        cancelled: "cancelled";
    }>;
    paymentStatus: z.ZodEnum<{
        pending: "pending";
        paid: "paid";
        failed: "failed";
        refunded: "refunded";
    }>;
    paymentMethod: z.ZodEnum<{
        pending: "pending";
        cash: "cash";
        card: "card";
        transfer: "transfer";
    }>;
    channel: z.ZodEnum<{
        web: "web";
        whatsapp: "whatsapp";
        admin_pos: "admin_pos";
        marketplace: "marketplace";
    }>;
    fulfillmentType: z.ZodEnum<{
        delivery: "delivery";
        pickup: "pickup";
    }>;
    items: z.ZodArray<z.ZodObject<{
        productId: z.ZodString;
        productName: z.ZodString;
        qty: z.ZodNumber;
        unitPrice: z.ZodNumber;
        imageUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        categoryId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>;
    modifiers: z.ZodDefault<z.ZodArray<z.ZodUnknown>>;
    totals: z.ZodObject<{
        subtotal: z.ZodNumber;
        delivery: z.ZodNumber;
        total: z.ZodNumber;
    }, z.core.$strip>;
    customer: z.ZodObject<{
        name: z.ZodString;
        phone: z.ZodString;
        email: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
        address: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        notes: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    }, z.core.$strip>;
    customerId: z.ZodOptional<z.ZodString>;
    customerPhoneNormalized: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodUnknown>;
    updatedAt: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strip>;
export declare const createOrderSchema: z.ZodObject<{
    tenantId: z.ZodOptional<z.ZodString>;
    items: z.ZodArray<z.ZodObject<{
        productId: z.ZodString;
        qty: z.ZodNumber;
    }, z.core.$strip>>;
    customer: z.ZodObject<{
        name: z.ZodString;
        phone: z.ZodString;
        email: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
        address: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        notes: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    }, z.core.$strip>;
    fulfillmentType: z.ZodEnum<{
        delivery: "delivery";
        pickup: "pickup";
    }>;
    paymentMethod: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        pending: "pending";
        cash: "cash";
        card: "card";
        transfer: "transfer";
    }>>>;
}, z.core.$strip>;
export declare const updateOrderStatusSchema: z.ZodObject<{
    status: z.ZodEnum<{
        queued: "queued";
        preparing: "preparing";
        ready: "ready";
        on_the_way: "on_the_way";
        delivered: "delivered";
        cancelled: "cancelled";
    }>;
}, z.core.$strip>;
export declare const createPosSaleSchema: z.ZodObject<{
    tenantId: z.ZodOptional<z.ZodString>;
    items: z.ZodArray<z.ZodObject<{
        productId: z.ZodString;
        qty: z.ZodNumber;
    }, z.core.$strip>>;
    customer: z.ZodObject<{
        name: z.ZodString;
        phone: z.ZodString;
        email: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
        address: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        notes: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    }, z.core.$strip>;
    fulfillmentType: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        delivery: "delivery";
        pickup: "pickup";
    }>>>;
    paymentMethod: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        pending: "pending";
        cash: "cash";
        card: "card";
        transfer: "transfer";
    }>>>;
}, z.core.$strip>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type CreatePosSaleInput = z.infer<typeof createPosSaleSchema>;
