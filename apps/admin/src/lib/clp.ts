export type ClpParseError = "empty" | "negative" | "decimal" | "zero" | "invalid";

export type ClpParseResult =
  | { ok: true; value: number }
  | { ok: false; reason: ClpParseError; message: string };

const MESSAGES: Record<ClpParseError, string> = {
  empty: "Ingresa un monto.",
  negative: "El monto no puede ser negativo.",
  decimal: "CLP no usa decimales. Ingresa pesos enteros, ej: 12000 o 12.000.",
  zero: "El monto debe ser mayor a cero.",
  invalid: "Monto no válido. Usa solo números, ej: 12000 o 12.000.",
};

function fail(reason: ClpParseError): ClpParseResult {
  return { ok: false, reason, message: MESSAGES[reason] };
}

/**
 * Parses CLP text typed by a person into whole pesos.
 * "." is only accepted as a thousands separator (1.200.000); anything that could be a
 * decimal ("12,50", "12.5", "1.200,00") is rejected rather than guessed.
 */
export function parseClpAmount(raw: string): ClpParseResult {
  const text = raw.trim().replace(/^\$\s*/, "").replace(/\s+/g, "");
  if (text === "") return fail("empty");
  if (text.startsWith("-")) return fail("negative");
  if (text.includes(",")) return fail("decimal");
  if (!/^[\d.]+$/.test(text)) return fail("invalid");

  let digits: string;
  if (text.includes(".")) {
    if (!/^\d{1,3}(\.\d{3})+$/.test(text)) return fail("decimal");
    digits = text.replace(/\./g, "");
  } else {
    digits = text;
  }

  if (/^0+$/.test(digits)) return fail("zero");
  if (digits.startsWith("0")) return fail("invalid");

  const value = Number(digits);
  if (!Number.isSafeInteger(value)) return fail("invalid");

  return { ok: true, value };
}

export function formatClp(value?: number): string {
  return `$${(value ?? 0).toLocaleString("es-CL")}`;
}
