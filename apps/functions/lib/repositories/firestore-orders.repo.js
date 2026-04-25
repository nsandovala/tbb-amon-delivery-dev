"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrder = createOrder;
exports.generateOrderId = generateOrderId;
exports.getOrder = getOrder;
exports.updateOrderStatus = updateOrderStatus;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const firebase_admin_2 = require("../lib/firebase-admin");
const errors_1 = require("../lib/errors");
const logger_1 = require("../lib/logger");
const shared_1 = require("@amon/shared");
const ORDERS_COLLECTION = "orders";
/**
 * Tenant-scoped reference: tenants/{tenantId}/orders
 */
function ordersCol(tenantId) {
    return (0, firebase_admin_2.getDb)().collection("tenants").doc(tenantId).collection(ORDERS_COLLECTION);
}
function orderDoc(tenantId, orderId) {
    return ordersCol(tenantId).doc(orderId);
}
/**
 * Create an order document. Caller provides the orderId.
 * Totals are calculated server-side from product prices.
 */
async function createOrder(tenantId, orderId, input) {
    const now = firebase_admin_1.default.firestore.FieldValue.serverTimestamp();
    await orderDoc(tenantId, orderId).set({
        id: orderId,
        tenantId,
        status: "queued",
        channel: input.channel,
        paymentMethod: input.paymentMethod,
        paymentStatus: "pending",
        customer: input.customer,
        items: input.items,
        totals: input.totals,
        fulfillmentType: input.fulfillmentType,
        createdAt: now,
        updatedAt: now,
    });
    logger_1.logger.info("Order created", { tenantId, orderId });
}
/**
 * Generate a simple auto-id via Firestore.
 */
function generateOrderId(tenantId) {
    return ordersCol(tenantId).doc().id;
}
/**
 * Read a single order.
 */
async function getOrder(tenantId, orderId) {
    const snap = await orderDoc(tenantId, orderId).get();
    if (!snap.exists) {
        throw new errors_1.NotFoundError(`Order ${orderId}`);
    }
    return snap;
}
/**
 * Update order status with transition validation.
 */
async function updateOrderStatus(tenantId, orderId, newStatus) {
    const snap = await getOrder(tenantId, orderId);
    const data = snap.data();
    const currentStatus = data?.status;
    if (currentStatus && isIllegalTransition(currentStatus, newStatus)) {
        throw new errors_1.ConflictError(`Illegal transition from "${currentStatus}" to "${newStatus}"`);
    }
    const now = firebase_admin_1.default.firestore.FieldValue.serverTimestamp();
    await orderDoc(tenantId, orderId).update({
        status: newStatus,
        statusChangedAt: now,
        updatedAt: now,
    });
    logger_1.logger.info("Order status updated", {
        tenantId,
        orderId,
        from: currentStatus,
        to: newStatus,
    });
}
function isIllegalTransition(from, to) {
    const blocked = shared_1.ILLEGAL_TRANSITIONS[from];
    if (!blocked)
        return false;
    return blocked.includes(to);
}
//# sourceMappingURL=firestore-orders.repo.js.map