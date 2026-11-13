import { describe, expect, it } from 'vitest';
import { getOverview } from '@/lib/dashboards/overview';
import { sampleDataFromConfig } from '@/lib/data';
import { createSampleStore } from '@/lib/data/sample/store';
import { parseFilters, type FilterContext } from '@/lib/filters';

const data = sampleDataFromConfig();
const store = createSampleStore(data);
const context: FilterContext = { dataFrom: data.range.from, today: data.range.to, launchDate: data.launchDate };
const launch = { date: data.launchDate, label: 'Launch' };
const overview = (query: string) => getOverview(store, parseFilters(new URLSearchParams(query), context), context, launch);
const kpi = async (query: string, id: string) => (await overview(query)).kpis.find((item) => item.id === id)!;

describe('getOverview', () => {
  it('gives five headline numbers, each with a trend and a "so what" line', async () => {
    const { kpis } = await overview('');
    expect(kpis.map((item) => item.id)).toEqual(['installs', 'activations', 'key_events', 'influenced_pipeline_usd', 'reach']);
    for (const item of kpis) {
      expect(item.value).not.toBe('');
      expect(item.note.length).toBeGreaterThan(10);
      expect(item.trend.length).toBeGreaterThanOrEqual(2);
      expect(item.trend.every(Number.isFinite)).toBe(true);
    }
  });

  it('compares with the baseline by default, per day', async () => {
    const events = await kpi('', 'key_events');
    expect(events.delta).toBeGreaterThan(0);
    expect(events.deltaLabel).toBe('vs baseline, per day');
  });

  it('says a number is new when the baseline has none of it', async () => {
    const installs = await kpi('', 'installs');
    expect(installs.delta).toBeUndefined();
    expect(installs.detail).toBe('New since the baseline.');
  });

  it('compares with the previous period of the same length without "per day"', async () => {
    expect((await kpi('range=month&compare=previous', 'installs')).deltaLabel).toBe('vs previous period');
  });

  it('shows progress for numbers with a target and says so for those without', async () => {
    const installs = await kpi('compare=target', 'installs');
    expect(installs.delta).toBeUndefined();
    expect(installs.progress).toBeGreaterThan(0);
    expect(installs.detail).toMatch(/^\d{4}-Q\d: .+ of .+ \(\d+%\), (on track|behind pace|target met)$/);
    expect((await kpi('compare=target', 'activations')).detail).toMatch(/^No target set for/);
    expect((await kpi('compare=target', 'reach')).detail).toBe('Targets are not set for this number.');
  });

  it('applies the tag filter to reach only', async () => {
    const [all, blog] = [await overview(''), await overview('tags=blog')];
    const value = (result: typeof all, id: string) => result.kpis.find((item) => item.id === id)!.value;
    expect(value(blog, 'reach')).not.toBe(value(all, 'reach'));
    expect(value(blog, 'installs')).toBe(value(all, 'installs'));
    expect(all.kpis.filter((item) => item.tagged).map((item) => item.id)).toEqual(['reach']);
  });

  it('changes every number with the date range', async () => {
    const [all, month] = [await overview(''), await overview('range=month')];
    all.kpis.forEach((item, i) => expect(month.kpis[i].value).not.toBe(item.value));
  });

  it('handles filters that match nothing', async () => {
    const empty = await overview('range=custom&from=2020-01-01&to=2020-01-31&tags=no-such-tag');
    expect(empty.kpis.find((item) => item.id === 'reach')).toMatchObject({ value: '0', note: 'No activities match these filters.' });
    expect(empty.kpis.find((item) => item.id === 'installs')).toMatchObject({ value: '0', note: 'No installs in this period.' });
    expect(empty.kpis.find((item) => item.id === 'influenced_pipeline_usd')?.value).toBe('$0');
  });

  it('counts the days to or since the launch', async () => {
    expect((await overview('')).launch).toEqual({ ...launch, daysAway: -90 });
    expect((await getOverview(store, parseFilters({}, context), context)).launch).toBeUndefined();
  });

  it('summarizes the data sources by status', async () => {
    const { sources } = await overview('');
    expect(sources.total).toBe(data.sourceStatuses.length);
    expect(sources.byStatus.reduce((sum, row) => sum + row.count, 0)).toBe(sources.total);
    expect(sources.byStatus.every((row) => row.count > 0)).toBe(true);
  });
});
