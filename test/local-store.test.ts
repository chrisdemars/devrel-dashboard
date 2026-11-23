import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { getContent } from '@/lib/dashboards/content';
import { createLocalStore, readSnapshots, snapshotsToData, snapshotStamp, type LocalSnapshot } from '@/lib/data/local/store';
import { parseFilters, type FilterContext } from '@/lib/filters';
import { ga4Points } from '@/lib/sources/ga4';

const visit = (date: string, metric: string, value: number, dimensions: Record<string, string> = { campaign: 'devrel-blog-a', channel: 'linkedin' }) => ({
  date,
  metric,
  value,
  dimensions,
});

// A GA4 snapshot with DevRel visits, next to a Metricool snapshot holding
// company-wide totals that must never reach the dashboard.
const older: LocalSnapshot = {
  generatedAt: '2026-10-10T06:00:00.000Z',
  sources: {
    ga4: { status: 'ok', metrics: { points: [visit('2026-10-08', 'sessions', 40), visit('2026-10-09', 'sessions', 50)] } },
    metricool: { status: 'ok', metrics: { platforms: { linkedin: { daily: { followers: [{ date: '2026-10-09', value: 11000 }] } } } } },
  },
};
const newer: LocalSnapshot = {
  generatedAt: '2026-10-11T06:00:00.000Z',
  sources: {
    ga4: {
      status: 'ok',
      metrics: {
        points: [
          visit('2026-10-09', 'sessions', 55),
          visit('2026-10-10', 'sessions', 60),
          visit('2026-10-10', 'engaged_sessions', 30),
          visit('2026-10-10', 'key_events', 4, { campaign: 'devrel-blog-a', channel: 'linkedin', event: 'demo_request' }),
        ],
      },
    },
  },
};

describe('snapshotsToData', () => {
  it('reads the rows collectors tied to DevRel; a later snapshot replaces the same day', () => {
    const { points, lastCollected } = snapshotsToData([newer, older]);
    const of = (metric: string) => points.filter((p) => p.metric === metric).map((p) => [p.date, p.value]);
    expect(of('sessions')).toEqual([['2026-10-08', 40], ['2026-10-09', 55], ['2026-10-10', 60]]);
    expect(of('engaged_sessions')).toEqual([['2026-10-10', 30]]);
    expect(points.find((p) => p.metric === 'key_events')).toMatchObject({
      source: 'ga4',
      dimensions: { campaign: 'devrel-blog-a', channel: 'linkedin', event: 'demo_request' },
    });
    expect(lastCollected).toEqual({ ga4: newer.generatedAt, metricool: older.generatedAt });
  });

  it('never turns company-wide totals into numbers', () => {
    const { points } = snapshotsToData([older]);
    expect(points.some((p) => p.metric === 'followers')).toBe(false);
    expect(points.every((p) => p.source === 'ga4')).toBe(true);
  });

  it('skips failed sources, unknown metrics and bad values', () => {
    const failed: LocalSnapshot = { generatedAt: '2026-10-12T06:00:00.000Z', sources: { ga4: { status: 'error', error: '403' } } };
    const bad: LocalSnapshot = {
      generatedAt: '2026-10-13T06:00:00.000Z',
      sources: {
        ga4: {
          status: 'ok',
          metrics: { points: [visit('yesterday', 'sessions', 1), visit('2026-10-13', 'pageviews', 1), visit('2026-10-13', 'sessions', Number.NaN)] },
        },
      },
    };
    expect(snapshotsToData([failed, bad]).points).toEqual([]);
    expect(snapshotsToData([failed]).lastCollected).toEqual({});
  });
});

describe('ga4Points', () => {
  it('turns DevRel campaign rows into daily points, leaving out empty rows', () => {
    const points = ga4Points(
      [
        { date: '20261120', sessionCampaignName: 'DevRel-Blog-A', sessionSource: 'linkedin', sessions: 12, engagedSessions: 7 },
        { date: '20261121', sessionCampaignName: 'devrel-blog-a', sessionSource: 'x', sessions: 0, engagedSessions: 0 },
      ],
      [{ date: '20261120', sessionCampaignName: 'devrel-blog-a', sessionSource: 'linkedin', eventName: 'demo_request', keyEvents: 2 }],
    );
    expect(points).toEqual([
      { date: '2026-11-20', metric: 'sessions', value: 12, dimensions: { campaign: 'devrel-blog-a', channel: 'linkedin' } },
      { date: '2026-11-20', metric: 'engaged_sessions', value: 7, dimensions: { campaign: 'devrel-blog-a', channel: 'linkedin' } },
      {
        date: '2026-11-20',
        metric: 'key_events',
        value: 2,
        dimensions: { campaign: 'devrel-blog-a', channel: 'linkedin', event: 'demo_request' },
      },
    ]);
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
    { id: 'ga4', name: 'GA4', category: 'web' as const, status: 'ok' as const },
    { id: 'crm', name: 'CRM', category: 'business' as const, status: 'placeholder' as const, note: 'No access yet.' },
  ];
  const store = createLocalStore(snapshotsToData([older, newer]), statuses, '2026-11-20');

  it('covers the days it has data for, and holds nothing made up', async () => {
    expect(store.mode).toBe('local');
    expect(await store.getDateRange()).toEqual({ from: '2026-10-08', to: '2026-10-10' });
    expect(await store.getActivities()).toEqual([]);
    expect(await store.getDealTotals()).toMatchObject({ count: 0, amountUsd: 0 });
    expect(await store.getTargets()).toEqual([]);
    expect(await store.getMetricPoints({ metrics: ['key_events'] })).toHaveLength(1);
    expect(await store.getMetricPoints({ from: '2026-10-10', to: '2026-10-10', metrics: ['sessions'] })).toHaveLength(1);
  });

  it('reports source states, with when each last collected', async () => {
    const [ga4, crm] = await store.getSourceStatuses();
    expect(ga4.lastCollectedAt).toBe(newer.generatedAt);
    expect(crm).toMatchObject({ status: 'placeholder', note: 'No access yet.' });
    expect(crm.lastCollectedAt).toBeUndefined();
  });

  it('with nothing collected, covers just today', async () => {
    expect(await createLocalStore({ points: [], lastCollected: {} }, [], '2026-11-20').getDateRange()).toEqual({ from: '2026-11-20', to: '2026-11-20' });
  });

  it('feeds the Content page visits from DevRel links', async () => {
    const context: FilterContext = { dataFrom: '2026-10-08', today: '2026-10-10' };
    const { kpis } = await getContent(store, parseFilters(new URLSearchParams(''), context), context);
    const visits = kpis.find((kpi) => kpi.id === 'sessions')!;
    expect(visits).toMatchObject({ value: '155', attribution: 'tracked', label: 'Visits from DevRel links' });
  });
});
