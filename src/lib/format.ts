// Number and date formatting shared by the dashboards and the report.

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });

/** 1284 → "1,284", 12900 → "12.9K", 4200000 → "4.2M". */
export function formatNumber(value: number): string {
  return Math.abs(value) < 10_000 ? whole.format(value) : compact.format(value);
}

/** 0.384 → "38%". */
export function formatPercent(fraction: number): string {
  return percent.format(fraction);
}

export type Direction = 'up' | 'down' | 'flat';

export interface Delta {
  direction: Direction;
  /** Signed text, e.g. "+22%", "−5%" or "0%". */
  text: string;
  /** Whether the change is good, bad or neither, given which direction is good. */
  tone: 'positive' | 'negative' | 'neutral';
}

/**
 * Describes a change given as a fraction (0.22 = up 22%).
 * `goodWhen` says which direction is good: 'up' for installs, 'down' for cost per lead.
 */
export function describeDelta(change: number, goodWhen: 'up' | 'down' = 'up'): Delta {
  const rounded = Math.round(change * 100);
  if (!Number.isFinite(change) || rounded === 0) return { direction: 'flat', text: '0%', tone: 'neutral' };
  const direction = rounded > 0 ? 'up' : 'down';
  return {
    direction,
    text: `${rounded > 0 ? '+' : '−'}${whole.format(Math.abs(rounded))}%`,
    tone: direction === goodWhen ? 'positive' : 'negative',
  };
}

/** Change from `previous` to `current` as a fraction, or undefined when there is no base to compare with. */
export function changeFrom(previous: number, current: number): number | undefined {
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous === 0) return undefined;
  return (current - previous) / Math.abs(previous);
}

const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** '2026-12-15' → "Dec 15, 2026". */
export function formatDay(value: string): string {
  return day.format(new Date(`${value}T00:00:00Z`));
}

/** "Dec 15, 2026 – Mar 15, 2027", or one date when both ends are the same day. */
export function formatDayRange(from: string, to: string): string {
  return from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`;
}
