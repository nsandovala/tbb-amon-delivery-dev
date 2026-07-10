import { z } from "zod";

/**
 * Local mirror of packages/shared/src/schemas/expense.schema.ts.
 *
 * Functions compile to CommonJS and are packaged without the workspace, so the
 * ESM-only @amon/shared cannot be required at runtime. Same reason order.shared.ts
 * exists. Keep both copies in sync when the expense contract changes.
 */

const EXPENSE_CATEGORIES = [
  "supplies",
  "fuel",
  "staff",
  "services",
  "maintenance",
  "packaging",
  "other",
] as const;

const EXPENSE_PAYMENT_METHODS = [
  "cash",
  "transfer",
  "pending",
] as const;

export const expenseCategorySchema = z.enum(EXPENSE_CATEGORIES);
export const expensePaymentMethodSchema = z.enum(EXPENSE_PAYMENT_METHODS);

export const createExpenseSchema = z.object({
  tenantId: z.string().min(1).optional(),
  category: expenseCategorySchema,
  description: z.string().trim().min(2, "Description must be at least 2 characters"),
  amount: z.number().positive("Amount must be positive"),
  paymentMethod: expensePaymentMethodSchema.optional().default("cash"),
  occurredAt: z.string().datetime("occurredAt must be an ISO 8601 timestamp").optional(),
  notes: z.string().trim().optional(),
});

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
