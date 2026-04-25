"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderCustomerSchema = exports.orderItemSchema = exports.createOrderSchema = void 0;
// Re-export from @amon/shared for backward compatibility
// Source of truth: packages/shared/src/schemas/order.schema.ts
var shared_1 = require("@amon/shared");
Object.defineProperty(exports, "createOrderSchema", { enumerable: true, get: function () { return shared_1.createOrderInputSchema; } });
Object.defineProperty(exports, "orderItemSchema", { enumerable: true, get: function () { return shared_1.orderItemSchema; } });
Object.defineProperty(exports, "orderCustomerSchema", { enumerable: true, get: function () { return shared_1.orderCustomerSchema; } });
//# sourceMappingURL=create-order.schema.js.map