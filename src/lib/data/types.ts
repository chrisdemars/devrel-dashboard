// The data the dashboards read, whatever it is stored in.
// Dates are ISO strings: YYYY-MM-DD for days, full timestamps where noted.

import type { SourceCategory, SourceStatus } from '../sources/core';

/** Something DevRel did: a blog post, a video, a talk, a contribution to another team. */
export interface Activity {
  id: string;
  /** One of the built-in tags from the org config, e.g. 'blog' or 'talk'. */
  type: string;
  title: string;
  date: string;
  url?: string;
  /** The utm_campaign used on links from this activity. */
  utmCampaign?: string;
  costUsd?: number;
  estAudience?: number;
  notes?: string;
  /** The blog post this was made from, for a short, stream or social post. */
  parentId?: string;
  /** The activity type plus any free-form tags. */
  tags: string[];
}

export interface Tag {
  name: string;
  /** 'type' for the built-in activity types, 'custom' for free-form tags. */
  kind: 'type' | 'custom';
}

/** One number an activity produced on one platform, e.g. 1,200 views on YouTube. */
export interface ActivityMetric {
  activityId: string;
  /** e.g. 'blog', 'youtube', 'twitch', 'linkedin', 'x'. */
  platform: string;
  metric: ActivityMetricName;
  value: number;
}

export type ActivityMetricName =
  | 'views'
  | 'reach'
  | 'engagements'
  | 'live_viewers'
  | 'peak_viewers'
  | 'replay_views'
  /** Key events on the site in visits that started on this piece, e.g. a demo request after reading a post. */
  | 'key_events';

export type CfpStatus = 'given' | 'accepted' | 'submitted' | 'rejected' | 'invited' | 'declined';

export interface Conference {
  id: string;
  /** The talk activity, once the talk has been given. */
  activityId?: string;
  name: string;
  date: string;
  location?: string;
  cfpStatus: CfpStatus;
  estAudience?: number;
  qrScans?: number;
  /** Site sessions that arrived through this conference's UTM link. */
  siteVisits?: number;
  leadsToSales?: number;
  costUsd?: number;
  tags: string[];
}

/** A deal sales linked to DevRel. Sensitive: only admins see individual deals. */
export interface InfluencedDeal {
  id: string;
  date: string;
  name: string;
  amountUsd: number;
  stage: 'open' | 'won' | 'lost';
  /** What DevRel did, e.g. 'conference', 'demo', 'content'. */
  touchpoint: string;
  activityId?: string;
}

/** Deal numbers that are safe to show every viewer. */
export interface DealTotals {
  count: number;
  amountUsd: number;
  wonCount: number;
  wonAmountUsd: number;
  byTouchpoint: { touchpoint: string; count: number; amountUsd: number }[];
}

/** One value of a metric on one day, e.g. installs from npm on 2026-12-20. */
export interface MetricPoint {
  date: string;
  metric: MetricName;
  value: number;
  /** The id of the source it came from, e.g. 'npm' or 'ga4'. */
  source: string;
  /** What splits the metric, e.g. { channel: 'npm' } or { event: 'demo_request' }. */
  dimensions?: Record<string, string>;
}

export const METRICS = [
  'installs', // per day, by channel
  'signups', // per day, by heard_from
  'activations', // per day: first real use after install
  'active_users', // weekly active users, dated at the week's start
  'sessions', // per day, by channel
  'engaged_sessions', // per day, by channel
  'key_events', // per day, by event
  'followers', // total on that day, by platform
] as const;

export type MetricName = (typeof METRICS)[number];

export interface SourceStatusInfo {
  id: string;
  name: string;
  category: SourceCategory;
  status: SourceStatus;
  note?: string;
  missing?: string[];
  /** Full timestamp of the last successful collection. */
  lastCollectedAt?: string;
}

/** A goal for a metric over a period such as '2027-Q1'. */
export interface Target {
  metric: MetricName | 'influenced_pipeline_usd';
  period: string;
  value: number;
}

export type ReportSection = 'so_what' | 'working' | 'not_working' | 'ask';

/** Text written for the leadership report. */
export interface ReportNote {
  id: string;
  /** e.g. '2027-Q1'. */
  period: string;
  section: ReportSection;
  /** For 'so_what' notes: the metric the line sits under. */
  metric?: MetricName | 'influenced_pipeline_usd';
  text: string;
}

/** Work DevRel had to turn down. It shows demand beyond current capacity. */
export interface DeclinedRequest {
  id: string;
  date: string;
  kind: 'conference' | 'content' | 'workshop' | 'cross-team';
  title: string;
  reason: string;
}

export interface DateRange {
  /** First day, inclusive. */
  from: string;
  /** Last day, inclusive. */
  to: string;
}

export interface DataFilter extends Partial<DateRange> {
  /** Keep items that have at least one of these tags. Empty or missing keeps everything. */
  tags?: string[];
}

export interface MetricQuery extends Partial<DateRange> {
  /** Leave out for every metric. */
  metrics?: MetricName[];
}

export type DataMode = 'sample' | 'supabase';

/**
 * Everything the dashboards can ask for. Each implementation (sample data,
 * Supabase) answers the same questions, so pages never know where data lives.
 */
export interface DataStore {
  readonly mode: DataMode;
  /** The days the store has data for. Dashboards treat `to` as "today". */
  getDateRange(): Promise<DateRange>;
  getTags(): Promise<Tag[]>;
  getActivities(filter?: DataFilter): Promise<Activity[]>;
  /** Metrics for the activities that match the filter. */
  getActivityMetrics(filter?: DataFilter): Promise<ActivityMetric[]>;
  getConferences(filter?: DataFilter): Promise<Conference[]>;
  /** Individual deals. Only call this for admins. */
  getInfluencedDeals(range?: Partial<DateRange>): Promise<InfluencedDeal[]>;
  getDealTotals(range?: Partial<DateRange>): Promise<DealTotals>;
  getMetricPoints(query?: MetricQuery): Promise<MetricPoint[]>;
  getSourceStatuses(): Promise<SourceStatusInfo[]>;
  getTargets(): Promise<Target[]>;
  getReportNotes(period?: string): Promise<ReportNote[]>;
  getDeclinedRequests(range?: Partial<DateRange>): Promise<DeclinedRequest[]>;
}
