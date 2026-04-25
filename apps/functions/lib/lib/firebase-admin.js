"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const env_1 = require("./env");
let db;
/**
 * Singleton Firestore Admin instance.
 * Initialized once; emulator host is set before init if applicable.
 */
function getDb() {
    if (db)
        return db;
    if (!firebase_admin_1.default.apps.length) {
        firebase_admin_1.default.initializeApp({ projectId: env_1.env.projectId });
    }
    db = firebase_admin_1.default.firestore();
    return db;
}
//# sourceMappingURL=firebase-admin.js.map