import { describe, expect, it } from 'vitest';
import { getEvents } from '@/lib/dashboards/events';
import { sampleDataFromConfig } from '@/lib/data';
import { createSampleStore } from '@/lib/data/sample/store';
import { parseFilters, type FilterContext } from '@/lib/filters';

const data = sampleDataFromConfig();
const store = createSampleStore(data);
const context: FilterContext = { dataFrom: data.range.from, today: data.range.to, launchDate: data.launchDate };
const events = (query: string, from = store) => getEvents(from, parseFilters(new URLSearchParams(query), context), context);
const wholeRange = `range=custom&from=${data.range.from}&to=${data.range.to}`;
const given = data.conferences.filter((c) => c.cfpStatus === 'given');

describe('getEvents', () => {
  it('gives four headline numbers; a lower cost per lead counts as good', async () => {
    const { kpis } = await events(wholeRange);
    expect(kpis.map((kpi) => kpi.id)).toEqual(['talks', 'audience', 'leads', 'cost_per_lead']);
    expect(kpis[0].value).toBe(String(given.length));
    expect(kpis.find((kpi) => kpi.id === 'cost_per_lead')?.goodWhen).toBe('down');
    expect(kpis.slice(0, 3).every((kpi) => kpi.goodWhen === undefined)).toBe(true);
  });

  it('lists each conference with a talk, cheapest lead first, and totals that add up', async () => {
    const { conferences } = await events(wholeRange);
    expect(conferences.rows).toHaveLength(given.length);
    const perLead = conferences.rows.map((row) => row.costPerLead ?? Infinity);
    expect(perLead).toEqual([...perLead].sort((a, b) => a - b));
    for (const field of ['audience', 'qrScans', 'siteVisits', 'leads', 'costUsd'] as const) {
      expect(conferences.rows.reduce((sum, row) => sum + row[field], 0)).toBe(conferences.totals[field]);
    }
    expect(conferences.totals.costPerLead).toBeCloseTo(conferences.totals.costUsd / conferences.totals.leads);
    expect(conferences.rows.every((row) => row.siteVisits >= row.qrScans)).toBe(true);
    expect(conferences.caption).toContain(conferences.rows[0].name);
  });

  it('charts the audience over time, adding up to the headline number', async () => {
    const { audience, conferences } = await events(wholeRange);
    const charted = audience.rows.reduce((sum, row) => sum + row.values.audience, 0);
    // Days at the start that do not fill a column are left out, so the chart can only be lower.
    expect(charted).toBeLessThanOrEqual(conferences.totals.audience);
    expect(charted).toBeGreaterThan(0);
    expect(audience.total).toBe(conferences.totals.audience);
  });

  it('counts upcoming talks toward the acceptance rate', async () => {
    const { cfp } = await events(wholeRange);
    const count = (status: string) => data.conferences.filter((c) => c.cfpStatus === status).length;
    const accepted = count('given') + count('accepted');
    expect(cfp.acceptanceRate).toBeCloseTo(accepted / (accepted + count('rejected')));
    expect(cfp.byStatus.reduce((sum, row) => sum + row.count, 0)).toBe(data.conferences.length);
    expect(cfp.byStatus.every((row) => row.count > 0)).toBe(true);
  });

  it('counts invitations turned down, newest first', async () => {
    const { declined } = await events(wholeRange);
    const logged = data.declinedRequests.filter((r) => r.kind === 'conference' || r.kind === 'workshop').length;
    const marked = data.conferences.filter((c) => c.cfpStatus === 'declined' && c.date <= data.range.to).length;
    expect(declined.count).toBe(logged + marked);
    expect(declined.rows.map((row) => row.date)).toEqual([...declined.rows.map((row) => row.date)].sort().reverse());
  });

  it('narrows conferences by tag, and shows empty tables when nothing matches', async () => {
    const tag = given[0].tags[0];
    const one = await events(`${wholeRange}&tags=${tag}`);
    expect(one.conferences.rows.map((row) => row.name)).toEqual([given[0].name]);

    const none = await events(`${wholeRange}&tags=no-such-tag`);
    expect(none.conferences.rows).toEqual([]);
    expect(none.kpis.map((kpi) => kpi.value)).toEqual(['0', '0', '0', '–']);
    expect(none.cfp).toMatchObject({ byStatus: [], caption: 'No talk submissions have been decided yet.' });
    expect(none.cfp.acceptanceRate).toBeUndefined();
  });
});
