// The numbers on the product launch page: installs by channel, activation,
// weekly active users and where sign-ups heard about the product.

import { quarterOf } from '../data/dates';
import type { DataStore, DateRange, MetricName, MetricPoint } from '../data/types';
import { comparisonRange, type FilterContext, type Filters } from '../filters';
import { formatNumber, formatPercent } from '../format';
import {
  comparePeriods,
  compareMetric,
  metricBreakdown,
  metricBuckets,
  metricTotal,
  periodRange,
  trendBucketDays,
  type BreakdownRow,
} from '../metrics';
import { chartBucketDays, labelFor, rowLabels, type ChartRow, type ChartSeries } from './shared';
import { standing, type Standing } from './standing';

export { chartBucketDays, labelFor, type ChartRow, type ChartSeries } from './shared';

export interface LaunchKpi extends Standing {
  id: string;
  label: string;
  value: string;
  trend: number[];
  note: string;
}

export interface Launch {
  kpis: LaunchKpi[];
  installs: { series: ChartSeries[]; rows: ChartRow[]; total: number; caption: string; bucket: string };
  /** Undefined when the store has no usage data at all: the page shows what to ask for instead. */
  funnel?: { steps: { label: string; value: number; share: number }[]; caption: string };
  activeUsers?: { rows: ChartRow[]; caption: string };
  signups?: { rows: BreakdownRow[]; total: number; caption: string };
}

// Known install channels, in a fixed order so each keeps its color.
const CHANNELS = ['npm', 'homebrew', 'github', 'pypi', 'docker'];
const hasAny = (points: MetricPoint[], metric: MetricName) => points.some((point) => point.metric === metric);

export async function getLaunch(store: DataStore, filters: Filters, context: FilterContext): Promise<Launch> {
  const range: DateRange = { from: filters.from, to: filters.to };
  const compareWith = comparisonRange(filters, context);
  const period = quarterOf(filters.to);
  const [points, targets] = await Promise.all([store.getMetricPoints(), store.getTargets()]);

  const total = (metric: MetricName, within: Partial<DateRange> = range) => metricTotal(points, metric, within);
  const trend = (metric: MetricName) =>
    metricBuckets(points, metric, range, trendBucketDays(range)).map((bucket) => bucket.value);
  const targetFor = (metric: MetricName) =>
    targets.find((target) => target.metric === metric && target.period === period)?.value;
  const quarterSoFar = { from: periodRange(period)!.from, to: filters.to };

  const installs = total('installs');
  const activations = total('activations');
  const signups = total('signups');
  const rate = installs > 0 ? activations / installs : undefined;
  const byChannel = metricBreakdown(points, 'installs', 'channel', range);
  const bySource = metricBreakdown(points, 'signups', 'heard_from', range);

  function countKpi(id: MetricName, label: string, note: string): LaunchKpi {
    return {
      id,
      label,
      value: formatNumber(total(id)),
      ...standing(filters, compareWith && compareMetric(points, id, range, compareWith), {
        actual: total(id, quarterSoFar),
        value: targetFor(id),
        period,
        format: formatNumber,
      }),
      trend: trend(id),
      note,
    };
  }

  // Activation rate compares rate with rate, whatever the lengths of the periods.
  const previousInstalls = compareWith ? total('installs', compareWith) : 0;
  const previousRate = previousInstalls > 0 ? total('activations', compareWith) / previousInstalls : 0;
  const installTrend = trend('installs');

  const kpis: LaunchKpi[] = [
    countKpi(
      'installs',
      'Installs',
      byChannel[0] && installs > 0
        ? `${labelFor(byChannel[0].key)} brings ${formatPercent(byChannel[0].share)} of installs.`
        : 'No installs in this period.',
    ),
    countKpi(
      'signups',
      'Sign-ups',
      installs > 0 && signups > 0
        ? `About one sign-up for every ${formatNumber(Math.max(Math.round(installs / signups), 1))} installs.`
        : 'No sign-ups in this period.',
    ),
    {
      id: 'activation_rate',
      label: 'Activation rate',
      value: rate === undefined ? '–' : formatPercent(rate),
      ...standing(filters, compareWith && rate !== undefined ? comparePeriods(rate, previousRate) : undefined),
      trend: trend('activations').map((value, i) => (installTrend[i] > 0 ? value / installTrend[i] : 0)),
      note:
        rate === undefined
          ? 'No installs in this period.'
          : `${formatNumber(activations)} of ${formatNumber(installs)} installs went on to a first real use.`,
    },
    countKpi(
      'active_users',
      'Weekly active users',
      total('active_users') > 0
        ? 'People who used the product in the latest week of this period.'
        : 'No active users recorded in this period.',
    ),
  ];

  // Installs over time, stacked by channel.
  const bucketDays = chartBucketDays(range);
  const keys = [
    ...CHANNELS.filter((channel) => byChannel.some((row) => row.key === channel)),
    ...byChannel.map((row) => row.key).filter((key) => !CHANNELS.includes(key)).sort(),
  ];
  const extras = [...new Set(points.filter((p) => p.metric === 'installs').map((p) => p.dimensions?.channel ?? 'unknown'))]
    .filter((key) => !CHANNELS.includes(key))
    .sort();
  const series = keys.map((key) => ({
    key,
    label: labelFor(key),
    colorIndex: CHANNELS.includes(key) ? CHANNELS.indexOf(key) : CHANNELS.length + extras.indexOf(key),
  }));
  const perChannel = keys.map((key) =>
    metricBuckets(
      points.filter((point) => (point.dimensions?.channel ?? 'unknown') === key),
      'installs',
      range,
      bucketDays,
    ),
  );
  const installRows: ChartRow[] = (perChannel[0] ?? []).map((bucket, i) => ({
    ...rowLabels(bucket),
    values: Object.fromEntries(keys.map((key, k) => [key, perChannel[k][i].value])),
  }));
  const rowTotal = (row: ChartRow) => Object.values(row.values).reduce((sum, value) => sum + value, 0);
  const best = installRows.reduce<ChartRow | undefined>((top, row) => (!top || rowTotal(row) > rowTotal(top) ? row : top), undefined);

  const usage = hasAny(points, 'activations');
  const weekly = metricBuckets(points, 'active_users', range, 7);
  const [firstWeek, lastWeek] = [weekly.find((bucket) => bucket.value > 0), weekly.at(-1)];

  return {
    kpis,
    installs: {
      series,
      rows: installRows,
      total: installs,
      bucket: bucketDays === 1 ? 'day' : bucketDays === 7 ? 'week' : '30 days',
      caption:
        best && installs > 0
          ? `The busiest ${bucketDays === 1 ? 'day' : 'stretch'} was ${best.period}, with ${formatNumber(rowTotal(best))} installs.`
          : 'No installs in this period.',
    },
    ...(usage && {
      funnel: {
        steps: [
          { label: 'Installs', value: installs, share: installs > 0 ? 1 : 0 },
          { label: 'First real use', value: activations, share: rate ?? 0 },
        ],
        caption:
          rate === undefined
            ? 'No installs in this period.'
            : `${formatPercent(rate)} of installs become real use. Tutorials and the quickstart are what move this number.`,
      },
    }),
    ...(hasAny(points, 'active_users') && {
      activeUsers: {
        rows: weekly.map((bucket) => ({ ...rowLabels(bucket), values: { active_users: bucket.value } })),
        caption:
          firstWeek && lastWeek && lastWeek.value > 0
            ? `From ${formatNumber(firstWeek.value)} to ${formatNumber(lastWeek.value)} weekly users over this period.`
            : 'No active users recorded in this period.',
      },
    }),
    ...(hasAny(points, 'signups') && {
      signups: {
        rows: bySource,
        total: signups,
        caption:
          bySource[0] && signups > 0
            ? `${labelFor(bySource[0].key)} is the top answer, at ${formatPercent(bySource[0].share)} of sign-ups.`
            : 'No sign-ups in this period.',
      },
    }),
  };
}
