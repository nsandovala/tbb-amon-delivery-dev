export declare const ORDER_STATUSES: readonly ["queued", "preparing", "ready", "on_the_way", "delivered", "cancelled"];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export declare const ACTIVE_ORDER_STATUSES: OrderStatus[];
export declare const CLOSED_ORDER_STATUSES: OrderStatus[];
/**
 * Illegal transitions: from status → blocked statuses.
 * Terminal states (delivered, cancelled) block most transitions.
 */
export declare const ILLEGAL_TRANSITIONS: Record<OrderStatus, OrderStatus[]>;
//# sourceMappingURL=order-status.d.ts.map