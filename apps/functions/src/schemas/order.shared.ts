import { z } from "zod";

export const ORDER_STATUSES = [
  "queued",
  "preparing",
  "ready",
  "on_the_way",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ILLEGAL_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
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
] as const;

const PAYMENT_METHODS = [
  "pending",
  "cash",
  "card",
  "transfer",
] as const;

const FULFILLMENT_TYPES = [
  "delivery",
  "pickup",
] as const;

const optionalEmailSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  },
  z.string().email("Email must be valid").optional()
);

const optionalTrimmedStringSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  },
  z.string().optional()
);

export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export const paymentStatusSchema = z.enum([
  "pending",
  "paid",
  "failed",
  "refunded",
] as const);
export const fulfillmentTypeSchema = z.enum(FULFILLMENT_TYPES);
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const orderChannelSchema = z.enum(ORDER_CHANNELS);

export const orderItemSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  productName: z.string().min(1, "Product name is required"),
  qty: z.number().int().positive("Quantity must be positive"),
  unitPrice: z.number().nonnegative("Unit price must be non-negative"),
  imageUrl: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
});

export const orderTotalsSchema = z.object({
  subtotal: z.number().nonnegative("Subtotal must be non-negative"),
  delivery: z.number().nonnegative("Delivery fee must be non-negative"),
  total: z.number().nonnegative("Total must be non-negative"),
});

export const orderCustomerSchema = z.object({
  name: z.string().min(1, "Customer name is required"),
  phone: optionalTrimmedStringSchema,
  email: optionalEmailSchema,
  address: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

export const createOrderCustomerSchema = z.object({
  name: z.string().min(1, "Customer name is required"),
  phone: z.string().min(1, "Customer phone is required"),
  email: optionalEmailSchema,
  address: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

export const createPosSaleCustomerSchema = z.object({
  name: z.string().min(1, "Customer name is required"),
  phone: optionalTrimmedStringSchema,
  email: optionalEmailSchema,
  address: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

export const orderSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  status: orderStatusSchema,
  paymentStatus: paymentStatusSchema,
  paymentMethod: paymentMethodSchema,
  channel: orderChannelSchema,
  fulfillmentType: fulfillmentTypeSchema,
  items: z.array(orderItemSchema).min(1, "Order must have at least one item"),
  modifiers: z.array(z.unknown()).default([]),
  totals: orderTotalsSchema,
  customer: orderCustomerSchema,
  customerId: z.string().min(1).optional(),
  customerPhoneNormalized: z.string().min(1).optional(),
  displayOrderNumber: z.number().int().positive().optional(),
  displayCode: z.string().min(3).optional(),
  operationalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

export const createOrderSchema = z.object({
  tenantId: z.string().min(1).optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    qty: z.number().int().positive(),
  })).min(1, "Order must have at least one item"),
  customer: createOrderCustomerSchema,
  fulfillmentType: fulfillmentTypeSchema,
  paymentMethod: paymentMethodSchema.optional().default("pending"),
});

export const updateOrderStatusSchema = z.object({
  status: orderStatusSchema,
});

export const createPosSaleSchema = z.object({
  tenantId: z.string().min(1).optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    qty: z.number().int().positive(),
  })).min(1, "POS sale must have at least one item"),
  customer: createPosSaleCustomerSchema,
  fulfillmentType: fulfillmentTypeSchema.optional().default("pickup"),
  paymentMethod: paymentMethodSchema.optional().default("pending"),
}).superRefine((value, ctx) => {
  if (value.fulfillmentType !== "delivery") {
    return;
  }

  if (!value.customer.phone?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customer", "phone"],
      message: "Customer phone is required for delivery",
    });
  }

  if (!value.customer.address?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customer", "address"],
      message: "Customer address is required for delivery",
    });
  }
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type CreatePosSaleInput = z.infer<typeof createPosSaleSchema>;
