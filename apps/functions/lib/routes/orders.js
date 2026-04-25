"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrder = exports.createOrder = void 0;
const https_1 = require("firebase-functions/v2/https");
const create_order_schema_1 = require("../schemas/create-order.schema");
const orders_service_1 = require("../services/orders.service");
const errors_1 = require("../lib/errors");
const logger_1 = require("../lib/logger");
const DEFAULT_TENANT = "tbb";
/**
 * POST /orders
 * Creates a new order in tenants/{tenantId}/orders.
 */
exports.createOrder = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    try {
        if (req.method !== "POST") {
            res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST only" } });
            return;
        }
        const body = req.body;
        if (!body) {
            res.status(400).json({ ok: false, error: { code: "MISSING_BODY", message: "Request body required" } });
            return;
        }
        const parsed = create_order_schema_1.createOrderSchema.safeParse(body);
        if (!parsed.success) {
            throw new errors_1.ValidationError("Invalid order payload", parsed.error.issues);
        }
        const tenantId = parsed.data.tenantId || DEFAULT_TENANT;
        const result = await (0, orders_service_1.handleCreateOrder)(tenantId, parsed.data);
        res.status(201).json({
            ok: true,
            data: { orderId: result.orderId, tenantId },
        });
    }
    catch (err) {
        handleError(err, res);
    }
});
/**
 * GET /orders/:id
 * Reads an order from tenants/{tenantId}/orders.
 * tenantId passed as query param or defaults to pilot tenant.
 */
exports.getOrder = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    try {
        const orderId = req.path.split("/").pop();
        if (!orderId) {
            res.status(400).json({ ok: false, error: { code: "MISSING_ID", message: "Order ID required" } });
            return;
        }
        const tenantId = req.query.tenantId || DEFAULT_TENANT;
        const order = await (0, orders_service_1.handleGetOrder)(tenantId, orderId);
        res.status(200).json({ ok: true, data: order });
    }
    catch (err) {
        handleError(err, res);
    }
});
function handleError(err, res) {
    if (err instanceof errors_1.ValidationError) {
        res.status(400).json({
            ok: false,
            error: { code: err.code, message: err.message, details: err.details },
        });
        return;
    }
    if (err instanceof errors_1.AppError) {
        res.status(err.statusCode).json({
            ok: false,
            error: { code: err.code, message: err.message },
        });
        return;
    }
    logger_1.logger.error("Unhandled error", { error: String(err) });
    res.status(500).json({
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
}
//# sourceMappingURL=orders.js.map