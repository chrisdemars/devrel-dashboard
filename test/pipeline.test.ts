import { describe, expect, it, vi } from 'vitest';
import { getPipeline } from '@/lib/dashboards/pipeline';
import { sampleDataFromConfig } from '@/lib/data';
import { createSampleStore, summarizeDeals } from '@/lib/data/sample/store';
import { parseFilters, type FilterContext } from '@/lib/filters';

const data = sampleDataFromConfig();
const store = createSampleStore(data);
const context: FilterContext = { dataFrom: data.range.from, today: data.range.to, launchDate: data.launchDate };
const pipeline = (query: string, from = store) => getPipeline(from, parseFilters(new URLSearchParams(query), context), context);
const wholeRange = `range=custom&from=${data.range.from}&to=${data.range.to}`;
const totals = summarizeDeals(data.deals);

describe('getPipeline', () => {
  it('gives four headline numbers that match the deal totals', async () => {
    const { kpis } = await pipeline(wholeRange);
    expect(kpis.map((kpi) => kpi.id)).toEqual(['key_events', 'influenced_pipeline_usd', 'deals', 'won']);
    expect(kpis[2].value).toBe(String(totals.count));
    for (const kpi of kpis) expect(kpi.trend.every(Number.isFinite)).toBe(true);
  });

  it('never reads individual deals', async () => {
    const spy = vi.spyOn(store, 'getInfluencedDeals');
    await pipeline(wholeRange);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('splits pipeline by touchpoint, largest first, with shares that add up', async () => {
    const { touchpoints } = await pipeline(wholeRange);
    expect(touchpoints.rows.reduce((sum, row) => sum + row.amountUsd, 0)).toBe(totals.amountUsd);
    expect(touchpoints.rows.reduce((sum, row) => sum + row.count, 0)).toBe(totals.count);
    expect(touchpoints.rows.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1);
    expect(touchpoints.rows.map((row) => row.amountUsd)).toEqual([...touchpoints.rows.map((row) => row.amountUsd)].sort((a, b) => b - a));
  });

  it('gives a cost per deal only where spend was logged', async () => {
    const { channels } = await pipeline(wholeRange);
    const conference = channels.rows.find((row) => row.key === 'conference')!;
    expect(conference.spendUsd).toBeGreaterThan(0);
    expect(conference.costPerDeal).toBeCloseTo(conference.spendUsd / conference.deals);
    for (const row of channels.rows.filter((channel) => channel.spendUsd === 0)) expect(row.costPerDeal).toBeUndefined();
    expect(channels.rows.reduce((sum, row) => sum + row.deals, 0)).toBe(totals.count);
  });

  it('stacks key events by event, each with a stable color', async () => {
    const [all, month] = [await pipeline(''), await pipeline('range=month')];
    expect(all.keyEvents.series.length).toBeGreaterThan(1);
    expect(month.keyEvents.series).toEqual(all.keyEvents.series);
    expect(new Set(all.keyEvents.series.map((s) => s.colorIndex)).size).toBe(all.keyEvents.series.length);
  });

  it('shows progress against the quarter’s targets', async () => {
    const { kpis } = await pipeline('compare=target');
    expect(kpis[0].progress).toBeGreaterThan(0);
    expect(kpis[1].detail).toMatch(/^\d{4}-Q\d: \$.+ of \$150K/);
    expect(kpis[2].detail).toBe('Targets are not set for this number.');
  });

  it('asks for CRM access until the CRM is connected', async () => {
    expect((await pipeline('')).crm).toEqual({ note: expect.stringContaining('No CRM access') });
    const connected = createSampleStore({
      ...data,
      sourceStatuses: data.sourceStatuses.map((source) => ({ ...source, status: 'ok' as const })),
    });
    expect((await pipeline('', connected)).crm).toBeUndefined();
  });

  it('shows zeros, not errors, for a period with no data', async () => {
    const empty = await pipeline('range=custom&from=2020-01-01&to=2020-01-31');
    expect(empty.kpis.map((kpi) => kpi.value)).toEqual(['0', '$0', '0', '$0']);
    expect(empty.touchpoints.rows).toEqual([]);
    expect(empty.channels).toEqual({ rows: [], caption: 'No spend or deals in this period.' });
    expect(empty.keyEvents.series).toEqual([]);
  });
});
