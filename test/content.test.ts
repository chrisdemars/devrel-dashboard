import { describe, expect, it } from 'vitest';
import { getContent } from '@/lib/dashboards/content';
import { sampleDataFromConfig } from '@/lib/data';
import { addDays } from '@/lib/data/dates';
import { createSampleStore } from '@/lib/data/sample/store';
import { parseFilters, type FilterContext } from '@/lib/filters';

const data = sampleDataFromConfig();
const store = createSampleStore(data);
const context: FilterContext = { dataFrom: data.range.from, today: data.range.to, launchDate: data.launchDate };
const content = (query: string, from = store) => getContent(from, parseFilters(new URLSearchParams(query), context), context);
const wholeRange = `range=custom&from=${data.range.from}&to=${data.range.to}`;

describe('getContent', () => {
  it('gives four headline numbers with trends and notes', async () => {
    const { kpis } = await content('');
    expect(kpis.map((kpi) => kpi.id)).toEqual(['sessions', 'engagement_rate', 'reach', 'youtube_subscribers']);
    for (const kpi of kpis) {
      expect(kpi.note.length).toBeGreaterThan(10);
      expect(kpi.trend.every(Number.isFinite)).toBe(true);
    }
    expect(kpis.filter((kpi) => kpi.tagged).map((kpi) => kpi.id)).toEqual(['reach']);
  });

  it('lists every blog post in the range with the reach of all its formats, largest first', async () => {
    const { posts } = await content(wholeRange);
    expect(posts.rows).toHaveLength(data.activities.filter((activity) => activity.type === 'blog').length);
    expect(posts.rows.map((row) => row.totalReach)).toEqual([...posts.rows.map((row) => row.totalReach)].sort((a, b) => b - a));
    for (const row of posts.rows) {
      expect(row.totalReach).toBeGreaterThanOrEqual(row.postReach);
      expect(row.formats).not.toContain('blog');
    }
    expect(posts.rows.some((row) => row.formats.includes('short'))).toBe(true);
    expect(posts.caption).toContain(posts.rows[0].title);
  });

  it('ranks posts by views and by key events separately', async () => {
    const { topByViews, topByKeyEvents, topCaption } = await content(wholeRange);
    expect(topByViews).toHaveLength(5);
    expect(topByKeyEvents).toHaveLength(5);
    expect(topByViews.map((post) => post.id)).not.toEqual(topByKeyEvents.map((post) => post.id));
    expect(topCaption).toContain(topByKeyEvents[0].title);
  });

  it('narrows posts and reach by tag, but not site traffic', async () => {
    const [all, shorts] = [await content(wholeRange), await content(`${wholeRange}&tags=short`)];
    const value = (result: typeof all, id: string) => result.kpis.find((kpi) => kpi.id === id)!.value;
    // Shorts alone have no blog post to roll up into.
    expect(shorts.posts.rows).toEqual([]);
    expect(value(shorts, 'reach')).not.toBe(value(all, 'reach'));
    expect(value(shorts, 'sessions')).toBe(value(all, 'sessions'));
    expect(shorts.sessions.total).toBe(all.sessions.total);
  });

  it('stacks sessions by channel in a fixed order, and the columns add up', async () => {
    const { sessions, channels } = await content(`range=custom&from=${addDays(data.range.to, -27)}&to=${data.range.to}`);
    expect(sessions.series.map((s) => s.key)).toEqual(['organic_search', 'organic_social', 'referral', 'direct']);
    expect(sessions.series.map((s) => s.colorIndex)).toEqual([0, 1, 2, 3]);
    const sum = sessions.rows.flatMap((row) => Object.values(row.values)).reduce((a, b) => a + b, 0);
    expect(sum).toBe(sessions.total);
    expect(channels.reduce((total, channel) => total + channel.sessions, 0)).toBe(sessions.total);
    for (const channel of channels) {
      expect(channel.rate).toBeGreaterThan(0);
      expect(channel.rate).toBeLessThanOrEqual(1);
    }
  });

  it('compares against the selected period or target', async () => {
    const sessions = async (query: string) => (await content(query)).kpis[0];
    expect((await sessions('')).deltaLabel).toBe('vs baseline, per day');
    expect((await sessions('compare=target')).progress).toBeGreaterThan(0);
    expect((await content('compare=target')).kpis[1].detail).toBe('Targets are not set for this number.');
  });

  it('shows empty lists, not errors, when nothing matches', async () => {
    const empty = await content('tags=no-such-tag');
    expect(empty.posts).toEqual({ rows: [], caption: 'No posts match these filters.' });
    expect(empty.topByViews).toEqual([]);
    expect(empty.topCaption).toBe('No posts match these filters.');
    expect(empty.kpis.find((kpi) => kpi.id === 'reach')).toMatchObject({ value: '0', note: 'No content matches these filters.' });
  });

  it('leaves the subscriber chart out when no counts were ever collected', async () => {
    const withoutFollowers = createSampleStore({
      ...data,
      metricPoints: data.metricPoints.filter((point) => point.metric !== 'followers'),
    });
    expect((await content('', withoutFollowers)).subscribers).toBeUndefined();
    expect((await content('')).subscribers?.rows.length).toBeGreaterThan(1);
  });
});
