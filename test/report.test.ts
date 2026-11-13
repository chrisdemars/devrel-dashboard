import { describe, expect, it } from 'vitest';
import { niceMax } from '@/components/charts/static-columns';
import { getOverview } from '@/lib/dashboards/overview';
import { getReport, parseReportRequest, periodLabel, reportFilters, reportHref, reportPeriods } from '@/lib/dashboards/report';
import { sampleDataFromConfig } from '@/lib/data';
import { quarterOf } from '@/lib/data/dates';
import { createSampleStore } from '@/lib/data/sample/store';
import type { FilterContext } from '@/lib/filters';
import { periodRange } from '@/lib/metrics';

const data = sampleDataFromConfig();
const store = createSampleStore(data);
const context: FilterContext = { dataFrom: data.range.from, today: data.range.to, launchDate: data.launchDate };
const current = quarterOf(data.range.to);
const periods = reportPeriods(context);
const report = (query = '') => getReport(store, parseReportRequest(new URLSearchParams(query), context), context);

describe('report periods and links', () => {
  it('lists every quarter the data touches, oldest first', () => {
    expect(periods[0]).toBe(quarterOf(data.range.from));
    expect(periods.at(-1)).toBe(current);
    expect(periods).toEqual([...periods].sort());
    expect(reportPeriods({ dataFrom: '2026-11-20', today: '2027-04-02' })).toEqual(['2026-Q4', '2027-Q1', '2027-Q2']);
    expect(periodLabel('2027-Q1')).toBe('Q1 2027');
  });

  it('falls back to the current quarter for a missing or unknown period', () => {
    expect(parseReportRequest(new URLSearchParams(''), context)).toEqual({ period: current, tags: [] });
    expect(parseReportRequest({ period: '1999-Q1' }, context).period).toBe(current);
    expect(parseReportRequest({ period: 'last-week' }, context).period).toBe(current);
    expect(parseReportRequest({ period: periods[0].toLowerCase(), tags: 'talk,blog' }, context)).toEqual({ period: periods[0], tags: ['blog', 'talk'] });
  });

  it('links keep the tags', () => {
    expect(reportHref({ period: '2027-Q1', tags: [] })).toBe('/report?period=2027-Q1');
    expect(reportHref({ period: '2027-Q1', tags: ['blog', 'talk'] })).toBe('/report?period=2027-Q1&tags=blog,talk');
  });

  it('covers the quarter, cut short at today, compared with the period before', () => {
    const filters = reportFilters({ period: current, tags: [] }, context);
    expect(filters).toMatchObject({ preset: 'custom', compare: 'previous', from: periodRange(current)!.from });
    expect(filters.to <= data.range.to).toBe(true);
    const past = reportFilters({ period: periods[0], tags: [] }, context);
    expect(past.to).toBe(periodRange(periods[0])!.to < data.range.to ? periodRange(periods[0])!.to : data.range.to);
  });
});

describe('getReport', () => {
  it('shows the same headline numbers as the Overview for the same period', async () => {
    const result = await report();
    const overview = await getOverview(store, reportFilters({ period: current, tags: [] }, context), context);
    expect(result.kpis.map(({ id, value }) => [id, value])).toEqual(overview.kpis.map(({ id, value }) => [id, value]));
    expect(result.period).toMatchObject({ key: current, current: true });
    expect(result.periods.filter((period) => period.current)).toHaveLength(1);
  });

  it('adds reach up by format, and lists the posts that travelled furthest', async () => {
    const { reach } = await report();
    expect(reach.byFormat.reduce((sum, row) => sum + row.value, 0)).toBe(reach.total);
    const values = reach.byFormat.map((row) => row.value);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(reach.topPosts.length).toBeLessThanOrEqual(5);
    const reaches = reach.topPosts.map((post) => post.totalReach);
    expect(reaches).toEqual([...reaches].sort((a, b) => b - a));
    expect(reach.sessions.rows.reduce((sum, row) => sum + row.value, 0)).toBeLessThanOrEqual(reach.sessions.total);
    expect(reach.sessions.total).toBeGreaterThan(0);
    expect(reach.caption).toContain(reach.byFormat[0].label);
  });

  it('takes the narrative from the report notes for that period', async () => {
    const result = await report();
    const notes = (section: string) => data.reportNotes.filter((n) => n.period === current && n.section === section).map((n) => n.text);
    expect(result.working).toEqual(notes('working'));
    expect(result.notWorking).toEqual(notes('not_working'));
    expect(result.ask.notes).toEqual(notes('ask'));
    expect(result.working.length).toBeGreaterThan(0);
  });

  it('lists every source that is not connected, and none that is', async () => {
    const { access } = await report();
    expect(access.map((source) => source.id).sort()).toEqual(data.sourceStatuses.filter((s) => s.status !== 'ok').map((s) => s.id).sort());
    expect(access.every((source) => source.status !== 'ok')).toBe(true);
  });

  it('backs the ask with the staffing model', async () => {
    const { ask } = await getReport(store, { period: current, tags: [] }, context, { people: 2 });
    expect(ask.staffing.people).toBe(2);
    expect(ask.staffing.rows[0].projected).toBeCloseTo(ask.staffing.rows[0].current * 1.5);
  });

  it('follows the period and the tags', async () => {
    const now = await report();
    const earlier = await report(`period=${periods[0]}`);
    expect(earlier.range.from).toBe(periodRange(periods[0])!.from);
    expect(earlier.inProgress).toBe(false);
    expect(earlier.rangeLabel).not.toBe(now.rangeLabel);
    const tagged = await report('tags=blog');
    expect(tagged.tags).toEqual(['blog']);
    expect(tagged.reach.total).toBeLessThan(now.reach.total);
    expect(tagged.periods.every((period) => period.href.endsWith('&tags=blog'))).toBe(true);
  });

  it('says so when a period has nothing in it', async () => {
    const empty = await report('tags=no-such-tag');
    expect(empty.reach.byFormat).toEqual([]);
    expect(empty.reach.caption).toBe('No reach is recorded for this period.');
    expect(empty.reach.topPosts).toEqual([]);
  });
});

describe('niceMax', () => {
  it('rounds an axis up to a clean number', () => {
    expect([1, 4862, 5000, 12, 0.3, 2400].map(niceMax)).toEqual([1, 5000, 5000, 20, 0.5, 2500]);
  });
});
