// Pieces every dashboard's data module uses: chart rows and series, display
// names for the keys found in the data, and how wide a chart column is.

import type { DataStore, DateRange, DealTotals } from '../data/types';
import { formatDay, formatDayRange } from '../format';
import { rangeDays, sumBuckets } from '../metrics';

export interface ChartSeries {
  key: string;
  label: string;
  /** Position in the chart palette. It belongs to the series, so it never changes with the filters. */
  colorIndex: number;
}

export interface ChartRow {
  /** Short label for the axis, e.g. "Jan 4". */
  label: string;
  /** Full label for the tooltip and the table, e.g. "Jan 4, 2027 – Jan 10, 2027". */
  period: string;
  values: Record<string, number>;
}

const LABELS: Record<string, string> = {
  npm: 'npm',
  homebrew: 'Homebrew',
  github: 'GitHub releases',
  pypi: 'PyPI',
  docker: 'Docker Hub',
  youtube: 'YouTube',
  x: 'X',
  linkedin: 'LinkedIn',
  twitch: 'Twitch',
  facebook: 'Facebook',
  unknown: 'Unknown',
};

/** A display name for a key from the data: "github" → "GitHub releases", "organic_search" → "Organic search". */
export function labelFor(key: string): string {
  const words = key.replaceAll(/[_-]+/g, ' ').trim();
  return LABELS[key] ?? (words ? words[0].toUpperCase() + words.slice(1) : 'Unknown');
}

/** Column width in days: days for a short range, weeks for a quarter, 30 days for longer. */
export function chartBucketDays(range: DateRange): number {
  const days = rangeDays(range);
  return days <= 16 ? 1 : days <= 16 * 7 ? 7 : 30;
}

/** What a column of `days` days is called in a chart title: "day", "week" or "30 days". */
export function bucketName(days: number): string {
  return days === 1 ? 'day' : days === 7 ? 'week' : `${days} days`;
}

const shortDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Axis and tooltip labels for a bucket. */
export function rowLabels({ from, to }: DateRange): Pick<ChartRow, 'label' | 'period'> {
  return {
    label: shortDay.format(new Date(`${from}T00:00:00Z`)),
    period: from === to ? formatDay(from) : formatDayRange(from, to),
  };
}

/**
 * Series for the keys present, in a fixed order so each keeps its color
 * whatever the filters show. Keys outside `known` follow, in alphabetical
 * order of every key the data has ever had.
 */
export function seriesFor(known: string[], present: string[], everSeen: string[]): ChartSeries[] {
  const extras = [...new Set(everSeen)].filter((key) => !known.includes(key)).sort();
  return [...known, ...extras]
    .filter((key) => present.includes(key))
    .map((key) => ({
      key,
      label: labelFor(key),
      colorIndex: known.includes(key) ? known.indexOf(key) : known.length + extras.indexOf(key),
    }));
}

/**
 * Deal totals for each bucket of a range, oldest first. It asks for totals
 * per bucket rather than individual deals, which only admins may read.
 */
export async function dealBuckets(store: DataStore, range: DateRange, days: number): Promise<(DateRange & DealTotals)[]> {
  const buckets = sumBuckets([], range, days);
  const totals = await Promise.all(buckets.map(({ from, to }) => store.getDealTotals({ from, to })));
  return buckets.map(({ from, to }, i) => ({ from, to, ...totals[i] }));
}
