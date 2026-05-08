"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPosSaleSchema = exports.updateOrderStatusSchema = exports.createOrderSchema = exports.orderSchema = exports.orderCustomerSchema = exports.orderTotalsSchema = exports.orderItemSchema = exports.orderChannelSchema = exports.orderStatusSchema = exports.fulfillmentTypeSchema = exports.paymentStatusSchema = exports.paymentMethodSchema = exports.ILLEGAL_TRANSITIONS = exports.ORDER_STATUSES = void 0;
const zod_1 = require("zod");
exports.ORDER_STATUSES = [
    "queued",
    "preparing",
    "ready",
    "on_the_way",
    "delivered",
    "cancelled",
];
exports.ILLEGAL_TRANSITIONS = {
    delivered: ["queued", "preparing", "ready", "on_the_way"],
    cancelled: ["queued", "preparing", "ready", "on_the_way", "delivered"],
    queued: [],
    preparing: [],
    ready: [],
    on_the_way: [],
};
const ORDER_CHANNELS = [
    "web",
    "whatsapp",
    "admin_pos",
    "marketplace",
];
const PAYMENT_METHODS = [
    "pending",
    "cash",
    "card",
    "transfer",
];
const FULFILLMENT_TYPES = [
    "delivery",
    "pickup",
];
const optionalEmailSchema = zod_1.z.preprocess((value) => {
    if (typeof value !== "string")
        return value;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
}, zod_1.z.string().email("Email must be valid").optional());
exports.paymentMethodSchema = zod_1.z.enum(PAYMENT_METHODS);
exports.paymentStatusSchema = zod_1.z.enum([
    "pending",
    "paid",
    "failed",
    "refunded",
]);
exports.fulfillmentTypeSchema = zod_1.z.enum(FULFILLMENT_TYPES);
exports.orderStatusSchema = zod_1.z.enum(exports.ORDER_STATUSES);
exports.orderChannelSchema = zod_1.z.enum(ORDER_CHANNELS);
exports.orderItemSchema = zod_1.z.object({
    productId: zod_1.z.string().min(1, "Product ID is required"),
    productName: zod_1.z.string().min(1, "Product name is required"),
    qty: zod_1.z.number().int().positive("Quantity must be positive"),
    unitPrice: zod_1.z.number().nonnegative("Unit price must be non-negative"),
    imageUrl: zod_1.z.string().nullable().optional(),
    categoryId: zod_1.z.string().nullable().optional(),
});
exports.orderTotalsSchema = zod_1.z.object({
    subtotal: zod_1.z.number().nonnegative("Subtotal must be non-negative"),
    delivery: zod_1.z.number().nonnegative("Delivery fee must be non-negative"),
    total: zod_1.z.number().nonnegative("Total must be non-negative"),
});
exports.orderCustomerSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Customer name is required"),
    phone: zod_1.z.string().min(1, "Customer phone is required"),
    email: optionalEmailSchema,
    address: zod_1.z.string().optional().default(""),
    notes: zod_1.z.string().optional().default(""),
});
exports.orderSchema = zod_1.z.object({
    tenantId: zod_1.z.string().min(1, "Tenant ID is required"),
    status: exports.orderStatusSchema,
    paymentStatus: exports.paymentStatusSchema,
    paymentMethod: exports.paymentMethodSchema,
    channel: exports.orderChannelSchema,
    fulfillmentType: exports.fulfillmentTypeSchema,
    items: zod_1.z.array(exports.orderItemSchema).min(1, "Order must have at least one item"),
    modifiers: zod_1.z.array(zod_1.z.unknown()).default([]),
    totals: exports.orderTotalsSchema,
    customer: exports.orderCustomerSchema,
    createdAt: zod_1.z.unknown().optional(),
    updatedAt: zod_1.z.unknown().optional(),
});
exports.createOrderSchema = zod_1.z.object({
    tenantId: zod_1.z.string().min(1).optional(),
    items: zod_1.z.array(zod_1.z.object({
        productId: zod_1.z.string().min(1),
        qty: zod_1.z.number().int().positive(),
    })).min(1, "Order must have at least one item"),
    customer: exports.orderCustomerSchema,
    fulfillmentType: exports.fulfillmentTypeSchema,
    paymentMethod: exports.paymentMethodSchema.optional().default("pending"),
});
exports.updateOrderStatusSchema = zod_1.z.object({
    status: exports.orderStatusSchema,
});
exports.createPosSaleSchema = zod_1.z.object({
    tenantId: zod_1.z.string().min(1).optional(),
    items: zod_1.z.array(zod_1.z.object({
        productId: zod_1.z.string().min(1),
        qty: zod_1.z.number().int().positive(),
    })).min(1, "POS sale must have at least one item"),
    customer: exports.orderCustomerSchema,
    fulfillmentType: exports.fulfillmentTypeSchema.optional().default("pickup"),
    paymentMethod: exports.paymentMethodSchema.optional().default("pending"),
});
//# sourceMappingURL=order.shared.js.map