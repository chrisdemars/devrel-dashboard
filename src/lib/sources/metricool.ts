// Metricool: followers, impressions, reach and interactions for every social
// network connected to one Metricool brand. Its API needs the Advanced plan
// or above.
//
// Every number comes from the timelines endpoint (one call per network and
// metric), documented in Metricool's Swagger file:
// https://app.metricool.com/api/swagger.json. A network that is not connected
// to the brand answers 403 ("There is no twitch connection for blog: ...") or
// returns no points, and is left out of the result.
//
// Metricool does not report live viewers per livestream, so stream numbers
// still come from the platforms or a manual log.

import { env, lookbackDays, STATUS, type CollectResult, type Source } from './core';

const API = 'https://app.metricool.com/api/v2/analytics/timelines';

/** One time series to ask for. `level` is a reading (followers), `flow` adds up over days (impressions). */
export interface MetricoolQuery {
  network: string;
  metric: string;
  subject?: string;
  kind: 'level' | 'flow';
  /** The name it is stored under, shared across networks. */
  as: 'followers' | 'impressions' | 'reach' | 'views' | 'interactions';
}

/** What the dashboard asks Metricool for. Metric names are Metricool's, per network. */
export const METRICOOL_QUERIES: MetricoolQuery[] = [
  { network: 'twitter', metric: 'followers', subject: 'account', kind: 'level', as: 'followers' },
  { network: 'twitter', metric: 'impressions', subject: 'posts', kind: 'flow', as: 'impressions' },
  { network: 'twitter', metric: 'interactions', subject: 'posts', kind: 'flow', as: 'interactions' },
  { network: 'linkedin', metric: 'followers', subject: 'account', kind: 'level', as: 'followers' },
  { network: 'linkedin', metric: 'impressionCount', subject: 'account', kind: 'flow', as: 'impressions' },
  { network: 'linkedin', metric: 'interactions', subject: 'posts', kind: 'flow', as: 'interactions' },
  { network: 'facebook', metric: 'pageFollows', subject: 'account', kind: 'level', as: 'followers' },
  { network: 'facebook', metric: 'impressions', subject: 'posts', kind: 'flow', as: 'impressions' },
  { network: 'facebook', metric: 'interactions', subject: 'posts', kind: 'flow', as: 'interactions' },
  { network: 'instagram', metric: 'reach', subject: 'posts', kind: 'flow', as: 'reach' },
  { network: 'instagram', metric: 'interactions', subject: 'posts', kind: 'flow', as: 'interactions' },
  { network: 'youtube', metric: 'views', kind: 'flow', as: 'views' },
  { network: 'youtube', metric: 'interactions', kind: 'flow', as: 'interactions' },
  { network: 'twitch', metric: 'followers', subject: 'account', kind: 'level', as: 'followers' },
  { network: 'twitch', metric: 'views', subject: 'account', kind: 'flow', as: 'views' },
];

/** Metricool's network names, as the dashboard names platforms. */
const PLATFORM: Record<string, string> = { twitter: 'x' };

export interface DailyValue {
  date: string;
  value: number;
}

export interface PlatformNumbers {
  /** Latest reading, and the change since the first reading in the period. */
  followers?: { latest: number; change: number };
  impressions?: number;
  reach?: number;
  views?: number;
  interactions?: number;
  /** Day-by-day values behind the numbers above, oldest first. */
  daily: Partial<Record<MetricoolQuery['as'], DailyValue[]>>;
}

/**
 * The points in a timelines response, one per day, oldest first. Metricool
 * dates carry the brand's time zone ("2026-10-21T12:00:00+0200"); the day is
 * taken as written. Anything that is not a number is dropped.
 */
export function parseTimeline(body: unknown): DailyValue[] {
  const data = (body as { data?: unknown })?.data ?? body;
  const values = Array.isArray(data) && data.length > 0 && Array.isArray(data[0]?.values) ? data[0].values : data;
  if (!Array.isArray(values)) return [];
  const byDay = new Map<string, number>();
  for (const point of values) {
    const day = typeof point?.dateTime === 'string' ? point.dateTime.slice(0, 10) : undefined;
    const value = Number(point?.value);
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day) && point?.value !== null && Number.isFinite(value)) byDay.set(day, value);
  }
  return [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

/** Adds one series to a platform: the latest reading for a level, the total for a flow. */
export function addSeries(into: PlatformNumbers, query: MetricoolQuery, points: DailyValue[]): void {
  if (points.length === 0) return;
  into.daily[query.as] = points;
  if (query.kind === 'level') {
    into.followers = { latest: points.at(-1)!.value, change: points.at(-1)!.value - points[0].value };
  } else {
    into[query.as as Exclude<MetricoolQuery['as'], 'followers'>] = points.reduce((sum, point) => sum + point.value, 0);
  }
}

export interface MetricoolSettings {
  token: string;
  userId: string;
  blogId: string;
  from: string;
  to: string;
  timezone: string;
}

/** Fetches JSON; returns the HTTP status alongside so one failing metric does not stop the rest. */
export type FetchJson = (url: string, headers: Record<string, string>) => Promise<{ status: number; body: unknown }>;

const fetchJson: FetchJson = async (url, headers) => {
  const res = await fetch(url, { headers: { 'user-agent': 'devrel-dashboard', accept: 'application/json', ...headers } });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Kept as text for the error message.
  }
  return { status: res.status, body };
};

/** Asks for every query and puts the results together by platform. */
export async function collectMetricool(
  settings: MetricoolSettings,
  queries: MetricoolQuery[] = METRICOOL_QUERIES,
  get: FetchJson = fetchJson,
): Promise<CollectResult> {
  const platforms: Record<string, PlatformNumbers> = {};
  const skipped: string[] = [];
  const notConnected = new Set<string>();
  let refused = 0;

  for (const query of queries) {
    const params = new URLSearchParams({
      userId: settings.userId,
      blogId: settings.blogId,
      network: query.network,
      metric: query.metric,
      from: `${settings.from}T00:00:00`,
      to: `${settings.to}T23:59:59`,
      timezone: settings.timezone,
      ...(query.subject && { subject: query.subject }),
    });
    const { status, body } = await get(`${API}?${params}`, { 'X-Mc-Auth': settings.token });
    // A bad token fails every call, so stop at the first.
    if (status === 401) throw new Error(`401 from Metricool: check METRICOOL_API_TOKEN`);
    // 403 means this network is not connected to the brand, or the brand cannot be read at all.
    if (status === 403) {
      refused += 1;
      notConnected.add(PLATFORM[query.network] ?? query.network);
      continue;
    }
    if (status !== 200) {
      skipped.push(`${query.network} ${query.metric} (HTTP ${status})`);
      continue;
    }
    const platform = PLATFORM[query.network] ?? query.network;
    const numbers = (platforms[platform] ??= { daily: {} });
    addSeries(numbers, query, parseTimeline(body));
  }

  if (queries.length > 0 && refused === queries.length) {
    throw new Error(`403 from Metricool for every network: check that the token can read brand ${settings.blogId} (METRICOOL_BLOG_ID)`);
  }
  // Networks with nothing at all are not connected to the brand.
  for (const [platform, numbers] of Object.entries(platforms)) {
    if (Object.keys(numbers.daily).length === 0) delete platforms[platform];
  }
  const missing = [...notConnected].filter((platform) => !platforms[platform]).sort();
  const connected = Object.keys(platforms).sort();
  return {
    metrics: { range: { from: settings.from, to: settings.to }, platforms },
    ...(connected.length === 0 && { status: STATUS.PLACEHOLDER }),
    note:
      connected.length === 0
        ? 'Metricool answered, but no network on this brand returned any numbers. Check which networks are connected to the brand.'
        : [
            `Networks with data: ${connected.join(', ')}.`,
            missing.length > 0 && `Not connected to the brand: ${missing.join(', ')}.`,
            skipped.length > 0 && `Skipped: ${skipped.join('; ')}.`,
          ]
            .filter(Boolean)
            .join(' '),
  };
}

/** Today's date in UTC, moved by `days`. */
function day(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export const metricool: Source = {
  id: 'metricool',
  name: 'Metricool (X, LinkedIn, Facebook, Instagram, YouTube, Twitch)',
  category: 'social',
  env: [
    { name: 'METRICOOL_API_TOKEN', required: true, help: 'Metricool > Account settings > API: the access token' },
    { name: 'METRICOOL_USER_ID', required: true, help: 'The number after userId= in the Metricool app address' },
    { name: 'METRICOOL_BLOG_ID', required: true, help: 'The number after blogId= in the app address, with your brand open' },
    { name: 'METRICOOL_TIMEZONE', required: false, help: "Time zone for the days, e.g. 'Europe/Madrid'. UTC by default" },
  ],
  setup: [
    'Metricool\'s API needs the Advanced plan or above. The token is under Account settings > API.',
    'Open your brand in the Metricool app. The address contains userId=... and blogId=...: those are the other two settings.',
    'Run "npm run collect". Networks connected to the brand are picked up on their own.',
  ],
  collect: () =>
    collectMetricool({
      token: env('METRICOOL_API_TOKEN')!,
      userId: env('METRICOOL_USER_ID')!,
      blogId: env('METRICOOL_BLOG_ID')!,
      // The last full days, ending yesterday.
      from: day(-lookbackDays()),
      to: day(-1),
      timezone: env('METRICOOL_TIMEZONE') ?? 'UTC',
    }),
};
