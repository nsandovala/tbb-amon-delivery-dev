import { z } from "zod";
/**
 * Payment method enum from shared constants
 */
export declare const paymentMethodSchema: z.ZodEnum<{
    pending: "pending";
    cash: "cash";
    card: "card";
    transfer: "transfer";
}>;
/**
 * Payment status enum
 */
export declare const paymentStatusSchema: z.ZodEnum<{
    pending: "pending";
    paid: "paid";
    failed: "failed";
    refunded: "refunded";
}>;
/**
 * Fulfillment type enum from shared constants
 */
export declare const fulfillmentTypeSchema: z.ZodEnum<{
    delivery: "delivery";
    pickup: "pickup";
}>;
/**
 * Order status enum from shared constants
 */
export declare const orderStatusSchema: z.ZodEnum<{
    queued: "queued";
    preparing: "preparing";
    ready: "ready";
    on_the_way: "on_the_way";
    delivered: "delivered";
    cancelled: "cancelled";
}>;
/**
 * Order channel enum from shared constants
 */
export declare const orderChannelSchema: z.ZodEnum<{
    web: "web";
    whatsapp: "whatsapp";
    admin_pos: "admin_pos";
    marketplace: "marketplace";
}>;
/**
 * Order item schema - represents a line item in an order
 */
export declare const orderItemSchema: z.ZodObject<{
    productId: z.ZodString;
    productName: z.ZodString;
    qty: z.ZodNumber;
    unitPrice: z.ZodNumber;
    imageUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    categoryId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
/**
 * Order totals schema
 */
export declare const orderTotalsSchema: z.ZodObject<{
    subtotal: z.ZodNumber;
    delivery: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strip>;
/**
 * Order customer schema
 */
export declare const orderCustomerSchema: z.ZodObject<{
    name: z.ZodString;
    phone: z.ZodString;
    email: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    address: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    notes: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
/**
 * Complete order schema for creation/validation
 */
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
/**
 * Schema for creating an order - client sends minimal data, server calculates totals
 */
export declare const createOrderInputSchema: z.ZodObject<{
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
/**
 * Schema for updating order status
 */
export declare const updateOrderStatusInputSchema: z.ZodObject<{
    status: z.ZodEnum<{
        queued: "queued";
        preparing: "preparing";
        ready: "ready";
        on_the_way: "on_the_way";
        delivered: "delivered";
        cancelled: "cancelled";
    }>;
}, z.core.$strip>;
/**
 * Schema for POS sale creation
 */
export declare const createPosSaleInputSchema: z.ZodObject<{
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
export type Order = z.infer<typeof orderSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type OrderTotals = z.infer<typeof orderTotalsSchema>;
export type OrderCustomer = z.infer<typeof orderCustomerSchema>;
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusInputSchema>;
export type CreatePosSaleInput = z.infer<typeof createPosSaleInputSchema>;
//# sourceMappingURL=order.schema.d.ts.map