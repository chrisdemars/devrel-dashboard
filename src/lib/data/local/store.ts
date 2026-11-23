// A DataStore that answers from the snapshots `npm run collect` writes, so
// the dashboards can show real numbers without a database. It holds only
// DevRel-attributed metric points and source states. Activities,
// conferences, deals, targets and report notes stay empty until they have a
// real home (Supabase), so pages show their "nothing yet" and "access
// needed" states instead of made-up numbers.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inRange } from '../dates';
import { METRICS, type DataStore, type DateRange, type MetricName, type MetricPoint, type SourceStatusInfo } from '../types';

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

interface PointRow {
  date?: unknown;
  metric?: unknown;
  value?: unknown;
  dimensions?: unknown;
}

const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isMetric = (value: unknown): value is MetricName => typeof value === 'string' && (METRICS as readonly string[]).includes(value);

function cleanDimensions(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const entries = Object.entries(value).filter(([, v]) => typeof v === 'string' && v !== '');
  return entries.length ? (Object.fromEntries(entries) as Record<string, string>) : undefined;
}

/**
 * Turns snapshots into metric points. Only `metrics.points` is read: the rows
 * a collector has already tied to DevRel (for GA4, visits and key events with
 * a DevRel campaign). Anything else a collector saves, such as company-wide
 * totals, never reaches the dashboard. Snapshots overlap (each holds the last
 * few weeks), so a later snapshot replaces the same day from an earlier one.
 */
export function snapshotsToData(snapshots: LocalSnapshot[]): LocalData {
  const byKey = new Map<string, MetricPoint>();
  const lastCollected: Record<string, string> = {};

  for (const snapshot of [...snapshots].sort((a, b) => a.generatedAt.localeCompare(b.generatedAt))) {
    for (const [id, result] of Object.entries(snapshot.sources ?? {})) {
      if (result?.status !== 'ok') continue;
      lastCollected[id] = snapshot.generatedAt;
      const rows = result.metrics?.points;
      if (!Array.isArray(rows)) continue;
      for (const row of rows as PointRow[]) {
        const value = Number(row.value);
        if (!isDay(row.date) || !isMetric(row.metric) || !Number.isFinite(value)) continue;
        const dimensions = cleanDimensions(row.dimensions);
        const point: MetricPoint = { date: row.date, metric: row.metric, value, source: id, ...(dimensions && { dimensions }) };
        byKey.set(`${point.metric}|${point.date}|${id}|${JSON.stringify(dimensions ?? {})}`, point);
      }
    }
  }

  return {
    points: [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.metric.localeCompare(b.metric)),
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
