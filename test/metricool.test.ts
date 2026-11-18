import { describe, expect, test } from 'vitest';
import { addSeries, collectMetricool, parseTimeline, type FetchJson, type MetricoolQuery, type PlatformNumbers } from '../src/lib/sources/metricool';
import { STATUS } from '../src/lib/sources';

const settings = { token: 'test-token', userId: '1', blogId: '2', from: '2026-10-01', to: '2026-10-03', timezone: 'UTC' };
const series = (...points: [string, number | null][]) => ({
  data: [{ metric: 'm', values: points.map(([dateTime, value]) => ({ dateTime, value })) }],
});

describe('parseTimeline', () => {
  test('one value per day, oldest first, whatever order Metricool sends', () => {
    const body = series(['2026-10-03T12:00:00+0200', 3], ['2026-10-01T12:00:00+0200', 1], ['2026-10-02T12:00:00+0100', 2]);
    expect(parseTimeline(body)).toEqual([
      { date: '2026-10-01', value: 1 },
      { date: '2026-10-02', value: 2 },
      { date: '2026-10-03', value: 3 },
    ]);
  });

  test('drops points that are not numbers, and survives odd shapes', () => {
    expect(parseTimeline(series(['2026-10-01T00:00:00', null], ['bad', 4], ['2026-10-02T00:00:00', 5]))).toEqual([{ date: '2026-10-02', value: 5 }]);
    expect(parseTimeline({ data: [] })).toEqual([]);
    expect(parseTimeline('not json')).toEqual([]);
    expect(parseTimeline([{ dateTime: '2026-10-01T00:00:00', value: 7 }])).toEqual([{ date: '2026-10-01', value: 7 }]);
  });
});

describe('addSeries', () => {
  const points = [
    { date: '2026-10-01', value: 100 },
    { date: '2026-10-02', value: 110 },
  ];
  test('a level keeps the latest reading and the change; a flow adds up', () => {
    const numbers: PlatformNumbers = { daily: {} };
    addSeries(numbers, { network: 'x', metric: 'followers', kind: 'level', as: 'followers' }, points);
    addSeries(numbers, { network: 'x', metric: 'impressions', kind: 'flow', as: 'impressions' }, points);
    expect(numbers.followers).toEqual({ latest: 110, change: 10 });
    expect(numbers.impressions).toBe(210);
    expect(numbers.daily.followers).toEqual(points);
  });

  test('an empty series adds nothing', () => {
    const numbers: PlatformNumbers = { daily: {} };
    addSeries(numbers, { network: 'x', metric: 'reach', kind: 'flow', as: 'reach' }, []);
    expect(numbers).toEqual({ daily: {} });
  });
});

describe('collectMetricool', () => {
  const queries: MetricoolQuery[] = [
    { network: 'twitter', metric: 'followers', subject: 'account', kind: 'level', as: 'followers' },
    { network: 'twitter', metric: 'impressions', subject: 'posts', kind: 'flow', as: 'impressions' },
    { network: 'twitch', metric: 'followers', subject: 'account', kind: 'level', as: 'followers' },
    { network: 'linkedin', metric: 'impressionCount', subject: 'account', kind: 'flow', as: 'impressions' },
  ];
  const urls: string[] = [];
  const fake: FetchJson = async (url, headers) => {
    urls.push(url);
    expect(headers['X-Mc-Auth']).toBe('test-token');
    const metric = new URL(url).searchParams.get('metric');
    const network = new URL(url).searchParams.get('network');
    if (network === 'twitch') return { status: 403, body: 'There is no twitch connection for blog: 2' };
    if (network === 'linkedin') return { status: 500, body: 'oops' };
    return { status: 200, body: series(['2026-10-01T12:00:00+0200', metric === 'followers' ? 50 : 7], ['2026-10-02T12:00:00+0200', metric === 'followers' ? 55 : 8]) };
  };

  test('groups numbers by platform, leaves out networks with no data, and notes what was skipped', async () => {
    const result = await collectMetricool(settings, queries, fake);
    const platforms = (result.metrics as { platforms: Record<string, PlatformNumbers> }).platforms;
    expect(Object.keys(platforms)).toEqual(['x']);
    expect(platforms.x.followers).toEqual({ latest: 55, change: 5 });
    expect(platforms.x.impressions).toBe(15);
    expect(result.status).toBeUndefined();
    expect(result.note).toContain('Networks with data: x');
    expect(result.note).toContain('linkedin impressionCount (HTTP 500)');
    expect(result.note).toContain('Not connected to the brand: twitch');
    const first = new URL(urls[0]).searchParams;
    expect(Object.fromEntries(first)).toMatchObject({ userId: '1', blogId: '2', from: '2026-10-01T00:00:00', to: '2026-10-03T23:59:59', subject: 'account' });
  });

  test('stops with a clear error when the token is refused', async () => {
    const refused: FetchJson = async () => ({ status: 401, body: {} });
    await expect(collectMetricool(settings, queries, refused)).rejects.toThrow(/METRICOOL_API_TOKEN/);
  });

  test('stops with a clear error when the brand cannot be read at all', async () => {
    const forbidden: FetchJson = async () => ({ status: 403, body: {} });
    await expect(collectMetricool(settings, queries, forbidden)).rejects.toThrow(/METRICOOL_BLOG_ID/);
  });

  test('reports a placeholder when no network returns anything', async () => {
    const empty: FetchJson = async () => ({ status: 200, body: { data: [] } });
    const result = await collectMetricool(settings, queries, empty);
    expect(result.status).toBe(STATUS.PLACEHOLDER);
    expect(result.note).toContain('no network on this brand returned any numbers');
  });
});
