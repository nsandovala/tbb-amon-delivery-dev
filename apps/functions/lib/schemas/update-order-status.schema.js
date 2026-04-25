"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ILLEGAL_TRANSITIONS = exports.VALID_STATUSES = exports.updateOrderStatusSchema = void 0;
// Re-export from @amon/shared for backward compatibility
// Source of truth: packages/shared/src/schemas/order.schema.ts
var shared_1 = require("@amon/shared");
Object.defineProperty(exports, "updateOrderStatusSchema", { enumerable: true, get: function () { return shared_1.updateOrderStatusInputSchema; } });
// Re-export constants from shared
var shared_2 = require("@amon/shared");
Object.defineProperty(exports, "VALID_STATUSES", { enumerable: true, get: function () { return shared_2.ORDER_STATUSES; } });
Object.defineProperty(exports, "ILLEGAL_TRANSITIONS", { enumerable: true, get: function () { return shared_2.ILLEGAL_TRANSITIONS; } });
//# sourceMappingURL=update-order-status.schema.js.map