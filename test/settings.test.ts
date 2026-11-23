// How sources read settings that can live in devrel.config.ts or in .env.
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Source } from '../src/lib/sources/core';

vi.mock('@devrel/config', () => ({
  default: {
    org: { name: 'Acme' },
    ga4: { keyEvents: ['demo_request'] },
  },
}));

const { allSources, listSetting, missingConfig, runSource, STATUS } = await import('../src/lib/sources');
const { configValue } = await import('../src/lib/config');

const source = (id: string) => allSources.find((s) => s.id === id)!;

// A made-up source that needs a list from the config.
const needsEvents: Source = {
  id: 'needs-events',
  name: 'Needs events',
  category: 'web',
  env: [{ name: 'TEST_EVENTS', config: 'ga4.keyEvents', required: true, help: 'Event names' }],
  collect: async () => ({}),
};

// A made-up source that needs one of two settings.
const needsEither: Source = {
  id: 'needs-either',
  name: 'Needs either',
  category: 'web',
  env: [
    { name: 'TEST_A', help: 'Setting A' },
    { name: 'TEST_B', help: 'Setting B' },
  ],
  requireAny: ['TEST_A', 'TEST_B'],
  collect: async () => ({}),
};

afterEach(() => {
  delete process.env.GA4_KEY_EVENTS;
  delete process.env.TEST_EVENTS;
  delete process.env.TEST_A;
});

describe('listSetting', () => {
  test('reads the list from the config', () => {
    expect(listSetting(source('ga4'), 'GA4_KEY_EVENTS')).toEqual(['demo_request']);
  });

  test('the .env variable overrides the config', () => {
    process.env.GA4_KEY_EVENTS = 'install_click, demo_request';
    expect(listSetting(source('ga4'), 'GA4_KEY_EVENTS')).toEqual(['install_click', 'demo_request']);
  });

  test('is empty when neither is set', () => {
    expect(listSetting(needsEither, 'TEST_A')).toEqual([]);
  });
});

describe('missingConfig', () => {
  test('a list in the config satisfies a required setting', () => {
    expect(missingConfig(needsEvents)).toEqual([]);
  });

  test('a missing setting is named, with its help, and the source is not configured', async () => {
    expect(missingConfig(needsEither)).toEqual(['one of: TEST_A, TEST_B']);
    const result = await runSource(needsEither);
    expect(result.status).toBe(STATUS.NOT_CONFIGURED);
    expect(result.help).toEqual(['TEST_A: Setting A', 'TEST_B: Setting B']);
  });

  test('a .env variable alone satisfies a "one of" requirement', () => {
    process.env.TEST_A = 'yes';
    expect(missingConfig(needsEither)).toEqual([]);
  });
});

test('every config path named by a source exists in the config', () => {
  const paths = allSources.flatMap((s) => (s.env ?? []).flatMap((e) => (e.config ? [e.config] : [])));
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) expect(configValue(path), path).toBeInstanceOf(Array);
});
