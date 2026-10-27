import { z } from "zod";
import { DOCUMENT_ID_PATTERN, ORDER_LIMITS } from "./order-limits";

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
  z.string().max(ORDER_LIMITS.maxEmailLength).email("Email must be valid").optional()
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
  name: z.string().trim().min(1, "Customer name is required").max(ORDER_LIMITS.maxCustomerNameLength),
  phone: z.string().trim().min(1, "Customer phone is required").max(ORDER_LIMITS.maxPhoneLength),
  email: optionalEmailSchema,
  address: z.string().max(ORDER_LIMITS.maxAddressLength).optional().default(""),
  notes: z.string().max(ORDER_LIMITS.maxNotesLength).optional().default(""),
});

/**
 * COST-GUARD: entrada de líneas para createOrder/createPosSale. Acota líneas,
 * cantidades e IDs antes de cualquier lectura de Firestore.
 */
const documentIdSchema = z
  .string()
  .min(1)
  .max(ORDER_LIMITS.maxIdLength)
  .regex(DOCUMENT_ID_PATTERN, "Invalid document ID");

const orderInputItemsSchema = (emptyMessage: string) =>
  z
    .array(
      z.object({
        productId: documentIdSchema,
        qty: z.number().int().positive().max(ORDER_LIMITS.maxQtyPerLine),
      })
    )
    .min(1, emptyMessage)
    .max(ORDER_LIMITS.maxLines, `Order cannot have more than ${ORDER_LIMITS.maxLines} lines`)
    .refine(
      (items) => items.reduce((sum, item) => sum + item.qty, 0) <= ORDER_LIMITS.maxTotalUnits,
      { message: `Order cannot exceed ${ORDER_LIMITS.maxTotalUnits} units` }
    );

export const createPosSaleCustomerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required").max(ORDER_LIMITS.maxCustomerNameLength),
  phone: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const normalized = value.trim();
      return normalized.length > 0 ? normalized : undefined;
    },
    z.string().max(ORDER_LIMITS.maxPhoneLength).optional()
  ),
  email: optionalEmailSchema,
  address: z.string().max(ORDER_LIMITS.maxAddressLength).optional().default(""),
  notes: z.string().max(ORDER_LIMITS.maxNotesLength).optional().default(""),
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
  tenantId: documentIdSchema.optional(),
  items: orderInputItemsSchema("Order must have at least one item"),
  customer: createOrderCustomerSchema,
  fulfillmentType: fulfillmentTypeSchema,
  paymentMethod: paymentMethodSchema.optional().default("pending"),
}).superRefine((value, ctx) => {
  if (value.fulfillmentType === "delivery" && !value.customer.address?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customer", "address"],
      message: "Customer address is required for delivery",
    });
  }
});

export const updateOrderStatusSchema = z.object({
  status: orderStatusSchema,
});

export const createPosSaleSchema = z.object({
  tenantId: documentIdSchema.optional(),
  items: orderInputItemsSchema("POS sale must have at least one item"),
  customer: createPosSaleCustomerSchema,
  fulfillmentType: fulfillmentTypeSchema.optional().default("pickup"),
  paymentMethod: paymentMethodSchema.optional().default("pending"),
  acquisitionSource: z.enum(["instagram", "facebook", "whatsapp", "in_person", "other"]).optional(),
  acquisitionCampaign: z.string().trim().max(100).optional(),
}).superRefine((value, ctx) => {
  if (value.acquisitionCampaign && !value.acquisitionSource) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["acquisitionCampaign"],
      message: "Selecciona el origen antes de indicar una campaña o publicación",
    });
  }

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
