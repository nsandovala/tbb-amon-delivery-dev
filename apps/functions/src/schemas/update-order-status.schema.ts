// Re-export from @amon/shared for backward compatibility
// Source of truth: packages/shared/src/schemas/order.schema.ts
export {
  updateOrderStatusInputSchema as updateOrderStatusSchema,
  type UpdateOrderStatusInput,
} from "@amon/shared";

// Re-export constants from shared
export {
  ORDER_STATUSES as VALID_STATUSES,
  ILLEGAL_TRANSITIONS,
  type OrderStatus,
} from "@amon/shared";
