"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCreatePosSale = handleCreatePosSale;
const firestore_orders_repo_1 = require("../repositories/firestore-orders.repo");
const firebase_admin_1 = require("../lib/firebase-admin");
const logger_1 = require("../lib/logger");
const DEFAULT_DELIVERY_FEE = 0;
async function calculateTotals(tenantId, items) {
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
    const delivery = DEFAULT_DELIVERY_FEE;
    const total = subtotal + delivery;
    return {
        items: processedItems,
        subtotal,
        delivery,
        total,
    };
}
/**
 * POS sale creates an order with channel="admin_pos".
 * Totals are calculated server-side from DB product prices.
 */
async function handleCreatePosSale(tenantId, input) {
    const orderId = (0, firestore_orders_repo_1.generateOrderId)(tenantId);
    // Calculate totals server-side from DB prices
    const { items: processedItems, subtotal, delivery, total } = await calculateTotals(tenantId, input.items);
    await (0, firestore_orders_repo_1.createOrder)(tenantId, orderId, {
        tenantId,
        items: processedItems,
        customer: input.customer,
        fulfillmentType: "pickup",
        paymentMethod: input.paymentMethod ?? "pending",
        channel: "admin_pos",
        totals: { subtotal, delivery, total },
    });
    logger_1.logger.info("POS sale recorded", { tenantId, orderId, subtotal, total });
    return { orderId };
}
//# sourceMappingURL=pos.service.js.map