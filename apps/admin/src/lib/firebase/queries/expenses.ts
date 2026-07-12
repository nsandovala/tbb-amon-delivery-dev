export type ExpenseCategory =
  | "supplies"
  | "fuel"
  | "staff"
  | "services"
  | "maintenance"
  | "packaging"
  | "other";

export type ExpensePaymentMethod = "cash" | "transfer" | "pending";

export interface AdminExpense {
  id: string;
  tenantId?: string;
  category?: ExpenseCategory;
  description?: string;
  amount?: number;
  paymentMethod?: ExpensePaymentMethod;
  status?: "active";
  notes?: string;
  occurredAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  supplies: "Insumos",
  fuel: "Combustible",
  staff: "Personal",
  services: "Servicios",
  maintenance: "Mantención",
  packaging: "Packaging",
  other: "Otros",
};

export const EXPENSE_PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  pending: "Pendiente",
};
