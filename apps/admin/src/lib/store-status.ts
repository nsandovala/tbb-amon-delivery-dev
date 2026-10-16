import type { StoreState, StoreStatus, Weekday } from "./api/store";
import { parseClpAmount } from "./clp";

/**
 * M6J — semántica visual del estado de tienda (sala de control, POS, cocina).
 *
 * Verde  = recibe pedidos según horario.
 * Ámbar  = recibe pedidos pero requiere atención (cierra pronto / abierta fuera de horario).
 * Rojo   = NO recibe pedidos (cerrada por horario, manual, caja cerrada o config inválida).
 */

export type StoreTone = "green" | "amber" | "red";

export const STORE_STATE_LABELS: Record<StoreState, string> = {
  scheduled_open: "Abierta",
  closing: "Cierra pronto",
  manual_open: "Abierta manual",
  scheduled_closed: "Cerrada",
  manual_closed: "Cerrada manual",
  closed: "Jornada cerrada",
};

export function getStoreTone(state: StoreState): StoreTone {
  if (state === "scheduled_open") return "green";
  if (state === "closing" || state === "manual_open") return "amber";
  return "red";
}

export const TONE_CLASSES: Record<
  StoreTone,
  { text: string; border: string; bg: string; dot: string; glow: string }
> = {
  green: {
    text: "text-emerald-300",
    border: "border-emerald-400/30",
    bg: "bg-emerald-400/[0.07]",
    dot: "bg-emerald-400",
    glow: "shadow-[0_0_40px_rgba(16,185,129,0.15)]",
  },
  amber: {
    text: "text-amber-300",
    border: "border-amber-400/35",
    bg: "bg-amber-400/[0.08]",
    dot: "bg-amber-400",
    glow: "shadow-[0_0_40px_rgba(251,191,36,0.15)]",
  },
  red: {
    text: "text-red-300",
    border: "border-red-500/35",
    bg: "bg-red-500/[0.08]",
    dot: "bg-red-500",
    glow: "shadow-[0_0_40px_rgba(239,68,68,0.15)]",
  },
};

export const WEEKDAY_ORDER: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
};

export const STORE_EVENT_LABELS: Record<string, string> = {
  schedule_transition: "Cambio por horario",
  store_opened: "Apertura manual",
  store_closed: "Cierre manual",
  store_reopened: "Reapertura",
  schedule_resumed: "Vuelve al horario",
  hours_updated: "Horario editado",
  cash_closed: "Cierre de caja",
};

/** Hora de pared en la timezone de la tienda; nunca la del navegador. */
export function formatStoreClock(nowMs: number, timeZone: string): { time: string; date: string } {
  try {
    const time = new Intl.DateTimeFormat("es-CL", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(nowMs);
    const dateParts = new Intl.DateTimeFormat("es-CL", {
      timeZone,
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).formatToParts(nowMs);
    const part = (type: Intl.DateTimeFormatPartTypes) => dateParts.find((item) => item.type === type)?.value ?? "";
    const date = `${part("weekday")}, ${part("day")}/${part("month")}/${part("year")}`;
    return { time, date };
  } catch {
    return { time: "--:--:--", date: "" };
  }
}

/** ISO operational date (YYYY-MM-DD) rendered for Chilean users as DD/MM/YYYY. */
export function formatOperationalDate(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/** ISO timestamp rendered in local calendar order without shifting its wall-clock date. */
export function formatLocalDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}` : value;
}

/** "HH:MM" de un ISO con offset, en la timezone de la tienda. */
export function formatStoreTime(iso: string | null, timeZone: string): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  try {
    return new Intl.DateTimeFormat("es-CL", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(ms);
  } catch {
    return "—";
  }
}

/** "en 1 h 05 min" / "en 42 s" / "ahora". */
export function formatCountdown(targetIso: string | null, nowMs: number): string | null {
  if (!targetIso) return null;
  const target = Date.parse(targetIso);
  if (Number.isNaN(target)) return null;
  const diff = Math.max(0, Math.round((target - nowMs) / 1000));
  if (diff === 0) return "ahora";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (days > 0) return `en ${days} d ${hours} h`;
  if (hours > 0) return `en ${hours} h ${String(minutes).padStart(2, "0")} min`;
  if (minutes > 0) return `en ${minutes} min`;
  return `en ${diff} s`;
}

/** Próxima transición relevante para la pantalla: cierre si recibe pedidos, apertura si no. */
export function getNextTransition(
  status: Pick<StoreStatus, "acceptingOrders" | "nextOpenAt" | "nextCloseAt">
): { label: string; at: string | null } {
  return status.acceptingOrders
    ? { label: "Cierra", at: status.nextCloseAt }
    : { label: "Abre", at: status.nextOpenAt };
}

/**
 * Efectivo contado: a diferencia de un gasto, `0` es válido (caja vacía).
 * El resto de reglas CLP (sin decimales, separador de miles) se reutiliza de parseClpAmount.
 */
export function parseCountedClp(raw: string): { ok: true; value: number } | { ok: false; message: string } {
  const text = raw.trim().replace(/^\$\s*/, "");
  if (/^0+$/.test(text)) return { ok: true, value: 0 };
  const parsed = parseClpAmount(raw);
  return parsed.ok ? parsed : { ok: false, message: parsed.message };
}
