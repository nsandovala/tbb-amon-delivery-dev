import type { PaymentMethod } from "./payment-methods.js";

export const EXPENSE_CATEGORIES = [
  "supplies",
  "fuel",
  "staff",
  "services",
  "maintenance",
  "packaging",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * Expenses accept a subset of the order payment methods: "card" is excluded
 * because the foodtruck settles operating costs in cash or by transfer.
 * The `satisfies` clause fails the build if any member stops being a valid
 * PaymentMethod, keeping this list tied to payment-methods.ts.
 */
export const EXPENSE_PAYMENT_METHODS = [
  "cash",
  "transfer",
  "pending",
] as const satisfies readonly PaymentMethod[];

export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];
