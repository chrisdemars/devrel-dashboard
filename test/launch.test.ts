import { describe, expect, it } from 'vitest';
import { chartBucketDays, getLaunch, labelFor } from '@/lib/dashboards/launch';
import { sampleDataFromConfig } from '@/lib/data';
import { addDays } from '@/lib/data/dates';
import { createSampleStore } from '@/lib/data/sample/store';
import { parseFilters, type FilterContext } from '@/lib/filters';

const data = sampleDataFromConfig();
const store = createSampleStore(data);
const context: FilterContext = { dataFrom: data.range.from, today: data.range.to, launchDate: data.launchDate };
const launch = (query: string, from = store) => getLaunch(from, parseFilters(new URLSearchParams(query), context), context);

describe('labelFor', () => {
  it('names known channels and tidies the rest', () => {
    expect(labelFor('github')).toBe('GitHub releases');
    expect(labelFor('organic_search')).toBe('Organic search');
    expect(labelFor('')).toBe('Unknown');
  });
});

describe('chartBucketDays', () => {
  it('uses days for short ranges, weeks up to 16 weeks, and 30 days beyond', () => {
    expect(chartBucketDays({ from: '2027-03-01', to: '2027-03-15' })).toBe(1);
    expect(chartBucketDays({ from: '2027-01-01', to: '2027-03-15' })).toBe(7);
    expect(chartBucketDays({ from: '2026-01-01', to: '2026-12-31' })).toBe(30);
  });
});

describe('getLaunch', () => {
  it('gives four headline numbers with trends and notes', async () => {
    const { kpis } = await launch('');
    expect(kpis.map((kpi) => kpi.id)).toEqual(['installs', 'signups', 'activation_rate', 'active_users']);
    for (const kpi of kpis) {
      expect(kpi.note.length).toBeGreaterThan(10);
      expect(kpi.trend.every(Number.isFinite)).toBe(true);
    }
    expect(kpis[2].value).toMatch(/^\d+%$/);
  });

  it('stacks installs by channel, and the columns add up to the total', async () => {
    // Exactly four weeks ending today, so no day falls outside a column.
    const { installs } = await launch(`range=custom&from=${addDays(data.range.to, -27)}&to=${data.range.to}`);
    expect(installs.bucket).toBe('week');
    expect(installs.series.map((s) => s.key)).toEqual(['npm', 'homebrew', 'github', 'docker']);
    const sum = installs.rows.flatMap((row) => Object.values(row.values)).reduce((a, b) => a + b, 0);
    expect(sum).toBe(installs.total);
  });

  it('keeps each channel’s color whatever the filters', async () => {
    const colors = async (query: string) =>
      Object.fromEntries((await launch(query)).installs.series.map((s) => [s.key, s.colorIndex]));
    expect(await colors('range=quarter')).toEqual(await colors(''));
    expect((await colors('')).docker).toBe(4);
  });

  it('switches to daily columns for a short range', async () => {
    // Ten days ending today, so it holds whatever launch date the org config sets.
    const { installs } = await launch(`range=custom&from=${addDays(data.range.to, -9)}&to=${data.range.to}`);
    expect(installs.bucket).toBe('day');
    expect(installs.rows).toHaveLength(10);
  });

  it('compares against the selected period or target', async () => {
    const id = async (query: string) => (await launch(query)).kpis[0];
    expect((await id('range=month&compare=previous')).deltaLabel).toBe('vs previous period');
    expect((await id('')).detail).toBe('New since the baseline.');
    expect((await id('compare=target')).progress).toBeGreaterThan(0);
  });

  it('orders the funnel and the sign-up answers', async () => {
    const { funnel, signups } = await launch('');
    expect(funnel?.steps.map((step) => step.label)).toEqual(['Installs', 'First real use']);
    expect(funnel!.steps[1].value).toBeLessThan(funnel!.steps[0].value);
    expect(signups!.rows.map((row) => row.value)).toEqual([...signups!.rows.map((row) => row.value)].sort((a, b) => b - a));
    expect(signups!.rows.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1);
  });

  it('shows zeros, not errors, for a period before the launch', async () => {
    const before = await launch(`range=custom&from=${data.range.from}&to=${addDays(data.launchDate, -1)}`);
    expect(before.kpis.map((kpi) => kpi.value)).toEqual(['0', '0', '–', '0']);
    expect(before.installs).toMatchObject({ total: 0, caption: 'No installs in this period.', series: [] });
    expect(before.funnel?.steps[1].share).toBe(0);
  });

  it('leaves out the charts whose data source has never reported', async () => {
    const withoutUsage = createSampleStore({
      ...data,
      metricPoints: data.metricPoints.filter((point) => point.metric === 'installs'),
    });
    const result = await launch('', withoutUsage);
    expect(result.funnel).toBeUndefined();
    expect(result.activeUsers).toBeUndefined();
    expect(result.signups).toBeUndefined();
    expect(result.installs.total).toBeGreaterThan(0);
  });
});
