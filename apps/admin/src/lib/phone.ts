/**
 * Normalización y validación de teléfono chileno — lado admin / POS.
 *
 * Replica la lógica del backend (apps/functions/src/services/customers.service.ts)
 * para que lo que valida el POS coincida con lo que persiste el backend.
 *
 * DEUDA TÉCNICA (follow-up, NO bloqueante del piloto):
 * mover esto a packages/shared y que admin + functions importen UNA sola
 * fuente de verdad. Hoy se duplica a propósito para desbloquear el build.
 */

/**
 * Normaliza a "+56XXXXXXXXX" (E.164). Devuelve null si no parece chileno válido.
 *   +56912345678 / 56912345678 / 912345678 / 09 1234 5678  → +56912345678
 */
export function normalizeChileanPhone(raw: string): string | null {
  const cleaned = raw.replace(/[^\d+]/g, "");

  let digits: string;
  if (cleaned.startsWith("+56")) {
    digits = cleaned.slice(3);
  } else if (cleaned.startsWith("56") && cleaned.length >= 11) {
    digits = cleaned.slice(2);
  } else {
    digits = cleaned.replace(/^\+/, "");
  }

  // Quita 0 inicial (ej. "09…")
  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  // 9 dígitos = número chileno válido (móvil parte con 9)
  if (digits.length === 9) {
    return `+56${digits}`;
  }

  return null;
}

/** true si el teléfono normaliza a un chileno válido. */
export function isValidChileanPhone(raw: string): boolean {
  return normalizeChileanPhone(raw) !== null;
}