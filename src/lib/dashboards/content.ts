// The numbers on the Content page: how far each post travels once every
// format made from it is counted, which posts bring visits and which bring
// key events, and where site traffic comes from.

import { quarterOf } from '../data/dates';
import type { Activity, ActivityMetric, DataStore, DateRange, MetricName } from '../data/types';
import { comparisonRange, toDataFilter, type FilterContext, type Filters } from '../filters';
import { formatDay, formatDayRange, formatNumber, formatPercent } from '../format';
import {
  comparePeriods,
  compareMetric,
  contentRollup,
  metricBreakdown,
  metricBuckets,
  metricTotal,
  periodRange,
  rangeDays,
  reachByActivity,
  sumBuckets,
  totalReach,
  trendBucketDays,
  type ContentRollup,
} from '../metrics';
import { chartBucketDays, labelFor, type ChartRow, type ChartSeries } from './launch';
import { standing, type Standing } from './standing';

export interface ContentKpi extends Standing {
  id: string;
  label: string;
  value: string;
  trend: number[];
  note: string;
  /** True when the tag filter changes this number. */
  tagged: boolean;
}

export interface PostRow {
  id: string;
  title: string;
  date: string;
  url?: string;
  /** The formats made from the post, e.g. ['short', 'livestream']. */
  formats: string[];
  postReach: number;
  totalReach: number;
  multiplier?: number;
}

export interface TopPost {
  id: string;
  title: string;
  value: number;
}

export interface Content {
  kpis: ContentKpi[];
  posts: { rows: PostRow[]; caption: string };
  topByViews: TopPost[];
  topByKeyEvents: TopPost[];
  topCaption: string;
  sessions: { series: ChartSeries[]; rows: ChartRow[]; total: number; bucket: string; caption: string };
  channels: { key: string; label: string; sessions: number; engaged: number; rate: number }[];
  channelCaption: string;
  /** Undefined when no subscriber counts have ever been collected. */
  subscribers?: { rows: ChartRow[]; caption: string };
}

// Known traffic channels, in a fixed order so each keeps its color.
const CHANNELS = ['organic_search', 'organic_social', 'referral', 'direct', 'email', 'paid'];
const TOP = 5;

const shortDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const rowLabels = ({ from, to }: DateRange) => ({
  label: shortDay.format(new Date(`${from}T00:00:00Z`)),
  period: from === to ? formatDay(from) : formatDayRange(from, to),
});

/** The top posts by one number measured on the post itself, e.g. blog views. */
function topPosts(posts: Activity[], metrics: ActivityMetric[], metric: ActivityMetric['metric'], limit = TOP): TopPost[] {
  const totals = new Map<string, number>();
  for (const item of metrics) {
    if (item.metric === metric && item.platform === 'blog') totals.set(item.activityId, (totals.get(item.activityId) ?? 0) + item.value);
  }
  return posts
    .map(({ id, title }) => ({ id, title, value: totals.get(id) ?? 0 }))
    .filter((post) => post.value > 0)
    .sort((a, b) => b.value - a.value || a.title.localeCompare(b.title))
    .slice(0, limit);
}

function postRow({ post, derived, postReach, totalReach, multiplier }: ContentRollup): PostRow {
  return {
    id: post.id,
    title: post.title,
    date: post.date,
    ...(post.url && { url: post.url }),
    formats: [...new Set(derived.map((activity) => activity.type))],
    postReach,
    totalReach,
    ...(multiplier !== undefined && { multiplier }),
  };
}

export async function getContent(store: DataStore, filters: Filters, context: FilterContext): Promise<Content> {
  const range: DateRange = { from: filters.from, to: filters.to };
  const compareWith = comparisonRange(filters, context);
  const period = quarterOf(filters.to);
  const quarterSoFar = { from: periodRange(period)!.from, to: filters.to };
  const filter = toDataFilter(filters);

  const [points, targets, activities, activityMetrics, previousMetrics] = await Promise.all([
    store.getMetricPoints(),
    store.getTargets(),
    store.getActivities(filter),
    store.getActivityMetrics(filter),
    compareWith ? store.getActivityMetrics({ ...filter, ...compareWith }) : undefined,
  ]);

  const total = (metric: MetricName, within: Partial<DateRange> = range) => metricTotal(points, metric, within);
  const trendDays = trendBucketDays(range);
  const trend = (metric: MetricName, from = points) => metricBuckets(from, metric, range, trendDays).map((bucket) => bucket.value);
  const targetFor = (metric: MetricName) =>
    targets.find((target) => target.metric === metric && target.period === period)?.value;

  // ---- Posts and what was made from them ----
  const rollup = contentRollup(activities, activityMetrics);
  const posts = rollup.map(postRow);
  const blogPosts = rollup.map((row) => row.post);
  const reach = totalReach(activityMetrics);
  const postReach = posts.reduce((sum, post) => sum + post.postReach, 0);
  const rolledReach = posts.reduce((sum, post) => sum + post.totalReach, 0);
  const dates = new Map(activities.map((activity) => [activity.id, activity.date]));
  const reachTrend = sumBuckets(
    [...reachByActivity(activityMetrics)].map(([id, value]) => ({ date: dates.get(id) ?? range.from, value })),
    range,
    trendDays,
  ).map((bucket) => bucket.value);

  const topByViews = topPosts(blogPosts, activityMetrics, 'views');
  const topByKeyEvents = topPosts(blogPosts, activityMetrics, 'key_events');
  // The post that brings the most key events, and where it ranks by traffic.
  const converter = topByKeyEvents[0];
  const viewRank = converter ? topPosts(blogPosts, activityMetrics, 'views', Infinity).findIndex((post) => post.id === converter.id) + 1 : 0;

  // ---- Site traffic ----
  const sessions = total('sessions');
  const engaged = total('engaged_sessions');
  const rate = sessions > 0 ? engaged / sessions : undefined;
  const previousSessions = compareWith ? total('sessions', compareWith) : 0;
  const previousRate = previousSessions > 0 ? total('engaged_sessions', compareWith) / previousSessions : 0;
  const sessionTrend = trend('sessions');
  const byChannel = metricBreakdown(points, 'sessions', 'channel', range);
  const engagedByChannel = new Map(metricBreakdown(points, 'engaged_sessions', 'channel', range).map((row) => [row.key, row.value]));
  const channels = byChannel.map((row) => {
    const engagedSessions = engagedByChannel.get(row.key) ?? 0;
    return {
      key: row.key,
      label: labelFor(row.key),
      sessions: row.value,
      engaged: engagedSessions,
      rate: row.value > 0 ? engagedSessions / row.value : 0,
    };
  });
  const bestChannel = [...channels].filter((channel) => channel.sessions > 0).sort((a, b) => b.rate - a.rate)[0];

  const everyChannel = [...new Set(points.filter((p) => p.metric === 'sessions').map((p) => p.dimensions?.channel ?? 'unknown'))];
  const extras = everyChannel.filter((key) => !CHANNELS.includes(key)).sort();
  const keys = [...CHANNELS, ...extras].filter((key) => byChannel.some((row) => row.key === key));
  const series = keys.map((key) => ({
    key,
    label: labelFor(key),
    colorIndex: CHANNELS.includes(key) ? CHANNELS.indexOf(key) : CHANNELS.length + extras.indexOf(key),
  }));
  const bucketDays = chartBucketDays(range);
  const perChannel = keys.map((key) =>
    metricBuckets(
      points.filter((point) => (point.dimensions?.channel ?? 'unknown') === key),
      'sessions',
      range,
      bucketDays,
    ),
  );
  const sessionRows: ChartRow[] = (perChannel[0] ?? []).map((bucket, i) => ({
    ...rowLabels(bucket),
    values: Object.fromEntries(keys.map((key, k) => [key, perChannel[k][i].value])),
  }));

  // ---- YouTube ----
  const youtube = points.filter((point) => point.metric === 'followers' && point.dimensions?.platform === 'youtube');
  const subscribers = metricTotal(youtube, 'followers', range);
  const weekly = metricBuckets(youtube, 'followers', range, 7);
  const youtubeViews = activityMetrics
    .filter((item) => item.platform === 'youtube' && item.metric === 'views')
    .reduce((sum, item) => sum + item.value, 0);

  const kpis: ContentKpi[] = [
    {
      id: 'sessions',
      label: 'Site sessions',
      value: formatNumber(sessions),
      ...standing(filters, compareWith && compareMetric(points, 'sessions', range, compareWith), {
        actual: total('sessions', quarterSoFar),
        value: targetFor('sessions'),
        period,
        format: formatNumber,
      }),
      trend: sessionTrend,
      note:
        byChannel[0] && sessions > 0
          ? `${labelFor(byChannel[0].key)} brings ${formatPercent(byChannel[0].share)} of visits.`
          : 'No sessions in this period.',
      tagged: false,
    },
    {
      id: 'engagement_rate',
      label: 'Engaged sessions',
      value: rate === undefined ? '–' : formatPercent(rate),
      ...standing(filters, compareWith && rate !== undefined ? comparePeriods(rate, previousRate) : undefined),
      trend: trend('engaged_sessions').map((value, i) => (sessionTrend[i] > 0 ? value / sessionTrend[i] : 0)),
      note:
        rate === undefined
          ? 'No sessions in this period.'
          : `${formatNumber(engaged)} of ${formatNumber(sessions)} visits stayed, scrolled or clicked.`,
      tagged: false,
    },
    {
      id: 'reach',
      label: 'Content reach',
      value: formatNumber(reach),
      ...standing(
        filters,
        compareWith && previousMetrics
          ? comparePeriods(reach, totalReach(previousMetrics), { current: rangeDays(range), previous: rangeDays(compareWith) })
          : undefined,
      ),
      trend: reachTrend,
      note:
        postReach > 0
          ? `Posts reach ${(rolledReach / postReach).toFixed(1)} times further once shorts and streams are counted.`
          : 'No content matches these filters.',
      tagged: true,
    },
    {
      id: 'youtube_subscribers',
      label: 'YouTube subscribers',
      value: formatNumber(subscribers),
      ...standing(filters, compareWith && compareMetric(youtube, 'followers', range, compareWith)),
      trend: trend('followers', youtube),
      note:
        youtubeViews > 0
          ? `Videos published in this period have ${formatNumber(youtubeViews)} views.`
          : 'No video views recorded in this period.',
      tagged: false,
    },
  ];

  const best = posts[0];
  const [firstWeek, lastWeek] = [weekly.find((bucket) => bucket.value > 0), weekly.at(-1)];

  return {
    kpis,
    posts: {
      rows: posts,
      caption: best
        ? `“${best.title}” travelled furthest: ${formatNumber(best.totalReach)} people across ${best.formats.length + 1} ${best.formats.length === 0 ? 'format' : 'formats'}.`
        : 'No posts match these filters.',
    },
    topByViews,
    topByKeyEvents,
    topCaption:
      topByViews.length === 0
        ? 'No posts match these filters.'
        : topByKeyEvents.length === 0
          ? 'Key events are not yet reported per post.'
          : viewRank === 1
            ? `“${converter.title}” leads both lists: the most read and the most key events.`
            : `“${converter.title}” brings the most key events but ranks ${viewRank > 0 ? `number ${viewRank}` : 'outside the list'} by traffic. The most-read post is not always the one that converts.`,
    sessions: {
      series,
      rows: sessionRows,
      total: sessions,
      bucket: bucketDays === 1 ? 'day' : bucketDays === 7 ? 'week' : '30 days',
      caption:
        byChannel[0] && sessions > 0
          ? `${labelFor(byChannel[0].key)} is the largest source, at ${formatPercent(byChannel[0].share)} of visits.`
          : 'No sessions in this period.',
    },
    channels,
    channelCaption: bestChannel
      ? `${bestChannel.label} visitors are the most engaged: ${formatPercent(bestChannel.rate)} stay, scroll or click.`
      : 'No sessions in this period.',
    ...(youtube.length > 0 && {
      subscribers: {
        rows: weekly.map((bucket) => ({ ...rowLabels(bucket), values: { subscribers: bucket.value } })),
        caption:
          firstWeek && lastWeek && lastWeek.value > firstWeek.value
            ? `Up ${formatNumber(lastWeek.value - firstWeek.value)} over this period, from ${formatNumber(firstWeek.value)} to ${formatNumber(lastWeek.value)}.`
            : `${formatNumber(subscribers)} subscribers at the end of this period.`,
      },
    }),
  };
}
