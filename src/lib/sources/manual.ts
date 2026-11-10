// Hand-kept logs. Copy a template from templates/ into data/manual/ (gitignored)
// and add a row per item, or export the matching Google Sheet tab as CSV there.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { num, parseCsv, sum, type CsvRow } from '../csv';
import { STATUS, type Source, type SourceCategory } from './core';

export function manualDir(): string {
  return process.env.MANUAL_DATA_DIR ?? 'data/manual';
}

interface ManualLog {
  id: string;
  name: string;
  category: SourceCategory;
  file: string;
  summarize: (rows: CsvRow[]) => Record<string, unknown>;
}

function manualLog({ id, name, category, file, summarize }: ManualLog): Source {
  return {
    id,
    name,
    category,
    file,
    async collect() {
      const path = join(manualDir(), file);
      let text: string;
      try {
        text = await readFile(path, 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
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

function latestBy(rows: CsvRow[], keyFn: (r: CsvRow) => string): Record<string, CsvRow> {
  const latest: Record<string, CsvRow> = {};
  for (const r of rows) {
    const key = keyFn(r);
    if (!latest[key] || r.date > latest[key].date) latest[key] = r;
  }
  return latest;
}

function countBy(rows: CsvRow[], column: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r[column]] = (counts[r[column]] ?? 0) + 1;
  return counts;
}

const REACH_COLUMNS = ['blog_sessions', 'short_views', 'stream_live_viewers', 'stream_replay_views', 'social_impressions'];

const manual: Source[] = [
  manualLog({
    id: 'follower-counts',
    name: 'Follower and subscriber counts (manual baseline)',
    category: 'social',
    file: 'follower-counts.csv',
    summarize: (rows) => ({
      latest: Object.fromEntries(
        Object.entries(latestBy(rows, (r) => `${r.platform}:${r.account}`)).map(([k, r]) => [
          k,
          { date: r.date, followers: num(r.followers) },
        ]),
      ),
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
      const perPost = rows.map((r) => ({
        title: r.blog_title,
        date: r.publish_date,
        totalReach: REACH_COLUMNS.reduce((t, c) => t + num(r[c]), 0),
        formats: REACH_COLUMNS.filter((c) => num(r[c]) > 0).length,
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
      latest: Object.fromEntries(
        Object.entries(latestBy(rows, (r) => `${r.package_manager}:${r.package}`)).map(([k, r]) => [
          k,
          { date: r.date, period: r.period, installs: num(r.installs) },
        ]),
      ),
    }),
  }),
  manualLog({
    id: 'cross-team',
    name: 'Cross-team contributions (docs, engineering, ...)',
    category: 'capacity',
    file: 'cross-team-contributions.csv',
    summarize: (rows) => ({ byTeam: countBy(rows, 'team') }),
  }),
  manualLog({
    id: 'declined-requests',
    name: 'Demand we could not meet (declined talks, unwritten content)',
    category: 'capacity',
    file: 'declined-requests.csv',
    summarize: (rows) => ({ byType: countBy(rows, 'type') }),
  }),
];

export default manual;
