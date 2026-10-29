export type MetricsRange = { start: Date; end: Date };
export type MetricsPeriod = "today" | "last7" | "last30" | "custom";
export type MetricsChannel = "all" | "web" | "admin_pos";
export type MetricsChartMode = "sales" | "orders";

export type MetricsDay = {
  key: string;
  sales: number;
  count: number;
};

function shiftCalendarDays(value: Date, days: number) {
  const shifted = new Date(value);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

/**
 * Builds a comparable period without moving an operational window into a
 * different part of the trading day. Custom ranges use the prior equal-length
 * interval; preset ranges shift by their calendar period and preserve local time.
 */
export function getPreviousMetricsRange(range: MetricsRange, period: MetricsPeriod): MetricsRange {
  if (period === "custom") {
    const length = Math.max(1, range.end.getTime() - range.start.getTime() + 1);
    const end = new Date(range.start.getTime() - 1);
    return { start: new Date(end.getTime() - length + 1), end };
  }

  const days = period === "today" ? 1 : period === "last7" ? 7 : 30;
  return {
    start: shiftCalendarDays(range.start, -days),
    end: shiftCalendarDays(range.end, -days),
  };
}

export function getTopMetricsDay<T extends MetricsDay>(days: T[], mode: MetricsChartMode): T | null {
  return days.reduce<T | null>((best, day) => {
    if (day.count <= 0) return best;
    if (!best) return day;
    const value = mode === "sales" ? day.sales : day.count;
    const bestValue = mode === "sales" ? best.sales : best.count;
    return value > bestValue ? day : best;
  }, null);
}

/** Expenses have no sales-channel attribution, so a channel-filtered net is invalid. */
export function getOperationalNet(sales: number, expenses: number, channel: MetricsChannel): number | null {
  return channel === "all" ? sales - expenses : null;
}

export type MetricsPaymentEvent = { type?: string; signedAmount?: number; at: Date | null };

export type MetricsTransferCollections = {
  /**
   * Cobro neto (confirmaciones − reversiones) con fecha dentro del rango.
   * null si la lectura se truncó (FIN-A01): con reversiones fuera del límite,
   * la suma parcial no es total ni mínimo garantizado.
   */
  net: number | null;
  /** Conteos de lo leído; con `complete: false` son parciales. */
  confirmedCount: number;
  revertedCount: number;
  complete: boolean;
};

/**
 * FIN-01: cobros por transferencia confirmados en el período, desde el libro
 * `paymentEvents`. Los eventos no tienen canal: con un filtro de canal la
 * métrica no aplica (null), igual que el neto operacional.
 */
export function getTransferCollectionsInRange(
  events: MetricsPaymentEvent[],
  range: MetricsRange,
  complete: boolean,
  channel: MetricsChannel
): MetricsTransferCollections | null {
  if (channel !== "all") return null;
  let net = 0;
  let confirmedCount = 0;
  let revertedCount = 0;
  for (const event of events) {
    if (!event.at || event.at < range.start || event.at > range.end) continue;
    const signed = typeof event.signedAmount === "number" && Number.isFinite(event.signedAmount) ? event.signedAmount : 0;
    net += signed;
    if (event.type === "transfer_confirmed") confirmedCount += 1;
    else if (event.type === "transfer_confirmation_reverted") revertedCount += 1;
  }
  return { net: complete ? net : null, confirmedCount, revertedCount, complete };
}
