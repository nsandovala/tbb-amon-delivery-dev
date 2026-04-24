/**
 * Minimal logger that writes to console (Cloud Functions / emulator compatible).
 * In production, replace or augment with structured logging service.
 */

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogMeta {
  [key: string]: unknown;
}

function format(level: LogLevel, message: string, meta?: LogMeta): string {
  const ts = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  return `[${ts}] ${level.toUpperCase()}: ${message}${metaStr}`;
}

export const logger = {
  info(message: string, meta?: LogMeta) {
    console.log(format("info", message, meta));
  },
  warn(message: string, meta?: LogMeta) {
    console.warn(format("warn", message, meta));
  },
  error(message: string, meta?: LogMeta) {
    console.error(format("error", message, meta));
  },
  debug(message: string, meta?: LogMeta) {
    if (process.env.LOG_LEVEL === "debug") {
      console.debug(format("debug", message, meta));
    }
  },
} as const;
