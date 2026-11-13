import { describe, expect, it } from 'vitest';
import { sampleDataFromConfig } from '@/lib/data';
import type { Activity, ActivityMetric, MetricName, MetricPoint } from '@/lib/data/types';
import {
  averagePerActivity,
  compareMetric,
  comparePeriods,
  contentRollup,
  costPerOutcome,
  cumulative,
  metricBreakdown,
  metricBuckets,
  metricTotal,
  outputRate,
  periodRange,
  projectStaffing,
  rangeDays,
  sparklineValues,
  targetProgress,
} from '@/lib/metrics';

function point(date: string, metric: MetricName, value: number, dimensions?: Record<string, string>): MetricPoint {
  return { date, metric, value, source: 'test', ...(dimensions && { dimensions }) };
}

const installs = [
  point('2027-01-01', 'installs', 10, { channel: 'npm' }),
  point('2027-01-01', 'installs', 4, { channel: 'docker' }),
  point('2027-01-02', 'installs', 20, { channel: 'npm' }),
  point('2027-01-08', 'installs', 30, { channel: 'npm' }),
  point('2027-01-08', 'installs', 6),
];

const followers = [
  point('2027-01-01', 'followers', 100, { platform: 'x' }),
  point('2027-01-01', 'followers', 50, { platform: 'youtube' }),
  point('2027-01-05', 'followers', 110, { platform: 'x' }),
  point('2027-01-09', 'followers', 120, { platform: 'x' }),
  point('2027-01-09', 'followers', 55, { platform: 'youtube' }),
];

describe('rangeDays', () => {
  it('counts both ends', () => {
    expect(rangeDays({ from: '2027-01-01', to: '2027-01-01' })).toBe(1);
    expect(rangeDays({ from: '2027-01-01', to: '2027-01-31' })).toBe(31);
  });

  it('is zero for a range that ends before it starts', () => {
    expect(rangeDays({ from: '2027-01-02', to: '2027-01-01' })).toBe(0);
  });
});

describe('metricTotal', () => {
  it('adds a flow up over the range', () => {
    expect(metricTotal(installs, 'installs')).toBe(70);
    expect(metricTotal(installs, 'installs', { from: '2027-01-01', to: '2027-01-02' })).toBe(34);
    expect(metricTotal(installs, 'installs', { from: '2027-01-08' })).toBe(36);
  });

  it('takes the latest reading of each series for a level', () => {
    expect(metricTotal(followers, 'followers')).toBe(175);
    expect(metricTotal(followers, 'followers', { to: '2027-01-06' })).toBe(160);
  });

  it('is zero with no data, and ignores other metrics and broken values', () => {
    expect(metricTotal([], 'installs')).toBe(0);
    expect(metricTotal(installs, 'signups')).toBe(0);
    expect(metricTotal([...installs, point('2027-01-03', 'installs', Number.NaN)], 'installs')).toBe(70);
  });
});

describe('metricBreakdown', () => {
  it('splits by a dimension, largest first, with shares', () => {
    expect(metricBreakdown(installs, 'installs', 'channel')).toEqual([
      { key: 'npm', value: 60, share: 60 / 70 },
      { key: 'unknown', value: 6, share: 6 / 70 },
      { key: 'docker', value: 4, share: 4 / 70 },
    ]);
  });

  it('uses the latest reading per group for a level', () => {
    expect(metricBreakdown(followers, 'followers', 'platform').map(({ key, value }) => [key, value])).toEqual([
      ['x', 120],
      ['youtube', 55],
    ]);
  });

  it('gives zero shares when everything is zero, and nothing when there is no data', () => {
    expect(metricBreakdown([point('2027-01-01', 'installs', 0, { channel: 'npm' })], 'installs', 'channel')).toEqual([
      { key: 'npm', value: 0, share: 0 },
    ]);
    expect(metricBreakdown([], 'installs', 'channel')).toEqual([]);
  });
});

describe('metricBuckets and sparklineValues', () => {
  it('lines whole buckets up with the end of the range and drops spare days at the start', () => {
    const buckets = metricBuckets(installs, 'installs', { from: '2027-01-01', to: '2027-01-09' }, 4);
    expect(buckets).toEqual([
      { from: '2027-01-02', to: '2027-01-05', value: 20 },
      { from: '2027-01-06', to: '2027-01-09', value: 36 },
    ]);
  });

  it('fills a flow with zero and carries a level forward', () => {
    expect(metricBuckets(installs, 'installs', { from: '2027-01-03', to: '2027-01-08' }, 2).map((b) => b.value)).toEqual([
      0, 0, 36,
    ]);
    expect(metricBuckets(followers, 'followers', { from: '2027-01-03', to: '2027-01-08' }, 2).map((b) => b.value)).toEqual([
      150, 160, 160,
    ]);
  });

  it('gives no buckets for a range shorter than one bucket', () => {
    expect(metricBuckets(installs, 'installs', { from: '2027-01-01', to: '2027-01-03' }, 7)).toEqual([]);
    expect(metricBuckets(installs, 'installs', { from: '2027-01-05', to: '2027-01-01' })).toEqual([]);
  });

  it('returns the last N buckets for a sparkline', () => {
    expect(sparklineValues(installs, 'installs', '2027-01-08', { count: 4, days: 2 })).toEqual([34, 0, 0, 36]);
    expect(sparklineValues([], 'installs', '2027-01-08')).toEqual(Array(12).fill(0));
  });
});

describe('cumulative', () => {
  it('keeps a running total and treats broken values as zero', () => {
    expect(cumulative([1, 2, 3])).toEqual([1, 3, 6]);
    expect(cumulative([1, Number.NaN, 3])).toEqual([1, 1, 4]);
    expect(cumulative([])).toEqual([]);
  });
});

describe('comparePeriods', () => {
  it('compares totals when no lengths are given or the lengths match', () => {
    expect(comparePeriods(120, 100)).toEqual({ current: 120, previous: 100, change: 0.2, basis: 'total' });
    expect(comparePeriods(120, 100, { current: 30, previous: 30 }).basis).toBe('total');
  });

  it('compares daily averages when the periods differ in length', () => {
    // 300 over 30 days is 10 a day; 100 over 20 days is 5 a day.
    expect(comparePeriods(300, 100, { current: 30, previous: 20 })).toEqual({
      current: 300,
      previous: 100,
      change: 1,
      basis: 'daily_average',
    });
  });

  it('has no change when the earlier value is zero', () => {
    expect(comparePeriods(50, 0).change).toBeUndefined();
    expect(comparePeriods(0, 0, { current: 10, previous: 20 }).change).toBeUndefined();
  });

  it('falls back to totals when a length is zero', () => {
    expect(comparePeriods(10, 5, { current: 0, previous: 20 })).toMatchObject({ change: 1, basis: 'total' });
  });
});

describe('compareMetric', () => {
  it('compares a flow by daily average across periods of different length', () => {
    const result = compareMetric(
      installs,
      'installs',
      { from: '2027-01-08', to: '2027-01-08' },
      { from: '2027-01-01', to: '2027-01-02' },
    );
    // 36 in one day against 34 in two (17 a day).
    expect(result).toMatchObject({ current: 36, previous: 34, basis: 'daily_average' });
    expect(result.change).toBeCloseTo(36 / 17 - 1);
  });

  it('compares a level reading with reading, whatever the lengths', () => {
    const result = compareMetric(
      followers,
      'followers',
      { from: '2027-01-02', to: '2027-01-09' },
      { from: '2027-01-01', to: '2027-01-01' },
    );
    expect(result).toMatchObject({ current: 175, previous: 150, basis: 'total' });
    expect(result.change).toBeCloseTo(1 / 6);
  });

  it('has no change when the earlier period has no data', () => {
    expect(
      compareMetric(installs, 'installs', { from: '2027-01-01', to: '2027-01-08' }, { from: '2026-12-01', to: '2026-12-08' })
        .change,
    ).toBeUndefined();
  });
});

describe('periodRange', () => {
  it('reads quarters, months and years', () => {
    expect(periodRange('2027-Q1')).toEqual({ from: '2027-01-01', to: '2027-03-31' });
    expect(periodRange('2026-Q4')).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(periodRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(periodRange('2027')).toEqual({ from: '2027-01-01', to: '2027-12-31' });
  });

  it.each(['2027-Q5', '2027-13', 'Q1', '', '2027-1'])('is undefined for %j', (period) => {
    expect(periodRange(period)).toBeUndefined();
  });
});

describe('targetProgress', () => {
  it('reports the fraction and what is left', () => {
    expect(targetProgress(250, 1000)).toEqual({ actual: 250, target: 1000, fraction: 0.25, remaining: 750, met: false });
  });

  it('marks a target as met once reached, with nothing left', () => {
    expect(targetProgress(1200, 1000)).toMatchObject({ fraction: 1.2, remaining: 0, met: true });
    expect(targetProgress(1000, 1000).met).toBe(true);
  });

  it('has no fraction when there is no real target', () => {
    for (const target of [0, -5, Number.NaN]) {
      expect(targetProgress(10, target)).toMatchObject({ fraction: undefined, remaining: 0, met: false });
    }
  });

  it('says whether the pace is on track', () => {
    const quarter = { from: '2027-01-01', to: '2027-03-31' }; // 90 days
    expect(targetProgress(500, 1000, quarter, '2027-02-14')).toMatchObject({ expected: 0.5, onTrack: true });
    expect(targetProgress(400, 1000, quarter, '2027-02-14')).toMatchObject({ expected: 0.5, onTrack: false });
  });

  it('keeps the expected pace between 0 and 1 outside the period', () => {
    const quarter = { from: '2027-01-01', to: '2027-03-31' };
    expect(targetProgress(0, 1000, quarter, '2026-12-01')).toMatchObject({ expected: 0, onTrack: true });
    expect(targetProgress(900, 1000, quarter, '2027-06-01')).toMatchObject({ expected: 1, onTrack: false });
  });
});

describe('costPerOutcome', () => {
  it('adds rows with the same channel and sorts cheapest first', () => {
    expect(
      costPerOutcome([
        { channel: 'conference', costUsd: 3000, outcomes: 10 },
        { channel: 'content', costUsd: 500, outcomes: 25 },
        { channel: 'conference', costUsd: 1000, outcomes: 10 },
      ]),
    ).toEqual([
      { channel: 'content', costUsd: 500, outcomes: 25, costPerOutcome: 20 },
      { channel: 'conference', costUsd: 4000, outcomes: 20, costPerOutcome: 200 },
    ]);
  });

  it('leaves the cost per outcome out when there were no outcomes, and lists those last', () => {
    expect(
      costPerOutcome([
        { channel: 'sponsorship', costUsd: 2000, outcomes: 0 },
        { channel: 'meetup', costUsd: 100, outcomes: 4 },
        { channel: 'unknown' },
      ]),
    ).toEqual([
      { channel: 'meetup', costUsd: 100, outcomes: 4, costPerOutcome: 25 },
      { channel: 'sponsorship', costUsd: 2000, outcomes: 0 },
      { channel: 'unknown', costUsd: 0, outcomes: 0 },
    ]);
  });

  it('treats free outcomes as costing nothing, and ignores broken numbers', () => {
    expect(costPerOutcome([{ channel: 'community', outcomes: 5 }])[0].costPerOutcome).toBe(0);
    expect(costPerOutcome([{ channel: 'x', costUsd: Number.NaN, outcomes: -3 }])).toEqual([
      { channel: 'x', costUsd: 0, outcomes: 0 },
    ]);
    expect(costPerOutcome([])).toEqual([]);
  });
});

function activity(id: string, type: string, date: string, parentId?: string): Activity {
  return { id, type, title: id, date, tags: [type], ...(parentId && { parentId }) };
}

function metric(activityId: string, platform: string, name: ActivityMetric['metric'], value: number): ActivityMetric {
  return { activityId, platform, metric: name, value };
}

describe('contentRollup', () => {
  const activities = [
    activity('post-1', 'blog', '2027-01-04'),
    activity('stream-1', 'livestream', '2027-01-08', 'post-1'),
    activity('short-1', 'short', '2027-01-06', 'post-1'),
    activity('clip-1', 'short', '2027-01-09', 'stream-1'),
    activity('post-2', 'blog', '2027-01-18'),
    activity('talk-1', 'talk', '2027-01-20'),
    activity('orphan', 'short', '2027-01-21', 'deleted-post'),
  ];
  const metrics = [
    metric('post-1', 'blog', 'views', 1000),
    metric('post-1', 'x', 'reach', 400),
    metric('post-1', 'x', 'engagements', 90),
    metric('short-1', 'youtube', 'views', 2000),
    metric('stream-1', 'youtube', 'live_viewers', 100),
    metric('stream-1', 'youtube', 'peak_viewers', 150),
    metric('stream-1', 'twitch', 'replay_views', 300),
    metric('clip-1', 'youtube', 'views', 200),
    metric('post-2', 'blog', 'views', 500),
    metric('talk-1', 'in-person', 'reach', 9999),
    metric('orphan', 'youtube', 'views', 9999),
  ];

  it('rolls every derived format up into its original post', () => {
    const [first, second] = contentRollup(activities, metrics);
    expect(first.post.id).toBe('post-1');
    expect(first.derived.map((a) => a.id)).toEqual(['short-1', 'stream-1', 'clip-1']);
    expect(first.pieces).toBe(4);
    expect(first.postReach).toBe(1400);
    expect(first.totalReach).toBe(4000);
    expect(first.multiplier).toBeCloseTo(4000 / 1400);
    expect(first.byFormat).toEqual([
      { format: 'short', reach: 2200 },
      { format: 'blog', reach: 1400 },
      { format: 'livestream', reach: 400 },
    ]);
    expect(first.byPlatform).toEqual([
      { platform: 'youtube', reach: 2300 },
      { platform: 'blog', reach: 1000 },
      { platform: 'x', reach: 400 },
      { platform: 'twitch', reach: 300 },
    ]);
    expect(second).toMatchObject({ pieces: 1, totalReach: 500, postReach: 500, multiplier: 1, derived: [] });
  });

  it('leaves out other activity types and pieces whose post is missing', () => {
    expect(contentRollup(activities, metrics).map((row) => row.post.id)).toEqual(['post-1', 'post-2']);
    expect(contentRollup(activities, metrics, ['talk']).map((row) => row.post.id)).toEqual(['talk-1']);
  });

  it('handles posts with no numbers yet', () => {
    expect(contentRollup([activity('post-1', 'blog', '2027-01-04')], [])).toEqual([
      expect.objectContaining({ totalReach: 0, postReach: 0, byFormat: [], byPlatform: [] }),
    ]);
    expect(contentRollup([activity('post-1', 'blog', '2027-01-04')], [])[0]).not.toHaveProperty('multiplier');
    expect(contentRollup([], [])).toEqual([]);
  });

  it('does not hang on activities that are each other’s parent', () => {
    const loop = [activity('a', 'blog', '2027-01-01', 'b'), activity('b', 'short', '2027-01-02', 'a')];
    expect(contentRollup(loop, [])).toEqual([]);
  });
});

describe('outputRate and averagePerActivity', () => {
  const activities = [
    activity('a', 'blog', '2027-01-01'),
    activity('b', 'blog', '2027-01-15'),
    activity('c', 'talk', '2027-01-20'),
    activity('d', 'blog', '2027-03-01'),
  ];
  const january = { from: '2027-01-01', to: '2027-01-30' };

  it('counts activities per 30 days by default', () => {
    expect(outputRate(activities, january)).toBe(3);
    expect(outputRate(activities, january, ['blog'])).toBe(2);
    expect(outputRate(activities, { from: '2027-01-01', to: '2027-03-01' }, ['blog'], 7)).toBeCloseTo((3 / 60) * 7);
  });

  it('is zero for an empty range or no activities', () => {
    expect(outputRate(activities, { from: '2027-02-01', to: '2027-01-01' })).toBe(0);
    expect(outputRate([], january)).toBe(0);
  });

  it('averages a result per activity, and is zero with none', () => {
    expect(averagePerActivity(1700, 2)).toBe(850);
    expect(averagePerActivity(1700, 0)).toBe(0);
    expect(averagePerActivity(Number.NaN, 2)).toBe(0);
  });
});

describe('projectStaffing', () => {
  it('doubles a one-person team’s output with one more person', () => {
    expect(projectStaffing({ outputPerPeriod: 2, outcomesPerOutput: { sessions: 850, signups: 12 } })).toEqual({
      current: 2,
      projected: 4,
      addedOutput: 2,
      addedOutcomes: { sessions: 1700, signups: 24 },
    });
  });

  it('scales by team size, people added and ramp-up', () => {
    expect(projectStaffing({ outputPerPeriod: 6, people: 3, addedPeople: 2, rampFactor: 0.5 })).toMatchObject({
      projected: 8,
      addedOutput: 2,
    });
  });

  it('adds nothing when there is nothing to scale from', () => {
    expect(projectStaffing({ outputPerPeriod: 0 })).toMatchObject({ current: 0, projected: 0, addedOutput: 0 });
    expect(projectStaffing({ outputPerPeriod: 4, people: 0 }).addedOutput).toBe(0);
    expect(projectStaffing({ outputPerPeriod: 4, addedPeople: 0 }).projected).toBe(4);
    expect(projectStaffing({ outputPerPeriod: Number.NaN }).projected).toBe(0);
  });

  it('keeps the ramp factor between 0 and 1', () => {
    expect(projectStaffing({ outputPerPeriod: 4, rampFactor: 3 }).addedOutput).toBe(4);
    expect(projectStaffing({ outputPerPeriod: 4, rampFactor: -1 }).addedOutput).toBe(0);
  });
});

describe('with the sample data', () => {
  const data = sampleDataFromConfig();

  it('gives a 12-point sparkline of real numbers for every metric', () => {
    for (const name of ['installs', 'sessions', 'followers', 'active_users'] as const) {
      const values = sparklineValues(data.metricPoints, name, data.range.to);
      expect(values).toHaveLength(12);
      expect(values.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
    }
  });

  it('rolls every blog post up with at least its own reach', () => {
    const rows = contentRollup(data.activities, data.activityMetrics);
    expect(rows).toHaveLength(data.activities.filter((a) => a.type === 'blog').length);
    expect(rows.every((row) => row.totalReach >= row.postReach && row.postReach > 0)).toBe(true);
    expect(rows.some((row) => row.pieces > 1)).toBe(true);
  });

  it('breaks installs down by channel with shares that add up to 1', () => {
    const rows = metricBreakdown(data.metricPoints, 'installs', 'channel');
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1);
  });
});
