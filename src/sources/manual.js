// Hand-kept logs. Copy a template from templates/ into data/manual/ (gitignored)
// and add a row per item, or export the matching Google Sheet tab as CSV there.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsv, num, sum } from '../lib/csv.js';
import { STATUS } from '../lib/source.js';

export const MANUAL_DIR = process.env.MANUAL_DATA_DIR ?? 'data/manual';

function manualLog({ id, name, category, file, summarize }) {
  return {
    id,
    name,
    category,
    file,
    async collect() {
      const path = join(MANUAL_DIR, file);
      let text;
      try {
        text = await readFile(path, 'utf8');
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        return {
          status: STATUS.NOT_CONFIGURED,
          missing: [path],
          help: [`Copy templates/${file} to ${path} and start logging.`],
        };
      }
      const rows = parseCsv(text);
      return { metrics: { rows: rows.length, ...summarize(rows) } };
    },
  };
}

const latestBy = (rows, keyFn) => {
  const latest = {};
  for (const r of rows) {
    const key = keyFn(r);
    if (!latest[key] || r.date > latest[key].date) latest[key] = r;
  }
  return latest;
};

export default [
  manualLog({
    id: 'follower-counts',
    name: 'Follower and subscriber counts (manual baseline)',
    category: 'social',
    file: 'follower-counts.csv',
    summarize: (rows) => ({
      latest: Object.fromEntries(Object.entries(latestBy(rows, (r) => `${r.platform}:${r.account}`))
        .map(([k, r]) => [k, { date: r.date, followers: num(r.followers) }])),
    }),
  }),
  manualLog({
    id: 'conferences',
    name: 'Conference talks and leads',
    category: 'events',
    file: 'conferences.csv',
    summarize: (rows) => {
      const talks = rows.filter((r) => r.cfp_status === 'accepted' || r.cfp_status === 'given');
      const submitted = rows.filter((r) => r.cfp_status && r.cfp_status !== 'invited');
      const leads = sum(rows, 'leads_to_sales');
      const cost = sum(rows, 'cost_usd');
      return {
        talks: talks.length,
        cfpAcceptanceRate: submitted.length ? talks.length / submitted.length : null,
        estAudience: sum(talks, 'est_audience'),
        qrScans: sum(rows, 'qr_scans'),
        leadsToSales: leads,
        costUsd: cost,
        costPerLead: leads ? cost / leads : null,
      };
    },
  }),
  manualLog({
    id: 'content-multiplier',
    name: 'Content multiplier (blog > short > stream > social)',
    category: 'content',
    file: 'content-multiplier.csv',
    summarize: (rows) => {
      const reachCols = ['blog_sessions', 'short_views', 'stream_live_viewers', 'stream_replay_views', 'social_impressions'];
      const perPost = rows.map((r) => ({
        title: r.blog_title,
        date: r.publish_date,
        totalReach: reachCols.reduce((t, c) => t + num(r[c]), 0),
        formats: reachCols.filter((c) => num(r[c]) > 0).length,
      }));
      return {
        posts: rows.length,
        totalReach: perPost.reduce((t, p) => t + p.totalReach, 0),
        top: perPost.sort((a, b) => b.totalReach - a.totalReach).slice(0, 5),
      };
    },
  }),
  manualLog({
    id: 'sales-flagged-deals',
    name: 'Deals sales flagged as DevRel-influenced',
    category: 'business',
    file: 'sales-flagged-deals.csv',
    summarize: (rows) => ({ deals: rows.length, amountUsd: sum(rows, 'amount_usd') }),
  }),
  manualLog({
    id: 'facebook-export',
    name: 'Facebook monthly export',
    category: 'social',
    file: 'facebook-export.csv',
    summarize: (rows) => ({ reach: sum(rows, 'reach'), views: sum(rows, 'views'), engagements: sum(rows, 'engagements') }),
  }),
  manualLog({
    id: 'other-package-installs',
    name: 'Installs from other package managers (manual)',
    category: 'cli',
    file: 'other-package-installs.csv',
    summarize: (rows) => ({
      latest: Object.fromEntries(Object.entries(latestBy(rows, (r) => `${r.package_manager}:${r.package}`))
        .map(([k, r]) => [k, { date: r.date, period: r.period, installs: num(r.installs) }])),
    }),
  }),
  manualLog({
    id: 'cross-team',
    name: 'Cross-team contributions (docs, engineering, ...)',
    category: 'capacity',
    file: 'cross-team-contributions.csv',
    summarize: (rows) => ({
      byTeam: rows.reduce((acc, r) => ({ ...acc, [r.team]: (acc[r.team] ?? 0) + 1 }), {}),
    }),
  }),
  manualLog({
    id: 'declined-requests',
    name: 'Demand we could not meet (declined talks, unwritten content)',
    category: 'capacity',
    file: 'declined-requests.csv',
    summarize: (rows) => ({
      byType: rows.reduce((acc, r) => ({ ...acc, [r.type]: (acc[r.type] ?? 0) + 1 }), {}),
    }),
  }),
];
