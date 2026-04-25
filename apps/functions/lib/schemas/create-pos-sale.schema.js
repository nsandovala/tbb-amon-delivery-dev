"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderCustomerSchema = exports.createPosSaleSchema = void 0;
// Re-export from @amon/shared for backward compatibility
// Source of truth: packages/shared/src/schemas/order.schema.ts
var shared_1 = require("@amon/shared");
Object.defineProperty(exports, "createPosSaleSchema", { enumerable: true, get: function () { return shared_1.createPosSaleInputSchema; } });
Object.defineProperty(exports, "orderCustomerSchema", { enumerable: true, get: function () { return shared_1.orderCustomerSchema; } });
//# sourceMappingURL=create-pos-sale.schema.js.map