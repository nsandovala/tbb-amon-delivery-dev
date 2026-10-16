import { test, expect } from "@playwright/test";
import type { PublicStoreAvailability } from "../../apps/web/src/lib/api/orders";
import { getCurrentStoreSpecialDateNotice } from "../../apps/web/src/lib/store-special-date-notice";

const availability = (overrides: Partial<PublicStoreAvailability> = {}): PublicStoreAvailability => ({
  state: "scheduled_closed",
  acceptingOrders: false,
  timezone: "America/Santiago",
  localNow: "2026-12-25T12:00:00-03:00",
  override: null,
  specialDate: {
    date: "2026-12-25",
    mode: "closed",
    customerMessage: "Cerrado por feriado",
  },
  upcomingSpecialDates: [],
  ...overrides,
});

test.describe("Aviso público de fechas especiales", () => {
  test("una apertura manual reemplaza el aviso de cierre configurado", () => {
    expect(getCurrentStoreSpecialDateNotice(availability({
      state: "manual_open",
      acceptingOrders: true,
      override: { mode: "open" },
    }))).toEqual({
      title: "Apertura excepcional",
      message: "Hoy abrimos de forma excepcional y estamos recibiendo pedidos.",
    });
  });

  test("un cierre manual reemplaza el horario especial configurado", () => {
    expect(getCurrentStoreSpecialDateNotice(availability({
      state: "manual_closed",
      override: { mode: "closed" },
      specialDate: { date: "2026-12-25", mode: "custom_hours", open: "17:30", close: "22:30" },
    }))).toEqual({
      title: "Cierre excepcional",
      message: "Hoy cerramos por decisión del local y no estamos recibiendo pedidos.",
    });
  });

  test("sin override conserva la decisión y mensaje configurados", () => {
    expect(getCurrentStoreSpecialDateNotice(availability())).toEqual({
      title: "Atención de hoy",
      message: "Cerrado",
      customerMessage: "Cerrado por feriado",
    });
  });

  test("la jornada cerrada en caja prevalece sobre una apertura manual", () => {
    expect(getCurrentStoreSpecialDateNotice(availability({
      state: "closed",
      override: { mode: "open" },
    }))).toEqual({
      title: "Atención de hoy",
      message: "La tienda está cerrada y no está recibiendo pedidos.",
    });
  });

  test("la jornada cerrada en caja prevalece sobre el horario y mensaje de la excepción", () => {
    expect(getCurrentStoreSpecialDateNotice(availability({
      state: "closed",
      specialDate: {
        date: "2026-12-25",
        mode: "custom_hours",
        open: "17:30",
        close: "22:30",
        customerMessage: "Abriremos desde las 17:30",
      },
    }))).toEqual({
      title: "Atención de hoy",
      message: "La tienda está cerrada y no está recibiendo pedidos.",
    });
  });

  test("la jornada cerrada en caja prevalece sobre un override de cierre manual", () => {
    expect(getCurrentStoreSpecialDateNotice(availability({
      state: "closed",
      override: { mode: "closed" },
    }))).toEqual({
      title: "Atención de hoy",
      message: "La tienda está cerrada y no está recibiendo pedidos.",
    });
  });
});
