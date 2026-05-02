"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ILLEGAL_TRANSITIONS = exports.VALID_STATUSES = exports.updateOrderStatusSchema = void 0;
var order_contracts_1 = require("../lib/order-contracts");
Object.defineProperty(exports, "updateOrderStatusSchema", { enumerable: true, get: function () { return order_contracts_1.updateOrderStatusInputSchema; } });
var order_contracts_2 = require("../lib/order-contracts");
Object.defineProperty(exports, "VALID_STATUSES", { enumerable: true, get: function () { return order_contracts_2.ORDER_STATUSES; } });
Object.defineProperty(exports, "ILLEGAL_TRANSITIONS", { enumerable: true, get: function () { return order_contracts_2.ILLEGAL_TRANSITIONS; } });
//# sourceMappingURL=update-order-status.schema.js.map