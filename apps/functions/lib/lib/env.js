"use strict";
/**
 * Environment variables required at runtime.
 * Fails fast if any mandatory variable is missing.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
function requireEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required env: ${name}`);
    }
    return value;
}
exports.env = {
    projectId: requireEnv("FIREBASE_PROJECT_ID"),
    nodeEnv: process.env.NODE_ENV || "development",
    isEmulator: process.env.FIRESTORE_EMULATOR_HOST !== undefined,
    emulatorHost: process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080",
};
//# sourceMappingURL=env.js.map