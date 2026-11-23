// Google Analytics 4, DevRel only: visits and key events (product page clicks,
// demo requests, install page visits) from sessions whose campaign carries the
// DevRel prefix, i.e. that started from a link made with `npm run utm`.
// Site-wide traffic is never asked for, so other teams' work cannot leak in.
//
// Setup:
//   1. Google Cloud console: enable the "Google Analytics Data API" and create
//      a service account. Download its JSON key into ./secrets/ (gitignored).
//   2. GA4 > Admin > Property access management: add the service account's
//      email as a Viewer.
//   3. GA4 > Admin > Property details: copy the numeric Property ID.

import type { protos } from '@google-analytics/data';
import config from '../config';
import { env, listSetting, lookbackDays, type Source } from './core';

type ReportRequest = protos.google.analytics.data.v1beta.IRunReportRequest;
type ReportResponse = protos.google.analytics.data.v1beta.IRunReportResponse;
type Filter = protos.google.analytics.data.v1beta.IFilter;

function rowsToObjects(response: ReportResponse, dims: string[], mets: string[]) {
  return (response.rows ?? []).map((row) => ({
    ...Object.fromEntries(dims.map((d, i) => [d, row.dimensionValues?.[i]?.value ?? ''])),
    ...Object.fromEntries(mets.map((m, i) => [m, Number(row.metricValues?.[i]?.value ?? 0)])),
  }));
}

const ga4: Source = {
  id: 'ga4',
  name: 'Google Analytics 4 (visits from DevRel links)',
  category: 'web',
  setup: [
    'In the Google Cloud console, enable the "Google Analytics Data API" and create a service account. Download its JSON key into ./secrets/ (gitignored).',
    "In GA4 > Admin > Property access management, add the service account's email as a Viewer.",
    'In GA4 > Admin > Property details, copy the numeric Property ID.',
    'Share every link through "npm run utm". Only visits whose campaign starts with the DevRel prefix are counted.',
  ],
  env: [
    { name: 'GA4_PROPERTY_ID', required: true, help: 'Numeric GA4 property ID (Admin > Property details)' },
    { name: 'GOOGLE_APPLICATION_CREDENTIALS', required: true, help: 'Path to the service account JSON key, e.g. ./secrets/ga4-service-account.json' },
    { name: 'GA4_KEY_EVENTS', config: 'ga4.keyEvents', required: false, help: 'Key event names to report, e.g. product_click, demo_request, install_click' },
  ],
  async collect() {
    const { BetaAnalyticsDataClient } = await import('@google-analytics/data');
    const client = new BetaAnalyticsDataClient();
    const property = `properties/${env('GA4_PROPERTY_ID')}`;
    const days = lookbackDays();
    const prefix = config.attribution.campaignPrefix;
    const keyEvents = listSetting(ga4, 'GA4_KEY_EVENTS');
    const report = (dims: string[], mets: string[], extra?: Filter) =>
      runDevrelReport(client, { property, days, prefix, dims, mets, extra });

    const [traffic, events] = await Promise.all([
      report(['date', 'sessionCampaignName', 'sessionSource'], ['sessions', 'engagedSessions']),
      report(
        ['date', 'sessionCampaignName', 'sessionSource', 'eventName'],
        ['keyEvents'],
        keyEvents.length ? { fieldName: 'eventName', inListFilter: { values: keyEvents } } : undefined,
      ),
    ]);

    const points = ga4Points(traffic, events);
    const campaigns = new Set(traffic.map((row) => row.sessionCampaignName));
    return {
      period: { days },
      metrics: { points, campaigns: campaigns.size },
      note: points.length
        ? `${campaigns.size} DevRel ${campaigns.size === 1 ? 'campaign' : 'campaigns'} with visits.`
        : `No visits with a "${prefix}-" campaign yet. Share links made with "npm run utm".`,
    };
  },
};

interface DevrelReport {
  property: string;
  days: number;
  prefix: string;
  dims: string[];
  mets: string[];
  extra?: Filter;
}

type Row = Record<string, string | number>;

/** A GA4 report limited to sessions whose campaign starts with the DevRel prefix. */
async function runDevrelReport(
  client: { runReport: (request: ReportRequest) => Promise<[ReportResponse, ...unknown[]]> },
  { property, days, prefix, dims, mets, extra }: DevrelReport,
): Promise<Row[]> {
  const devrel: Filter = {
    fieldName: 'sessionCampaignName',
    stringFilter: { matchType: 'BEGINS_WITH', value: `${prefix}-`, caseSensitive: false },
  };
  const request: ReportRequest = {
    property,
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }],
    dimensions: dims.map((name) => ({ name })),
    metrics: mets.map((name) => ({ name })),
    dimensionFilter: extra ? { andGroup: { expressions: [{ filter: devrel }, { filter: extra }] } } : { filter: devrel },
    limit: 100000,
  };
  const [response] = await client.runReport(request);
  return rowsToObjects(response, dims, mets);
}

/** GA4's 20261120 as 2026-11-20. */
const day = (value: string | number) => String(value).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');

/**
 * Daily metric points from the DevRel reports: sessions and engaged sessions
 * by campaign and channel (the utm_source), and key events by campaign,
 * channel and event. Rows with nothing in them are left out.
 */
export function ga4Points(traffic: Row[], events: Row[]) {
  const points: { date: string; metric: string; value: number; dimensions: Record<string, string> }[] = [];
  for (const row of traffic) {
    const dimensions = { campaign: String(row.sessionCampaignName).toLowerCase(), channel: String(row.sessionSource) };
    if (Number(row.sessions) > 0) points.push({ date: day(row.date), metric: 'sessions', value: Number(row.sessions), dimensions });
    if (Number(row.engagedSessions) > 0) {
      points.push({ date: day(row.date), metric: 'engaged_sessions', value: Number(row.engagedSessions), dimensions });
    }
  }
  for (const row of events) {
    if (!(Number(row.keyEvents) > 0)) continue;
    points.push({
      date: day(row.date),
      metric: 'key_events',
      value: Number(row.keyEvents),
      dimensions: {
        campaign: String(row.sessionCampaignName).toLowerCase(),
        channel: String(row.sessionSource),
        event: String(row.eventName),
      },
    });
  }
  return points;
}

export default ga4;
