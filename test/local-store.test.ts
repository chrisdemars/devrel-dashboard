import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { getStreams } from '@/lib/dashboards/streams';
import { createLocalStore, readSnapshots, snapshotsToData, snapshotStamp, type LocalSnapshot } from '@/lib/data/local/store';
import { parseFilters, type FilterContext } from '@/lib/filters';

const day = (date: string, value: number) => ({ date, value });
const snapshot = (generatedAt: string, platforms: Record<string, unknown>, extra: LocalSnapshot['sources'] = {}): LocalSnapshot => ({
  generatedAt,
  sources: { metricool: { status: 'ok', metrics: { platforms } }, ...extra },
});

const older = snapshot('2026-10-10T06:00:00.000Z', {
  x: { daily: { followers: [day('2026-10-08', 100), day('2026-10-09', 101)], impressions: [day('2026-10-08', 40), day('2026-10-09', 50)] } },
});
const newer = snapshot('2026-10-11T06:00:00.000Z', {
  x: { daily: { followers: [day('2026-10-09', 102), day('2026-10-10', 104)], impressions: [day('2026-10-09', 55), day('2026-10-10', 60)], interactions: [day('2026-10-10', 6)] } },
  youtube: { daily: { views: [day('2026-10-10', 900)], reach: [day('2026-10-10', 5)] } },
});

describe('snapshotsToData', () => {
  it('turns Metricool series into metric points by platform; a later snapshot replaces the same day', () => {
    const { points, lastCollected } = snapshotsToData([newer, older]);
    const of = (metric: string, platform: string) =>
      points.filter((p) => p.metric === metric && p.dimensions?.platform === platform).map((p) => [p.date, p.value]);
    expect(of('followers', 'x')).toEqual([['2026-10-08', 100], ['2026-10-09', 102], ['2026-10-10', 104]]);
    expect(of('social_impressions', 'x')).toEqual([['2026-10-08', 40], ['2026-10-09', 55], ['2026-10-10', 60]]);
    expect(of('social_interactions', 'x')).toEqual([['2026-10-10', 6]]);
    expect(of('video_views', 'youtube')).toEqual([['2026-10-10', 900]]);
    // Reach counts the same people again, so it is not stored.
    expect(points.some((p) => p.value === 5)).toBe(false);
    expect(lastCollected.metricool).toBe(newer.generatedAt);
  });

  it('skips failed sources and bad values', () => {
    const failed: LocalSnapshot = { generatedAt: '2026-10-12T06:00:00.000Z', sources: { metricool: { status: 'error', error: '401' } } };
    const bad = snapshot('2026-10-13T06:00:00.000Z', { x: { daily: { followers: [{ date: 'yesterday', value: 1 }, { date: '2026-10-13', value: Number.NaN }] } } });
    expect(snapshotsToData([failed, bad]).points).toEqual([]);
    expect(snapshotsToData([failed]).lastCollected).toEqual({});
  });

  it('adds a YouTube subscriber reading, unless Metricool already reports YouTube followers', () => {
    const channels = { youtube: { status: 'ok', metrics: { channels: { a: { subscribers: 300 }, b: { subscribers: 20 } } } } };
    const alone = snapshotsToData([{ generatedAt: '2026-10-12T06:00:00.000Z', sources: channels }]);
    expect(alone.points).toEqual([{ date: '2026-10-12', metric: 'followers', value: 320, source: 'youtube', dimensions: { platform: 'youtube' } }]);
    const both = snapshotsToData([snapshot('2026-10-12T06:00:00.000Z', { youtube: { daily: { followers: [day('2026-10-11', 310)] } } }, channels)]);
    expect(both.points.filter((p) => p.metric === 'followers').map((p) => p.source)).toEqual(['metricool']);
  });
});

describe('reading snapshots from a folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'devrel-snapshots-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('reads dated files only, skips broken ones, and changes its stamp when a file is added', () => {
    expect(readSnapshots(join(dir, 'missing'))).toEqual([]);
    writeFileSync(join(dir, '2026-10-10.json'), JSON.stringify(older));
    writeFileSync(join(dir, 'latest.json'), JSON.stringify(older));
    writeFileSync(join(dir, '2026-10-09.json'), '{ half-written');
    const before = snapshotStamp(dir);
    expect(readSnapshots(dir)).toEqual([older]);
    writeFileSync(join(dir, '2026-10-11.json'), JSON.stringify(newer));
    expect(snapshotStamp(dir)).not.toBe(before);
    expect(readSnapshots(dir)).toHaveLength(2);
  });
});

describe('createLocalStore', () => {
  const statuses = [
    { id: 'metricool', name: 'Metricool', category: 'social' as const, status: 'ok' as const },
    { id: 'ga4', name: 'GA4', category: 'web' as const, status: 'not_configured' as const, missing: ['GA4_PROPERTY_ID'] },
  ];
  const store = createLocalStore(snapshotsToData([older, newer]), statuses, '2026-11-20');

  it('covers the days it has data for, and holds nothing made up', async () => {
    expect(store.mode).toBe('local');
    expect(await store.getDateRange()).toEqual({ from: '2026-10-08', to: '2026-10-10' });
    expect(await store.getActivities()).toEqual([]);
    expect(await store.getDealTotals()).toMatchObject({ count: 0, amountUsd: 0 });
    expect(await store.getTargets()).toEqual([]);
    expect(await store.getMetricPoints({ metrics: ['video_views'] })).toHaveLength(1);
    expect(await store.getMetricPoints({ from: '2026-10-10', to: '2026-10-10', metrics: ['followers'] })).toHaveLength(1);
  });

  it('reports source states, with when each last collected', async () => {
    const [metricool, ga4] = await store.getSourceStatuses();
    expect(metricool.lastCollectedAt).toBe(newer.generatedAt);
    expect(ga4).toMatchObject({ status: 'not_configured', missing: ['GA4_PROPERTY_ID'] });
    expect(ga4.lastCollectedAt).toBeUndefined();
  });

  it('with nothing collected, covers just today', async () => {
    expect(await createLocalStore({ points: [], lastCollected: {} }, [], '2026-11-20').getDateRange()).toEqual({ from: '2026-11-20', to: '2026-11-20' });
  });

  it('feeds the Streams page real social numbers', async () => {
    const context: FilterContext = { dataFrom: '2026-10-08', today: '2026-10-10' };
    const { social, followers } = await getStreams(store, parseFilters(new URLSearchParams(''), context), context);
    const x = social.table.find((row) => row.key === 'x')!;
    expect(x).toMatchObject({ followers: 104, impressions: 155, interactions: 6 });
    expect(x.rate).toBeCloseTo(6 / 155);
    expect(social.table.find((row) => row.key === 'youtube')?.views).toBe(900);
    expect(social.caption).toContain('X shows posts to the most people');
    expect(followers.table.map((row) => row.key)).toEqual(['x']);
  });
});
