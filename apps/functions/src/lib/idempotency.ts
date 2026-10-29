import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError } from "./errors";

/**
 * ORDER-IDEMPOTENCY v1 — primitiva compartida por createOrder (web) y
 * createPosSale (POS).
 *
 * Diseño: el propio documento del pedido es el registro de idempotencia.
 * Su ID se DERIVA de (tenant, canal, clave) con SHA-256, así que dos intentos
 * con la misma clave apuntan siempre al mismo documento y la transacción de
 * creación (`tx.create`) garantiza que exista una sola vez, junto con el
 * incremento del contador operacional. No hay colección extra ni expiración:
 * la garantía dura mientras exista el pedido.
 *
 * La clave nunca se persiste en claro; el pedido guarda solo una huella del
 * contenido para distinguir un reintento equivalente de una reutilización.
 */

export const IDEMPOTENCY_VERSION = 1;

/** Clave aleatoria generada por el cliente (UUID v4 o 32+ hex). Sin datos personales. */
export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,128}$/, "idempotencyKey must be 16-128 URL-safe characters");

export type IdempotentChannel = "web" | "admin_pos";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * ID de pedido derivado: 20 caracteres base62, el mismo formato que los IDs
 * automáticos de Firestore (compatible con `getOrder` y la UI).
 */
export function deriveIdempotentOrderId(
  tenantId: string,
  channel: IdempotentChannel,
  key: string
): string {
  const digest = createHash("sha256").update(`amon-order:v1\n${tenantId}\n${channel}\n${key}`).digest();
  let id = "";
  for (let i = 0; i < 20; i += 1) {
    id += BASE62[digest[i] % 62];
  }
  return id;
}

/**
 * FIN-01: ID del evento de pago derivado de (tenant, pedido, acción, clave).
 * Leer este documento dentro de la transacción ES la verificación de
 * idempotencia: una clave ya usada para esa acción sobre ese pedido siempre
 * apunta al mismo evento, aunque después haya sido revertido.
 */
export function derivePaymentEventId(
  tenantId: string,
  orderId: string,
  action: string,
  key: string
): string {
  const digest = createHash("sha256")
    .update(`amon-payment-event:v1
${tenantId}
${orderId}
${action}
${key}`)
    .digest();
  let id = "";
  for (let i = 0; i < 20; i += 1) {
    id += BASE62[digest[i] % 62];
  }
  return id;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

/** Huella estable del contenido validado de la compra (sin la clave ni el tenant). */
export function fingerprintOrderIntent(intent: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(intent))).digest("hex");
}

/** Misma clave, contenido distinto. No incluye datos del pedido existente. */
export class IdempotencyKeyReusedError extends AppError {
  constructor() {
    super(
      "Esta clave de intento ya se usó para un pedido con otro contenido. Genera un intento nuevo.",
      409,
      "IDEMPOTENCY_KEY_REUSED"
    );
    this.name = "IdempotencyKeyReusedError";
  }
}
