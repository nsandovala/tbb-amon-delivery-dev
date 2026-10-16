import { z } from "zod";

/**
 * M6J — Evaluador puro del estado operativo de la tienda.
 *
 * Sin Firestore ni reloj implícito: recibe `now`, la configuración horaria, el
 * override manual y el cierre de caja del día, y devuelve el estado efectivo.
 * Toda la aritmética de horario se hace en la timezone configurada (por
 * defecto `America/Santiago`) vía Intl, con DST real; nunca con la timezone
 * del proceso ni del navegador.
 *
 * Regla madre: si la configuración falta, es inválida o no puede evaluarse,
 * el resultado es `closed` con `acceptingOrders: false` (fail-closed).
 */

export const DEFAULT_STORE_TIMEZONE = "America/Santiago";
/** Corte del día operacional, igual que `operational-order.ts`. */
export const STORE_OPERATIONAL_CUTOFF_HOUR = 5;
export const DEFAULT_CLOSING_WARNING_MINUTES = 15;

/** Índice = `Date#getUTCDay()` de la fecha local. */
export const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const STORE_STATES = [
  "scheduled_closed",
  "scheduled_open",
  "manual_open",
  "manual_closed",
  "closing",
  "closed",
] as const;
export type StoreState = (typeof STORE_STATES)[number];

export type StoreStatusSource = "schedule" | "manual" | "system";

export type StoreReasonCode =
  | "WITHIN_SCHEDULE"
  | "CLOSING_SOON"
  | "BEFORE_OPENING"
  | "AFTER_CLOSING"
  | "DAY_DISABLED"
  | "SPECIAL_DATE_CLOSED"
  | "MANUAL_OPEN"
  | "MANUAL_CLOSE"
  | "CASH_CLOSED"
  | "CONFIG_MISSING"
  | "CONFIG_INVALID"
  | "SPECIAL_DATE_INVALID"
  | "OVERRIDE_INVALID"
  | "EVALUATION_ERROR";

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function hhmmToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export const dayScheduleSchema = z
  .object({
    enabled: z.boolean(),
    open: z.string().regex(HHMM_REGEX, "open must be HH:MM (24h)"),
    close: z.string().regex(HHMM_REGEX, "close must be HH:MM (24h)"),
  })
  .refine((day) => !day.enabled || hhmmToMinutes(day.close) > hhmmToMinutes(day.open), {
    message: "close must be after open on the same day (overnight windows are not supported)",
    path: ["close"],
  });

export const storeHoursConfigSchema = z.object({
  // The operational-order and cash-close contracts currently support the
  // Chile pilot timezone only. Keeping this explicit prevents split days.
  timezone: z.literal(DEFAULT_STORE_TIMEZONE),
  closingWarningMinutes: z
    .number()
    .int()
    .min(0)
    .max(120)
    .default(DEFAULT_CLOSING_WARNING_MINUTES),
  days: z.object({
    sunday: dayScheduleSchema,
    monday: dayScheduleSchema,
    tuesday: dayScheduleSchema,
    wednesday: dayScheduleSchema,
    thursday: dayScheduleSchema,
    friday: dayScheduleSchema,
    saturday: dayScheduleSchema,
  }),
});

export type DaySchedule = z.infer<typeof dayScheduleSchema>;
export type StoreHoursConfig = z.infer<typeof storeHoursConfigSchema>;

/** Una excepción aplica a una fecha calendario local y prevalece sobre el horario semanal. */
export const storeDateExceptionSchema = z.object({
  date: z.string().refine(isCalendarDate, "Usa una fecha calendario válida (AAAA-MM-DD)."),
  mode: z.enum(["closed", "regular_hours", "custom_hours"]),
  open: z.string().regex(HHMM_REGEX).optional(),
  close: z.string().regex(HHMM_REGEX).optional(),
  customerMessage: z.string().trim().max(160).optional().transform((value) => value || undefined),
}).superRefine((exception, ctx) => {
  if (exception.mode === "custom_hours") {
    if (!exception.open || !exception.close) {
      ctx.addIssue({ code: "custom", message: "Indica la hora de apertura y cierre." });
    } else if (hhmmToMinutes(exception.close) <= hhmmToMinutes(exception.open)) {
      ctx.addIssue({ code: "custom", path: ["close"], message: "El cierre debe ser posterior a la apertura." });
    }
  }
});
export type StoreDateException = z.infer<typeof storeDateExceptionSchema>;

export const storeActorSchema = z.object({
  uid: z.string().min(1),
  email: z.string().nullable().optional(),
});
export type StoreActor = z.infer<typeof storeActorSchema>;

export const storeOverrideSchema = z.object({
  mode: z.enum(["open", "closed"]),
  operationalDate: z.string().regex(DATE_REGEX),
  reason: z.string().nullable().optional(),
  actor: storeActorSchema.nullable().optional(),
  at: z.string().nullable().optional(),
});
export type StoreOverride = z.infer<typeof storeOverrideSchema>;

/** Horario inicial de TBB. Solo bootstrap: la evaluación siempre lee Firestore. */
export function buildDefaultStoreHoursConfig(): StoreHoursConfig {
  const day: DaySchedule = { enabled: true, open: "17:30", close: "22:30" };
  return {
    timezone: DEFAULT_STORE_TIMEZONE,
    closingWarningMinutes: DEFAULT_CLOSING_WARNING_MINUTES,
    days: {
      sunday: { ...day },
      monday: { ...day },
      tuesday: { ...day },
      wednesday: { ...day },
      thursday: { ...day },
      friday: { ...day },
      saturday: { ...day },
    },
  };
}

/* ─── Timezone arithmetic ─────────────────────────────────────────────── */

export type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: Weekday;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export function getLocalParts(date: Date, timeZone: string): LocalParts {
  const parts = getFormatter(timeZone).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? NaN);

  const year = read("year");
  const month = read("month");
  const day = read("day");
  const hour = read("hour");
  const minute = read("minute");
  const second = read("second");

  if ([year, month, day, hour, minute, second].some((value) => Number.isNaN(value))) {
    throw new Error(`Cannot resolve local time for timezone ${timeZone}`);
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday: WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()],
  };
}

/** Offset local − UTC en minutos para el instante dado (ej. -180 en verano chileno). */
export function getOffsetMinutes(date: Date, timeZone: string): number {
  const p = getLocalParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncated = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtc - truncated) / 60000);
}

type LocalDate = { year: number; month: number; day: number };

function addDays(date: LocalDate, days: number): LocalDate {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatLocalDate(date: LocalDate): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

export function formatLocalDateKey(date: Date, timeZone: string): string {
  const parts = getLocalParts(date, timeZone);
  return formatLocalDate({ year: parts.year, month: parts.month, day: parts.day });
}

function parseLocalDate(value: string): LocalDate {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function weekdayOf(date: LocalDate): Weekday {
  return WEEKDAYS[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()];
}

/**
 * Convierte una hora de pared local (fecha + minutos del día) a instante UTC.
 * Dos pasadas resuelven el offset en días de cambio DST.
 */
export function zonedWallTimeToUtc(
  date: LocalDate,
  minutesOfDay: number,
  timeZone: string
): Date {
  const guess = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    Math.floor(minutesOfDay / 60),
    minutesOfDay % 60
  );
  const firstOffset = getOffsetMinutes(new Date(guess), timeZone);
  let instant = guess - firstOffset * 60000;
  const secondOffset = getOffsetMinutes(new Date(instant), timeZone);
  if (secondOffset !== firstOffset) {
    instant = guess - secondOffset * 60000;
  }
  return new Date(instant);
}

/** ISO 8601 con el offset local real, ej. `2026-10-15T17:30:00-03:00`. */
export function formatLocalIso(date: Date, timeZone: string): string {
  const p = getLocalParts(date, timeZone);
  const offset = getOffsetMinutes(date, timeZone);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return (
    `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

export function getOperationalDateFor(
  date: Date,
  timeZone: string,
  cutoffHour = STORE_OPERATIONAL_CUTOFF_HOUR
): string {
  const p = getLocalParts(date, timeZone);
  const base: LocalDate = { year: p.year, month: p.month, day: p.day };
  return formatLocalDate(p.hour < cutoffHour ? addDays(base, -1) : base);
}

/** Ventana [inicio, fin) del día operacional en UTC. */
export function getOperationalDayWindow(
  operationalDate: string,
  timeZone: string,
  cutoffHour = STORE_OPERATIONAL_CUTOFF_HOUR
): { start: Date; end: Date } {
  const date = parseLocalDate(operationalDate);
  return {
    start: zonedWallTimeToUtc(date, cutoffHour * 60, timeZone),
    end: zonedWallTimeToUtc(addDays(date, 1), cutoffHour * 60, timeZone),
  };
}

/* ─── Evaluation ──────────────────────────────────────────────────────── */

export type StoreStatus = {
  state: StoreState;
  acceptingOrders: boolean;
  source: StoreStatusSource;
  reasonCode: StoreReasonCode;
  message: string;
  timezone: string;
  /** Hora local de evaluación con offset. */
  localNow: string;
  localTime: string;
  weekday: Weekday | null;
  operationalDate: string | null;
  today: (DaySchedule & { weekday: Weekday }) | null;
  specialDate: StoreDateException | null;
  nextOpenAt: string | null;
  nextCloseAt: string | null;
  override: StoreOverride | null;
  configValid: boolean;
  configErrors?: string[];
};

export type EvaluateStoreStatusInput = {
  now: Date;
  /** Contenido crudo de `settings/storeHours` (null si no existe). */
  config: unknown;
  /** Override crudo de `settings/storeOperation.override` (null si no hay). */
  override?: unknown;
  /** Día operacional ya cerrado en caja (`cashCloses/{operationalDate}`), si existe. */
  cashClosedOperationalDate?: string | null;
  /** Excepciones por fecha, indexadas por fecha local YYYY-MM-DD. */
  dateExceptions?: Record<string, unknown>;
};

const WEEKDAY_LABELS: Record<Weekday, string> = {
  sunday: "dom",
  monday: "lun",
  tuesday: "mar",
  wednesday: "mié",
  thursday: "jue",
  friday: "vie",
  saturday: "sáb",
};

function describeLocalMoment(target: Date, now: Date, timeZone: string): string {
  const t = getLocalParts(target, timeZone);
  const n = getLocalParts(now, timeZone);
  const time = `${pad(t.hour)}:${pad(t.minute)}`;
  const today: LocalDate = { year: n.year, month: n.month, day: n.day };
  const targetDate = formatLocalDate({ year: t.year, month: t.month, day: t.day });
  if (targetDate === formatLocalDate(today)) return `hoy ${time}`;
  if (targetDate === formatLocalDate(addDays(today, 1))) return `mañana ${time}`;
  return `${WEEKDAY_LABELS[t.weekday]} ${pad(t.day)}-${pad(t.month)} ${time}`;
}

function failClosed(
  now: Date,
  reasonCode: "CONFIG_MISSING" | "CONFIG_INVALID" | "SPECIAL_DATE_INVALID" | "OVERRIDE_INVALID" | "EVALUATION_ERROR",
  timezone: string,
  configErrors?: string[]
): StoreStatus {
  let localNow = Number.isNaN(now.getTime()) ? "" : now.toISOString();
  let localTime = "--:--";
  let weekday: Weekday | null = null;
  try {
    localNow = formatLocalIso(now, timezone);
    const p = getLocalParts(now, timezone);
    localTime = `${pad(p.hour)}:${pad(p.minute)}`;
    weekday = p.weekday;
  } catch {
    // Timezone inutilizable: se devuelve UTC para que el estado siga siendo legible.
  }

  const messages: Record<typeof reasonCode, string> = {
    CONFIG_MISSING: "Tienda cerrada: no existe configuración de horario.",
    CONFIG_INVALID: "Tienda cerrada: la configuración de horario es inválida.",
    SPECIAL_DATE_INVALID: "Tienda cerrada: la excepción de horario de esta fecha es inválida.",
    OVERRIDE_INVALID: "Tienda cerrada: el estado manual registrado es inválido.",
    EVALUATION_ERROR: "Tienda cerrada: no fue posible evaluar el horario.",
  };

  return {
    state: "closed",
    acceptingOrders: false,
    source: "system",
    reasonCode,
    message: messages[reasonCode],
    timezone,
    localNow,
    localTime,
    weekday,
    operationalDate: null,
    today: null,
    specialDate: null,
    nextOpenAt: null,
    nextCloseAt: null,
    override: null,
    configValid: reasonCode !== "CONFIG_MISSING" && reasonCode !== "CONFIG_INVALID",
    ...(configErrors ? { configErrors } : {}),
  };
}

export function parseStoreHoursConfig(
  raw: unknown
): { ok: true; config: StoreHoursConfig } | { ok: false; errors: string[] } {
  const parsed = storeHoursConfigSchema.safeParse(raw);
  if (parsed.success) return { ok: true, config: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`
    ),
  };
}

export function evaluateStoreStatus(input: EvaluateStoreStatusInput): StoreStatus {
  const { now } = input;

  if (input.config === null || input.config === undefined) {
    return failClosed(now, "CONFIG_MISSING", DEFAULT_STORE_TIMEZONE);
  }

  const parsed = parseStoreHoursConfig(input.config);
  if (!parsed.ok) {
    return failClosed(now, "CONFIG_INVALID", DEFAULT_STORE_TIMEZONE, parsed.errors);
  }

  const config = parsed.config;
  const tz = config.timezone;

  try {
    if (Number.isNaN(now.getTime())) {
      throw new Error("Invalid evaluation clock");
    }

    const local = getLocalParts(now, tz);
    const localDate: LocalDate = { year: local.year, month: local.month, day: local.day };
    const operationalDate = getOperationalDateFor(now, tz);
    const localDateKey = formatLocalDate(localDate);
    const rawSpecialDate = input.dateExceptions?.[localDateKey];
    const specialDateResult = rawSpecialDate === undefined
      ? null
      : storeDateExceptionSchema.safeParse(rawSpecialDate);
    if (specialDateResult && !specialDateResult.success) {
      return failClosed(now, "SPECIAL_DATE_INVALID", tz);
    }
    const specialDate = specialDateResult?.success ? specialDateResult.data : null;
    const weeklySchedule = config.days[local.weekday];
    const daySchedule: DaySchedule = specialDate?.mode === "closed"
      ? { ...weeklySchedule, enabled: false }
      : specialDate?.mode === "custom_hours"
        ? { enabled: true, open: specialDate.open!, close: specialDate.close! }
        : weeklySchedule;
    const today = { weekday: local.weekday, ...daySchedule };
    const nowSeconds = local.hour * 3600 + local.minute * 60 + local.second;
    const openSeconds = hhmmToMinutes(daySchedule.open) * 60;
    const closeSeconds = hhmmToMinutes(daySchedule.close) * 60;

    let override: StoreOverride | null = null;
    if (input.override !== null && input.override !== undefined) {
      const parsedOverride = storeOverrideSchema.safeParse(input.override);
      if (!parsedOverride.success) {
        return failClosed(now, "OVERRIDE_INVALID", tz);
      }
      // Un override vale solo para el día operacional en que se registró.
      if (parsedOverride.data.operationalDate === operationalDate) {
        override = parsedOverride.data;
      }
    }

    const cashClosed = input.cashClosedOperationalDate === operationalDate;

    const base = {
      timezone: tz,
      localNow: formatLocalIso(now, tz),
      localTime: `${pad(local.hour)}:${pad(local.minute)}`,
      weekday: local.weekday,
      operationalDate,
      today,
      specialDate,
      override,
      configValid: true,
    };

    const findNextOpen = (): Date | null => {
      for (let offset = 0; offset <= 8; offset++) {
        const candidateDate = addDays(localDate, offset);
        const candidateDateKey = formatLocalDate(candidateDate);
        const candidateSpecialRaw = input.dateExceptions?.[candidateDateKey];
        const candidateSpecial = candidateSpecialRaw === undefined
          ? null
          : storeDateExceptionSchema.safeParse(candidateSpecialRaw);
        if (candidateSpecial && !candidateSpecial.success) continue;
        if (candidateSpecial?.success && candidateSpecial.data.mode === "closed") continue;
        const weekly = config.days[weekdayOf(candidateDate)];
        const schedule: DaySchedule = candidateSpecial?.success && candidateSpecial.data.mode === "custom_hours"
          ? { enabled: true, open: candidateSpecial.data.open!, close: candidateSpecial.data.close! }
          : weekly;
        if (!schedule.enabled) continue;
        const openAt = zonedWallTimeToUtc(candidateDate, hhmmToMinutes(schedule.open), tz);
        if (openAt.getTime() <= now.getTime()) continue;
        const candidateOperationalDate = getOperationalDateFor(openAt, tz);
        if (cashClosed && candidateOperationalDate === operationalDate) continue;
        if (override?.mode === "closed" && candidateOperationalDate === override.operationalDate) {
          continue;
        }
        return openAt;
      }
      return null;
    };

    const nextOpenIso = (): string | null => {
      const next = findNextOpen();
      return next ? formatLocalIso(next, tz) : null;
    };

    const describeNextOpen = (): string => {
      const next = findNextOpen();
      return next ? `Abre ${describeLocalMoment(next, now, tz)}.` : "Sin próxima apertura configurada.";
    };

    if (cashClosed) {
      return {
        ...base,
        state: "closed",
        acceptingOrders: false,
        source: "manual",
        reasonCode: "CASH_CLOSED",
        message: `Jornada cerrada: la caja de ${operationalDate} ya fue cerrada. ${describeNextOpen()}`,
        nextOpenAt: nextOpenIso(),
        nextCloseAt: null,
      };
    }

    if (override) {
      if (override.mode === "open") {
        const expiresAt = getOperationalDayWindow(operationalDate, tz).end;
        return {
          ...base,
          state: "manual_open",
          acceptingOrders: true,
          source: "manual",
          reasonCode: "MANUAL_OPEN",
          message: `Abierta manualmente. Vigente hasta ${describeLocalMoment(expiresAt, now, tz)} o hasta un cierre manual.`,
          nextOpenAt: null,
          nextCloseAt: formatLocalIso(expiresAt, tz),
        };
      }

      return {
        ...base,
        state: "manual_closed",
        acceptingOrders: false,
        source: "manual",
        reasonCode: "MANUAL_CLOSE",
        message: `Cerrada manualmente. ${describeNextOpen()}`,
        nextOpenAt: nextOpenIso(),
        nextCloseAt: null,
      };
    }

    const withinWindow =
      daySchedule.enabled && nowSeconds >= openSeconds && nowSeconds < closeSeconds;

    if (withinWindow) {
      const closeAt = zonedWallTimeToUtc(localDate, hhmmToMinutes(daySchedule.close), tz);
      const closingSoon = closeSeconds - nowSeconds <= config.closingWarningMinutes * 60;
      return {
        ...base,
        state: closingSoon ? "closing" : "scheduled_open",
        acceptingOrders: true,
        source: "schedule",
        reasonCode: closingSoon ? "CLOSING_SOON" : "WITHIN_SCHEDULE",
        message: [
          closingSoon ? `Cierra pronto: ${daySchedule.close}.` : `Abierta según horario hasta las ${daySchedule.close}.`,
          specialDate?.customerMessage,
        ].filter(Boolean).join(" "),
        nextOpenAt: null,
        nextCloseAt: formatLocalIso(closeAt, tz),
      };
    }

    const reasonCode: StoreReasonCode = specialDate?.mode === "closed"
      ? "SPECIAL_DATE_CLOSED"
      : !daySchedule.enabled
        ? "DAY_DISABLED"
      : nowSeconds < openSeconds
        ? "BEFORE_OPENING"
        : "AFTER_CLOSING";

    return {
      ...base,
      state: "scheduled_closed",
      acceptingOrders: false,
      source: "schedule",
      reasonCode,
      message: [
        specialDate?.mode === "closed"
          ? specialDate.customerMessage || "Cerrada por fecha especial."
          : "Cerrada según horario.",
        specialDate?.mode !== "closed" ? specialDate?.customerMessage : undefined,
        describeNextOpen(),
      ].filter(Boolean).join(" "),
      nextOpenAt: nextOpenIso(),
      nextCloseAt: null,
    };
  } catch {
    return failClosed(now, "EVALUATION_ERROR", tz);
  }
}

/** Respuesta pública: sin actor, sin motivo interno ni errores de config. */
export type PublicStoreStatus = Omit<StoreStatus, "override" | "configErrors"> & {
  override: { mode: StoreOverride["mode"] } | null;
  upcomingSpecialDates: StoreDateException[];
};

export function toPublicStoreStatus(
  status: StoreStatus,
  upcomingSpecialDates: StoreDateException[] = []
): PublicStoreStatus {
  const { override, configErrors: _configErrors, ...rest } = status;
  return { ...rest, override: override ? { mode: override.mode } : null, upcomingSpecialDates };
}
