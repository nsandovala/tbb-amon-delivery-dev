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
