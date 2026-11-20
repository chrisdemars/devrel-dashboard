// A DataStore that answers from the snapshots `npm run collect` writes, so
// the dashboards can show real numbers without a database. It holds only
// what the collector gathers: metric points and source states. Activities,
// conferences, deals, targets and report notes stay empty until they have a
// real home (Supabase), so pages show their "nothing yet" and "access
// needed" states instead of made-up numbers.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inRange } from '../dates';
import type { DataStore, DateRange, MetricName, MetricPoint, SourceStatusInfo } from '../types';

/** One snapshot file, as `npm run collect` writes it. */
export interface LocalSnapshot {
  generatedAt: string;
  sources: Record<string, { status?: string; error?: string; metrics?: Record<string, unknown> } & Record<string, unknown>>;
}

export interface LocalData {
  points: MetricPoint[];
  /** When each source last collected successfully, by source id. */
  lastCollected: Record<string, string>;
}

// What each Metricool series is stored as. Reach is left out: it counts the
// same people again, so it cannot be added to impressions.
const METRICOOL_METRICS: Record<string, MetricName> = {
  followers: 'followers',
  impressions: 'social_impressions',
  interactions: 'social_interactions',
  views: 'video_views',
};

interface DailyValue {
  date: string;
  value: number;
}

const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * Turns snapshots into metric points. Snapshots overlap (each holds the last
 * few weeks), so a later snapshot replaces the same day from an earlier one.
 */
export function snapshotsToData(snapshots: LocalSnapshot[]): LocalData {
  const byKey = new Map<string, MetricPoint>();
  const lastCollected: Record<string, string> = {};
  const add = (point: MetricPoint) =>
    byKey.set(`${point.metric}|${point.date}|${point.source}|${JSON.stringify(point.dimensions ?? {})}`, point);

  for (const snapshot of [...snapshots].sort((a, b) => a.generatedAt.localeCompare(b.generatedAt))) {
    for (const [id, result] of Object.entries(snapshot.sources ?? {})) {
      if (result?.status !== 'ok') continue;
      lastCollected[id] = snapshot.generatedAt;
      const metrics = result.metrics ?? {};

      if (id === 'metricool') {
        const platforms = (metrics.platforms ?? {}) as Record<string, { daily?: Record<string, DailyValue[]> }>;
        for (const [platform, numbers] of Object.entries(platforms)) {
          for (const [name, values] of Object.entries(numbers.daily ?? {})) {
            const metric = METRICOOL_METRICS[name];
            if (!metric || !Array.isArray(values)) continue;
            for (const { date, value } of values) {
              if (isDay(date) && Number.isFinite(value)) add({ date, metric, value, source: id, dimensions: { platform } });
            }
          }
        }
      }

      if (id === 'youtube') {
        // The YouTube API only gives today's subscriber count, so each snapshot adds one reading.
        const channels = (metrics.channels ?? {}) as Record<string, { subscribers?: number }>;
        const date = snapshot.generatedAt.slice(0, 10);
        const subscribers = Object.values(channels).reduce((sum, channel) => sum + (Number(channel.subscribers) || 0), 0);
        if (isDay(date) && subscribers > 0) add({ date, metric: 'followers', value: subscribers, source: id, dimensions: { platform: 'youtube' } });
      }
    }
  }

  // Metricool and the YouTube API both report YouTube; keep one source per platform and metric so they are not added twice.
  const points = [...byKey.values()];
  const owners = new Map<string, string>();
  for (const point of points) {
    const key = `${point.metric}|${point.dimensions?.platform ?? ''}`;
    if (!owners.has(key) || point.source === 'metricool') owners.set(key, point.source);
  }
  return {
    points: points
      .filter((point) => owners.get(`${point.metric}|${point.dimensions?.platform ?? ''}`) === point.source)
      .sort((a, b) => a.date.localeCompare(b.date) || a.metric.localeCompare(b.metric)),
    lastCollected,
  };
}

/** Reads every dated snapshot in a folder (latest.json repeats the newest one). Unreadable files are skipped. */
export function readSnapshots(dir: string): LocalSnapshot[] {
  let names: string[];
  try {
    names = readdirSync(/* turbopackIgnore: true */ dir).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name));
  } catch {
    return [];
  }
  const snapshots: LocalSnapshot[] = [];
  for (const name of names.sort()) {
    try {
      const parsed = JSON.parse(readFileSync(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, name), 'utf8'));
      if (typeof parsed?.generatedAt === 'string' && parsed.sources) snapshots.push(parsed);
    } catch {
      // A half-written or hand-edited file should not take the dashboard down.
    }
  }
  return snapshots;
}

/** A fingerprint of the folder, so the store is rebuilt only after a new collection. */
export function snapshotStamp(dir: string): string {
  try {
    return readdirSync(/* turbopackIgnore: true */ dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => `${name}:${statSync(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, name)).mtimeMs}`)
      .sort()
      .join('|');
  } catch {
    return '';
  }
}

export function createLocalStore(data: LocalData, statuses: SourceStatusInfo[], today: string): DataStore {
  const dates = data.points.map((point) => point.date).sort();
  // With nothing collected yet, the range is just today.
  const range: DateRange = { from: dates[0] ?? today, to: dates.at(-1) ?? today };
  const empty = { count: 0, amountUsd: 0, wonCount: 0, wonAmountUsd: 0, byTouchpoint: [] };

  return {
    mode: 'local',
    getDateRange: async () => range,
    getTags: async () => [],
    getActivities: async () => [],
    getActivityMetrics: async () => [],
    getConferences: async () => [],
    getInfluencedDeals: async () => [],
    getDealTotals: async () => empty,
    getMetricPoints: async (query = {}) =>
      data.points.filter((p) => inRange(p.date, query) && (!query.metrics?.length || query.metrics.includes(p.metric))),
    getSourceStatuses: async () =>
      statuses.map((status) => ({
        ...status,
        ...(data.lastCollected[status.id] && { lastCollectedAt: data.lastCollected[status.id] }),
      })),
    getTargets: async () => [],
    getReportNotes: async () => [],
    getDeclinedRequests: async () => [],
  };
}
