// The filters every dashboard shares: tags, a date range and what to compare
// against. They live in the URL, so a view can be reloaded, shared and printed.
//
//   ?tags=blog,talk&range=quarter&compare=previous
//   ?range=custom&from=2027-01-01&to=2027-01-31
//
// Anything left out of the URL takes its default, and defaults are never
// written to the URL. Everything here is pure; see ./server.ts for the helper
// that server components call.

import { addDays, daysBetween } from '../data/dates';
import type { DataFilter, DateRange } from '../data/types';
import { formatDayRange } from '../format';

export const RANGE_PRESETS = ['baseline', 'month', 'quarter', 'custom'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const COMPARISONS = ['baseline', 'previous', 'target'] as const;
export type Comparison = (typeof COMPARISONS)[number];

export const DEFAULT_PRESET = 'baseline' satisfies RangePreset;
export const DEFAULT_COMPARISON: Comparison = 'baseline';

export const RANGE_LABELS: Record<RangePreset, string> = {
  baseline: 'Since baseline',
  month: 'This month',
  quarter: 'This quarter',
  custom: 'Custom',
};

export const COMPARISON_LABELS: Record<Comparison, string> = {
  baseline: 'vs baseline',
  previous: 'vs previous period',
  target: 'vs target',
};

/** The search params the filters use. Links between dashboards carry these along. */
export const FILTER_PARAMS = ['tags', 'range', 'from', 'to', 'compare'] as const;

/** How long the baseline lasts when the org config has no launch date. */
const BASELINE_DAYS = 30;
const MAX_TAGS = 50;

/** What the filters are worked out against. */
export interface FilterContext {
  /** The last day with data. Dashboards treat it as "today". */
  today: string;
  /** The first day with data. */
  dataFrom: string;
  /** The launch date from the org config, if there is one. */
  launchDate?: string;
}

/** The filters in force, with the date range already worked out. */
export interface Filters extends DateRange {
  /** Selected tags, sorted. Empty means every tag. */
  tags: string[];
  preset: RangePreset;
  compare: Comparison;
}

/** A change to the filters, as the filter bar makes them. */
export type FilterChange = Partial<Pick<Filters, 'tags' | 'preset' | 'compare' | 'from' | 'to'>>;

/** Search params as Next.js passes them to a page, or a URLSearchParams. */
export type SearchParamsInput = URLSearchParams | Record<string, string | string[] | undefined>;

function isDay(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function reader(input: SearchParamsInput): (key: string) => string | undefined {
  if (input instanceof URLSearchParams) return (key) => input.get(key) ?? undefined;
  return (key) => {
    const value = input[key];
    return Array.isArray(value) ? value[0] : value;
  };
}

function cleanTags(tags: string[]): string[] {
  const cleaned = tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  return [...new Set(cleaned)].sort().slice(0, MAX_TAGS);
}

/**
 * The period before the launch, which later numbers are measured against:
 * from the first day of data to the day before the launch. Without a launch
 * date it is the first 30 days of data. It never runs past today.
 */
export function baselineRange({ today, dataFrom, launchDate }: FilterContext): DateRange {
  const end = launchDate && launchDate > dataFrom ? addDays(launchDate, -1) : addDays(dataFrom, BASELINE_DAYS - 1);
  return { from: dataFrom, to: end < today ? end : today };
}

/** The date range a preset stands for. */
export function presetRange(preset: Exclude<RangePreset, 'custom'>, context: FilterContext): DateRange {
  const { today, dataFrom } = context;
  if (preset === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (preset === 'quarter') {
    const firstMonth = Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1;
    return { from: `${today.slice(0, 4)}-${String(firstMonth).padStart(2, '0')}-01`, to: today };
  }
  // Since baseline: everything after it. While the baseline is still being
  // captured there is nothing after it, so show all the data so far.
  const from = addDays(baselineRange(context).to, 1);
  return { from: from <= today ? from : dataFrom, to: today };
}

/** Works out the filters from the URL. Anything missing or invalid falls back to its default. */
export function parseFilters(input: SearchParamsInput, context: FilterContext): Filters {
  const get = reader(input);

  const tags = cleanTags((get('tags') ?? '').split(','));
  const compareParam = get('compare') as Comparison | undefined;
  const compare = compareParam && COMPARISONS.includes(compareParam) ? compareParam : DEFAULT_COMPARISON;

  const presetParam = get('range') as RangePreset | undefined;
  const preset = presetParam && RANGE_PRESETS.includes(presetParam) ? presetParam : DEFAULT_PRESET;

  if (preset !== 'custom') return { tags, preset, compare, ...presetRange(preset, context) };

  const from = get('from');
  const to = get('to');
  if (!isDay(from) || !isDay(to)) {
    return { tags, preset: DEFAULT_PRESET, compare, ...presetRange(DEFAULT_PRESET, context) };
  }
  // Dates typed the wrong way round are swapped rather than rejected.
  return { tags, preset, compare, from: from <= to ? from : to, to: from <= to ? to : from };
}

/** The URL form of the filters. Defaults are left out, so the default view has no query string. */
export function filtersToSearchParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.tags.length > 0) params.set('tags', filters.tags.join(','));
  if (filters.preset !== DEFAULT_PRESET) params.set('range', filters.preset);
  if (filters.preset === 'custom') {
    params.set('from', filters.from);
    params.set('to', filters.to);
  }
  if (filters.compare !== DEFAULT_COMPARISON) params.set('compare', filters.compare);
  return params;
}

/** A link to `pathname` that keeps these filters. */
export function filterHref(pathname: string, filters: Filters): string {
  // Commas are safe in a query string and read better unescaped.
  const query = filtersToSearchParams(filters).toString().replaceAll('%2C', ',');
  return query ? `${pathname}?${query}` : pathname;
}

/** Applies a change from the filter bar and works the date range out again. */
export function updateFilters(filters: Filters, change: FilterChange, context: FilterContext): Filters {
  const next: Filters = { ...filters, ...change, tags: cleanTags(change.tags ?? filters.tags) };
  // Editing a date switches to a custom range that starts from the dates on show.
  if (!change.preset && (change.from || change.to)) next.preset = 'custom';
  if (next.preset !== 'custom') return { ...next, ...presetRange(next.preset, context) };
  if (!isDay(next.from) || !isDay(next.to)) return { ...next, from: filters.from, to: filters.to };
  if (next.from > next.to) {
    // Keep the date that was just edited and move the other one to match.
    if (change.to && !change.from) next.from = next.to;
    else next.to = next.from;
  }
  return next;
}

/**
 * The period to compare the selected range with. There is none for
 * 'target': targets are compared by value, not by period.
 */
export function comparisonRange(filters: Filters, context: FilterContext): DateRange | undefined {
  if (filters.compare === 'baseline') return baselineRange(context);
  if (filters.compare === 'previous') {
    const days = daysBetween(filters.from, filters.to) + 1;
    return { from: addDays(filters.from, -days), to: addDays(filters.from, -1) };
  }
  return undefined;
}

/** The part of the filters that data queries take. */
export function toDataFilter(filters: Filters): DataFilter {
  return { from: filters.from, to: filters.to, ...(filters.tags.length > 0 && { tags: filters.tags }) };
}

/** True when nothing differs from the default view. */
export function isDefaultFilters(filters: Filters): boolean {
  return filtersToSearchParams(filters).size === 0;
}

/** The filters in words, for the printed report: "Dec 15, 2026 – Mar 15, 2027 · Tags: blog, talk · vs baseline". */
export function describeFilters(filters: Filters): string {
  return [
    formatDayRange(filters.from, filters.to),
    `Tags: ${filters.tags.length > 0 ? filters.tags.join(', ') : 'all'}`,
    COMPARISON_LABELS[filters.compare],
  ].join(' · ');
}
