import { test, expect } from "@playwright/test";
import {
  formatCountdown,
  formatLocalDateTime,
  formatOperationalDate,
  formatStoreClock,
  formatStoreTime,
  getNextTransition,
  getStoreTone,
  parseCountedClp,
} from "../../apps/admin/src/lib/store-status";
import { isValidScheduleTime } from "../../apps/admin/src/lib/schedule";

/**
 * M6J — semántica visual de la sala de control (sin emulador).
 */

test.describe("Semáforo de estado", () => {
  test("verde solo para abierta por horario", () => {
    expect(getStoreTone("scheduled_open")).toBe("green");
  });

  test("ámbar cuando recibe pedidos pero requiere atención", () => {
    expect(getStoreTone("closing")).toBe("amber");
    expect(getStoreTone("manual_open")).toBe("amber");
  });

  test("rojo para todo estado que no recibe pedidos", () => {
    for (const state of ["scheduled_closed", "manual_closed", "closed"] as const) {
      expect(getStoreTone(state)).toBe("red");
    }
  });
});

test.describe("Reloj y transiciones", () => {
  test("el reloj usa la timezone de la tienda, no la del dispositivo", () => {
    const instant = Date.parse("2026-10-15T20:30:00Z");
    expect(formatStoreClock(instant, "America/Santiago").time).toBe("17:30:00");
    expect(formatStoreTime("2026-07-15T17:30:00-04:00", "America/Santiago")).toBe("17:30");
  });

  test("countdown legible", () => {
    const now = Date.parse("2026-10-15T20:00:00Z");
    expect(formatCountdown("2026-10-15T17:30:00-03:00", now)).toBe("en 30 min");
    expect(formatCountdown("2026-10-15T19:05:00-03:00", now)).toBe("en 2 h 05 min");
    expect(formatCountdown("2026-10-15T17:00:00-03:00", now)).toBe("ahora");
    expect(formatCountdown(null, now)).toBeNull();
  });

  test("fechas operativas y bitácora usan formato DD/MM/AAAA", () => {
    expect(formatOperationalDate("2026-10-16")).toBe("16/10/2026");
    expect(formatLocalDateTime("2026-10-16T17:30:00-03:00")).toBe("16/10/2026 17:30");
    expect(formatOperationalDate(null)).toBe("—");
  });

  test("muestra cierre si recibe pedidos y apertura si no", () => {
    const times = { nextOpenAt: "open", nextCloseAt: "close" };
    expect(getNextTransition({ acceptingOrders: true, ...times })).toEqual({ label: "Cierra", at: "close" });
    expect(getNextTransition({ acceptingOrders: false, ...times })).toEqual({ label: "Abre", at: "open" });
  });
});

test.describe("Efectivo contado", () => {
  test("acepta cero y montos CLP enteros", () => {
    expect(parseCountedClp("0")).toEqual({ ok: true, value: 0 });
    expect(parseCountedClp("45.000")).toEqual({ ok: true, value: 45000 });
    expect(parseCountedClp("$ 1.200.000")).toEqual({ ok: true, value: 1200000 });
  });

  test("rechaza decimales y negativos", () => {
    expect(parseCountedClp("12,50").ok).toBe(false);
    expect(parseCountedClp("-100").ok).toBe(false);
    expect(parseCountedClp("abc").ok).toBe(false);
  });
});

test.describe("Vista del horario semanal", () => {
  test("acepta horas válidas y rechaza 24:00", () => {
    expect(isValidScheduleTime("00:00")).toBe(true);
    expect(isValidScheduleTime("23:59")).toBe(true);
    expect(isValidScheduleTime("24:00")).toBe(false);
    expect(isValidScheduleTime("25:99")).toBe(false);
  });
});
