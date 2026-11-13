// The numbers on the Capacity page: how much the team produces, the work it
// does for other teams, the requests it turns down, and what one more person
// would add at today's averages.

import { inRange } from '../data/dates';
import type { Activity, DataStore, DateRange, DeclinedRequest } from '../data/types';
import { comparisonRange, toDataFilter, type FilterContext, type Filters } from '../filters';
import { formatNumber } from '../format';
import {
  averagePerActivity,
  comparePeriods,
  outputRate,
  projectStaffing,
  rangeDays,
  sumBuckets,
  totalReach,
  trendBucketDays,
} from '../metrics';
import { bucketName, chartBucketDays, labelFor, rowLabels, seriesFor, type ChartRow, type ChartSeries } from './shared';
import { standing, type Standing } from './standing';

export interface CapacityKpi extends Standing {
  id: string;
  label: string;
  value: string;
  trend: number[];
  note: string;
  /** 'down' for requests turned down: fewer is better. */
  goodWhen?: 'up' | 'down';
}

export interface CountRow {
  key: string;
  label: string;
  count: number;
}

export interface StaffingRow {
  id: string;
  label: string;
  /** Per 30 days, with today's team. */
  current: number;
  /** Per 30 days, with one more person. */
  projected: number;
}

export interface Capacity {
  kpis: CapacityKpi[];
  output: { series: ChartSeries[]; rows: ChartRow[]; total: number; bucket: string; caption: string };
  crossTeam: {
    count: number;
    byTeam: CountRow[];
    rows: { id: string; title: string; date: string; team: string }[];
    caption: string;
  };
  declined: {
    count: number;
    byKind: CountRow[];
    rows: { id: string; title: string; date: string; kind: string; reason?: string }[];
    caption: string;
  };
  staffing: {
    people: number;
    /** Output, reach and key events first, then one row per kind of work. */
    rows: StaffingRow[];
    byType: StaffingRow[];
    caption: string;
  };
}

/** The kinds of work that count as output, in a fixed order so each keeps its color. */
export const OUTPUT_TYPES = ['blog', 'short', 'long-form-video', 'livestream', 'talk'];
const PER_DAYS = 30;

const TYPE_LABELS: Record<string, string> = {
  blog: 'Blog posts',
  short: 'Short videos',
  'long-form-video': 'Long-form videos',
  livestream: 'Livestreams',
  talk: 'Talks',
};
const KIND_LABELS: Record<string, string> = {
  conference: 'Conference invitations',
  workshop: 'Workshops',
  content: 'Content',
  'cross-team': 'Work for other teams',
};
const KIND_ORDER = ['conference', 'workshop', 'content', 'cross-team'];
const NO_TEAM = 'not_recorded';

/** 2.25 → "2.3", 14.2 → "14": one decimal only where it tells you something. */
export function formatRate(value: number): string {
  return value < 10 ? String(Math.round(value * 10) / 10) : formatNumber(Math.round(value));
}

function countBy<T>(items: T[], key: (item: T) => string, label: (key: string) => string, order: string[] = []): CountRow[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  const rank = (name: string) => (order.includes(name) ? order.indexOf(name) : order.length);
  return [...counts]
    .map(([name, count]) => ({ key: name, label: label(name), count }))
    .sort((a, b) => b.count - a.count || rank(a.key) - rank(b.key) || a.label.localeCompare(b.label));
}

const plural = (count: number, one: string, many: string) => `${formatRate(count)} ${count === 1 ? one : many}`;

export async function getCapacity(
  store: DataStore,
  filters: Filters,
  context: FilterContext,
  people = 1,
): Promise<Capacity> {
  const range: DateRange = { from: filters.from, to: filters.to };
  const compareWith = comparisonRange(filters, context);
  const days = compareWith && { current: rangeDays(range), previous: rangeDays(compareWith) };
  const filter = toDataFilter(filters);
  const tags = filters.tags.length > 0 ? { tags: filters.tags } : {};

  const [activities, activityMetrics, conferences, requests, previousActivities, previousRequests] = await Promise.all([
    store.getActivities(filter),
    store.getActivityMetrics(filter),
    store.getConferences(tags),
    store.getDeclinedRequests(range),
    compareWith ? store.getActivities({ ...filter, ...compareWith }) : [],
    compareWith ? store.getDeclinedRequests(compareWith) : [],
  ]);

  const isOutput = (activity: Activity) => OUTPUT_TYPES.includes(activity.type);
  const ofType = (list: Activity[], type: string) => list.filter((activity) => activity.type === type);
  const output = activities.filter(isOutput);
  const previousOutput = previousActivities.filter(isOutput);
  const crossTeam = ofType(activities, 'cross-team');

  const trendDays = trendBucketDays(range);
  const trend = (items: { date: string }[]) =>
    sumBuckets(items.map(({ date }) => ({ date, value: 1 })), range, trendDays).map((bucket) => bucket.value);
  const against = (current: number, previous: number) => standing(filters, days && comparePeriods(current, previous, days));

  // ---- Output over time ----
  const bucketDays = chartBucketDays(range);
  const present = OUTPUT_TYPES.filter((type) => ofType(output, type).length > 0);
  const series = seriesFor(OUTPUT_TYPES, present, OUTPUT_TYPES).map((item) => ({ ...item, label: TYPE_LABELS[item.key] ?? item.label }));
  const perType = present.map((type) => sumBuckets(ofType(output, type).map(({ date }) => ({ date, value: 1 })), range, bucketDays));
  const outputRows: ChartRow[] = (perType[0] ?? sumBuckets([], range, bucketDays)).map((bucket, i) => ({
    ...rowLabels(bucket),
    values: Object.fromEntries(present.map((type, t) => [type, perType[t][i].value])),
  }));

  const rate = (list: Activity[], within: DateRange, types = OUTPUT_TYPES) => outputRate(list, within, types, PER_DAYS);
  const outputPer30 = rate(activities, range);
  const postsPer30 = rate(activities, range, ['blog']);
  const previousPostsPer30 = compareWith ? rate(previousActivities, compareWith, ['blog']) : 0;

  // ---- Work for other teams ----
  const byTeam = countBy(crossTeam, (activity) => activity.team?.trim().toLowerCase() || NO_TEAM, labelFor);

  // ---- Turned down: logged requests plus invitations marked declined ----
  const invitations = (within: DateRange) => conferences.filter((c) => c.cfpStatus === 'declined' && inRange(c.date, within));
  const declinedRows = [
    ...requests.map(({ id, title, date, kind, reason }: DeclinedRequest) => ({ id, title, date, kind, reason })),
    ...invitations(range).map((c) => ({ id: c.id, title: `Invitation to speak at ${c.name}`, date: c.date, kind: 'conference' })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const previousDeclined = previousRequests.length + (compareWith ? invitations(compareWith).length : 0);
  const byKind = countBy(declinedRows, (row) => row.kind, (kind) => KIND_LABELS[kind] ?? labelFor(kind), KIND_ORDER);
  const asked = output.length + crossTeam.length + declinedRows.length;

  // ---- What one more person would add ----
  const outputIds = new Set(output.map((activity) => activity.id));
  const outputMetrics = activityMetrics.filter((metric) => outputIds.has(metric.activityId));
  const keyEvents = outputMetrics.reduce((sum, { metric, value }) => sum + (metric === 'key_events' && Number.isFinite(value) ? value : 0), 0);
  const reachEach = averagePerActivity(totalReach(outputMetrics), output.length);
  const keyEventsEach = averagePerActivity(keyEvents, output.length);
  const team = Number.isFinite(people) && people > 0 ? people : 1;
  const projection = projectStaffing({
    outputPerPeriod: outputPer30,
    people: team,
    outcomesPerOutput: { reach: reachEach, keyEvents: keyEventsEach },
  });
  const grow = (current: number) => projectStaffing({ outputPerPeriod: current, people: team }).projected;
  const staffingRows: StaffingRow[] = [
    { id: 'output', label: 'Pieces of work', current: projection.current, projected: projection.projected },
    {
      id: 'reach',
      label: 'People reached',
      current: projection.current * reachEach,
      projected: projection.current * reachEach + projection.addedOutcomes.reach,
    },
    {
      id: 'key_events',
      label: 'Key events on the site',
      current: projection.current * keyEventsEach,
      projected: projection.current * keyEventsEach + projection.addedOutcomes.keyEvents,
    },
  ];
  const byType: StaffingRow[] = present.map((type) => {
    const current = rate(activities, range, [type]);
    return { id: type, label: TYPE_LABELS[type] ?? labelFor(type), current, projected: grow(current) };
  });

  const none = 'No work matches these filters.';
  // Named in a caption only when it leads outright; a tie has no leader.
  const leader = (rows: CountRow[]) => (rows.length > 0 && rows[0].count > (rows[1]?.count ?? 0) ? rows[0] : undefined);
  const busiest = leader(series.map(({ key, label }) => ({ key, label, count: ofType(output, key).length })).sort((x, y) => y.count - x.count));
  const topTeam = leader(byTeam);
  const topKind = leader(byKind);

  const kpis: CapacityKpi[] = [
    {
      id: 'output',
      label: `Pieces of work per ${PER_DAYS} days`,
      value: formatRate(outputPer30),
      ...against(output.length, previousOutput.length),
      trend: trend(output),
      note: output.length > 0 ? `${formatNumber(output.length)} posts, videos, streams and talks in this period.` : none,
    },
    {
      id: 'posts',
      label: `Blog posts per ${PER_DAYS} days`,
      value: formatRate(postsPer30),
      ...against(ofType(activities, 'blog').length, ofType(previousActivities, 'blog').length),
      trend: trend(ofType(activities, 'blog')),
      note:
        compareWith && previousPostsPer30 > 0
          ? `${formatRate(previousPostsPer30)} per ${PER_DAYS} days in the period compared with. Every other format starts from a post.`
          : 'Every other format starts from a post, so this sets the pace for the rest.',
    },
    {
      id: 'cross_team',
      label: 'Contributions to other teams',
      value: formatNumber(crossTeam.length),
      ...against(crossTeam.length, ofType(previousActivities, 'cross-team').length),
      trend: trend(crossTeam),
      note:
        byTeam.length > 0
          ? `${topTeam ? `${topTeam.label} got the most help.` : `${byTeam.length} teams got help.`} This is time not spent on content or talks.`
          : 'No work for other teams matches these filters.',
    },
    {
      id: 'declined',
      label: 'Requests turned down',
      value: formatNumber(declinedRows.length),
      ...against(declinedRows.length, previousDeclined),
      trend: trend(declinedRows),
      goodWhen: 'down',
      note:
        declinedRows.length === 0
          ? 'Nothing was turned down in this period.'
          : filters.tags.length > 0
            ? 'Each one is demand the team could not meet.'
            : `${formatNumber(declinedRows.length)} of the ${formatNumber(asked)} pieces of work asked for or planned did not happen.`,
    },
  ];

  const added = projection.addedOutput;
  return {
    kpis,
    output: {
      series,
      rows: outputRows,
      total: output.length,
      bucket: bucketName(bucketDays),
      caption: busiest
        ? `${busiest.label} are the largest part of the output: ${formatNumber(busiest.count)} of ${formatNumber(output.length)} pieces.`
        : output.length > 0
          ? `${formatNumber(output.length)} pieces of ${series.length} kinds. No one kind leads.`
          : none,
    },
    crossTeam: {
      count: crossTeam.length,
      byTeam,
      rows: crossTeam
        .map(({ id, title, date, team: name }) => ({ id, title, date, team: labelFor(name?.trim().toLowerCase() || NO_TEAM) }))
        .sort((a, b) => b.date.localeCompare(a.date)),
      caption:
        byTeam.length > 0
          ? `${byTeam.length === 1 ? 'One team' : `${byTeam.length} teams`} got help. DevRel supports product and engineering as well as marketing.`
          : 'No work for other teams matches these filters.',
    },
    declined: {
      count: declinedRows.length,
      byKind,
      rows: declinedRows,
      caption:
        byKind.length > 0
          ? `${topKind ? `${topKind.label} are turned down most often.` : `Requests of ${byKind.length} kinds were turned down.`} Each one is demand the team could not meet.`
          : 'Nothing was turned down in this period.',
    },
    staffing: {
      people: team,
      rows: staffingRows,
      byType,
      caption:
        added > 0
          ? `One more person would add about ${plural(Math.round(added * 10) / 10, 'piece', 'pieces')} of work, ${formatNumber(Math.round(projection.addedOutcomes.reach))} people reached and ${formatNumber(Math.round(projection.addedOutcomes.keyEvents))} key events every ${PER_DAYS} days. This assumes they produce what a current team member does and that each piece earns today's average. It is a straight-line estimate, not a forecast.`
          : 'There is no output in this period to base an estimate on.',
    },
  };
}
