"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeChileanPhone = normalizeChileanPhone;
exports.upsertCustomerFromOrder = upsertCustomerFromOrder;
const firestore_customers_repo_1 = require("../repositories/firestore-customers.repo");
const logger_1 = require("../lib/logger");
/* ------------------------------------------------------------------ */
/*  Chilean phone normalization                                       */
/* ------------------------------------------------------------------ */
/**
 * Normalize a Chilean phone number to "+56XXXXXXXXX" (E.164, 12 chars).
 *
 * Accepted inputs:
 *   +56912345678   → +56912345678
 *   56912345678    → +56912345678
 *   912345678      → +56912345678
 *   09 1234 5678   → +56912345678
 *
 * Returns null if the result doesn't look like a valid Chilean mobile.
 */
function normalizeChileanPhone(raw) {
    // Strip everything except digits and leading +
    const cleaned = raw.replace(/[^\d+]/g, "");
    let digits;
    if (cleaned.startsWith("+56")) {
        digits = cleaned.slice(3);
    }
    else if (cleaned.startsWith("56") && cleaned.length >= 11) {
        digits = cleaned.slice(2);
    }
    else {
        digits = cleaned.replace(/^\+/, "");
    }
    // Remove leading 0 (e.g. "09…")
    if (digits.startsWith("0")) {
        digits = digits.slice(1);
    }
    // Chilean mobile: 9 digits starting with 9
    if (digits.length === 9 && digits.startsWith("9")) {
        return `+56${digits}`;
    }
    // Fallback: any 9-digit Chilean number (landline etc.)
    if (digits.length === 9) {
        return `+56${digits}`;
    }
    return null;
}
/**
 * Upsert a customer record based on the phone from the order.
 * Returns the normalizedPhone (used as customerId) or null if the phone
 * couldn't be normalized.
 *
 * This is fire-and-forget safe — order creation should NOT fail if
 * customer upsert fails.
 */
async function upsertCustomerFromOrder(ctx) {
    const normalized = normalizeChileanPhone(ctx.customer.phone);
    if (!normalized) {
        logger_1.logger.warn("Could not normalize customer phone, skipping customer upsert", {
            tenantId: ctx.tenantId,
            rawPhone: ctx.customer.phone,
        });
        return null;
    }
    try {
        await (0, firestore_customers_repo_1.upsertCustomer)(ctx.tenantId, normalized, {
            rawPhone: ctx.customer.phone,
            name: ctx.customer.name,
            email: ctx.customer.email,
            address: ctx.customer.address,
            orderTotal: ctx.orderTotal,
            paymentMethod: ctx.paymentMethod,
            fulfillmentType: ctx.fulfillmentType,
        });
        logger_1.logger.info("Customer upserted", {
            tenantId: ctx.tenantId,
            customerId: normalized,
        });
        return normalized;
    }
    catch (err) {
        logger_1.logger.error("Customer upsert failed (non-blocking)", {
            tenantId: ctx.tenantId,
            phone: normalized,
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}
//# sourceMappingURL=customers.service.js.map