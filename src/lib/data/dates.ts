// Day arithmetic on YYYY-MM-DD strings, always in UTC so results never depend
// on the machine's time zone.

const DAY_MS = 86_400_000;

function toTime(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function toDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return toDay(toTime(day) + days * DAY_MS);
}

/** Adds calendar months, clamping to the last day of a shorter month (Jan 31 + 1 month = Feb 28). */
export function addMonths(day: string, months: number): string {
  const date = new Date(toTime(day));
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return toDay(target.getTime());
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toTime(to) - toTime(from)) / DAY_MS);
}

/** Every day from `from` to `to`, inclusive. */
export function eachDay(from: string, to: string): string[] {
  return Array.from({ length: Math.max(daysBetween(from, to) + 1, 0) }, (_, i) => addDays(from, i));
}

/** 0 for Sunday through 6 for Saturday. */
export function weekday(day: string): number {
  return new Date(toTime(day)).getUTCDay();
}

/** The quarter a day falls in, e.g. '2027-Q1'. */
export function quarterOf(day: string): string {
  return `${day.slice(0, 4)}-Q${Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1}`;
}

/** True when `day` is inside the range. A missing bound is open. */
export function inRange(day: string, range: { from?: string; to?: string } = {}): boolean {
  return (!range.from || day >= range.from) && (!range.to || day <= range.to);
}
