// Re-export from @amon/shared for backward compatibility
// Source of truth: packages/shared/src/schemas/order.schema.ts
export {
  createPosSaleInputSchema as createPosSaleSchema,
  type CreatePosSaleInput,
  orderCustomerSchema,
} from "@amon/shared";
