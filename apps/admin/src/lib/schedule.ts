const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(value: string): number | null {
  const match = TIME_REGEX.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function isValidScheduleTime(value: string): boolean {
  return toMinutes(value) !== null;
}
