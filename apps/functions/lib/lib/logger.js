"use strict";
/**
 * Minimal logger that writes to console (Cloud Functions / emulator compatible).
 * In production, replace or augment with structured logging service.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
function format(level, message, meta) {
    const ts = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    return `[${ts}] ${level.toUpperCase()}: ${message}${metaStr}`;
}
exports.logger = {
    info(message, meta) {
        console.log(format("info", message, meta));
    },
    warn(message, meta) {
        console.warn(format("warn", message, meta));
    },
    error(message, meta) {
        console.error(format("error", message, meta));
    },
    debug(message, meta) {
        if (process.env.LOG_LEVEL === "debug") {
            console.debug(format("debug", message, meta));
        }
    },
};
//# sourceMappingURL=logger.js.map