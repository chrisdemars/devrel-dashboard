// Google Analytics 4: blog and site traffic, plus key events
// (e.g. product page clicks, demo requests, install page visits).
//
// Setup (once you're logged in to GA4):
//   1. Google Cloud console: enable the "Google Analytics Data API" and create
//      a service account. Download its JSON key into ./secrets/ (gitignored).
//   2. GA4 > Admin > Property access management: add the service account's
//      email as a Viewer.
//   3. GA4 > Admin > Property details: copy the numeric Property ID.

import { env, envList, lookbackDays } from '../lib/source.js';

function rowsToObjects(response, dims, mets) {
  return (response.rows ?? []).map((row) => ({
    ...Object.fromEntries(dims.map((d, i) => [d, row.dimensionValues[i].value])),
    ...Object.fromEntries(mets.map((m, i) => [m, Number(row.metricValues[i].value)])),
  }));
}

export default {
  id: 'ga4',
  name: 'Google Analytics 4 (blog and site)',
  category: 'web',
  env: [
    { name: 'GA4_PROPERTY_ID', required: true, help: 'Numeric GA4 property ID (Admin > Property details)' },
    { name: 'GOOGLE_APPLICATION_CREDENTIALS', required: true, help: 'Path to the service account JSON key, e.g. ./secrets/ga4-service-account.json' },
    { name: 'GA4_BLOG_PATH_PREFIX', required: false, help: 'Limit the top-pages report to blog posts, e.g. /blog/' },
    { name: 'GA4_KEY_EVENTS', required: false, help: 'Comma-separated key event names to report, e.g. product_click,demo_request,cli_install_click' },
  ],
  async collect() {
    const { BetaAnalyticsDataClient } = await import('@google-analytics/data');
    const client = new BetaAnalyticsDataClient();
    const property = `properties/${env('GA4_PROPERTY_ID')}`;
    const days = lookbackDays();
    const dateRanges = [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }];

    const report = async ({ dims, mets, filter, limit, orderBy }) => {
      const [res] = await client.runReport({
        property,
        dateRanges,
        dimensions: dims.map((name) => ({ name })),
        metrics: mets.map((name) => ({ name })),
        ...(filter && { dimensionFilter: { filter } }),
        ...(orderBy && { orderBys: [{ metric: { metricName: orderBy }, desc: true }] }),
        ...(limit && { limit }),
      });
      return rowsToObjects(res, dims, mets);
    };

    const prefix = env('GA4_BLOG_PATH_PREFIX');
    const keyEvents = envList('GA4_KEY_EVENTS');

    const [byChannel, topPages, events] = await Promise.all([
      report({
        dims: ['sessionDefaultChannelGroup'],
        mets: ['sessions', 'engagedSessions', 'userEngagementDuration', 'keyEvents'],
        orderBy: 'sessions',
      }),
      report({
        dims: ['pagePath', 'pageTitle'],
        mets: ['screenPageViews', 'sessions', 'engagedSessions', 'keyEvents'],
        filter: prefix && { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: prefix } },
        orderBy: 'screenPageViews',
        limit: 10,
      }),
      report({
        dims: ['eventName'],
        mets: ['keyEvents'],
        filter: keyEvents.length && { fieldName: 'eventName', inListFilter: { values: keyEvents } },
        orderBy: 'keyEvents',
      }),
    ]);

    return {
      period: { days },
      metrics: { byChannel, topPages, keyEvents: events },
      ...(!keyEvents.length && { note: 'GA4_KEY_EVENTS not set: showing every event marked as a key event.' }),
    };
  },
};
