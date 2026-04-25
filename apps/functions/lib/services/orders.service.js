"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCreateOrder = handleCreateOrder;
exports.handleUpdateOrderStatus = handleUpdateOrderStatus;
exports.handleGetOrder = handleGetOrder;
const firestore_orders_repo_1 = require("../repositories/firestore-orders.repo");
const firebase_admin_1 = require("../lib/firebase-admin");
const logger_1 = require("../lib/logger");
const DEFAULT_DELIVERY_FEE = 1500;
const MAX_DELIVERY_FEE = 10000;
async function calculateTotals(tenantId, items, deliveryFee) {
    const snaps = await Promise.all(items.map(item => (0, firebase_admin_1.getDb)()
        .collection("tenants")
        .doc(tenantId)
        .collection("products")
        .doc(item.productId)
        .get()));
    const processedItems = [];
    let subtotal = 0;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const snap = snaps[i];
        const data = snap.data();
        const price = data?.price;
        if (price === undefined || price === null) {
            throw new Error(`Product ${item.productId} has no price`);
        }
        const lineTotal = price * item.qty;
        subtotal += lineTotal;
        processedItems.push({
            productId: item.productId,
            productName: data?.name || `Product ${item.productId}`,
            qty: item.qty,
            unitPrice: price,
            imageUrl: data?.imageUrl || null,
            categoryId: data?.categoryId || null,
        });
    }
    const safeDeliveryFee = typeof deliveryFee === "number" && deliveryFee >= 0 && deliveryFee <= MAX_DELIVERY_FEE
        ? deliveryFee
        : DEFAULT_DELIVERY_FEE;
    const total = subtotal + safeDeliveryFee;
    return {
        items: processedItems,
        subtotal,
        delivery: safeDeliveryFee,
        total,
    };
}
async function handleCreateOrder(tenantId, input) {
    const orderId = (0, firestore_orders_repo_1.generateOrderId)(tenantId);
    // Calculate totals server-side from DB prices
    const { items: processedItems, subtotal, delivery, total } = await calculateTotals(tenantId, input.items, input.deliveryFee ?? DEFAULT_DELIVERY_FEE);
    await (0, firestore_orders_repo_1.createOrder)(tenantId, orderId, {
        tenantId,
        items: processedItems,
        customer: input.customer,
        fulfillmentType: input.fulfillmentType,
        paymentMethod: input.paymentMethod ?? "pending",
        channel: "web",
        totals: { subtotal, delivery, total },
    });
    logger_1.logger.info("Order created via service", { tenantId, orderId, subtotal, delivery, total });
    return { orderId };
}
async function handleUpdateOrderStatus(tenantId, orderId, input) {
    await (0, firestore_orders_repo_1.updateOrderStatus)(tenantId, orderId, input.status);
}
async function handleGetOrder(tenantId, orderId) {
    const snap = await (0, firestore_orders_repo_1.getOrder)(tenantId, orderId);
    return { id: snap.id, ...snap.data() };
}
//# sourceMappingURL=orders.service.js.map