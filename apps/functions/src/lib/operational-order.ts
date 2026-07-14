const OPERATIONAL_TIMEZONE = "America/Santiago";
const OPERATIONAL_CUTOFF_HOUR = 5;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function getTimeZoneParts(date: Date, timeZone = OPERATIONAL_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: Number(read("hour")),
  };
}

function formatDateParts(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function getOperationalDate(
  now = new Date(),
  cutoffHour = OPERATIONAL_CUTOFF_HOUR
): string {
  const parts = getTimeZoneParts(now);
  const operationalBase = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  if (parts.hour < cutoffHour) {
    operationalBase.setUTCDate(operationalBase.getUTCDate() - 1);
  }

  return formatDateParts(operationalBase);
}

export function formatDisplayCode(displayOrderNumber: number): string {
  return String(displayOrderNumber).padStart(3, "0");
}

export type OperationalOrderMeta = {
  displayOrderNumber: number;
  displayCode: string;
  operationalDate: string;
};
