"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPosSale = exports.updateOrderStatus = void 0;
const https_1 = require("firebase-functions/v2/https");
const update_order_status_schema_1 = require("../schemas/update-order-status.schema");
const create_pos_sale_schema_1 = require("../schemas/create-pos-sale.schema");
const orders_service_1 = require("../services/orders.service");
const pos_service_1 = require("../services/pos.service");
const errors_1 = require("../lib/errors");
const logger_1 = require("../lib/logger");
const DEFAULT_TENANT = "tbb";
/**
 * PATCH /orders/:id/status
 * Transitions an order to a new status.
 * Validates transition rules at service/repository layer.
 */
exports.updateOrderStatus = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    try {
        if (req.method !== "PATCH") {
            res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "PATCH only" } });
            return;
        }
        // Support current frontend client (?orderId=...) and path-style invocations.
        const pathSegments = req.path.split("/").filter(Boolean);
        const orderIdFromPath = pathSegments[0];
        const orderIdFromQuery = typeof req.query.orderId === "string" ? req.query.orderId : undefined;
        const orderId = orderIdFromQuery || orderIdFromPath;
        if (!orderId) {
            res.status(400).json({ ok: false, error: { code: "MISSING_ID", message: "Order ID required" } });
            return;
        }
        const body = req.body;
        if (!body) {
            res.status(400).json({ ok: false, error: { code: "MISSING_BODY", message: "Request body required" } });
            return;
        }
        const parsed = update_order_status_schema_1.updateOrderStatusSchema.safeParse(body);
        if (!parsed.success) {
            throw new errors_1.ValidationError("Invalid status payload", parsed.error.issues);
        }
        const tenantId = DEFAULT_TENANT;
        await (0, orders_service_1.handleUpdateOrderStatus)(tenantId, orderId, parsed.data);
        res.status(200).json({
            ok: true,
            data: { orderId, status: parsed.data.status },
        });
    }
    catch (err) {
        handleError(err, res);
    }
});
/**
 * POST /pos/sale
 * Records a POS sale (creates order with channel=admin_pos).
 */
exports.createPosSale = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
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
        const parsed = create_pos_sale_schema_1.createPosSaleSchema.safeParse(body);
        if (!parsed.success) {
            throw new errors_1.ValidationError("Invalid POS sale payload", parsed.error.issues);
        }
        const tenantId = parsed.data.tenantId || DEFAULT_TENANT;
        const result = await (0, pos_service_1.handleCreatePosSale)(tenantId, parsed.data);
        res.status(201).json({
            ok: true,
            data: { orderId: result.orderId, tenantId },
        });
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
    if (err instanceof errors_1.NotFoundError) {
        res.status(404).json({
            ok: false,
            error: { code: err.code, message: err.message },
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
//# sourceMappingURL=pos.js.map