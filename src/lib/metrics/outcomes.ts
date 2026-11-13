// What the work produced: cost per outcome, the reach of each post across
// every format made from it, and what another person would add.

import { inRange } from '../data/dates';
import type { Activity, ActivityMetric, ActivityMetricName, DateRange } from '../data/types';
import { rangeDays } from './series';

export interface CostInput {
  /** What the money went on, e.g. 'conference', or one conference's name. */
  channel: string;
  costUsd?: number;
  /** What it produced: leads, scans, sign-ups. */
  outcomes?: number;
}

export interface CostRow {
  channel: string;
  costUsd: number;
  outcomes: number;
  /** Undefined when there were no outcomes: the cost produced nothing countable. */
  costPerOutcome?: number;
}

/**
 * Cost per outcome for each channel, cheapest first. Rows with the same
 * channel are added together. Channels with no outcomes come last.
 */
export function costPerOutcome(rows: CostInput[]): CostRow[] {
  const totals = new Map<string, { costUsd: number; outcomes: number }>();
  for (const { channel, costUsd, outcomes } of rows) {
    const total = totals.get(channel) ?? { costUsd: 0, outcomes: 0 };
    total.costUsd += Number.isFinite(costUsd) ? Math.max(costUsd!, 0) : 0;
    total.outcomes += Number.isFinite(outcomes) ? Math.max(outcomes!, 0) : 0;
    totals.set(channel, total);
  }
  return [...totals]
    .map(([channel, { costUsd, outcomes }]) => ({
      channel,
      costUsd,
      outcomes,
      ...(outcomes > 0 && { costPerOutcome: costUsd / outcomes }),
    }))
    .sort(
      (a, b) =>
        (a.costPerOutcome ?? Infinity) - (b.costPerOutcome ?? Infinity) ||
        b.costUsd - a.costUsd ||
        a.channel.localeCompare(b.channel),
    );
}

/**
 * The numbers that count as people reached. Engagements and peak viewers are
 * left out: they count the same people again.
 */
export const REACH_METRICS: ActivityMetricName[] = ['views', 'reach', 'live_viewers', 'replay_views'];

/** People reached by each activity, by activity id. */
export function reachByActivity(metrics: ActivityMetric[]): Map<string, number> {
  const reach = new Map<string, number>();
  for (const { activityId, metric, value } of metrics) {
    if (!REACH_METRICS.includes(metric) || !Number.isFinite(value)) continue;
    reach.set(activityId, (reach.get(activityId) ?? 0) + value);
  }
  return reach;
}

/** People reached by a set of activities, all platforms and formats together. */
export function totalReach(metrics: ActivityMetric[]): number {
  return [...reachByActivity(metrics).values()].reduce((total, value) => total + value, 0);
}

export interface ContentRollup {
  /** The original piece, usually a blog post. */
  post: Activity;
  /** Everything made from it (shorts, streams), oldest first. */
  derived: Activity[];
  /** The post plus what was made from it: 1 post + 2 derived = 3. */
  pieces: number;
  /** People reached by the post and everything made from it. */
  totalReach: number;
  /** People reached by the post alone. */
  postReach: number;
  /** Total reach divided by the post's own reach. Undefined when the post alone reached nobody. */
  multiplier?: number;
  /** Reach per activity type, largest first. */
  byFormat: { format: string; reach: number }[];
  /** Reach per platform, largest first. */
  byPlatform: { platform: string; reach: number }[];
}

function largestFirst<K extends string>(totals: Map<string, number>, key: K) {
  return [...totals]
    .map(([name, reach]) => ({ [key]: name, reach }) as Record<K, string> & { reach: number })
    .sort((a, b) => b.reach - a.reach || a[key].localeCompare(b[key]));
}

/**
 * One row per original post with the reach of every format made from it,
 * largest total first. Only activities of the `rootTypes` start a row.
 * An activity whose parent is missing from the list is left out.
 */
export function contentRollup(
  activities: Activity[],
  metrics: ActivityMetric[],
  rootTypes: string[] = ['blog'],
): ContentRollup[] {
  const byId = new Map(activities.map((activity) => [activity.id, activity]));

  // Follow parents up to the original piece. `seen` stops a loop in bad data.
  function rootOf(activity: Activity): Activity | undefined {
    const seen = new Set<string>();
    let current: Activity | undefined = activity;
    while (current?.parentId) {
      if (seen.has(current.id)) return undefined;
      seen.add(current.id);
      current = byId.get(current.parentId);
    }
    return current;
  }

  const reach = new Map<string, { total: number; byPlatform: Map<string, number> }>();
  for (const { activityId, platform, metric, value } of metrics) {
    if (!REACH_METRICS.includes(metric) || !Number.isFinite(value)) continue;
    const entry = reach.get(activityId) ?? { total: 0, byPlatform: new Map<string, number>() };
    entry.total += value;
    entry.byPlatform.set(platform, (entry.byPlatform.get(platform) ?? 0) + value);
    reach.set(activityId, entry);
  }

  const families = new Map<string, Activity[]>();
  for (const activity of activities) {
    const root = rootOf(activity);
    if (!root || !rootTypes.includes(root.type)) continue;
    families.set(root.id, [...(families.get(root.id) ?? []), activity]);
  }

  return [...families]
    .map(([rootId, family]) => {
      const post = byId.get(rootId)!;
      const byFormat = new Map<string, number>();
      const byPlatform = new Map<string, number>();
      let totalReach = 0;
      for (const activity of family) {
        const entry = reach.get(activity.id);
        if (!entry) continue;
        totalReach += entry.total;
        byFormat.set(activity.type, (byFormat.get(activity.type) ?? 0) + entry.total);
        for (const [platform, value] of entry.byPlatform) byPlatform.set(platform, (byPlatform.get(platform) ?? 0) + value);
      }
      const postReach = reach.get(rootId)?.total ?? 0;
      return {
        post,
        derived: family.filter((activity) => activity.id !== rootId).sort((a, b) => a.date.localeCompare(b.date)),
        pieces: family.length,
        totalReach,
        postReach,
        ...(postReach > 0 && { multiplier: totalReach / postReach }),
        byFormat: largestFirst(byFormat, 'format'),
        byPlatform: largestFirst(byPlatform, 'platform'),
      };
    })
    .sort((a, b) => b.totalReach - a.totalReach || b.post.date.localeCompare(a.post.date));
}

/**
 * How many activities are produced per `per` days (30 by default) over a
 * range. Zero for an empty range.
 */
export function outputRate(activities: Activity[], range: DateRange, types?: string[], per = 30): number {
  const days = rangeDays(range);
  if (days === 0) return 0;
  const count = activities.filter(
    (activity) => inRange(activity.date, range) && (!types || types.includes(activity.type)),
  ).length;
  return (count / days) * per;
}

/** The average result of one activity, e.g. sessions per blog post. Zero when there are no activities. */
export function averagePerActivity(total: number, count: number): number {
  return count > 0 && Number.isFinite(total) ? total / count : 0;
}

export interface StaffingInput {
  /** What the team produces per period today, e.g. 2 blog posts a month. */
  outputPerPeriod: number;
  /** How many people produce it today. */
  people?: number;
  /** How many people would be added. */
  addedPeople?: number;
  /**
   * How productive a new person is compared with the current team, 0 to 1.
   * Use less than 1 for the first months, while they are getting started.
   */
  rampFactor?: number;
  /** What one unit of output is worth on average, e.g. { sessions: 850, signups: 12 }. */
  outcomesPerOutput?: Record<string, number>;
}

export interface StaffingProjection {
  /** Output per period today. */
  current: number;
  /** Output per period with the added people. */
  projected: number;
  /** The difference: what the added people produce. */
  addedOutput: number;
  /** What that extra output is worth, at today's averages. */
  addedOutcomes: Record<string, number>;
}

/**
 * What adding people would produce, assuming each new person produces what a
 * current team member does (times `rampFactor`) and each piece of work earns
 * what it earns on average today. It is a straight-line estimate, not a forecast.
 */
export function projectStaffing({
  outputPerPeriod,
  people = 1,
  addedPeople = 1,
  rampFactor = 1,
  outcomesPerOutput = {},
}: StaffingInput): StaffingProjection {
  const current = Number.isFinite(outputPerPeriod) ? Math.max(outputPerPeriod, 0) : 0;
  const perPerson = people > 0 ? current / people : 0;
  const ramp = Math.min(Math.max(rampFactor, 0), 1);
  const addedOutput = perPerson * Math.max(addedPeople, 0) * ramp;
  return {
    current,
    projected: current + addedOutput,
    addedOutput,
    addedOutcomes: Object.fromEntries(
      Object.entries(outcomesPerOutput).map(([name, value]) => [name, Number.isFinite(value) ? value * addedOutput : 0]),
    ),
  };
}
