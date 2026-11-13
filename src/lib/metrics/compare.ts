// Comparing a number with an earlier period or with a target.

import { addDays, daysBetween } from '../data/dates';
import type { DateRange, MetricName, MetricPoint } from '../data/types';
import { changeFrom } from '../format';
import { METRIC_KINDS, metricTotal, rangeDays } from './series';

export interface PeriodComparison {
  current: number;
  previous: number;
  /** Change as a fraction (0.22 = up 22%). Undefined when the earlier value is zero or missing. */
  change?: number;
  /**
   * What `change` compares. 'daily_average' when the two periods differ in
   * length, so a three-month period is not flattered against a one-month one.
   */
  basis: 'total' | 'daily_average';
}

/**
 * Change between two totals. Pass the number of days in each period when the
 * totals add up over time; periods of different length are then compared by
 * their daily average.
 */
export function comparePeriods(
  current: number,
  previous: number,
  days?: { current: number; previous: number },
): PeriodComparison {
  if (!days || days.current === days.previous || days.current <= 0 || days.previous <= 0) {
    return { current, previous, change: changeFrom(previous, current), basis: 'total' };
  }
  return {
    current,
    previous,
    change: changeFrom(previous / days.previous, current / days.current),
    basis: 'daily_average',
  };
}

/**
 * A metric in one period against another: the period before, or the
 * baseline. Flows of different length compare by daily average; levels
 * (followers) always compare reading with reading.
 */
export function compareMetric(
  points: MetricPoint[],
  metric: MetricName,
  current: DateRange,
  previous: DateRange,
): PeriodComparison {
  const days = METRIC_KINDS[metric] === 'flow' ? { current: rangeDays(current), previous: rangeDays(previous) } : undefined;
  return comparePeriods(metricTotal(points, metric, current), metricTotal(points, metric, previous), days);
}

/** The dates a target period covers: '2027-Q1', '2027-03' or '2027'. Undefined for anything else. */
export function periodRange(period: string): DateRange | undefined {
  const match = /^(\d{4})(?:-(?:Q([1-4])|(0[1-9]|1[0-2])))?$/.exec(period);
  if (!match) return undefined;
  const [, year, quarter, month] = match;
  const firstMonth = quarter ? (Number(quarter) - 1) * 3 + 1 : month ? Number(month) : 1;
  const months = quarter ? 3 : month ? 1 : 12;
  const from = `${year}-${String(firstMonth).padStart(2, '0')}-01`;
  const next = new Date(Date.UTC(Number(year), firstMonth - 1 + months, 1)).toISOString().slice(0, 10);
  return { from, to: addDays(next, -1) };
}

export interface TargetProgress {
  actual: number;
  target: number;
  /** Actual as a fraction of the target; above 1 when beaten. Undefined when there is no target to measure against. */
  fraction?: number;
  /** How much is left to reach the target. Zero once it is met. */
  remaining: number;
  met: boolean;
  /**
   * The fraction of the period that has passed, 0 to 1: where a steady pace
   * would be by now. Only set when the period and today are given.
   */
  expected?: number;
  /** True when progress is at or ahead of a steady pace. */
  onTrack?: boolean;
}

/**
 * Progress toward a target. Give the target's period and today's date to
 * also learn whether the pace is on track.
 */
export function targetProgress(actual: number, target: number, period?: DateRange, today?: string): TargetProgress {
  const valid = Number.isFinite(target) && target > 0;
  const fraction = valid && Number.isFinite(actual) ? actual / target : undefined;
  const progress: TargetProgress = {
    actual,
    target,
    fraction,
    remaining: valid ? Math.max(target - actual, 0) : 0,
    met: fraction !== undefined && fraction >= 1,
  };
  if (!period || !today || fraction === undefined) return progress;

  const total = rangeDays(period);
  if (total === 0) return progress;
  const elapsed = Math.min(Math.max(daysBetween(period.from, today) + 1, 0), total);
  const expected = elapsed / total;
  return { ...progress, expected, onTrack: fraction >= expected };
}
