import { describe, expect, test } from 'vitest';
import exampleConfig from '../devrel.config.example';
import activeConfig from '../src/lib/config';
import { BUILT_IN_TAGS, ConfigError, PAGE_LABELS, parseConfig } from '../src/lib/config/schema';
import { allSources, selectSources } from '../src/lib/sources';

const problems = (input: unknown): string[] => {
  try {
    parseConfig(input);
  } catch (err) {
    if (err instanceof ConfigError) return err.problems;
    throw err;
  }
  return [];
};

describe('parseConfig', () => {
  test('the example config is valid', () => {
    expect(parseConfig(exampleConfig).org.name).toBe('Acme');
  });

  test('the active config (your own, or the example) is valid', () => {
    expect(activeConfig.org.name).not.toBe('');
  });

  test('only org.name is required; everything else gets a default', () => {
    const config = parseConfig({ org: { name: 'Acme' } });
    expect(config).toMatchObject({
      theme: { preset: 'default', fonts: { stylesheets: [] } },
      sources: { enabled: 'all' },
      packages: { npm: [], homebrewFormulae: [], homebrewCasks: [], pypi: [], docker: [], github: [] },
      ga4: { keyEvents: [] },
      team: { people: 1 },
      pages: PAGE_LABELS,
      tags: { builtIn: BUILT_IN_TAGS, suggested: [] },
    });
    expect(config.launch).toBeUndefined();
  });

  test('a partial section keeps the other defaults', () => {
    const config = parseConfig({
      org: { name: 'Acme' },
      theme: { fonts: { heading: 'Lora' } },
      pages: { launch: 'CLI launch' },
    });
    expect(config.theme).toEqual({ preset: 'default', fonts: { heading: 'Lora', stylesheets: [] } });
    expect(config.pages).toEqual({ ...PAGE_LABELS, launch: 'CLI launch' });
  });

  test('a missing org name is reported by its path', () => {
    expect(problems({})).toEqual(['org: is required']);
    expect(problems({ org: {} })).toEqual(['org.name: is required']);
    expect(problems({ org: { name: '  ' } })).toEqual(['org.name: must not be empty']);
  });

  test('every problem is listed, each with its path', () => {
    expect(
      problems({
        org: { name: 'Acme', url: 'example.com' },
        launch: { date: '12/15/2026', label: 'Launch' },
        packages: { npm: '@acme/cli' },
        sources: { enabled: 'some' },
        tags: { suggested: ['npm', 'npm'] },
      }),
    ).toEqual([
      'org.url: must be a full URL, e.g. https://example.com',
      "sources.enabled: must be 'all' or a list of source ids",
      'packages.npm: must be an array',
      'launch.date: must be a date like 2026-12-31',
      'tags.suggested: must not contain duplicates',
    ]);
  });

  test('a date that does not exist is rejected', () => {
    for (const date of ['2026-13-01', '2026-02-30']) {
      expect(problems({ org: { name: 'Acme' }, launch: { date, label: 'Launch' } })).toEqual([
        'launch.date: is not a real calendar date',
      ]);
    }
  });

  test('a misspelled setting is called out', () => {
    expect(problems({ org: { name: 'Acme' }, pages: { overveiw: 'Home' }, them: {} })).toEqual([
      'pages.overveiw: unknown setting (check the spelling)',
      'them: unknown setting (check the spelling)',
    ]);
  });

  test('the error message names the file to fix', () => {
    expect(() => parseConfig({})).toThrow(/Invalid DevRel config\. Fix config\/devrel\.config\.ts[^\n]*\n {2}- org: is required/);
  });
});

describe('selectSources', () => {
  test("'all' keeps every source", () => {
    expect(selectSources(allSources, 'all')).toEqual(allSources);
  });

  test('a list keeps only those sources', () => {
    expect(selectSources(allSources, ['github', 'npm']).map((s) => s.id)).toEqual(['npm', 'github']);
  });

  test('an unknown id is a config error that lists the known ids', () => {
    expect(() => selectSources(allSources, ['npm', 'npn'])).toThrow(ConfigError);
    expect(() => selectSources(allSources, ['npm', 'npn'])).toThrow(/sources\.enabled: unknown source "npn"\. Known sources: npm, /);
  });
});
