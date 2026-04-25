/**
 * Minimal logger that writes to console (Cloud Functions / emulator compatible).
 * In production, replace or augment with structured logging service.
 */
interface LogMeta {
    [key: string]: unknown;
}
export declare const logger: {
    readonly info: (message: string, meta?: LogMeta) => void;
    readonly warn: (message: string, meta?: LogMeta) => void;
    readonly error: (message: string, meta?: LogMeta) => void;
    readonly debug: (message: string, meta?: LogMeta) => void;
};
export {};
