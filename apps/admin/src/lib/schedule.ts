const MINUTES_PER_DAY = 24 * 60;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(value: string): number | null {
  const match = TIME_REGEX.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function isValidScheduleTime(value: string): boolean {
  return toMinutes(value) !== null;
}

/** Position and width for a same-day interval on a 00:00–24:00 timeline. */
export function getScheduleTrackStyle(open: string, close: string): { left: number; width: number } | null {
  const openMinutes = toMinutes(open);
  const closeMinutes = toMinutes(close);
  if (openMinutes === null || closeMinutes === null || closeMinutes <= openMinutes) return null;

  return {
    left: (openMinutes / MINUTES_PER_DAY) * 100,
    width: ((closeMinutes - openMinutes) / MINUTES_PER_DAY) * 100,
  };
}
