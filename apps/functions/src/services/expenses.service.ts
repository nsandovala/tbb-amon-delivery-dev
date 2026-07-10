import admin from "firebase-admin";
import { generateExpenseId, createExpense } from "../repositories/firestore-expenses.repo";
import type { CreateExpenseInput } from "../schemas/expense.schema";
import { logger } from "../lib/logger";

/**
 * Records an operating expense under tenants/{tenantId}/expenses.
 *
 * occurredAt lets the operator backdate an expense they are logging late.
 * When absent it falls back to the server clock, so the field is always set.
 */
export async function handleCreateExpense(
  tenantId: string,
  input: CreateExpenseInput
): Promise<{ expenseId: string }> {
  const expenseId = generateExpenseId(tenantId);

  const occurredAt = input.occurredAt
    ? admin.firestore.Timestamp.fromDate(new Date(input.occurredAt))
    : admin.firestore.FieldValue.serverTimestamp();

  await createExpense(tenantId, expenseId, { ...input, occurredAt });

  logger.info("Expense recorded", {
    tenantId,
    expenseId,
    category: input.category,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
  });

  return { expenseId };
}
