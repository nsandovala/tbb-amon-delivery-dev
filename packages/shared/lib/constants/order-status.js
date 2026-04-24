export const ORDER_STATUSES = [
    "queued",
    "preparing",
    "ready",
    "on_the_way",
    "delivered",
    "cancelled",
];
export const ACTIVE_ORDER_STATUSES = [
    "queued",
    "preparing",
    "ready",
    "on_the_way",
];
export const CLOSED_ORDER_STATUSES = [
    "delivered",
    "cancelled",
];
/**
 * Illegal transitions: from status → blocked statuses.
 * Terminal states (delivered, cancelled) block most transitions.
 */
export const ILLEGAL_TRANSITIONS = {
    delivered: ["queued", "preparing", "ready", "on_the_way"],
    cancelled: ["queued", "preparing", "ready", "on_the_way", "delivered"],
    queued: [],
    preparing: [],
    ready: [],
    on_the_way: [],
};
