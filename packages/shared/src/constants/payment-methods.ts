export const PAYMENT_METHODS = [
  "pending",
  "cash",
  "card",
  "transfer",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
