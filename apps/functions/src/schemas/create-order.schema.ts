// Re-export from @amon/shared for backward compatibility
// Source of truth: packages/shared/src/schemas/order.schema.ts
export {
  createOrderInputSchema as createOrderSchema,
  type CreateOrderInput,
  orderItemSchema,
  orderCustomerSchema,
} from "@amon/shared";
