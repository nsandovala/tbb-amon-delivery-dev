import { expect, test } from "@playwright/test";
import { getOperationalNet, getPreviousMetricsRange, getTopMetricsDay } from "../../apps/admin/src/lib/metrics";

test.describe("Comparaciones de métricas por período", () => {
  test("hoy compara las mismas horas de la jornada operacional anterior", () => {
    const current = {
      start: new Date(2026, 9, 21, 5, 0, 0),
      end: new Date(2026, 9, 21, 12, 0, 0),
    };

    const previous = getPreviousMetricsRange(current, "today");

    expect(previous.start).toEqual(new Date(2026, 9, 20, 5, 0, 0));
    expect(previous.end).toEqual(new Date(2026, 9, 20, 12, 0, 0));
  });

  test("períodos de 7 y 30 días se alinean con el mismo tramo anterior", () => {
    const current = {
      start: new Date(2026, 9, 15, 5, 0, 0),
      end: new Date(2026, 9, 21, 12, 0, 0),
    };

    const previousWeek = getPreviousMetricsRange(current, "last7");
    const currentMonth = {
      start: new Date(2026, 8, 22, 5, 0, 0),
      end: new Date(2026, 9, 21, 12, 0, 0),
    };
    const previousMonth = getPreviousMetricsRange(currentMonth, "last30");

    expect(previousWeek.start).toEqual(new Date(2026, 9, 8, 5, 0, 0));
    expect(previousWeek.end).toEqual(new Date(2026, 9, 14, 12, 0, 0));
    expect(previousMonth.start).toEqual(new Date(2026, 7, 23, 5, 0, 0));
    expect(previousMonth.end).toEqual(new Date(2026, 8, 21, 12, 0, 0));
  });
});

test.describe("Alcance financiero y gráfico", () => {
  test("no calcula neto mezclando ventas filtradas y gastos de toda la tienda", () => {
    expect(getOperationalNet(10_000, 12_000, "web")).toBeNull();
    expect(getOperationalNet(20_000, 12_000, "admin_pos")).toBeNull();
    expect(getOperationalNet(30_000, 12_000, "all")).toBe(18_000);
  });

  test("destaca mayor venta o mayor cantidad según el modo del gráfico", () => {
    const days = [
      { key: "high-ticket", sales: 30_000, count: 1 },
      { key: "more-orders", sales: 20_000, count: 4 },
      { key: "empty", sales: 0, count: 0 },
    ];

    expect(getTopMetricsDay(days, "sales")?.key).toBe("high-ticket");
    expect(getTopMetricsDay(days, "orders")?.key).toBe("more-orders");
    expect(getTopMetricsDay([], "orders")).toBeNull();
  });
});
