"use client";

export const OPERATIONAL_DAY_CUTOFF_HOUR = 5;

export function toDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "object" && value !== null) {
    const candidate = value as {
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
    };

    if (typeof candidate.toDate === "function") {
      const parsed = candidate.toDate();
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const seconds = candidate.seconds ?? candidate._seconds;
    if (typeof seconds === "number") {
      const parsed = new Date(seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

export function getOperationalDayStart(
  now: Date,
  cutoffHour = OPERATIONAL_DAY_CUTOFF_HOUR
): Date {
  const start = new Date(now);
  start.setHours(cutoffHour, 0, 0, 0);

  if (start.getTime() > now.getTime()) {
    start.setDate(start.getDate() - 1);
  }

  return start;
}
