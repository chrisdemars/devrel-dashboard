// The leadership report for one quarter: headline numbers, reach, what is
// working and what is not, the data still missing, and the ask. It reuses the
// dashboards' own numbers, so the report can never disagree with them.

import { quarterOf } from '../data/dates';
import type { DataStore, DateRange, ReportSection } from '../data/types';
import { parseFilters, type FilterContext, type Filters, type SearchParamsInput } from '../filters';
import { formatDayRange, formatNumber } from '../format';
import { contentRollup, metricBuckets, metricTotal, periodRange, reachByActivity } from '../metrics';
import type { SourceStatus } from '../sources/core';
import { typeLabel } from './activity';
import { getCapacity, type Capacity } from './capacity';
import { getEvents } from './events';
import { getOverview, type OverviewKpi } from './overview';
import { rowLabels } from './shared';

export interface ReportRequest {
  /** A quarter, e.g. '2027-Q1'. */
  period: string;
  /** Selected tags, sorted. Empty means every tag. */
  tags: string[];
}

export interface ReportPeriod {
  key: string;
  /** "Q1 2027". */
  label: string;
  href: string;
  current: boolean;
}

export interface Report {
  period: ReportPeriod;
  periods: ReportPeriod[];
  /** The days covered: the quarter, cut short at today while it is still running. */
  range: DateRange;
  rangeLabel: string;
  /** True when the quarter has not ended yet. */
  inProgress: boolean;
  tags: string[];
  kpis: Omit<OverviewKpi, 'tagged'>[];
  reach: {
    total: number;
    byFormat: { label: string; value: number }[];
    sessions: { rows: { label: string; period: string; value: number }[]; total: number };
    topPosts: { id: string; title: string; formats: number; totalReach: number; multiplier?: number }[];
    events: { talks: number; audience: number; leads: number };
    caption: string;
  };
  working: string[];
  notWorking: string[];
  /** Sources that are not connected, with what each needs. */
  access: { id: string; name: string; status: SourceStatus; note?: string; missing: string[] }[];
  ask: { notes: string[]; staffing: Capacity['staffing'] };
}

// Plural, because each row adds up several pieces.
const FORMAT_LABELS: Record<string, string> = {
  blog: 'Blog posts',
  short: 'Short videos',
  'long-form-video': 'Long-form videos',
  livestream: 'Livestreams',
  talk: 'Talks',
  community: 'Community work',
};

const QUARTER = /^\d{4}-Q[1-4]$/;
const TOP_POSTS = 5;

/** "2027-Q1" → "Q1 2027". */
export function periodLabel(period: string): string {
  return `${period.slice(5)} ${period.slice(0, 4)}`;
}

/** Every quarter the data touches, oldest first. */
export function reportPeriods({ dataFrom, today }: FilterContext): string[] {
  const periods: string[] = [];
  let [year, quarter] = [Number(dataFrom.slice(0, 4)), Number(quarterOf(dataFrom).slice(6))];
  const last = quarterOf(today);
  for (let i = 0; i < 400; i++) {
    const key = `${year}-Q${quarter}`;
    periods.push(key);
    if (key >= last) break;
    if (quarter === 4) [year, quarter] = [year + 1, 1];
    else quarter += 1;
  }
  return periods;
}

/** Reads `period` and `tags` from the URL. A missing or unknown period falls back to the current quarter. */
export function parseReportRequest(input: SearchParamsInput, context: FilterContext): ReportRequest {
  const raw = input instanceof URLSearchParams ? (input.get('period') ?? undefined) : input.period;
  const period = (Array.isArray(raw) ? raw[0] : raw)?.trim().toUpperCase();
  const known = reportPeriods(context);
  return {
    period: period && QUARTER.test(period) && known.includes(period) ? period : quarterOf(context.today),
    tags: parseFilters(input, context).tags,
  };
}

/** A link to the report for a period, keeping the tags. */
export function reportHref({ period, tags }: ReportRequest): string {
  return `/report?period=${period}${tags.length > 0 ? `&tags=${tags.map(encodeURIComponent).join(',')}` : ''}`;
}

/** The filters the dashboards would use to show the same period, compared with the period before. */
export function reportFilters(request: ReportRequest, context: FilterContext): Filters {
  const quarter = periodRange(request.period)!;
  const to = quarter.to < context.today ? quarter.to : context.today;
  return { tags: request.tags, preset: 'custom', compare: 'previous', from: quarter.from <= to ? quarter.from : to, to };
}

export async function getReport(
  store: DataStore,
  request: ReportRequest,
  context: FilterContext,
  options: { people?: number; launch?: { date: string; label: string } } = {},
): Promise<Report> {
  const filters = reportFilters(request, context);
  const range: DateRange = { from: filters.from, to: filters.to };
  const dataFilter = { ...range, ...(request.tags.length > 0 && { tags: request.tags }) };

  const [overview, events, capacity, activities, activityMetrics, points, notes, statuses] = await Promise.all([
    getOverview(store, filters, context, options.launch),
    getEvents(store, filters, context),
    getCapacity(store, filters, context, options.people),
    store.getActivities(dataFilter),
    store.getActivityMetrics(dataFilter),
    store.getMetricPoints(),
    store.getReportNotes(request.period),
    store.getSourceStatuses(),
  ]);

  // ---- Reach ----
  const reach = reachByActivity(activityMetrics);
  const formats = new Map<string, number>();
  for (const { id, type } of activities) formats.set(type, (formats.get(type) ?? 0) + (reach.get(id) ?? 0));
  const byFormat = [...formats]
    .filter(([, value]) => value > 0)
    .map(([type, value]) => ({ label: FORMAT_LABELS[type] ?? typeLabel(type), value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const total = byFormat.reduce((sum, row) => sum + row.value, 0);
  const topPosts = contentRollup(activities, activityMetrics)
    .slice(0, TOP_POSTS)
    .map(({ post, pieces, totalReach, multiplier }) => ({
      id: post.id,
      title: post.title,
      formats: pieces,
      totalReach,
      ...(multiplier !== undefined && { multiplier }),
    }));
  const given = events.conferences;

  const text = (section: ReportSection) => notes.filter((note) => note.section === section).map((note) => note.text);
  const label = (key: string): ReportPeriod => ({
    key,
    label: periodLabel(key),
    href: reportHref({ period: key, tags: request.tags }),
    current: key === request.period,
  });

  return {
    period: label(request.period),
    periods: reportPeriods(context).map(label),
    range,
    rangeLabel: formatDayRange(range.from, range.to),
    inProgress: periodRange(request.period)!.to > context.today,
    tags: request.tags,
    kpis: overview.kpis.map((kpi) => ({ ...kpi, tagged: undefined })),
    reach: {
      total,
      byFormat,
      sessions: {
        rows: metricBuckets(points, 'sessions', range, 7).map((bucket) => ({ ...rowLabels(bucket), value: bucket.value })),
        total: metricTotal(points, 'sessions', range),
      },
      topPosts,
      events: { talks: given.rows.length, audience: given.totals.audience, leads: given.totals.leads },
      caption:
        byFormat.length > 0
          ? `${byFormat[0].label} reached the most people: ${formatNumber(byFormat[0].value)} of ${formatNumber(total)}.`
          : 'No reach is recorded for this period.',
    },
    working: text('working'),
    notWorking: text('not_working'),
    access: statuses
      .filter((source) => source.status !== 'ok')
      .map(({ id, name, status, note, missing }) => ({ id, name, status, ...(note && { note }), missing: missing ?? [] })),
    ask: { notes: text('ask'), staffing: capacity.staffing },
  };
}
