import type { Request } from "firebase-functions/v2/https";
import { PayloadTooLargeError } from "./errors";

/**
 * COST-GUARD: rechaza cuerpos JSON más grandes que `maxBytes` antes de validar
 * el contrato o tocar Firestore. Usa el cuerpo crudo que expone Cloud
 * Functions y, si no está, el header `Content-Length`.
 */
export function assertBodyWithinLimit(req: Request, maxBytes: number): void {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  const declared = Number(req.get("content-length") ?? 0);
  const size = raw ? raw.length : Number.isFinite(declared) ? declared : 0;
  if (size > maxBytes) {
    throw new PayloadTooLargeError(maxBytes);
  }
}
