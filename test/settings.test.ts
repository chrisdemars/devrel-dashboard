// How sources read settings that can live in devrel.config.ts or in .env.
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@devrel/config', () => ({
  default: {
    org: { name: 'Acme' },
    packages: { npm: ['@acme/cli', '@acme/sdk'], homebrewCasks: ['acme'] },
    ga4: { keyEvents: ['demo_request'] },
  },
}));

const { allSources, listSetting, missingConfig, runSource, STATUS } = await import('../src/lib/sources');
const { configValue } = await import('../src/lib/config');

const source = (id: string) => allSources.find((s) => s.id === id)!;

afterEach(() => {
  delete process.env.CLI_NPM_PACKAGES;
  delete process.env.CLI_PYPI_PACKAGES;
  delete process.env.GA4_KEY_EVENTS;
});

describe('listSetting', () => {
  test('reads the list from the config', () => {
    expect(listSetting(source('npm'), 'CLI_NPM_PACKAGES')).toEqual(['@acme/cli', '@acme/sdk']);
    expect(listSetting(source('ga4'), 'GA4_KEY_EVENTS')).toEqual(['demo_request']);
  });

  test('the .env variable overrides the config', () => {
    process.env.CLI_NPM_PACKAGES = '@acme/other';
    expect(listSetting(source('npm'), 'CLI_NPM_PACKAGES')).toEqual(['@acme/other']);
  });

  test('is empty when neither is set', () => {
    expect(listSetting(source('pypi'), 'CLI_PYPI_PACKAGES')).toEqual([]);
  });
});

describe('missingConfig', () => {
  test('a name in the config satisfies a required setting', () => {
    expect(missingConfig(source('npm'))).toEqual([]);
  });

  test('a name in the config satisfies a "one of" requirement', () => {
    expect(missingConfig(source('homebrew'))).toEqual([]);
  });

  test('a missing setting points at the config first, then .env', async () => {
    expect(missingConfig(source('pypi'))).toEqual(['packages.pypi in devrel.config.ts (or CLI_PYPI_PACKAGES in .env)']);
    const result = await runSource(source('pypi'));
    expect(result.status).toBe(STATUS.NOT_CONFIGURED);
    expect(result.help).toEqual(['packages.pypi in devrel.config.ts (or CLI_PYPI_PACKAGES in .env): PyPI package names']);
  });

  test('a .env variable alone still satisfies it', () => {
    process.env.CLI_PYPI_PACKAGES = 'acme';
    expect(missingConfig(source('pypi'))).toEqual([]);
  });
});

test('every config path named by a source exists in the config', () => {
  const paths = allSources.flatMap((s) => (s.env ?? []).flatMap((e) => (e.config ? [e.config] : [])));
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) expect(configValue(path), path).toBeInstanceOf(Array);
});
