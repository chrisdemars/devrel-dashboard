// The numbers on the Overview page, worked out from the filters.
// All the arithmetic lives in src/lib/metrics; this file only decides what
// to show and how to word it.

import { daysBetween, quarterOf } from '../data/dates';
import type { DataStore, DateRange, MetricName, SourceStatusInfo, Target } from '../data/types';
import { comparisonRange, toDataFilter, type FilterContext, type Filters } from '../filters';
import { formatNumber, formatPercent, formatUsd } from '../format';
import {
  comparePeriods,
  compareMetric,
  metricBreakdown,
  metricBuckets,
  metricTotal,
  periodRange,
  rangeDays,
  reachByActivity,
  sumBuckets,
  trendBucketDays,
} from '../metrics';
import type { SourceStatus } from '../sources/core';
import { dealBuckets } from './shared';
import { standing } from './standing';

export interface OverviewKpi {
  id: string;
  label: string;
  /** Already formatted, e.g. "12.9K" or "$84K". */
  value: string;
  /** Change against the selected comparison, as a fraction. */
  delta?: number;
  deltaLabel?: string;
  /** Said in place of a change: target progress, or why there is nothing to compare with. */
  detail?: string;
  /** Progress toward the target, when comparing with targets. */
  progress?: number;
  trend: number[];
  /** The "so what" line. */
  note: string;
  /** True when the tag filter changes this number. */
  tagged: boolean;
}

export interface Overview {
  kpis: OverviewKpi[];
  launch?: { label: string; date: string; /** Days from today; negative once it has happened. */ daysAway: number };
  sources: { total: number; byStatus: { status: SourceStatus; count: number }[] };
}

const STATUS_ORDER: SourceStatus[] = ['ok', 'not_configured', 'placeholder', 'error'];

function sourceSummary(statuses: SourceStatusInfo[]): Overview['sources'] {
  return {
    total: statuses.length,
    byStatus: STATUS_ORDER.map((status) => ({
      status,
      count: statuses.filter((source) => source.status === status).length,
    })).filter(({ count }) => count > 0),
  };
}

export async function getOverview(
  store: DataStore,
  filters: Filters,
  context: FilterContext,
  launch?: { date: string; label: string },
): Promise<Overview> {
  const range: DateRange = { from: filters.from, to: filters.to };
  const compareWith = comparisonRange(filters, context);
  const period = quarterOf(filters.to);
  const quarter = periodRange(period)!;
  const quarterSoFar = { from: quarter.from, to: filters.to };
  const bucketDays = trendBucketDays(range);

  const [points, dealTotals, previousDeals, quarterDeals, activities, activityMetrics, targets, notes, statuses] =
    await Promise.all([
      store.getMetricPoints(),
      store.getDealTotals(range),
      compareWith ? store.getDealTotals(compareWith) : undefined,
      store.getDealTotals(quarterSoFar),
      store.getActivities(toDataFilter(filters)),
      store.getActivityMetrics(toDataFilter(filters)),
      store.getTargets(),
      store.getReportNotes(period),
      store.getSourceStatuses(),
    ]);

  const targetFor = (metric: Target['metric']) =>
    targets.find((target) => target.metric === metric && target.period === period)?.value;
  // A note written for the report wins over the generated line, unless there is nothing to explain.
  const noteFor = (metric: Target['metric'], total: number, fallback: string) =>
    (total > 0 && notes.find((note) => note.section === 'so_what' && note.metric === metric)?.text) || fallback;

  function metricKpi(id: MetricName, label: string, fallbackNote: string): OverviewKpi {
    return {
      id,
      label,
      value: formatNumber(metricTotal(points, id, range)),
      ...standing(filters, compareWith && compareMetric(points, id, range, compareWith), {
        actual: metricTotal(points, id, quarterSoFar),
        value: targetFor(id),
        period,
        format: formatNumber,
      }),
      trend: metricBuckets(points, id, range, bucketDays).map((bucket) => bucket.value),
      note: noteFor(id, metricTotal(points, id, range), fallbackNote),
      tagged: false,
    };
  }

  const installs = metricTotal(points, 'installs', range);
  const [topChannel] = metricBreakdown(points, 'installs', 'channel', range);
  const activations = metricTotal(points, 'activations', range);
  const [topEvent] = metricBreakdown(points, 'key_events', 'event', range);
  const [topTouchpoint] = [...dealTotals.byTouchpoint].sort((a, b) => b.amountUsd - a.amountUsd);

  const reach = reachByActivity(activityMetrics);
  const reachItems = activities.map(({ id, date }) => ({ date, value: reach.get(id) ?? 0 }));
  const reachTotal = reachItems.reduce((total, item) => total + item.value, 0);
  // The comparison period's activities, with the same tags.
  const previousReach = compareWith
    ? [...reachByActivity(await store.getActivityMetrics({ ...toDataFilter(filters), ...compareWith })).values()].reduce(
        (total, value) => total + value,
        0,
      )
    : undefined;

  const pipelineTrend = (await dealBuckets(store, range, bucketDays)).map((bucket) => bucket.amountUsd);

  const kpis: OverviewKpi[] = [
    metricKpi(
      'installs',
      'Product installs',
      topChannel && installs > 0
        ? `${topChannel.key} brings ${formatPercent(topChannel.share)} of installs.`
        : 'No installs in this period.',
    ),
    metricKpi(
      'activations',
      'Activations',
      installs > 0
        ? `${formatPercent(activations / installs)} of installs go on to a first real use.`
        : 'No activations in this period.',
    ),
    metricKpi(
      'key_events',
      'Key events on the site',
      topEvent && topEvent.value > 0
        ? `${topEvent.key} is the most common, with ${formatNumber(topEvent.value)}.`
        : 'No key events in this period.',
    ),
    {
      id: 'influenced_pipeline_usd',
      label: 'Influenced pipeline',
      value: formatUsd(dealTotals.amountUsd),
      ...standing(
        filters,
        previousDeals &&
          compareWith &&
          comparePeriods(dealTotals.amountUsd, previousDeals.amountUsd, {
            current: rangeDays(range),
            previous: rangeDays(compareWith),
          }),
        { actual: quarterDeals.amountUsd, value: targetFor('influenced_pipeline_usd'), period, format: formatUsd },
      ),
      trend: pipelineTrend,
      note: noteFor(
        'influenced_pipeline_usd',
        dealTotals.amountUsd,
        topTouchpoint
          ? `${dealTotals.count} ${dealTotals.count === 1 ? 'deal' : 'deals'}; ${topTouchpoint.touchpoint} is the biggest touchpoint.`
          : 'No influenced deals logged in this period.',
      ),
      tagged: false,
    },
    {
      id: 'reach',
      label: 'Audience reached',
      value: formatNumber(reachTotal),
      ...standing(
        filters,
        previousReach !== undefined && compareWith
          ? comparePeriods(reachTotal, previousReach, { current: rangeDays(range), previous: rangeDays(compareWith) })
          : undefined,
        undefined,
      ),
      trend: sumBuckets(reachItems, range, bucketDays).map((bucket) => bucket.value),
      note:
        activities.length > 0
          ? `${formatNumber(activities.length)} ${activities.length === 1 ? 'activity' : 'activities'}, reaching about ${formatNumber(Math.round(reachTotal / activities.length))} people each.`
          : 'No activities match these filters.',
      tagged: true,
    },
  ];

  return {
    kpis,
    ...(launch && { launch: { ...launch, daysAway: daysBetween(context.today, launch.date) } }),
    sources: sourceSummary(statuses),
  };
}
