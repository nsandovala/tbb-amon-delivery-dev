import { z } from "zod";
import { ORDER_STATUSES } from "../constants/order-status.js";
import { ORDER_CHANNELS } from "../constants/channels.js";
import { PAYMENT_METHODS } from "../constants/payment-methods.js";
import { FULFILLMENT_TYPES } from "../constants/fulfillment-types.js";

const optionalEmailSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  },
  z.string().email("Email must be valid").optional()
);

/**
 * Payment method enum from shared constants
 */
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

/**
 * Payment status enum
 */
export const paymentStatusSchema = z.enum([
  "pending",
  "paid",
  "failed",
  "refunded",
] as const);

/**
 * Fulfillment type enum from shared constants
 */
export const fulfillmentTypeSchema = z.enum(FULFILLMENT_TYPES);

/**
 * Order status enum from shared constants
 */
export const orderStatusSchema = z.enum(ORDER_STATUSES);

/**
 * Order channel enum from shared constants
 */
export const orderChannelSchema = z.enum(ORDER_CHANNELS);

/**
 * Order item schema - represents a line item in an order
 */
export const orderItemSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  productName: z.string().min(1, "Product name is required"),
  qty: z.number().int().positive("Quantity must be positive"),
  unitPrice: z.number().nonnegative("Unit price must be non-negative"),
  imageUrl: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
});

/**
 * Order totals schema
 */
export const orderTotalsSchema = z.object({
  subtotal: z.number().nonnegative("Subtotal must be non-negative"),
  delivery: z.number().nonnegative("Delivery fee must be non-negative"),
  total: z.number().nonnegative("Total must be non-negative"),
});

/**
 * Order customer schema
 */
export const orderCustomerSchema = z.object({
  name: z.string().min(1, "Customer name is required"),
  phone: z.string().min(1, "Customer phone is required"),
  email: optionalEmailSchema,
  address: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

/**
 * Complete order schema for creation/validation
 */
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
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

/**
 * Schema for creating an order - client sends minimal data, server calculates totals
 */
export const createOrderInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    qty: z.number().int().positive(),
  })).min(1, "Order must have at least one item"),
  customer: orderCustomerSchema,
  fulfillmentType: fulfillmentTypeSchema,
  paymentMethod: paymentMethodSchema.optional().default("pending"),
});

/**
 * Schema for updating order status
 */
export const updateOrderStatusInputSchema = z.object({
  status: orderStatusSchema,
});

/**
 * Schema for POS sale creation
 */
export const createPosSaleInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    qty: z.number().int().positive(),
  })).min(1, "POS sale must have at least one item"),
  customer: orderCustomerSchema,
  fulfillmentType: fulfillmentTypeSchema.optional().default("pickup"),
  paymentMethod: paymentMethodSchema.optional().default("pending"),
});

export type Order = z.infer<typeof orderSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type OrderTotals = z.infer<typeof orderTotalsSchema>;
export type OrderCustomer = z.infer<typeof orderCustomerSchema>;
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusInputSchema>;
export type CreatePosSaleInput = z.infer<typeof createPosSaleInputSchema>;
