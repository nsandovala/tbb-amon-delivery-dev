"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCreatePosSale = handleCreatePosSale;
const firestore_orders_repo_1 = require("../repositories/firestore-orders.repo");
const firebase_admin_1 = require("../lib/firebase-admin");
const logger_1 = require("../lib/logger");
const customers_service_1 = require("./customers.service");
const DELIVERY_FEE = 1500;
/** Single source of truth for delivery fee based on fulfillment type */
function resolveDeliveryFee(fulfillmentType) {
    return fulfillmentType === "delivery" ? DELIVERY_FEE : 0;
}
async function calculateTotals(tenantId, items, fulfillmentType) {
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
    const delivery = resolveDeliveryFee(fulfillmentType);
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
    const resolvedFulfillment = input.fulfillmentType;
    const { items: processedItems, subtotal, delivery, total } = await calculateTotals(tenantId, input.items, resolvedFulfillment);
    // Normalize phone for customer identity — reject if invalid
    const normalizedPhone = (0, customers_service_1.normalizeChileanPhone)(input.customer.phone);
    if (!normalizedPhone) {
        throw new Error("El teléfono del cliente es obligatorio y debe ser un número chileno válido (+569XXXXXXXX)");
    }
    await (0, firestore_orders_repo_1.createOrder)(tenantId, orderId, {
        tenantId,
        items: processedItems,
        customer: input.customer,
        fulfillmentType: input.fulfillmentType,
        paymentMethod: input.paymentMethod ?? "pending",
        channel: "admin_pos",
        totals: { subtotal, delivery, total },
        customerId: normalizedPhone,
        customerPhoneNormalized: normalizedPhone,
    });
    // Upsert customer (non-blocking — order is already persisted)
    await (0, customers_service_1.upsertCustomerFromOrder)({
        tenantId,
        customer: input.customer,
        orderTotal: total,
        paymentMethod: input.paymentMethod ?? "pending",
        fulfillmentType: resolvedFulfillment,
    });
    logger_1.logger.info("POS sale recorded", { tenantId, orderId, subtotal, total, customerId: normalizedPhone });
    return { orderId };
}
//# sourceMappingURL=pos.service.js.map