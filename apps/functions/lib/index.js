"use strict";
/**
 * @amon/functions — Entry point.
 * Exports Firebase Functions for orders and POS.
 *
 * Route → Service → Repository.
 * All writes go through Firestore Admin SDK.
 * Tenant-aware under tenants/{tenantId}.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPosSale = exports.updateOrderStatus = exports.getOrder = exports.createOrder = void 0;
const orders_1 = require("./routes/orders");
Object.defineProperty(exports, "createOrder", { enumerable: true, get: function () { return orders_1.createOrder; } });
Object.defineProperty(exports, "getOrder", { enumerable: true, get: function () { return orders_1.getOrder; } });
const pos_1 = require("./routes/pos");
Object.defineProperty(exports, "updateOrderStatus", { enumerable: true, get: function () { return pos_1.updateOrderStatus; } });
Object.defineProperty(exports, "createPosSale", { enumerable: true, get: function () { return pos_1.createPosSale; } });
//# sourceMappingURL=index.js.map