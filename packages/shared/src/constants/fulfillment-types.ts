export const FULFILLMENT_TYPES = [
  "delivery",
  "pickup",
] as const;

export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];
