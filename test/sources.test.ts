import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import sources, { envList, runSource, STATUS, type Source } from '../src/lib/sources';

const base = { id: 't', name: 't', category: 'web' } as const;

describe('runSource', () => {
  beforeEach(() => {
    delete process.env.TEST_VAR;
  });

  test('placeholder sources report placeholder with their planned config', async () => {
    const r = await runSource({ ...base, placeholder: 'later', env: [{ name: 'X', help: 'h' }] });
    expect(r.status).toBe(STATUS.PLACEHOLDER);
    expect(r.plannedConfig).toEqual(['X']);
  });

  test('missing required env reports not_configured with help', async () => {
    const r = await runSource({ ...base, env: [{ name: 'TEST_VAR', required: true, help: 'h' }], collect: async () => ({}) });
    expect(r.status).toBe(STATUS.NOT_CONFIGURED);
    expect(r.missing).toEqual(['TEST_VAR']);
    expect(r.help).toEqual(['TEST_VAR: h']);
  });

  test('requireAny reports not_configured when none are set', async () => {
    const r = await runSource({ ...base, requireAny: ['TEST_VAR'], collect: async () => ({}) });
    expect(r.status).toBe(STATUS.NOT_CONFIGURED);
  });

  test('a thrown error reports error with the message', async () => {
    const r = await runSource({ ...base, collect: async () => { throw new Error('boom'); } });
    expect(r).toMatchObject({ status: STATUS.ERROR, error: 'boom' });
  });

  test('success reports ok with metrics', async () => {
    process.env.TEST_VAR = 'set';
    const r = await runSource({ ...base, env: [{ name: 'TEST_VAR', required: true, help: 'h' }], collect: async () => ({ metrics: { n: 1 } }) });
    expect(r).toMatchObject({ status: STATUS.OK, metrics: { n: 1 } });
  });

  test('collect can override the status (e.g. a stub)', async () => {
    const r = await runSource({ ...base, collect: async () => ({ status: STATUS.PLACEHOLDER, note: 'stub' }) });
    expect(r).toMatchObject({ status: STATUS.PLACEHOLDER, note: 'stub' });
  });
});

describe('envList', () => {
  test('splits, trims and drops empties', () => {
    process.env.TEST_VAR = ' a, b ,,c ';
    expect(envList('TEST_VAR')).toEqual(['a', 'b', 'c']);
  });
});

describe('manual logs', () => {
  let dir: string;
  const conferences = () => sources.find((s) => s.id === 'conferences') as Source;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'devrel-manual-'));
    process.env.MANUAL_DATA_DIR = dir;
  });
  afterEach(async () => {
    delete process.env.MANUAL_DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  test('a missing file reports not_configured', async () => {
    const r = await runSource(conferences());
    expect(r.status).toBe(STATUS.NOT_CONFIGURED);
    expect(r.missing?.[0]).toContain('conferences.csv');
  });

  test('conference summary computes acceptance rate and cost per lead', async () => {
    await writeFile(
      join(dir, 'conferences.csv'),
      [
        'date,event,cfp_status,est_audience,qr_scans,leads_to_sales,cost_usd',
        '2026-10-01,A,given,300,40,4,"$2,000"',
        '2026-11-01,B,rejected,,,,',
        '2026-12-01,C,invited,,,,',
      ].join('\n'),
    );
    const r = await runSource(conferences());
    expect(r.status).toBe(STATUS.OK);
    expect(r.metrics).toMatchObject({ rows: 3, talks: 1, cfpAcceptanceRate: 0.5, estAudience: 300, qrScans: 40, leadsToSales: 4, costUsd: 2000, costPerLead: 500 });
  });
});

test('every source has a unique id', () => {
  const ids = sources.map((s) => s.id);
  expect(new Set(ids).size).toBe(ids.length);
});
