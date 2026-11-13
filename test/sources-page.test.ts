import { describe, expect, test } from 'vitest';
import { getSourcesPage } from '@/lib/dashboards/sources';
import { allSources, checkSource, checkSources, readLatestSnapshot, STATUS, type Snapshot, type Source } from '@/lib/sources';

const base = { id: 'test', name: 'Test source', category: 'cli' as const };
const collect = async () => ({});

describe('checkSource', () => {
  test('a placeholder reports its note and the settings it will read', () => {
    const result = checkSource({ ...base, placeholder: 'Waiting on access.', env: [{ name: 'TEST_TOKEN', help: 'h' }] });
    expect(result).toMatchObject({ status: STATUS.PLACEHOLDER, note: 'Waiting on access.', plannedConfig: ['TEST_TOKEN'] });
  });

  test('a missing setting is named, with what it is', () => {
    const source: Source = { ...base, env: [{ name: 'TEST_MISSING_VAR', required: true, help: 'A test value' }], collect };
    expect(checkSource(source)).toMatchObject({
      status: STATUS.NOT_CONFIGURED,
      missing: ['TEST_MISSING_VAR'],
      help: ['TEST_MISSING_VAR: A test value'],
    });
  });

  test('a source with nothing missing is connected', () => {
    expect(checkSource({ ...base, collect })).toMatchObject({ status: STATUS.OK, missing: [], help: [] });
  });

  test('a manual log is connected once its file exists', () => {
    const log: Source = { ...base, file: 'log.csv', collect };
    expect(checkSource(log, () => true)).toMatchObject({ status: STATUS.OK, missing: [] });
    const absent = checkSource(log, () => false);
    expect(absent.status).toBe(STATUS.NOT_CONFIGURED);
    expect(absent.missing?.[0]).toMatch(/log\.csv$/);
    expect(absent.help?.[0]).toContain('templates/log.csv');
  });

  test('setup steps travel with the result', () => {
    expect(checkSource({ ...base, setup: ['Step one'], collect }).setup).toEqual(['Step one']);
    expect(checkSources(allSources).find((source) => source.id === 'ga4')?.setup?.length).toBeGreaterThan(0);
  });
});

describe('readLatestSnapshot', () => {
  test('is undefined when nothing has been collected', async () => {
    expect(await readLatestSnapshot('no/such/folder')).toBeUndefined();
  });
});

describe('getSourcesPage', () => {
  const results = checkSources(allSources, () => false);

  test('groups every source by category, in a fixed order, and counts each status', () => {
    const page = getSourcesPage(results);
    expect(page.groups.flatMap((group) => group.sources)).toHaveLength(allSources.length);
    expect(page.groups.map((group) => group.category)).toEqual(['cli', 'web', 'social', 'content', 'events', 'business', 'capacity']);
    expect(page.counts.map((count) => count.status)).toEqual(['ok', 'not_configured', 'placeholder', 'error']);
    expect(page.counts.reduce((sum, count) => sum + count.count, 0)).toBe(allSources.length);
    for (const { status, count } of page.counts) expect(count).toBe(results.filter((r) => r.status === status).length);
    expect(page.lastCollectedAt).toBeUndefined();
    expect(page.summary).toContain(`of ${allSources.length} sources`);
  });

  test('shows the same state as the status check for every source', () => {
    const cards = getSourcesPage(results).groups.flatMap((group) => group.sources);
    for (const result of results) {
      const card = cards.find((item) => item.id === result.id)!;
      expect(card.status).toBe(result.status);
      expect(card.missing).toEqual(result.missing ?? []);
    }
  });

  test('adds the last collection, and shows a failed pull as an error', () => {
    const okay = { ...base, status: STATUS.OK };
    const snapshot: Snapshot = {
      generatedAt: '2027-01-05T06:00:00.000Z',
      sources: { test: { ...okay, status: STATUS.ERROR, error: '401 Unauthorized' } },
    };
    const page = getSourcesPage([okay, { ...okay, id: 'other' }], snapshot);
    const [failed, other] = page.groups[0].sources;
    expect(failed).toMatchObject({ status: STATUS.ERROR, lastRun: { at: snapshot.generatedAt, error: '401 Unauthorized' } });
    expect(other.status).toBe(STATUS.OK);
    expect(other.lastRun).toBeUndefined();
    expect(page.lastCollectedAt).toBe(snapshot.generatedAt);
    expect(page.summary).toBe('1 of 2 sources is connected.');
  });

  test('says so when no sources are enabled', () => {
    expect(getSourcesPage([]).summary).toContain('No sources are enabled');
  });
});
