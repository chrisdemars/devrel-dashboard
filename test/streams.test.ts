import { describe, expect, it } from 'vitest';
import { getStreams } from '@/lib/dashboards/streams';
import { sampleDataFromConfig } from '@/lib/data';
import { createSampleStore } from '@/lib/data/sample/store';
import { parseFilters, type FilterContext } from '@/lib/filters';

const data = sampleDataFromConfig();
const store = createSampleStore(data);
const context: FilterContext = { dataFrom: data.range.from, today: data.range.to, launchDate: data.launchDate };
const streams = (query: string, from = store) => getStreams(from, parseFilters(new URLSearchParams(query), context), context);
const wholeRange = `range=custom&from=${data.range.from}&to=${data.range.to}`;

describe('getStreams', () => {
  it('gives four headline numbers; only the follower count ignores tags', async () => {
    const { kpis } = await streams('');
    expect(kpis.map((kpi) => kpi.id)).toEqual(['streams', 'live_viewers', 'replay_views', 'followers']);
    expect(kpis.filter((kpi) => !kpi.tagged).map((kpi) => kpi.id)).toEqual(['followers']);
    for (const kpi of kpis) expect(kpi.trend.every(Number.isFinite)).toBe(true);
  });

  it('lists every livestream, newest first, with platform rows that add up', async () => {
    const { streams: table } = await streams(wholeRange);
    expect(table.rows).toHaveLength(data.activities.filter((activity) => activity.type === 'livestream').length);
    expect(table.rows.map((row) => row.date)).toEqual([...table.rows.map((row) => row.date)].sort().reverse());
    for (const row of table.rows) {
      expect(row.byPlatform.reduce((sum, platform) => sum + platform.live, 0)).toBe(row.live);
      expect(row.byPlatform.reduce((sum, platform) => sum + platform.replays, 0)).toBe(row.replays);
      expect(row.topPlatform).toBe(row.byPlatform[0].platform);
    }
  });

  it('ranks platforms by viewers per stream, and their totals match the headline numbers', async () => {
    const { platforms, kpis, streams: table } = await streams(wholeRange);
    expect(platforms.rows.map((row) => row.perStream)).toEqual([...platforms.rows.map((row) => row.perStream)].sort((a, b) => b - a));
    expect(platforms.rows.reduce((sum, row) => sum + row.live, 0)).toBe(table.rows.reduce((sum, row) => sum + row.live, 0));
    expect(platforms.rows.every((row) => row.streams === table.rows.length)).toBe(true);
    expect(platforms.caption).toContain(platforms.rows[0].label);
    expect(kpis[0].value).toBe(String(table.rows.length));
  });

  it('charts followers per platform in a fixed color order', async () => {
    const { followers } = await streams('');
    expect(followers.series.map((s) => [s.key, s.colorIndex])).toEqual([
      ['youtube', 0],
      ['x', 1],
      ['linkedin', 2],
      ['twitch', 3],
    ]);
    expect(followers.rows.length).toBeGreaterThan(1);
    for (const row of followers.table) {
      expect(row.end).toBeGreaterThan(row.start);
      expect(row.change).toBeGreaterThan(0);
    }
  });

  it('narrows streams by tag but not followers', async () => {
    const [all, none] = [await streams(wholeRange), await streams(`${wholeRange}&tags=no-such-tag`)];
    expect(none.streams.rows).toEqual([]);
    expect(none.platforms.rows).toEqual([]);
    expect(none.kpis.slice(0, 3).map((kpi) => kpi.value)).toEqual(['0', '0', '0']);
    expect(none.kpis[3].value).toBe(all.kpis[3].value);
    expect(none.followers.table).toEqual(all.followers.table);
  });

  it('names platforms whose source is not connected and reports nothing', async () => {
    expect((await streams('')).missingPlatforms).toEqual([
      { key: 'facebook', label: 'Facebook', note: expect.stringContaining('No access yet') },
    ]);
    const connected = createSampleStore({
      ...data,
      sourceStatuses: data.sourceStatuses.map((source) => ({ ...source, status: 'ok' as const })),
    });
    expect((await streams('', connected)).missingPlatforms).toEqual([]);
  });
});
