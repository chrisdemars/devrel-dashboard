// The numbers on the Pipeline and impact page: key events on the site,
// deals sales linked to DevRel, and what each channel cost for what it
// produced. Deals are read as totals only; individual deals are for admins.

import { quarterOf } from '../data/dates';
import type { DataStore, DateRange } from '../data/types';
import { comparisonRange, type FilterContext, type Filters } from '../filters';
import { formatNumber, formatPercent, formatUsd } from '../format';
import {
  comparePeriods,
  compareMetric,
  costPerOutcome,
  metricBreakdown,
  metricBuckets,
  metricTotal,
  periodRange,
  rangeDays,
  trendBucketDays,
} from '../metrics';
import { bucketName, chartBucketDays, dealBuckets, labelFor, rowLabels, seriesFor, type ChartRow, type ChartSeries } from './shared';
import { standing, type Standing } from './standing';

export interface PipelineKpi extends Standing {
  id: string;
  label: string;
  value: string;
  trend: number[];
  note: string;
}

export interface ChannelRow {
  key: string;
  label: string;
  /** Money logged against this channel's activities. Zero when none was logged. */
  spendUsd: number;
  deals: number;
  pipelineUsd: number;
  /** Undefined when there is no spend or no deals to divide. */
  costPerDeal?: number;
}

export interface Pipeline {
  kpis: PipelineKpi[];
  keyEvents: { series: ChartSeries[]; rows: ChartRow[]; total: number; bucket: string; caption: string };
  touchpoints: { rows: { key: string; label: string; count: number; amountUsd: number; share: number }[]; caption: string };
  channels: { rows: ChannelRow[]; caption: string };
  /** Set when the CRM is not connected: deals are then logged by hand. */
  crm?: { note?: string };
}

/** Which deal touchpoint each activity type's spend counts toward. */
const CHANNEL_OF: Record<string, string> = {
  talk: 'conference',
  blog: 'content',
  short: 'content',
  'long-form-video': 'content',
  livestream: 'livestream',
};

export async function getPipeline(store: DataStore, filters: Filters, context: FilterContext): Promise<Pipeline> {
  const range: DateRange = { from: filters.from, to: filters.to };
  const compareWith = comparisonRange(filters, context);
  const days = compareWith && { current: rangeDays(range), previous: rangeDays(compareWith) };
  const period = quarterOf(filters.to);
  const quarterSoFar = { from: periodRange(period)!.from, to: filters.to };
  const trendDays = trendBucketDays(range);

  const [points, deals, previousDeals, quarterDeals, dealTrend, activities, targets, statuses] = await Promise.all([
    store.getMetricPoints({ metrics: ['key_events'] }),
    store.getDealTotals(range),
    compareWith ? store.getDealTotals(compareWith) : undefined,
    store.getDealTotals(quarterSoFar),
    dealBuckets(store, range, trendDays),
    store.getActivities(range),
    store.getTargets(),
    store.getSourceStatuses(),
  ]);
  const targetFor = (metric: 'key_events' | 'influenced_pipeline_usd') =>
    targets.find((target) => target.metric === metric && target.period === period)?.value;

  // ---- Key events ----
  const keyEvents = metricTotal(points, 'key_events', range);
  const byEvent = metricBreakdown(points, 'key_events', 'event', range);
  const everSeen = points.map((point) => point.dimensions?.event ?? 'unknown');
  const series = seriesFor([], byEvent.map((row) => row.key), everSeen);
  const bucketDays = chartBucketDays(range);
  const perEvent = series.map(({ key }) =>
    metricBuckets(
      points.filter((point) => (point.dimensions?.event ?? 'unknown') === key),
      'key_events',
      range,
      bucketDays,
    ),
  );
  const eventRows: ChartRow[] = (perEvent[0] ?? []).map((bucket, i) => ({
    ...rowLabels(bucket),
    values: Object.fromEntries(series.map(({ key }, k) => [key, perEvent[k][i].value])),
  }));

  // ---- Deals by touchpoint ----
  const touchpoints = [...deals.byTouchpoint]
    .map((row) => ({
      key: row.touchpoint,
      label: labelFor(row.touchpoint),
      count: row.count,
      amountUsd: row.amountUsd,
      share: deals.amountUsd > 0 ? row.amountUsd / deals.amountUsd : 0,
    }))
    .sort((a, b) => b.amountUsd - a.amountUsd || a.label.localeCompare(b.label));

  // ---- Spend against deals, by channel ----
  const spend = new Map<string, number>();
  for (const activity of activities) {
    const channel = CHANNEL_OF[activity.type];
    if (channel && activity.costUsd) spend.set(channel, (spend.get(channel) ?? 0) + activity.costUsd);
  }
  const pipelineBy = new Map(deals.byTouchpoint.map((row) => [row.touchpoint, row.amountUsd]));
  const channels: ChannelRow[] = costPerOutcome([
    ...[...spend].map(([channel, costUsd]) => ({ channel, costUsd })),
    ...deals.byTouchpoint.map((row) => ({ channel: row.touchpoint, outcomes: row.count })),
  ]).map((row) => ({
    key: row.channel,
    label: labelFor(row.channel),
    spendUsd: row.costUsd,
    deals: row.outcomes,
    pipelineUsd: pipelineBy.get(row.channel) ?? 0,
    ...(row.costUsd > 0 && row.costPerOutcome !== undefined && { costPerDeal: row.costPerOutcome }),
  }));
  const costed = channels.filter((row) => row.costPerDeal !== undefined);
  const unspent = channels.filter((row) => row.spendUsd === 0 && row.deals > 0);

  const crm = statuses.find((source) => source.id === 'crm');
  const top = touchpoints[0];

  const kpis: PipelineKpi[] = [
    {
      id: 'key_events',
      label: 'Key events on the site',
      value: formatNumber(keyEvents),
      ...standing(filters, compareWith && compareMetric(points, 'key_events', range, compareWith), {
        actual: metricTotal(points, 'key_events', quarterSoFar),
        value: targetFor('key_events'),
        period,
        format: formatNumber,
      }),
      trend: metricBuckets(points, 'key_events', range, trendDays).map((bucket) => bucket.value),
      note:
        byEvent[0] && keyEvents > 0
          ? `${labelFor(byEvent[0].key)} is the most common, at ${formatPercent(byEvent[0].share)}.`
          : 'No key events in this period.',
    },
    {
      id: 'influenced_pipeline_usd',
      label: 'Influenced pipeline',
      value: formatUsd(deals.amountUsd),
      ...standing(filters, previousDeals && days && comparePeriods(deals.amountUsd, previousDeals.amountUsd, days), {
        actual: quarterDeals.amountUsd,
        value: targetFor('influenced_pipeline_usd'),
        period,
        format: formatUsd,
      }),
      trend: dealTrend.map((bucket) => bucket.amountUsd),
      note: top ? `${top.label} is the biggest touchpoint, at ${formatPercent(top.share)} of the amount.` : 'No influenced deals in this period.',
    },
    {
      id: 'deals',
      label: 'Deals influenced',
      value: formatNumber(deals.count),
      ...standing(filters, previousDeals && days && comparePeriods(deals.count, previousDeals.count, days)),
      trend: dealTrend.map((bucket) => bucket.count),
      note:
        deals.count > 0
          ? `About ${formatUsd(Math.round(deals.amountUsd / deals.count))} per deal.`
          : 'No influenced deals in this period.',
    },
    {
      id: 'won',
      label: 'Won so far',
      value: formatUsd(deals.wonAmountUsd),
      ...standing(filters, previousDeals && days && comparePeriods(deals.wonAmountUsd, previousDeals.wonAmountUsd, days)),
      trend: dealTrend.map((bucket) => bucket.wonAmountUsd),
      note:
        deals.count > 0
          ? `${deals.wonCount} of ${deals.count} ${deals.count === 1 ? 'deal' : 'deals'} closed as won; the rest are open or lost.`
          : 'No influenced deals in this period.',
    },
  ];

  return {
    kpis,
    keyEvents: {
      series,
      rows: eventRows,
      total: keyEvents,
      bucket: bucketName(bucketDays),
      caption:
        byEvent[0] && keyEvents > 0
          ? `${labelFor(byEvent[0].key)} leads with ${formatNumber(byEvent[0].value)}. These are the steps a visitor takes toward the product.`
          : 'No key events in this period.',
    },
    touchpoints: {
      rows: touchpoints,
      caption: top
        ? `${top.label} is where most influenced pipeline starts: ${formatUsd(top.amountUsd)} across ${top.count} ${top.count === 1 ? 'deal' : 'deals'}.`
        : 'No influenced deals in this period.',
    },
    channels: {
      rows: channels,
      caption:
        costed.length > 0
          ? `${costed[0].label} cost ${formatUsd(Math.round(costed[0].costPerDeal!))} per influenced deal.${unspent.length > 0 ? ` ${unspent.map((row) => row.label).join(' and ')} had no spend logged, only time.` : ''}`
          : channels.length > 0
            ? 'No spend is logged against these channels yet, so there is no cost per deal.'
            : 'No spend or deals in this period.',
    },
    ...(crm && crm.status !== 'ok' && { crm: { ...(crm.note && { note: crm.note }) } }),
  };
}
