"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertCustomer = upsertCustomer;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const firebase_admin_2 = require("../lib/firebase-admin");
const logger_1 = require("../lib/logger");
const CUSTOMERS_COLLECTION = "customers";
/**
 * Tenant-scoped reference: tenants/{tenantId}/customers
 */
function customersCol(tenantId) {
    return (0, firebase_admin_2.getDb)().collection("tenants").doc(tenantId).collection(CUSTOMERS_COLLECTION);
}
function customerDoc(tenantId, customerId) {
    return customersCol(tenantId).doc(customerId);
}
/**
 * Upsert a customer document.
 * - Doc ID = normalizedPhone
 * - If exists: increment counters, update optional fields if better informed
 * - If new: create from scratch
 */
async function upsertCustomer(tenantId, normalizedPhone, data) {
    const ref = customerDoc(tenantId, normalizedPhone);
    const now = firebase_admin_1.default.firestore.FieldValue.serverTimestamp();
    const increment = firebase_admin_1.default.firestore.FieldValue.increment;
    await (0, firebase_admin_2.getDb)().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) {
            // ── UPDATE existing customer ──────────────────────────────
            const existing = snap.data();
            const updates = {
                phone: data.rawPhone,
                totalOrders: increment(1),
                totalSpent: increment(data.orderTotal),
                lastOrderAt: now,
                lastPaymentMethod: data.paymentMethod,
                lastFulfillmentType: data.fulfillmentType,
                updatedAt: now,
            };
            // Update name if the new one is "better informed" (longer or non-empty)
            if (data.name &&
                (!existing.name || data.name.length > existing.name.length)) {
                updates.name = data.name;
            }
            // Update email if provided and currently missing
            if (data.email && !existing.email) {
                updates.email = data.email;
            }
            // Append address if new and non-empty
            if (data.address && data.address.trim().length > 0) {
                const existingAddresses = existing.addresses || [];
                const trimmed = data.address.trim();
                if (!existingAddresses.includes(trimmed)) {
                    updates.addresses = firebase_admin_1.default.firestore.FieldValue.arrayUnion(trimmed);
                }
            }
            tx.update(ref, updates);
            logger_1.logger.debug("Customer updated", { tenantId, customerId: normalizedPhone });
        }
        else {
            // ── CREATE new customer ───────────────────────────────────
            const addresses = [];
            if (data.address && data.address.trim().length > 0) {
                addresses.push(data.address.trim());
            }
            tx.set(ref, {
                id: normalizedPhone,
                phone: data.rawPhone,
                phoneNormalized: normalizedPhone,
                name: data.name,
                ...(data.email ? { email: data.email } : {}),
                addresses,
                totalOrders: 1,
                totalSpent: data.orderTotal,
                lastOrderAt: now,
                lastPaymentMethod: data.paymentMethod,
                lastFulfillmentType: data.fulfillmentType,
                createdAt: now,
                updatedAt: now,
            });
            logger_1.logger.debug("Customer created", { tenantId, customerId: normalizedPhone });
        }
    });
}
//# sourceMappingURL=firestore-customers.repo.js.map