import { afterEach, describe, expect, test } from 'vitest';
import { dataMode, getDataStore, sampleDataFromConfig } from '../src/lib/data';
import { addDays, addMonths, daysBetween, eachDay, inRange, quarterOf, weekday } from '../src/lib/data/dates';
import { DEFAULT_KEY_EVENTS, generateSampleData, type SampleOptions } from '../src/lib/data/sample/generate';
import { createRandom } from '../src/lib/data/sample/random';
import { createSampleStore, summarizeDeals } from '../src/lib/data/sample/store';
import { METRICS } from '../src/lib/data/types';
import { BUILT_IN_TAGS } from '../src/lib/config/schema';

const options: SampleOptions = {
  launchDate: '2026-12-15',
  launchLabel: 'Acme CLI launch',
  activityTypes: BUILT_IN_TAGS,
  suggestedTags: ['launch', 'npm'],
  keyEvents: ['demo_request', 'install_click'],
  sources: [
    { id: 'npm', name: 'npm downloads', category: 'cli' },
    { id: 'crm', name: 'CRM', category: 'business' },
  ],
};
const data = generateSampleData(options);
const store = createSampleStore(data);

describe('dates', () => {
  test('day arithmetic crosses months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    expect(daysBetween('2026-12-15', '2027-01-14')).toBe(30);
    expect(daysBetween('2026-12-15', '2026-12-10')).toBe(-5);
  });

  test('adding months clamps to the end of a shorter month', () => {
    expect(addMonths('2026-12-15', -4)).toBe('2026-08-15');
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });

  test('eachDay includes both ends and is empty for a reversed range', () => {
    expect(eachDay('2026-12-30', '2027-01-01')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
    expect(eachDay('2027-01-02', '2027-01-01')).toEqual([]);
  });

  test('weekday, quarter and range checks', () => {
    expect(weekday('2026-12-15')).toBe(2); // a Tuesday
    expect(quarterOf('2026-12-31')).toBe('2026-Q4');
    expect(quarterOf('2027-01-01')).toBe('2027-Q1');
    expect(inRange('2026-12-15', { from: '2026-12-15', to: '2026-12-15' })).toBe(true);
    expect(inRange('2026-12-16', { to: '2026-12-15' })).toBe(false);
    expect(inRange('2026-12-16')).toBe(true);
  });
});

test('the random generator repeats for a seed and differs between seeds', () => {
  const draw = (seed: number) => Array.from({ length: 5 }, createRandom(seed).next);
  expect(draw(7)).toEqual(draw(7));
  expect(draw(7)).not.toEqual(draw(8));
  const random = createRandom(1);
  for (let i = 0; i < 200; i += 1) {
    const n = random.int(3, 5);
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(5);
  }
});

describe('generateSampleData', () => {
  test('is identical across runs', () => {
    expect(generateSampleData(options)).toEqual(data);
  });

  test('a different seed gives different numbers', () => {
    expect(generateSampleData({ ...options, seed: 1 }).metricPoints).not.toEqual(data.metricPoints);
  });

  test('covers four months before the launch to three months after', () => {
    expect(data.range).toEqual({ from: '2026-08-15', to: '2027-03-15' });
    for (const item of [...data.activities, ...data.deals, ...data.metricPoints, ...data.declinedRequests]) {
      expect(inRange(item.date, data.range), item.date).toBe(true);
    }
  });

  test('follows the launch date it is given', () => {
    const moved = generateSampleData({ ...options, launchDate: '2027-06-01' });
    expect(moved.range).toEqual({ from: '2027-02-01', to: '2027-09-01' });
    expect(moved.metricPoints.filter((p) => p.metric === 'installs').every((p) => p.date >= '2027-06-01')).toBe(true);
  });

  test('every activity type is covered, and only the types asked for', () => {
    expect([...new Set(data.activities.map((a) => a.type))].sort()).toEqual([...BUILT_IN_TAGS].sort());
    const fewer = generateSampleData({ ...options, activityTypes: ['blog', 'talk'] });
    expect([...new Set(fewer.activities.map((a) => a.type))].sort()).toEqual(['blog', 'talk']);
  });

  test('ids are unique, and derived activities point at a blog post', () => {
    const ids = data.activities.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const byId = new Map(data.activities.map((a) => [a.id, a]));
    const derived = data.activities.filter((a) => a.parentId);
    expect(derived.length).toBeGreaterThan(0);
    for (const activity of derived) {
      expect(byId.get(activity.parentId!)?.type).toBe('blog');
      expect(activity.date >= byId.get(activity.parentId!)!.date).toBe(true);
    }
  });

  test('every activity carries its type as a tag, and every tag is listed', () => {
    const known = new Set(data.tags.map((t) => t.name));
    for (const activity of data.activities) {
      expect(activity.tags).toContain(activity.type);
      for (const tag of activity.tags) expect(known.has(tag), tag).toBe(true);
    }
    expect(data.tags.filter((t) => t.kind === 'type').map((t) => t.name)).toEqual(BUILT_IN_TAGS);
    expect(data.tags.map((t) => t.name)).toEqual(expect.arrayContaining(['launch', 'npm']));
  });

  test('activity metrics belong to real activities and are whole, non-negative numbers', () => {
    const ids = new Set(data.activities.map((a) => a.id));
    for (const metric of data.activityMetrics) {
      expect(ids.has(metric.activityId)).toBe(true);
      expect(Number.isInteger(metric.value) && metric.value >= 0).toBe(true);
    }
  });

  test('product metrics start on launch day; site metrics cover the whole window', () => {
    const first = (metric: string) => data.metricPoints.filter((p) => p.metric === metric).map((p) => p.date).sort()[0];
    for (const metric of ['installs', 'signups', 'activations']) expect(first(metric)).toBe('2026-12-15');
    expect(first('sessions')).toBe('2026-08-15');
    expect(new Set(data.metricPoints.map((p) => p.metric))).toEqual(new Set(METRICS));
  });

  test('key events use the names from the config, or defaults when there are none', () => {
    const events = (d: typeof data) => [...new Set(d.metricPoints.filter((p) => p.metric === 'key_events').map((p) => p.dimensions?.event))];
    expect(events(data)).toEqual(['demo_request', 'install_click']);
    expect(events(generateSampleData({ ...options, keyEvents: [] }))).toEqual(DEFAULT_KEY_EVENTS);
  });

  test('talks given have costs and leads, and link to a talk activity; upcoming ones are dated after the window', () => {
    const given = data.conferences.filter((c) => c.cfpStatus === 'given');
    expect(given.length).toBeGreaterThan(0);
    for (const conference of given) {
      expect(conference.costUsd).toBeGreaterThan(0);
      expect(conference.leadsToSales).toBeGreaterThan(0);
      expect(data.activities.find((a) => a.id === conference.activityId)?.type).toBe('talk');
    }
    for (const conference of data.conferences.filter((c) => c.cfpStatus === 'accepted' || c.cfpStatus === 'submitted')) {
      expect(conference.date > data.range.to).toBe(true);
    }
  });

  test('sources not connected in the sample are marked, and the rest have a collection time', () => {
    const status = (id: string) => data.sourceStatuses.find((s) => s.id === id);
    expect(status('crm')).toMatchObject({ status: 'placeholder' });
    expect(status('npm')).toMatchObject({ status: 'ok', lastCollectedAt: '2027-03-15T06:00:00.000Z' });
  });

  test('targets and report notes exist for every quarter in the window', () => {
    for (const quarter of ['2026-Q3', '2026-Q4', '2027-Q1']) {
      expect(data.targets.some((t) => t.period === quarter)).toBe(true);
      const sections = new Set(data.reportNotes.filter((n) => n.period === quarter).map((n) => n.section));
      expect(sections).toEqual(new Set(['so_what', 'working', 'not_working', 'ask']));
    }
    // There is nothing to install before the launch quarter.
    expect(data.targets.some((t) => t.metric === 'installs' && t.period === '2026-Q3')).toBe(false);
  });
});

describe('the sample store', () => {
  test('filters activities by date and by tag (any of the tags)', async () => {
    expect(await store.getActivities()).toHaveLength(data.activities.length);
    const blogs = await store.getActivities({ tags: ['blog'] });
    expect(blogs.length).toBeGreaterThan(0);
    expect(blogs.every((a) => a.type === 'blog')).toBe(true);
    const either = await store.getActivities({ tags: ['blog', 'talk'] });
    expect(new Set(either.map((a) => a.type))).toEqual(new Set(['blog', 'talk']));
    const december = await store.getActivities({ from: '2026-12-01', to: '2026-12-31' });
    expect(december.length).toBeGreaterThan(0);
    expect(december.every((a) => a.date.startsWith('2026-12'))).toBe(true);
    expect(await store.getActivities({ tags: ['no-such-tag'] })).toEqual([]);
    expect(await store.getActivities({ tags: [] })).toHaveLength(data.activities.length);
  });

  test('activity metrics follow the activity filter', async () => {
    const talks = new Set((await store.getActivities({ tags: ['talk'] })).map((a) => a.id));
    const metrics = await store.getActivityMetrics({ tags: ['short'] });
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics.every((m) => m.activityId.startsWith('short-') && !talks.has(m.activityId))).toBe(true);
  });

  test('metric points filter by metric and date', async () => {
    const points = await store.getMetricPoints({ metrics: ['installs'], from: '2027-01-01', to: '2027-01-07' });
    expect(points).toHaveLength(7 * 4); // seven days, four install channels
    expect(points.every((p) => p.metric === 'installs')).toBe(true);
    expect(await store.getMetricPoints()).toHaveLength(data.metricPoints.length);
  });

  test('deal totals add up without exposing individual deals', async () => {
    const deals = await store.getInfluencedDeals();
    const totals = await store.getDealTotals();
    expect(totals.count).toBe(deals.length);
    expect(totals.amountUsd).toBe(deals.reduce((sum, d) => sum + d.amountUsd, 0));
    expect(totals.byTouchpoint.reduce((sum, t) => sum + t.count, 0)).toBe(deals.length);
    expect(JSON.stringify(totals)).not.toContain('Account');
    expect(summarizeDeals([])).toEqual({ count: 0, amountUsd: 0, wonCount: 0, wonAmountUsd: 0, byTouchpoint: [] });
  });

  test('report notes filter by period', async () => {
    const notes = await store.getReportNotes('2027-Q1');
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((n) => n.period === '2027-Q1')).toBe(true);
  });

  test('reports its mode and date range', async () => {
    expect(store.mode).toBe('sample');
    expect(await store.getDateRange()).toEqual(data.range);
  });
});

describe('DATA_MODE', () => {
  afterEach(() => {
    delete process.env.DATA_MODE;
  });

  test('defaults to sample', () => {
    expect(dataMode()).toBe('sample');
    expect(getDataStore().mode).toBe('sample');
  });

  test('accepts sample in any case, with spaces', () => {
    process.env.DATA_MODE = ' Sample ';
    expect(dataMode()).toBe('sample');
  });

  test('an unknown value names the valid ones', () => {
    process.env.DATA_MODE = 'postgres';
    expect(() => dataMode()).toThrow('DATA_MODE is "postgres". Use one of: sample, supabase.');
  });

  test('supabase is not available yet and says so', () => {
    process.env.DATA_MODE = 'supabase';
    expect(() => getDataStore()).toThrow(/not available yet/);
  });

  test('sample data built from the org config works with the active config', () => {
    const fromConfig = sampleDataFromConfig();
    expect(fromConfig.activities.length).toBeGreaterThan(0);
    expect(fromConfig.sourceStatuses.length).toBeGreaterThan(0);
  });
});
