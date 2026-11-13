// The numbers on the Streams and social page: what each livestream drew on
// each platform, and how followers are growing.

import type { ActivityMetric, DataStore, DateRange } from '../data/types';
import { comparisonRange, toDataFilter, type FilterContext, type Filters } from '../filters';
import { formatNumber, formatPercent } from '../format';
import { comparePeriods, compareMetric, metricBuckets, metricTotal, rangeDays, sumBuckets, trendBucketDays } from '../metrics';
import { labelFor, rowLabels, seriesFor, type ChartRow, type ChartSeries } from './shared';
import { standing, type Standing } from './standing';

export interface StreamsKpi extends Standing {
  id: string;
  label: string;
  value: string;
  trend: number[];
  note: string;
  tagged: boolean;
}

export interface Viewers {
  live: number;
  peak: number;
  replays: number;
}

export interface StreamRow extends Viewers {
  id: string;
  title: string;
  date: string;
  url?: string;
  /** The platform with the most live and replay viewers for this stream. */
  topPlatform?: string;
  byPlatform: ({ platform: string } & Viewers)[];
}

export interface PlatformRow extends Viewers {
  key: string;
  label: string;
  /** Streams that reported numbers on this platform. */
  streams: number;
  /** Live plus replay viewers per stream. */
  perStream: number;
}

export interface FollowerRow {
  key: string;
  label: string;
  start: number;
  end: number;
  /** Growth over the period as a fraction. Undefined when there was no reading at the start. */
  change?: number;
}

export interface Streams {
  kpis: StreamsKpi[];
  streams: { rows: StreamRow[]; caption: string };
  platforms: { rows: PlatformRow[]; caption: string };
  followers: { series: ChartSeries[]; rows: ChartRow[]; table: FollowerRow[]; caption: string };
  /** Platforms with a data source that is not connected and reports nothing yet. */
  missingPlatforms: { key: string; label: string; note?: string }[];
}

// Known platforms, in a fixed order so each keeps its color.
const PLATFORMS = ['youtube', 'x', 'linkedin', 'twitch', 'facebook'];

const NONE: Viewers = { live: 0, peak: 0, replays: 0 };
const FIELD: Partial<Record<ActivityMetric['metric'], keyof Viewers>> = {
  live_viewers: 'live',
  peak_viewers: 'peak',
  replay_views: 'replays',
};

function add(into: Viewers, metric: ActivityMetric): void {
  const field = FIELD[metric.metric];
  if (field && Number.isFinite(metric.value)) into[field] += metric.value;
}

const watched = (viewers: Viewers) => viewers.live + viewers.replays;

/** Live, peak and replay viewers for a set of stream metrics. */
function sumViewers(metrics: ActivityMetric[]): Viewers {
  const total = { ...NONE };
  for (const metric of metrics) add(total, metric);
  return total;
}

export async function getStreams(store: DataStore, filters: Filters, context: FilterContext): Promise<Streams> {
  const range: DateRange = { from: filters.from, to: filters.to };
  const compareWith = comparisonRange(filters, context);
  const filter = toDataFilter(filters);
  const days = compareWith && { current: rangeDays(range), previous: rangeDays(compareWith) };
  const isStream = (type: string) => type === 'livestream';

  const [activities, activityMetrics, previousActivities, previousMetrics, points, statuses] = await Promise.all([
    store.getActivities(filter),
    store.getActivityMetrics(filter),
    compareWith ? store.getActivities({ ...filter, ...compareWith }) : undefined,
    compareWith ? store.getActivityMetrics({ ...filter, ...compareWith }) : undefined,
    store.getMetricPoints(),
    store.getSourceStatuses(),
  ]);

  // ---- Streams ----
  const streams = activities.filter((activity) => isStream(activity.type));
  const ids = new Set(streams.map((stream) => stream.id));
  const streamMetrics = activityMetrics.filter((metric) => ids.has(metric.activityId));
  const totals = sumViewers(streamMetrics);

  const previousIds = new Set((previousActivities ?? []).filter((activity) => isStream(activity.type)).map((a) => a.id));
  const previousTotals = sumViewers((previousMetrics ?? []).filter((metric) => previousIds.has(metric.activityId)));

  const rows: StreamRow[] = streams
    .map((stream) => {
      const perPlatform = new Map<string, Viewers>();
      for (const metric of streamMetrics) {
        if (metric.activityId !== stream.id) continue;
        const viewers = perPlatform.get(metric.platform) ?? { ...NONE };
        add(viewers, metric);
        perPlatform.set(metric.platform, viewers);
      }
      const byPlatform = [...perPlatform]
        .map(([platform, viewers]) => ({ platform, ...viewers }))
        .sort((a, b) => watched(b) - watched(a) || a.platform.localeCompare(b.platform));
      return {
        id: stream.id,
        title: stream.title,
        date: stream.date,
        ...(stream.url && { url: stream.url }),
        ...sumViewers(streamMetrics.filter((metric) => metric.activityId === stream.id)),
        ...(byPlatform[0] && watched(byPlatform[0]) > 0 && { topPlatform: byPlatform[0].platform }),
        byPlatform,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const platformKeys = [...new Set(streamMetrics.map((metric) => metric.platform))];
  const platforms: PlatformRow[] = platformKeys
    .map((key) => {
      const own = streamMetrics.filter((metric) => metric.platform === key);
      const viewers = sumViewers(own);
      const count = new Set(own.map((metric) => metric.activityId)).size;
      return { key, label: labelFor(key), ...viewers, streams: count, perStream: count > 0 ? watched(viewers) / count : 0 };
    })
    .sort((a, b) => b.perStream - a.perStream || a.label.localeCompare(b.label));

  const dates = new Map(streams.map((stream) => [stream.id, stream.date]));
  const trendDays = trendBucketDays(range);
  const viewerTrend = (field: keyof Viewers) =>
    sumBuckets(
      streamMetrics
        .filter((metric) => FIELD[metric.metric] === field)
        .map((metric) => ({ date: dates.get(metric.activityId) ?? range.from, value: metric.value })),
      range,
      trendDays,
    ).map((bucket) => bucket.value);

  // ---- Followers ----
  const followerPoints = points.filter((point) => point.metric === 'followers');
  const everSeen = followerPoints.map((point) => point.dimensions?.platform ?? 'unknown');
  const startDay = { to: range.from };
  const table: FollowerRow[] = [...new Set(everSeen)]
    .map((key) => {
      const own = followerPoints.filter((point) => (point.dimensions?.platform ?? 'unknown') === key);
      const start = metricTotal(own, 'followers', startDay);
      const end = metricTotal(own, 'followers', { to: range.to });
      return { key, label: labelFor(key), start, end, ...(start > 0 && { change: (end - start) / start }) };
    })
    .filter((row) => row.end > 0)
    .sort((a, b) => b.end - a.end);
  const series = seriesFor(PLATFORMS, table.map((row) => row.key), everSeen);
  const perPlatform = series.map(({ key }) =>
    metricBuckets(
      followerPoints.filter((point) => (point.dimensions?.platform ?? 'unknown') === key),
      'followers',
      range,
      7,
    ),
  );
  const followerRows: ChartRow[] = (perPlatform[0] ?? []).map((bucket, i) => ({
    ...rowLabels(bucket),
    values: Object.fromEntries(series.map(({ key }, k) => [key, perPlatform[k][i].value])),
  }));
  const followers = metricTotal(followerPoints, 'followers', { to: range.to });
  const fastest = [...table].filter((row) => row.change !== undefined).sort((a, b) => b.change! - a.change!)[0];

  const best = platforms[0];
  const biggest = [...rows].sort((a, b) => watched(b) - watched(a))[0];
  const reported = new Set([...platformKeys, ...everSeen]);

  const kpis: StreamsKpi[] = [
    {
      id: 'streams',
      label: 'Livestreams',
      value: formatNumber(streams.length),
      ...standing(filters, days && comparePeriods(streams.length, previousIds.size, days)),
      trend: sumBuckets(streams.map(({ date }) => ({ date, value: 1 })), range, trendDays).map((bucket) => bucket.value),
      note:
        streams.length > 0
          ? `Each one goes out on ${platformKeys.length} ${platformKeys.length === 1 ? 'platform' : 'platforms'} at once.`
          : 'No livestreams match these filters.',
      tagged: true,
    },
    {
      id: 'live_viewers',
      label: 'Live viewers',
      value: formatNumber(totals.live),
      ...standing(filters, days && comparePeriods(totals.live, previousTotals.live, days)),
      trend: viewerTrend('live'),
      note:
        streams.length > 0
          ? `About ${formatNumber(Math.round(totals.live / streams.length))} people watch each stream live.`
          : 'No livestreams match these filters.',
      tagged: true,
    },
    {
      id: 'replay_views',
      label: 'Replay views',
      value: formatNumber(totals.replays),
      ...standing(filters, days && comparePeriods(totals.replays, previousTotals.replays, days)),
      trend: viewerTrend('replays'),
      note:
        totals.live > 0
          ? `Replays bring ${(totals.replays / totals.live).toFixed(1)} times the live audience.`
          : 'No livestreams match these filters.',
      tagged: true,
    },
    {
      id: 'followers',
      label: 'Followers, all platforms',
      value: formatNumber(followers),
      ...standing(filters, compareWith && compareMetric(followerPoints, 'followers', range, compareWith)),
      trend: metricBuckets(followerPoints, 'followers', range, trendDays).map((bucket) => bucket.value),
      note: table[0] ? `${table[0].label} is the largest audience, with ${formatNumber(table[0].end)}.` : 'No follower counts collected yet.',
      tagged: false,
    },
  ];

  return {
    kpis,
    streams: {
      rows,
      caption: biggest
        ? `“${biggest.title}” drew the most: ${formatNumber(watched(biggest))} live and replay viewers.`
        : 'No livestreams match these filters.',
    },
    platforms: {
      rows: platforms,
      caption:
        best && best.perStream > 0
          ? `${best.label} brings the most viewers per stream: about ${formatNumber(Math.round(best.perStream))}, live and replay.`
          : 'No livestreams match these filters.',
    },
    followers: {
      series,
      rows: followerRows,
      table,
      caption: fastest
        ? `${fastest.label} is growing fastest: up ${formatPercent(fastest.change!)} over this period.`
        : 'No follower counts collected yet.',
    },
    missingPlatforms: statuses
      .filter((source) => PLATFORMS.includes(source.id) && source.status !== 'ok' && !reported.has(source.id))
      .map((source) => ({ key: source.id, label: labelFor(source.id), ...(source.note && { note: source.note }) })),
  };
}
