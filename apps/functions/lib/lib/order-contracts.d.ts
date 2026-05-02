import { z } from "zod";
export declare const ORDER_STATUSES: readonly ["queued", "preparing", "ready", "on_the_way", "delivered", "cancelled"];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export declare const ILLEGAL_TRANSITIONS: Record<OrderStatus, OrderStatus[]>;
export declare const ORDER_CHANNELS: readonly ["web", "whatsapp", "admin_pos", "marketplace"];
export declare const PAYMENT_METHODS: readonly ["pending", "cash", "card", "transfer"];
export declare const FULFILLMENT_TYPES: readonly ["delivery", "pickup"];
export declare const paymentMethodSchema: z.ZodEnum<["pending", "cash", "card", "transfer"]>;
export declare const paymentStatusSchema: z.ZodEnum<["pending", "paid", "failed", "refunded"]>;
export declare const fulfillmentTypeSchema: z.ZodEnum<["delivery", "pickup"]>;
export declare const orderStatusSchema: z.ZodEnum<["queued", "preparing", "ready", "on_the_way", "delivered", "cancelled"]>;
export declare const orderChannelSchema: z.ZodEnum<["web", "whatsapp", "admin_pos", "marketplace"]>;
export declare const orderItemSchema: z.ZodObject<{
    productId: z.ZodString;
    productName: z.ZodString;
    qty: z.ZodNumber;
    unitPrice: z.ZodNumber;
    imageUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    categoryId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    productId: string;
    productName: string;
    qty: number;
    unitPrice: number;
    imageUrl?: string | null | undefined;
    categoryId?: string | null | undefined;
}, {
    productId: string;
    productName: string;
    qty: number;
    unitPrice: number;
    imageUrl?: string | null | undefined;
    categoryId?: string | null | undefined;
}>;
export declare const orderTotalsSchema: z.ZodObject<{
    subtotal: z.ZodNumber;
    delivery: z.ZodNumber;
    total: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    delivery: number;
    subtotal: number;
    total: number;
}, {
    delivery: number;
    subtotal: number;
    total: number;
}>;
export declare const orderCustomerSchema: z.ZodObject<{
    name: z.ZodString;
    phone: z.ZodString;
    email: z.ZodOptional<z.ZodString>;
    address: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    notes: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    phone: string;
    address: string;
    notes: string;
    email?: string | undefined;
}, {
    name: string;
    phone: string;
    email?: string | undefined;
    address?: string | undefined;
    notes?: string | undefined;
}>;
export declare const orderSchema: z.ZodObject<{
    tenantId: z.ZodString;
    status: z.ZodEnum<["queued", "preparing", "ready", "on_the_way", "delivered", "cancelled"]>;
    paymentStatus: z.ZodEnum<["pending", "paid", "failed", "refunded"]>;
    paymentMethod: z.ZodEnum<["pending", "cash", "card", "transfer"]>;
    channel: z.ZodEnum<["web", "whatsapp", "admin_pos", "marketplace"]>;
    fulfillmentType: z.ZodEnum<["delivery", "pickup"]>;
    items: z.ZodArray<z.ZodObject<{
        productId: z.ZodString;
        productName: z.ZodString;
        qty: z.ZodNumber;
        unitPrice: z.ZodNumber;
        imageUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        categoryId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        productId: string;
        productName: string;
        qty: number;
        unitPrice: number;
        imageUrl?: string | null | undefined;
        categoryId?: string | null | undefined;
    }, {
        productId: string;
        productName: string;
        qty: number;
        unitPrice: number;
        imageUrl?: string | null | undefined;
        categoryId?: string | null | undefined;
    }>, "many">;
    modifiers: z.ZodDefault<z.ZodArray<z.ZodUnknown, "many">>;
    totals: z.ZodObject<{
        subtotal: z.ZodNumber;
        delivery: z.ZodNumber;
        total: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        delivery: number;
        subtotal: number;
        total: number;
    }, {
        delivery: number;
        subtotal: number;
        total: number;
    }>;
    customer: z.ZodObject<{
        name: z.ZodString;
        phone: z.ZodString;
        email: z.ZodOptional<z.ZodString>;
        address: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        notes: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        phone: string;
        address: string;
        notes: string;
        email?: string | undefined;
    }, {
        name: string;
        phone: string;
        email?: string | undefined;
        address?: string | undefined;
        notes?: string | undefined;
    }>;
    createdAt: z.ZodOptional<z.ZodUnknown>;
    updatedAt: z.ZodOptional<z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    status: "queued" | "preparing" | "ready" | "on_the_way" | "delivered" | "cancelled";
    tenantId: string;
    paymentStatus: "pending" | "paid" | "failed" | "refunded";
    paymentMethod: "pending" | "cash" | "card" | "transfer";
    channel: "web" | "whatsapp" | "admin_pos" | "marketplace";
    fulfillmentType: "delivery" | "pickup";
    items: {
        productId: string;
        productName: string;
        qty: number;
        unitPrice: number;
        imageUrl?: string | null | undefined;
        categoryId?: string | null | undefined;
    }[];
    modifiers: unknown[];
    totals: {
        delivery: number;
        subtotal: number;
        total: number;
    };
    customer: {
        name: string;
        phone: string;
        address: string;
        notes: string;
        email?: string | undefined;
    };
    createdAt?: unknown;
    updatedAt?: unknown;
}, {
    status: "queued" | "preparing" | "ready" | "on_the_way" | "delivered" | "cancelled";
    tenantId: string;
    paymentStatus: "pending" | "paid" | "failed" | "refunded";
    paymentMethod: "pending" | "cash" | "card" | "transfer";
    channel: "web" | "whatsapp" | "admin_pos" | "marketplace";
    fulfillmentType: "delivery" | "pickup";
    items: {
        productId: string;
        productName: string;
        qty: number;
        unitPrice: number;
        imageUrl?: string | null | undefined;
        categoryId?: string | null | undefined;
    }[];
    totals: {
        delivery: number;
        subtotal: number;
        total: number;
    };
    customer: {
        name: string;
        phone: string;
        email?: string | undefined;
        address?: string | undefined;
        notes?: string | undefined;
    };
    modifiers?: unknown[] | undefined;
    createdAt?: unknown;
    updatedAt?: unknown;
}>;
export declare const createOrderInputSchema: z.ZodObject<{
    tenantId: z.ZodOptional<z.ZodString>;
    items: z.ZodArray<z.ZodObject<{
        productId: z.ZodString;
        qty: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        productId: string;
        qty: number;
    }, {
        productId: string;
        qty: number;
    }>, "many">;
    customer: z.ZodObject<{
        name: z.ZodString;
        phone: z.ZodString;
        email: z.ZodOptional<z.ZodString>;
        address: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        notes: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        phone: string;
        address: string;
        notes: string;
        email?: string | undefined;
    }, {
        name: string;
        phone: string;
        email?: string | undefined;
        address?: string | undefined;
        notes?: string | undefined;
    }>;
    fulfillmentType: z.ZodEnum<["delivery", "pickup"]>;
    paymentMethod: z.ZodDefault<z.ZodOptional<z.ZodEnum<["pending", "cash", "card", "transfer"]>>>;
}, "strip", z.ZodTypeAny, {
    paymentMethod: "pending" | "cash" | "card" | "transfer";
    fulfillmentType: "delivery" | "pickup";
    items: {
        productId: string;
        qty: number;
    }[];
    customer: {
        name: string;
        phone: string;
        address: string;
        notes: string;
        email?: string | undefined;
    };
    tenantId?: string | undefined;
}, {
    fulfillmentType: "delivery" | "pickup";
    items: {
        productId: string;
        qty: number;
    }[];
    customer: {
        name: string;
        phone: string;
        email?: string | undefined;
        address?: string | undefined;
        notes?: string | undefined;
    };
    tenantId?: string | undefined;
    paymentMethod?: "pending" | "cash" | "card" | "transfer" | undefined;
}>;
export declare const updateOrderStatusInputSchema: z.ZodObject<{
    status: z.ZodEnum<["queued", "preparing", "ready", "on_the_way", "delivered", "cancelled"]>;
}, "strip", z.ZodTypeAny, {
    status: "queued" | "preparing" | "ready" | "on_the_way" | "delivered" | "cancelled";
}, {
    status: "queued" | "preparing" | "ready" | "on_the_way" | "delivered" | "cancelled";
}>;
export declare const createPosSaleInputSchema: z.ZodObject<{
    tenantId: z.ZodOptional<z.ZodString>;
    items: z.ZodArray<z.ZodObject<{
        productId: z.ZodString;
        qty: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        productId: string;
        qty: number;
    }, {
        productId: string;
        qty: number;
    }>, "many">;
    customer: z.ZodObject<{
        name: z.ZodString;
        phone: z.ZodString;
        email: z.ZodOptional<z.ZodString>;
        address: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        notes: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        phone: string;
        address: string;
        notes: string;
        email?: string | undefined;
    }, {
        name: string;
        phone: string;
        email?: string | undefined;
        address?: string | undefined;
        notes?: string | undefined;
    }>;
    fulfillmentType: z.ZodDefault<z.ZodOptional<z.ZodEnum<["delivery", "pickup"]>>>;
    paymentMethod: z.ZodDefault<z.ZodOptional<z.ZodEnum<["pending", "cash", "card", "transfer"]>>>;
}, "strip", z.ZodTypeAny, {
    paymentMethod: "pending" | "cash" | "card" | "transfer";
    fulfillmentType: "delivery" | "pickup";
    items: {
        productId: string;
        qty: number;
    }[];
    customer: {
        name: string;
        phone: string;
        address: string;
        notes: string;
        email?: string | undefined;
    };
    tenantId?: string | undefined;
}, {
    items: {
        productId: string;
        qty: number;
    }[];
    customer: {
        name: string;
        phone: string;
        email?: string | undefined;
        address?: string | undefined;
        notes?: string | undefined;
    };
    tenantId?: string | undefined;
    paymentMethod?: "pending" | "cash" | "card" | "transfer" | undefined;
    fulfillmentType?: "delivery" | "pickup" | undefined;
}>;
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusInputSchema>;
export type CreatePosSaleInput = z.infer<typeof createPosSaleInputSchema>;
