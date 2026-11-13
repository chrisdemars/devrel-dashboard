import { describe, expect, it } from 'vitest';
import {
  baselineRange,
  comparisonRange,
  describeFilters,
  filterHref,
  filtersToSearchParams,
  isDefaultFilters,
  parseFilters,
  presetRange,
  toDataFilter,
  updateFilters,
  type FilterContext,
} from '@/lib/filters';

const context: FilterContext = { dataFrom: '2026-08-15', today: '2027-03-15', launchDate: '2026-12-15' };
const parse = (query: string, ctx = context) => parseFilters(new URLSearchParams(query), ctx);

describe('baselineRange', () => {
  it('runs from the first day of data to the day before the launch', () => {
    expect(baselineRange(context)).toEqual({ from: '2026-08-15', to: '2026-12-14' });
  });

  it('is the first 30 days of data when there is no launch date', () => {
    expect(baselineRange({ ...context, launchDate: undefined })).toEqual({ from: '2026-08-15', to: '2026-09-13' });
  });

  it('ignores a launch date on or before the first day of data', () => {
    expect(baselineRange({ ...context, launchDate: '2026-08-15' }).to).toBe('2026-09-13');
  });

  it('never runs past today', () => {
    expect(baselineRange({ ...context, today: '2026-11-12' })).toEqual({ from: '2026-08-15', to: '2026-11-12' });
    expect(baselineRange({ dataFrom: '2026-08-15', today: '2026-08-20' }).to).toBe('2026-08-20');
  });
});

describe('presetRange', () => {
  it('starts the month and the quarter on their first day', () => {
    expect(presetRange('month', context)).toEqual({ from: '2027-03-01', to: '2027-03-15' });
    expect(presetRange('quarter', context)).toEqual({ from: '2027-01-01', to: '2027-03-15' });
    expect(presetRange('quarter', { ...context, today: '2026-11-12' }).from).toBe('2026-10-01');
    expect(presetRange('quarter', { ...context, today: '2026-12-31' }).from).toBe('2026-10-01');
  });

  it('starts "since baseline" on the launch date', () => {
    expect(presetRange('baseline', context)).toEqual({ from: '2026-12-15', to: '2027-03-15' });
  });

  it('shows all the data while the baseline is still being captured', () => {
    expect(presetRange('baseline', { ...context, today: '2026-11-12' })).toEqual({
      from: '2026-08-15',
      to: '2026-11-12',
    });
  });
});

describe('parseFilters', () => {
  it('uses the defaults for an empty URL', () => {
    expect(parse('')).toEqual({
      tags: [],
      preset: 'baseline',
      compare: 'baseline',
      from: '2026-12-15',
      to: '2027-03-15',
    });
  });

  it('reads tags, range and comparison', () => {
    expect(parse('tags=talk,blog&range=quarter&compare=previous')).toEqual({
      tags: ['blog', 'talk'],
      preset: 'quarter',
      compare: 'previous',
      from: '2027-01-01',
      to: '2027-03-15',
    });
  });

  it('cleans up tags: trims, lowercases, drops blanks and duplicates', () => {
    expect(parse('tags=%20Blog%20,,talk,blog,').tags).toEqual(['blog', 'talk']);
  });

  it('reads a custom range and swaps dates given the wrong way round', () => {
    expect(parse('range=custom&from=2027-01-10&to=2027-01-20')).toMatchObject({
      preset: 'custom',
      from: '2027-01-10',
      to: '2027-01-20',
    });
    expect(parse('range=custom&from=2027-01-20&to=2027-01-10')).toMatchObject({
      from: '2027-01-10',
      to: '2027-01-20',
    });
  });

  it.each([
    'range=custom',
    'range=custom&from=2027-01-10',
    'range=custom&from=2027-02-30&to=2027-03-01',
    'range=custom&from=yesterday&to=today',
    'range=year',
    'compare=everything',
  ])('falls back to the defaults for %s', (query) => {
    expect(parse(query)).toMatchObject({ preset: 'baseline', compare: 'baseline', from: '2026-12-15' });
  });

  it('ignores from and to unless the range is custom', () => {
    expect(parse('range=month&from=2020-01-01&to=2020-01-02')).toMatchObject({ from: '2027-03-01', to: '2027-03-15' });
  });

  it('accepts the search params object Next.js gives a page', () => {
    expect(parseFilters({ tags: ['blog,talk', 'ignored'], compare: 'target', other: undefined }, context)).toMatchObject({
      tags: ['blog', 'talk'],
      compare: 'target',
    });
  });
});

describe('filtersToSearchParams and filterHref', () => {
  it('writes nothing for the default view', () => {
    expect(filtersToSearchParams(parse('')).toString()).toBe('');
    expect(filterHref('/content', parse(''))).toBe('/content');
    expect(isDefaultFilters(parse(''))).toBe(true);
  });

  it('writes only what differs from the defaults', () => {
    expect(filterHref('/', parse('tags=talk,blog&compare=target'))).toBe('/?tags=blog,talk&compare=target');
    expect(isDefaultFilters(parse('tags=blog'))).toBe(false);
  });

  it.each([
    '',
    'tags=blog,talk',
    'range=month',
    'range=quarter&compare=previous',
    'range=custom&from=2027-01-10&to=2027-01-20&compare=target',
    'tags=c%2B%2B,q%26a',
  ])('gives the same filters back after a round trip: "%s"', (query) => {
    const filters = parse(query);
    expect(parse(filterHref('/x', filters).split('?')[1] ?? '')).toEqual(filters);
  });
});

describe('updateFilters', () => {
  const start = parse('');

  it('works the dates out again when the preset changes', () => {
    expect(updateFilters(start, { preset: 'month' }, context)).toMatchObject({
      preset: 'month',
      from: '2027-03-01',
      to: '2027-03-15',
    });
  });

  it('keeps the dates on show when switching to custom', () => {
    expect(updateFilters(start, { preset: 'custom' }, context)).toMatchObject({
      preset: 'custom',
      from: '2026-12-15',
      to: '2027-03-15',
    });
  });

  it('switches to custom when a date is edited', () => {
    expect(updateFilters(start, { from: '2027-02-01' }, context)).toMatchObject({
      preset: 'custom',
      from: '2027-02-01',
      to: '2027-03-15',
    });
  });

  it('moves the other date when the edited one crosses it', () => {
    const custom = parse('range=custom&from=2027-01-10&to=2027-01-20');
    expect(updateFilters(custom, { from: '2027-02-01' }, context)).toMatchObject({ from: '2027-02-01', to: '2027-02-01' });
    expect(updateFilters(custom, { to: '2027-01-01' }, context)).toMatchObject({ from: '2027-01-01', to: '2027-01-01' });
  });

  it('keeps the old dates when given one that is not a date', () => {
    const custom = parse('range=custom&from=2027-01-10&to=2027-01-20');
    expect(updateFilters(custom, { from: '' }, context)).toMatchObject({ from: '2027-01-10', to: '2027-01-20' });
  });

  it('changes tags and comparison without touching the range', () => {
    expect(updateFilters(start, { tags: ['Talk', 'blog'], compare: 'target' }, context)).toEqual({
      ...start,
      tags: ['blog', 'talk'],
      compare: 'target',
    });
  });
});

describe('comparisonRange', () => {
  it('is the baseline period for "vs baseline"', () => {
    expect(comparisonRange(parse('range=month'), context)).toEqual({ from: '2026-08-15', to: '2026-12-14' });
  });

  it('is the same number of days just before the range for "vs previous period"', () => {
    expect(comparisonRange(parse('range=custom&from=2027-01-10&to=2027-01-19&compare=previous'), context)).toEqual({
      from: '2026-12-31',
      to: '2027-01-09',
    });
    expect(comparisonRange(parse('range=custom&from=2027-01-10&to=2027-01-10&compare=previous'), context)).toEqual({
      from: '2027-01-09',
      to: '2027-01-09',
    });
  });

  it('has no period for "vs target"', () => {
    expect(comparisonRange(parse('compare=target'), context)).toBeUndefined();
  });
});

describe('toDataFilter and describeFilters', () => {
  it('leaves tags out when none are selected', () => {
    expect(toDataFilter(parse(''))).toEqual({ from: '2026-12-15', to: '2027-03-15' });
    expect(toDataFilter(parse('tags=blog'))).toEqual({ from: '2026-12-15', to: '2027-03-15', tags: ['blog'] });
  });

  it('describes the filters in words', () => {
    expect(describeFilters(parse(''))).toBe('Dec 15, 2026 – Mar 15, 2027 · Tags: all · vs baseline');
    expect(describeFilters(parse('tags=blog,talk&range=custom&from=2027-01-10&to=2027-01-10&compare=target'))).toBe(
      'Jan 10, 2027 · Tags: blog, talk · vs target',
    );
  });
});
