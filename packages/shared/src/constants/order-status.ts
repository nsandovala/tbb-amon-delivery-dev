export const ORDER_STATUSES = [
  "queued",
  "preparing",
  "ready",
  "on_the_way",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  "queued",
  "preparing",
  "ready",
  "on_the_way",
];

export const CLOSED_ORDER_STATUSES: OrderStatus[] = [
  "delivered",
  "cancelled",
];

/**
 * Illegal transitions: from status → blocked statuses.
 * Terminal states (delivered, cancelled) block most transitions.
 */
export const ILLEGAL_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  delivered: ["queued", "preparing", "ready", "on_the_way"],
  cancelled: ["queued", "preparing", "ready", "on_the_way", "delivered"],
  queued: [],
  preparing: [],
  ready: [],
  on_the_way: [],
};
