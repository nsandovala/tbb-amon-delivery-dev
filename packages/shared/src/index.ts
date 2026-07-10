// Constants
export {
  ORDER_STATUSES,
  ACTIVE_ORDER_STATUSES,
  CLOSED_ORDER_STATUSES,
  ILLEGAL_TRANSITIONS,
  type OrderStatus,
} from "./constants/order-status.js";

export {
  ORDER_CHANNELS,
  type OrderChannel,
} from "./constants/channels.js";

export {
  PAYMENT_METHODS,
} from "./constants/payment-methods.js";

export {
  FULFILLMENT_TYPES,
} from "./constants/fulfillment-types.js";

export {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from "./constants/expense-categories.js";

// Schemas
export {
  paymentMethodSchema,
  paymentStatusSchema,
  fulfillmentTypeSchema,
  orderStatusSchema,
  orderChannelSchema,
  orderItemSchema,
  orderTotalsSchema,
  orderCustomerSchema,
  orderSchema,
  createOrderInputSchema,
  updateOrderStatusInputSchema,
  createPosSaleInputSchema,
} from "./schemas/order.schema.js";

export type {
  Order,
  OrderItem,
  OrderTotals,
  OrderCustomer,
  CreateOrderInput,
  UpdateOrderStatusInput,
  CreatePosSaleInput,
} from "./schemas/order.schema.js";

export {
  expenseCategorySchema,
  expensePaymentMethodSchema,
  expenseSchema,
  createExpenseInputSchema,
} from "./schemas/expense.schema.js";

export type {
  Expense,
  CreateExpenseInput,
} from "./schemas/expense.schema.js";

export type {
  Customer,
} from "./types/customer.js";
