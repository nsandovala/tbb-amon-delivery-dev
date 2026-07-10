import { z } from "zod";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
} from "../constants/expense-categories.js";

/**
 * Operating expense category enum from shared constants
 */
export const expenseCategorySchema = z.enum(EXPENSE_CATEGORIES);

/**
 * Payment method enum restricted to the subset expenses accept
 */
export const expensePaymentMethodSchema = z.enum(EXPENSE_PAYMENT_METHODS);

/**
 * Input accepted by the createExpense function.
 * occurredAt is an ISO 8601 timestamp; when omitted the server stamps now.
 */
export const createExpenseInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  category: expenseCategorySchema,
  description: z.string().trim().min(2, "Description must be at least 2 characters"),
  amount: z.number().positive("Amount must be positive"),
  paymentMethod: expensePaymentMethodSchema.optional().default("cash"),
  occurredAt: z.string().datetime("occurredAt must be an ISO 8601 timestamp").optional(),
  notes: z.string().trim().optional(),
});

/**
 * Shape of a persisted expense document under tenants/{tenantId}/expenses.
 * Timestamp fields are left as unknown because their runtime type differs
 * between the Admin SDK and the client SDK.
 */
export const expenseSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1, "Tenant ID is required"),
  category: expenseCategorySchema,
  description: z.string().min(2),
  amount: z.number().positive(),
  paymentMethod: expensePaymentMethodSchema,
  status: z.literal("active"),
  notes: z.string().optional(),
  occurredAt: z.unknown().optional(),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseInputSchema>;
export type Expense = z.infer<typeof expenseSchema>;
