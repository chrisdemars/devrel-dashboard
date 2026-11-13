import { describe, expect, it } from 'vitest';
import { formatRate, getCapacity, OUTPUT_TYPES } from '@/lib/dashboards/capacity';
import { sampleDataFromConfig } from '@/lib/data';
import { daysBetween } from '@/lib/data/dates';
import { createSampleStore } from '@/lib/data/sample/store';
import { parseFilters, type FilterContext } from '@/lib/filters';

const data = sampleDataFromConfig();
const store = createSampleStore(data);
const context: FilterContext = { dataFrom: data.range.from, today: data.range.to, launchDate: data.launchDate };
const capacity = (query: string, people?: number) =>
  getCapacity(store, parseFilters(new URLSearchParams(query), context), context, people);
const wholeRange = `range=custom&from=${data.range.from}&to=${data.range.to}`;
const days = daysBetween(data.range.from, data.range.to) + 1;
const output = data.activities.filter((a) => OUTPUT_TYPES.includes(a.type));
const crossTeam = data.activities.filter((a) => a.type === 'cross-team');

describe('getCapacity', () => {
  it('gives four headline numbers; output is a rate per 30 days', async () => {
    const { kpis } = await capacity(wholeRange);
    expect(kpis.map((kpi) => kpi.id)).toEqual(['output', 'posts', 'cross_team', 'declined']);
    expect(kpis[0].value).toBe(formatRate((output.length / days) * 30));
    expect(kpis[2].value).toBe(String(crossTeam.length));
    // Fewer requests turned down is the good direction.
    expect(kpis.map((kpi) => kpi.goodWhen)).toEqual([undefined, undefined, undefined, 'down']);
  });

  it('charts output by kind, with a fixed color for each kind', async () => {
    const all = await capacity(wholeRange);
    expect(all.output.total).toBe(output.length);
    const charted = all.output.rows.reduce((sum, row) => sum + Object.values(row.values).reduce((a, b) => a + b, 0), 0);
    // Days at the start that do not fill a column are left out, so the chart can only be lower.
    expect(charted).toBeLessThanOrEqual(output.length);
    expect(charted).toBeGreaterThan(0);

    const talks = await capacity(`${wholeRange}&tags=talk`);
    expect(talks.output.series.map((item) => item.key)).toEqual(['talk']);
    expect(talks.output.series[0].colorIndex).toBe(all.output.series.find((item) => item.key === 'talk')?.colorIndex);
    expect(talks.output.total).toBe(output.filter((a) => a.type === 'talk').length);
  });

  it('counts work for other teams by team, largest first', async () => {
    const { crossTeam: result } = await capacity(wholeRange);
    expect(result.count).toBe(crossTeam.length);
    expect(result.byTeam.reduce((sum, row) => sum + row.count, 0)).toBe(crossTeam.length);
    const counts = result.byTeam.map((row) => row.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(result.byTeam.length).toBeGreaterThan(1);
    expect(result.rows.every((row) => row.team !== 'Not recorded')).toBe(true);
  });

  it('files a contribution with no team under "Not recorded"', async () => {
    const bare = createSampleStore({ ...data, activities: data.activities.map((activity) => ({ ...activity, team: undefined })) });
    const { crossTeam: result } = await getCapacity(bare, parseFilters(new URLSearchParams(wholeRange), context), context);
    expect(result.byTeam).toEqual([{ key: 'not_recorded', label: 'Not recorded', count: crossTeam.length }]);
  });

  it('counts requests turned down by kind, including declined invitations', async () => {
    const { declined } = await capacity(wholeRange);
    const marked = data.conferences.filter((c) => c.cfpStatus === 'declined' && c.date <= data.range.to).length;
    expect(declined.count).toBe(data.declinedRequests.length + marked);
    expect(declined.byKind.reduce((sum, row) => sum + row.count, 0)).toBe(declined.count);
    expect(declined.rows.map((row) => row.date)).toEqual([...declined.rows.map((row) => row.date)].sort().reverse());
    expect(declined.caption).toContain('demand the team could not meet');
  });

  it('projects one more person from the size of the team', async () => {
    const solo = (await capacity(wholeRange)).staffing;
    const [pieces, reach, keyEvents] = solo.rows;
    expect(solo.people).toBe(1);
    // One person becoming two doubles everything.
    expect(pieces.projected).toBeCloseTo(pieces.current * 2);
    expect(reach.projected).toBeCloseTo(reach.current * 2);
    expect(keyEvents.projected).toBeCloseTo(keyEvents.current * 2);
    expect(reach.current).toBeGreaterThan(0);
    expect(keyEvents.current).toBeGreaterThan(0);
    expect(solo.byType.reduce((sum, row) => sum + row.current, 0)).toBeCloseTo(pieces.current);
    expect(solo.caption).toContain('not a forecast');

    const four = (await capacity(wholeRange, 4)).staffing;
    expect(four.rows[0].projected).toBeCloseTo(four.rows[0].current * 1.25);
    expect(four.byType[0].projected).toBeCloseTo(four.byType[0].current * 1.25);
  });

  it('falls back to one person when the team size is not usable', async () => {
    expect((await capacity(wholeRange, 0)).staffing.people).toBe(1);
    expect((await capacity(wholeRange, Number.NaN)).staffing.people).toBe(1);
  });

  it('follows the tag and date filters', async () => {
    const all = await capacity(wholeRange);
    const blog = await capacity(`${wholeRange}&tags=blog`);
    expect(blog.crossTeam.count).toBe(0);
    expect(blog.staffing.rows[0].current).toBeLessThan(all.staffing.rows[0].current);
    // Logged requests are not tagged, so tags leave them alone.
    expect(blog.declined.count).toBeGreaterThanOrEqual(data.declinedRequests.length);

    const month = await capacity('range=month');
    expect(month.output.total).toBeLessThan(all.output.total);
    expect(month.declined.count).toBeLessThanOrEqual(all.declined.count);
  });

  it('says so when nothing matches', async () => {
    const empty = await capacity(`${wholeRange}&tags=no-such-tag`);
    expect(empty.output.total).toBe(0);
    expect(empty.output.series).toEqual([]);
    expect(empty.staffing.caption).toContain('no output');
    expect(empty.kpis[0].value).toBe('0');
  });

  it('compares with the baseline, the previous period and targets', async () => {
    const baseline = await capacity('');
    expect(baseline.kpis[0].delta !== undefined || baseline.kpis[0].detail !== undefined).toBe(true);
    const target = await capacity('compare=target');
    expect(target.kpis.every((kpi) => kpi.detail === 'Targets are not set for this number.')).toBe(true);
  });
});

describe('formatRate', () => {
  it('keeps one decimal below ten', () => {
    expect(formatRate(2.25)).toBe('2.3');
    expect(formatRate(2)).toBe('2');
    expect(formatRate(14.2)).toBe('14');
    expect(formatRate(12_900)).toBe('12.9K');
  });
});
