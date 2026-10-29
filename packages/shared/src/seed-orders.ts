/**
 * FIN-DATA-01 — Fecha operacional de los pedidos demo del seed.
 *
 * Los pedidos de `TBB_ORDERS` se escriben con `createdAt = now()`; sin
 * `operationalDate` quedaban fuera de Caja (que consulta por jornada) y sus
 * confirmaciones de pago nacían con origen desconocido. El seed les estampa la
 * jornada en que se crean, con la misma regla que `apps/functions`
 * (`getOperationalDate`: corte 05:00 en la zona de la tienda). No aplica a
 * pedidos reales históricos: a esos no se les inventa fecha.
 */

export const SEED_OPERATIONAL_CUTOFF_HOUR = 5;

export function seedOperationalDate(
  now: Date,
  timeZone: string,
  cutoffHour = SEED_OPERATIONAL_CUTOFF_HOUR
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? NaN);
  const base = new Date(Date.UTC(read("year"), read("month") - 1, read("day")));
  if (read("hour") < cutoffHour) base.setUTCDate(base.getUTCDate() - 1);
  return base.toISOString().slice(0, 10);
}

export function withSeedOperationalDate<T extends object>(
  orders: readonly T[],
  now: Date,
  timeZone: string
): (T & { operationalDate: string })[] {
  const operationalDate = seedOperationalDate(now, timeZone);
  return orders.map((order) => ({ ...order, operationalDate }));
}
