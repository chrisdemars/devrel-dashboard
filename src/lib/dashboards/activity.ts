// The Activity log: every logged activity in one list that can be narrowed by
// type and sorted, and the detail view of one activity with everything made
// from it.

import type { Activity, ActivityMetric, DataStore, DateRange } from '../data/types';
import { comparisonRange, filtersToSearchParams, toDataFilter, type FilterContext, type Filters, type SearchParamsInput } from '../filters';
import { formatNumber } from '../format';
import { comparePeriods, rangeDays, reachByActivity, sumBuckets, trendBucketDays } from '../metrics';
import { labelFor } from './shared';
import { standing, type Standing } from './standing';

export const SORTS = ['date', 'reach'] as const;
export type Sort = (typeof SORTS)[number];
export const SORT_LABELS: Record<Sort, string> = { date: 'Newest first', reach: 'Most reach first' };

/** What the log shows on top of the shared filters. Kept in the URL as `type` and `sort`. */
export interface LogView {
  /** One activity type, e.g. 'blog'. Undefined shows every type. */
  type?: string;
  sort: Sort;
}

const TYPE_LABELS: Record<string, string> = {
  blog: 'Blog post',
  short: 'Short video',
  'long-form-video': 'Long-form video',
  livestream: 'Livestream',
  talk: 'Talk',
  'cross-team': 'Work for another team',
  community: 'Community',
  feedback: 'Product feedback',
};

/** A display name for an activity type: "blog" → "Blog post". */
export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? labelFor(type);
}

/** Reads `type` and `sort` from the URL. Anything missing or invalid falls back to its default. */
export function parseLogView(input: SearchParamsInput): LogView {
  const get = (key: string) => {
    const value = input instanceof URLSearchParams ? (input.get(key) ?? undefined) : input[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const type = get('type')?.trim().toLowerCase().slice(0, 50);
  const sort = get('sort') as Sort | undefined;
  return { ...(type && { type }), sort: sort && SORTS.includes(sort) ? sort : 'date' };
}

/** A link to the log, or to one activity in it, that keeps the filters and the view. Defaults are left out. */
export function logHref(filters: Filters, view: LogView, activityId?: string): string {
  const params = filtersToSearchParams(filters);
  if (view.type) params.set('type', view.type);
  if (view.sort !== 'date') params.set('sort', view.sort);
  const query = params.toString().replaceAll('%2C', ',');
  const path = activityId === undefined ? '/activity' : `/activity/${encodeURIComponent(activityId)}`;
  return query ? `${path}?${query}` : path;
}

export interface LogKpi extends Standing {
  id: string;
  label: string;
  value: string;
  trend: number[];
  note: string;
}

export interface LogRow {
  id: string;
  href: string;
  title: string;
  date: string;
  type: string;
  typeLabel: string;
  url?: string;
  /** Free-form tags; the type is left out because it has its own column. */
  tags: string[];
  reach: number;
  engagements: number;
  keyEvents: number;
  /** People in the room, for a talk. An estimate, so it is kept apart from reach. */
  estAudience?: number;
  /** How many other activities were made from this one. */
  madeFromIt: number;
}

export interface LogChoice {
  key: string;
  label: string;
  href: string;
  current: boolean;
  count?: number;
}

export interface ActivityLog {
  kpis: LogKpi[];
  /** "All types" first, then each type found with these filters. */
  types: LogChoice[];
  sorts: LogChoice[];
  rows: LogRow[];
  caption: string;
}

function totals(metrics: ActivityMetric[], name: ActivityMetric['metric']): Map<string, number> {
  const sums = new Map<string, number>();
  for (const { activityId, metric, value } of metrics) {
    if (metric === name && Number.isFinite(value)) sums.set(activityId, (sums.get(activityId) ?? 0) + value);
  }
  return sums;
}

const sumOf = (ids: string[], values: Map<string, number>) => ids.reduce((sum, id) => sum + (values.get(id) ?? 0), 0);

export async function getActivityLog(store: DataStore, filters: Filters, context: FilterContext, view: LogView): Promise<ActivityLog> {
  const range: DateRange = { from: filters.from, to: filters.to };
  const compareWith = comparisonRange(filters, context);
  const days = compareWith && { current: rangeDays(range), previous: rangeDays(compareWith) };
  const filter = toDataFilter(filters);

  const [matching, metrics, everything, previousMatching, previousMetrics] = await Promise.all([
    store.getActivities(filter),
    store.getActivityMetrics(filter),
    store.getActivities(),
    compareWith ? store.getActivities({ ...filter, ...compareWith }) : [],
    compareWith ? store.getActivityMetrics({ ...filter, ...compareWith }) : [],
  ]);

  const ofType = (list: Activity[]) => (view.type ? list.filter((activity) => activity.type === view.type) : list);
  const activities = ofType(matching);
  const previous = ofType(previousMatching);
  const ids = activities.map((activity) => activity.id);
  const previousIds = previous.map((activity) => activity.id);

  const reach = reachByActivity(metrics);
  const engagements = totals(metrics, 'engagements');
  const keyEvents = totals(metrics, 'key_events');
  const children = new Map<string, number>();
  for (const { parentId } of everything) if (parentId) children.set(parentId, (children.get(parentId) ?? 0) + 1);

  const rows: LogRow[] = activities
    .map((activity) => ({
      id: activity.id,
      href: logHref(filters, view, activity.id),
      title: activity.title,
      date: activity.date,
      type: activity.type,
      typeLabel: typeLabel(activity.type),
      ...(activity.url && { url: activity.url }),
      ...(activity.estAudience !== undefined && { estAudience: activity.estAudience }),
      tags: activity.tags.filter((tag) => tag !== activity.type),
      reach: reach.get(activity.id) ?? 0,
      engagements: engagements.get(activity.id) ?? 0,
      keyEvents: keyEvents.get(activity.id) ?? 0,
      madeFromIt: children.get(activity.id) ?? 0,
    }))
    .sort((a, b) =>
      view.sort === 'reach'
        ? b.reach - a.reach || b.date.localeCompare(a.date) || a.id.localeCompare(b.id)
        : b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
    );

  // ---- Choices: a type keeps its place in the list whatever is selected ----
  const counts = new Map<string, number>();
  for (const { type } of matching) counts.set(type, (counts.get(type) ?? 0) + 1);
  const types: LogChoice[] = [
    { key: 'all', label: 'All types', href: logHref(filters, { sort: view.sort }), current: !view.type, count: matching.length },
    ...[...counts]
      .sort(([a], [b]) => typeLabel(a).localeCompare(typeLabel(b)))
      .map(([type, count]) => ({
        key: type,
        label: typeLabel(type),
        href: logHref(filters, { type, sort: view.sort }),
        current: view.type === type,
        count,
      })),
  ];
  const sorts: LogChoice[] = SORTS.map((sort) => ({
    key: sort,
    label: SORT_LABELS[sort],
    href: logHref(filters, { ...view, sort }),
    current: view.sort === sort,
  }));

  const trendDays = trendBucketDays(range);
  const trend = (value: (activity: Activity) => number) =>
    sumBuckets(activities.map((activity) => ({ date: activity.date, value: value(activity) })), range, trendDays).map((bucket) => bucket.value);
  const against = (current: number, before: number) => standing(filters, days && comparePeriods(current, before, days));
  const totalReach = sumOf(ids, reach);
  const totalKeyEvents = sumOf(ids, keyEvents);
  const top = [...rows].sort((a, b) => b.reach - a.reach)[0];
  const none = 'No activities match these filters.';

  const kpis: LogKpi[] = [
    {
      id: 'activities',
      label: 'Activities logged',
      value: formatNumber(activities.length),
      ...against(activities.length, previous.length),
      trend: trend(() => 1),
      note:
        activities.length === 0
          ? none
          : view.type
            ? `${typeLabel(view.type)} only, out of ${formatNumber(matching.length)} activities of every type.`
            : `${counts.size} ${counts.size === 1 ? 'type' : 'types'} of work with these filters.`,
    },
    {
      id: 'reach',
      label: 'People reached',
      value: formatNumber(totalReach),
      ...against(totalReach, sumOf(previousIds, reachByActivity(previousMetrics))),
      trend: trend((activity) => reach.get(activity.id) ?? 0),
      note: top && top.reach > 0 ? `"${top.title}" reached the most: ${formatNumber(top.reach)}.` : 'No reach is recorded for these activities.',
    },
    {
      id: 'key_events',
      label: 'Key events',
      value: formatNumber(totalKeyEvents),
      ...against(totalKeyEvents, sumOf(previousIds, totals(previousMetrics, 'key_events'))),
      trend: trend((activity) => keyEvents.get(activity.id) ?? 0),
      note:
        totalKeyEvents > 0
          ? 'Counted on the site in visits that started on one of these activities.'
          : 'No key events are recorded for these activities.',
    },
  ];

  return {
    kpis,
    types,
    sorts,
    rows,
    caption:
      rows.length > 0
        ? `${formatNumber(rows.length)} ${rows.length === 1 ? 'activity' : 'activities'}. Select a title to see its numbers and what was made from it.`
        : none,
  };
}

export interface RelatedActivity {
  id: string;
  title: string;
  date: string;
  typeLabel: string;
  reach: number;
}

export interface ActivityDetail {
  activity: Activity;
  typeLabel: string;
  tags: string[];
  /** People reached by this activity alone. */
  reach: number;
  /** One row per platform and number, largest platform first. */
  metrics: { platform: string; platformLabel: string; metric: string; metricLabel: string; value: number }[];
  /** The activity this one was made from. */
  madeFrom?: RelatedActivity;
  /** Everything made from this activity, oldest first. */
  derived: RelatedActivity[];
  /** This activity plus everything made from it. */
  familyReach: number;
}

/** One activity with its numbers and its derived formats. Undefined when the id is unknown. */
export async function getActivityDetail(store: DataStore, id: string): Promise<ActivityDetail | undefined> {
  const [activities, allMetrics] = await Promise.all([store.getActivities(), store.getActivityMetrics()]);
  const activity = activities.find((item) => item.id === id);
  if (!activity) return undefined;

  const reach = reachByActivity(allMetrics);
  const related = (item: Activity): RelatedActivity => ({
    id: item.id,
    title: item.title,
    date: item.date,
    typeLabel: typeLabel(item.type),
    reach: reach.get(item.id) ?? 0,
  });

  // Everything below this activity. `seen` stops a loop in bad data.
  const seen = new Set([activity.id]);
  const derived: Activity[] = [];
  let level = [activity.id];
  while (level.length > 0) {
    const next = activities.filter((item) => item.parentId && level.includes(item.parentId) && !seen.has(item.id));
    for (const item of next) seen.add(item.id);
    derived.push(...next);
    level = next.map((item) => item.id);
  }
  derived.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const own = allMetrics.filter((metric) => metric.activityId === id && Number.isFinite(metric.value));
  const byPlatform = new Map<string, number>();
  for (const { platform, value } of own) byPlatform.set(platform, (byPlatform.get(platform) ?? 0) + value);
  const parent = activity.parentId ? activities.find((item) => item.id === activity.parentId) : undefined;
  const ownReach = reach.get(id) ?? 0;

  return {
    activity,
    typeLabel: typeLabel(activity.type),
    tags: activity.tags.filter((tag) => tag !== activity.type),
    reach: ownReach,
    metrics: own
      .map(({ platform, metric, value }) => ({
        platform,
        platformLabel: labelFor(platform),
        metric,
        metricLabel: labelFor(metric),
        value,
      }))
      .sort(
        (a, b) =>
          (byPlatform.get(b.platform) ?? 0) - (byPlatform.get(a.platform) ?? 0) ||
          a.platform.localeCompare(b.platform) ||
          b.value - a.value,
      ),
    ...(parent && { madeFrom: related(parent) }),
    derived: derived.map(related),
    familyReach: ownReach + derived.reduce((sum, item) => sum + (reach.get(item.id) ?? 0), 0),
  };
}
