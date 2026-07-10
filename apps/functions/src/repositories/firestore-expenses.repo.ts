import admin from "firebase-admin";
import { getDb } from "../lib/firebase-admin";
import { logger } from "../lib/logger";
import type { CreateExpenseInput } from "../schemas/expense.schema";

const EXPENSES_COLLECTION = "expenses";

/**
 * Tenant-scoped reference: tenants/{tenantId}/expenses
 */
function expensesCol(tenantId: string): admin.firestore.CollectionReference {
  return getDb().collection("tenants").doc(tenantId).collection(EXPENSES_COLLECTION);
}

function expenseDoc(tenantId: string, expenseId: string): admin.firestore.DocumentReference {
  return expensesCol(tenantId).doc(expenseId);
}

/**
 * Generate a simple auto-id via Firestore.
 */
export function generateExpenseId(tenantId: string): string {
  return expensesCol(tenantId).doc().id;
}

/**
 * Create an expense document. Caller provides the expenseId and the resolved
 * occurredAt, which is either a client-supplied Timestamp or a server timestamp.
 */
export async function createExpense(
  tenantId: string,
  expenseId: string,
  input: Omit<CreateExpenseInput, "occurredAt"> & {
    occurredAt: admin.firestore.Timestamp | admin.firestore.FieldValue;
  }
): Promise<void> {
  const now = admin.firestore.FieldValue.serverTimestamp();

  await expenseDoc(tenantId, expenseId).set({
    id: expenseId,
    tenantId,
    category: input.category,
    description: input.description,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    status: "active",
    ...(input.notes ? { notes: input.notes } : {}),
    occurredAt: input.occurredAt,
    createdAt: now,
    updatedAt: now,
  });

  logger.info("Expense created", {
    tenantId,
    expenseId,
    category: input.category,
    amount: input.amount,
  });
}
