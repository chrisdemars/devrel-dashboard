import { describe, expect, it } from 'vitest';
import { getActivityDetail, getActivityLog, logHref, parseLogView, typeLabel } from '@/lib/dashboards/activity';
import { sampleDataFromConfig } from '@/lib/data';
import { createSampleStore } from '@/lib/data/sample/store';
import { parseFilters, type FilterContext } from '@/lib/filters';
import { reachByActivity } from '@/lib/metrics';

const data = sampleDataFromConfig();
const store = createSampleStore(data);
const context: FilterContext = { dataFrom: data.range.from, today: data.range.to, launchDate: data.launchDate };
const wholeRange = `range=custom&from=${data.range.from}&to=${data.range.to}`;
const log = (query: string) => {
  const params = new URLSearchParams(query);
  return getActivityLog(store, parseFilters(params, context), context, parseLogView(params));
};
const reach = reachByActivity(data.activityMetrics);

describe('parseLogView and logHref', () => {
  it('falls back to every type, newest first', () => {
    expect(parseLogView(new URLSearchParams(''))).toEqual({ sort: 'date' });
    expect(parseLogView({ type: ' Blog ', sort: 'sideways' })).toEqual({ type: 'blog', sort: 'date' });
    expect(parseLogView({ type: ['talk', 'blog'], sort: 'reach' })).toEqual({ type: 'talk', sort: 'reach' });
  });

  it('keeps the filters and leaves defaults out of the link', () => {
    const filters = parseFilters(new URLSearchParams('tags=launch,docs&compare=previous'), context);
    expect(logHref(parseFilters(new URLSearchParams(''), context), { sort: 'date' })).toBe('/activity');
    expect(logHref(filters, { type: 'blog', sort: 'reach' })).toBe('/activity?tags=docs,launch&compare=previous&type=blog&sort=reach');
    expect(logHref(filters, { sort: 'date' }, 'a b/1')).toBe('/activity/a%20b%2F1?tags=docs,launch&compare=previous');
  });
});

describe('getActivityLog', () => {
  it('lists every activity in the range, newest first', async () => {
    const { rows, types, kpis } = await log(wholeRange);
    expect(rows).toHaveLength(data.activities.length);
    expect(rows.map((row) => row.date)).toEqual([...rows.map((row) => row.date)].sort().reverse());
    expect(types[0]).toMatchObject({ key: 'all', current: true, count: data.activities.length });
    expect(types.slice(1).reduce((sum, type) => sum + (type.count ?? 0), 0)).toBe(data.activities.length);
    expect(kpis.map((kpi) => kpi.id)).toEqual(['activities', 'reach', 'key_events']);
    expect(kpis[0].value).toBe(String(data.activities.length));
  });

  it('gives each row its numbers, its tags without the type, and a link that keeps the view', async () => {
    const { rows } = await log(`${wholeRange}&sort=reach`);
    for (const row of rows) {
      expect(row.reach).toBe(reach.get(row.id) ?? 0);
      expect(row.tags).not.toContain(row.type);
      expect(row.href).toContain(`/activity/${row.id}?`);
      expect(row.href).toContain('sort=reach');
    }
    const blog = rows.find((row) => row.type === 'blog')!;
    expect(blog.madeFromIt).toBe(data.activities.filter((a) => a.parentId === blog.id).length);
    expect(blog.keyEvents).toBeGreaterThan(0);
  });

  it('sorts by reach, largest first', async () => {
    const { rows, sorts } = await log(`${wholeRange}&sort=reach`);
    const values = rows.map((row) => row.reach);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(sorts.find((sort) => sort.current)?.key).toBe('reach');
    expect(sorts.find((sort) => sort.key === 'date')?.href).not.toContain('sort=');
  });

  it('narrows to one type; the list of types stays whole', async () => {
    const all = await log(wholeRange);
    const talks = await log(`${wholeRange}&type=talk`);
    const expected = data.activities.filter((a) => a.type === 'talk');
    expect(talks.rows.map((row) => row.type)).toEqual(expected.map(() => 'talk'));
    expect(talks.types.map(({ key, count }) => [key, count])).toEqual(all.types.map(({ key, count }) => [key, count]));
    expect(talks.types.find((type) => type.current)?.key).toBe('talk');
    expect(talks.kpis[0].value).toBe(String(expected.length));
    expect(talks.types.find((type) => type.key === 'all')?.href).not.toContain('type=');
  });

  it('follows the tag and date filters', async () => {
    const all = await log(wholeRange);
    const tagged = await log(`${wholeRange}&tags=blog`);
    expect(tagged.rows.every((row) => row.type === 'blog')).toBe(true);
    expect(tagged.rows.length).toBeLessThan(all.rows.length);
    const month = await log('range=month');
    expect(month.rows.length).toBeLessThan(all.rows.length);
    expect(month.rows.every((row) => row.date >= `${data.range.to.slice(0, 7)}-01`)).toBe(true);
  });

  it('compares with the selected period, and says so when nothing matches', async () => {
    const compared = await log('compare=previous');
    expect(compared.kpis[0].delta !== undefined || compared.kpis[0].detail !== undefined).toBe(true);
    const empty = await log(`${wholeRange}&type=no-such-type`);
    expect(empty.rows).toEqual([]);
    expect(empty.caption).toBe('No activities match these filters.');
    expect(empty.types.every((type) => !type.current)).toBe(true);
  });
});

describe('getActivityDetail', () => {
  const blog = data.activities.find((a) => a.type === 'blog' && data.activities.some((b) => b.parentId === a.id))!;
  const children = data.activities.filter((a) => a.parentId === blog.id);

  it('gives a post its numbers and everything made from it', async () => {
    const detail = (await getActivityDetail(store, blog.id))!;
    expect(detail.typeLabel).toBe('Blog post');
    expect(detail.reach).toBe(reach.get(blog.id) ?? 0);
    expect(detail.metrics).toHaveLength(data.activityMetrics.filter((m) => m.activityId === blog.id).length);
    expect(detail.derived.map((item) => item.id).sort()).toEqual(children.map((a) => a.id).sort());
    expect(detail.derived.map((item) => item.date)).toEqual([...detail.derived.map((item) => item.date)].sort());
    expect(detail.familyReach).toBe(detail.reach + children.reduce((sum, a) => sum + (reach.get(a.id) ?? 0), 0));
    expect(detail.madeFrom).toBeUndefined();
  });

  it('points a derived activity back at what it was made from', async () => {
    const detail = (await getActivityDetail(store, children[0].id))!;
    expect(detail.madeFrom?.id).toBe(blog.id);
    expect(detail.derived).toEqual([]);
    expect(detail.familyReach).toBe(detail.reach);
  });

  it('survives a loop in the data and an unknown id', async () => {
    const looped = createSampleStore({
      ...data,
      activities: data.activities.map((a) => (a.id === blog.id ? { ...a, parentId: children[0].id } : a)),
    });
    const detail = (await getActivityDetail(looped, blog.id))!;
    expect(detail.derived).toHaveLength(children.length);
    expect(await getActivityDetail(store, 'no-such-activity')).toBeUndefined();
  });
});

describe('typeLabel', () => {
  it('names the built-in types and tidies anything else', () => {
    expect(typeLabel('long-form-video')).toBe('Long-form video');
    expect(typeLabel('office_hours')).toBe('Office hours');
  });
});
