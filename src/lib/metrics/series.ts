// Totals and time series from metric points.
//
// Metrics come in two kinds. A "flow" is counted per day and adds up over a
// period (installs, sessions). A "level" is a reading of how big something is
// (followers, weekly active users); its value for a period is the latest
// reading, never a sum.

import { addDays, daysBetween, inRange } from '../data/dates';
import type { DateRange, MetricName, MetricPoint } from '../data/types';

export type MetricKind = 'flow' | 'level';

export const METRIC_KINDS: Record<MetricName, MetricKind> = {
  installs: 'flow',
  signups: 'flow',
  activations: 'flow',
  sessions: 'flow',
  engaged_sessions: 'flow',
  key_events: 'flow',
  active_users: 'level',
  followers: 'level',
};

/** Number of days in a range, counting both ends. Zero for a range that ends before it starts. */
export function rangeDays(range: DateRange): number {
  return Math.max(daysBetween(range.from, range.to) + 1, 0);
}

/** A stable name for the series a point belongs to, e.g. "channel=npm". */
function seriesKey(point: MetricPoint): string {
  const dimensions = Object.entries(point.dimensions ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return `${point.source}|${dimensions.map(([key, value]) => `${key}=${value}`).join('&')}`;
}

/** Adds up a set of points of one metric: a sum for a flow, the latest reading of each series for a level. */
function combine(points: MetricPoint[], kind: MetricKind): number {
  if (kind === 'flow') return points.reduce((total, point) => total + point.value, 0);
  const latest = new Map<string, MetricPoint>();
  for (const point of points) {
    const key = seriesKey(point);
    const seen = latest.get(key);
    if (!seen || point.date >= seen.date) latest.set(key, point);
  }
  return [...latest.values()].reduce((total, point) => total + point.value, 0);
}

function select(points: MetricPoint[], metric: MetricName, range?: Partial<DateRange>): MetricPoint[] {
  return points.filter((point) => point.metric === metric && Number.isFinite(point.value) && inRange(point.date, range));
}

/**
 * The value of a metric over a range: the sum for a flow (installs), the
 * latest reading for a level (followers). Zero when there is no data.
 */
export function metricTotal(points: MetricPoint[], metric: MetricName, range?: Partial<DateRange>): number {
  return combine(select(points, metric, range), METRIC_KINDS[metric]);
}

export interface BreakdownRow {
  key: string;
  value: number;
  /** This row's part of the total, 0 to 1. Zero when the total is zero. */
  share: number;
}

/**
 * A metric split by one dimension, largest first, e.g. installs by 'channel'.
 * Points without that dimension are grouped under "unknown".
 */
export function metricBreakdown(
  points: MetricPoint[],
  metric: MetricName,
  dimension: string,
  range?: Partial<DateRange>,
): BreakdownRow[] {
  const groups = new Map<string, MetricPoint[]>();
  for (const point of select(points, metric, range)) {
    const key = point.dimensions?.[dimension] ?? 'unknown';
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }
  const rows = [...groups].map(([key, group]) => ({ key, value: combine(group, METRIC_KINDS[metric]) }));
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return rows
    .map((row) => ({ ...row, share: total > 0 ? row.value / total : 0 }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
}

export interface Bucket extends DateRange {
  value: number;
}

/**
 * A metric in equal buckets of `days` days, oldest first, lined up so the
 * last bucket ends on `range.to` and every bucket is whole. Days at the start
 * that do not fill a bucket are left out. A flow with no data in a bucket is
 * zero; a level carries its last reading forward.
 */
export function metricBuckets(points: MetricPoint[], metric: MetricName, range: DateRange, days = 7): Bucket[] {
  const size = Math.max(Math.floor(days), 1);
  const count = Math.floor(rangeDays(range) / size);
  const kind = METRIC_KINDS[metric];
  const selected = select(points, metric, kind === 'level' ? { to: range.to } : range);

  return Array.from({ length: count }, (_, i) => {
    const to = addDays(range.to, -(count - 1 - i) * size);
    const from = addDays(to, -(size - 1));
    const inBucket = selected.filter((point) => (kind === 'level' ? point.date <= to : inRange(point.date, { from, to })));
    return { from, to, value: combine(inBucket, kind) };
  });
}

/**
 * Values for a sparkline: the last `count` buckets ending on `to`, oldest
 * first. With the defaults that is the last 12 weeks.
 */
export function sparklineValues(
  points: MetricPoint[],
  metric: MetricName,
  to: string,
  { count = 12, days = 7 }: { count?: number; days?: number } = {},
): number[] {
  const from = addDays(to, -(count * days - 1));
  return metricBuckets(points, metric, { from, to }, days).map((bucket) => bucket.value);
}

/**
 * Dated amounts (deal values, the reach of each activity) added up in equal
 * buckets, lined up with the end of the range like `metricBuckets`.
 */
export function sumBuckets(items: { date: string; value: number }[], range: DateRange, days = 7): Bucket[] {
  const points = items.map(({ date, value }) => ({ date, value, metric: 'installs' as const, source: '' }));
  return metricBuckets(points, 'installs', range, days);
}

/** A bucket size that draws a range as about 12 points: a day for two weeks, a week for a quarter. */
export function trendBucketDays(range: DateRange, points = 12): number {
  return Math.max(Math.ceil(rangeDays(range) / points), 1);
}

/** Running total: [1, 2, 3] → [1, 3, 6]. For "total installs so far" lines. */
export function cumulative(values: number[]): number[] {
  let total = 0;
  return values.map((value) => (total += Number.isFinite(value) ? value : 0));
}
