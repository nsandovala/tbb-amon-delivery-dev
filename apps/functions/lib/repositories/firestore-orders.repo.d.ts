import admin from "firebase-admin";
import type { CreateOrderInput, OrderStatus } from "@amon/shared";
export type OrderDoc = admin.firestore.DocumentSnapshot;
/**
 * Create an order document. Caller provides the orderId.
 * Totals are calculated server-side from product prices.
 */
export declare function createOrder(tenantId: string, orderId: string, input: CreateOrderInput & {
    totals: {
        subtotal: number;
        delivery: number;
        total: number;
    };
    paymentMethod: string;
    channel: string;
}): Promise<void>;
/**
 * Generate a simple auto-id via Firestore.
 */
export declare function generateOrderId(tenantId: string): string;
/**
 * Read a single order.
 */
export declare function getOrder(tenantId: string, orderId: string): Promise<admin.firestore.DocumentSnapshot>;
/**
 * Update order status with transition validation.
 */
export declare function updateOrderStatus(tenantId: string, orderId: string, newStatus: OrderStatus): Promise<void>;
