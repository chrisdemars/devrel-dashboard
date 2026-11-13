// The numbers on the Events page: talks given, standing with conference
// organizers, what each conference cost and produced, and invitations turned down.

import { inRange } from '../data/dates';
import type { CfpStatus, Conference, DataStore, DateRange, DeclinedRequest } from '../data/types';
import { comparisonRange, type FilterContext, type Filters } from '../filters';
import { formatNumber, formatPercent, formatUsd } from '../format';
import { comparePeriods, costPerOutcome, rangeDays, sumBuckets, trendBucketDays } from '../metrics';
import { bucketName, chartBucketDays, rowLabels, type ChartRow } from './shared';
import { standing, type Standing } from './standing';

export interface EventsKpi extends Standing {
  id: string;
  label: string;
  value: string;
  trend: number[];
  note: string;
  /** 'down' for costs. */
  goodWhen?: 'up' | 'down';
}

export interface ConferenceRow {
  id: string;
  name: string;
  date: string;
  location?: string;
  audience: number;
  qrScans: number;
  siteVisits: number;
  leads: number;
  costUsd: number;
  /** Undefined when the conference produced no leads. */
  costPerLead?: number;
}

export interface Events {
  kpis: EventsKpi[];
  audience: { rows: ChartRow[]; total: number; bucket: string; caption: string };
  cfp: {
    /** Accepted talks (given or still to come) as a part of all decided submissions. Undefined when none are decided. */
    acceptanceRate?: number;
    byStatus: { status: CfpStatus; label: string; count: number }[];
    caption: string;
  };
  conferences: { rows: ConferenceRow[]; totals: Omit<ConferenceRow, 'id' | 'name' | 'date' | 'location'>; caption: string };
  declined: { count: number; rows: { id: string; title: string; date: string; reason?: string }[]; caption: string };
}

const STATUS_LABELS: Record<CfpStatus, string> = {
  given: 'Talk given',
  accepted: 'Accepted, still to come',
  submitted: 'Submitted, waiting to hear',
  rejected: 'Not accepted',
  invited: 'Invited',
  declined: 'Invitation declined',
};
const STATUS_ORDER: CfpStatus[] = ['given', 'accepted', 'submitted', 'rejected', 'invited', 'declined'];

const sum = (rows: Conference[], field: 'estAudience' | 'qrScans' | 'siteVisits' | 'leadsToSales' | 'costUsd') =>
  rows.reduce((total, row) => total + (row[field] ?? 0), 0);

export async function getEvents(store: DataStore, filters: Filters, context: FilterContext): Promise<Events> {
  const range: DateRange = { from: filters.from, to: filters.to };
  const compareWith = comparisonRange(filters, context);
  const days = compareWith && { current: rangeDays(range), previous: rangeDays(compareWith) };
  const tags = filters.tags.length > 0 ? { tags: filters.tags } : {};

  // Every conference with these tags; upcoming ones fall after the selected range.
  const [all, declinedRequests] = await Promise.all([store.getConferences(tags), store.getDeclinedRequests(range)]);
  const given = (within: DateRange) => all.filter((c) => c.cfpStatus === 'given' && inRange(c.date, within));
  const talks = given(range);
  const previous = compareWith ? given(compareWith) : [];

  const audience = sum(talks, 'estAudience');
  const leads = sum(talks, 'leadsToSales');
  const cost = sum(talks, 'costUsd');
  const perLead = leads > 0 ? cost / leads : undefined;
  const previousLeads = sum(previous, 'leadsToSales');
  const previousPerLead = previousLeads > 0 ? sum(previous, 'costUsd') / previousLeads : 0;

  const trendDays = trendBucketDays(range);
  const trend = (value: (c: Conference) => number) =>
    sumBuckets(talks.map((c) => ({ date: c.date, value: value(c) })), range, trendDays).map((bucket) => bucket.value);

  // ---- Per conference ----
  const costs = new Map(
    costPerOutcome(talks.map((c) => ({ channel: c.id, costUsd: c.costUsd, outcomes: c.leadsToSales }))).map((row) => [row.channel, row]),
  );
  const rows: ConferenceRow[] = talks
    .map((c) => ({
      id: c.id,
      name: c.name,
      date: c.date,
      ...(c.location && { location: c.location }),
      audience: c.estAudience ?? 0,
      qrScans: c.qrScans ?? 0,
      siteVisits: c.siteVisits ?? 0,
      leads: c.leadsToSales ?? 0,
      costUsd: c.costUsd ?? 0,
      ...(costs.get(c.id)?.costPerOutcome !== undefined && { costPerLead: costs.get(c.id)!.costPerOutcome }),
    }))
    .sort((a, b) => (a.costPerLead ?? Infinity) - (b.costPerLead ?? Infinity) || b.date.localeCompare(a.date));
  const cheapest = rows.find((row) => row.costPerLead !== undefined);

  // ---- Audience over time ----
  const bucketDays = chartBucketDays(range);
  const audienceRows: ChartRow[] = sumBuckets(
    talks.map((c) => ({ date: c.date, value: c.estAudience ?? 0 })),
    range,
    bucketDays,
  ).map((bucket) => ({ ...rowLabels(bucket), values: { audience: bucket.value } }));
  const largest = [...talks].sort((a, b) => (b.estAudience ?? 0) - (a.estAudience ?? 0))[0];

  // ---- Standing: submissions in the range, plus anything still to come ----
  const submissions = all.filter((c) => inRange(c.date, range) || c.date > context.today);
  const count = (status: CfpStatus) => submissions.filter((c) => c.cfpStatus === status).length;
  const accepted = count('given') + count('accepted');
  const decided = accepted + count('rejected');
  const acceptanceRate = decided > 0 ? accepted / decided : undefined;

  // ---- Turned down: logged requests plus invitations marked declined ----
  const declinedRows = [
    ...declinedRequests
      .filter((request: DeclinedRequest) => request.kind === 'conference' || request.kind === 'workshop')
      .map(({ id, title, date, reason }) => ({ id, title, date, reason })),
    ...all
      .filter((c) => c.cfpStatus === 'declined' && inRange(c.date, range))
      .map((c) => ({ id: c.id, title: `Invitation to speak at ${c.name}`, date: c.date })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const kpis: EventsKpi[] = [
    {
      id: 'talks',
      label: 'Talks given',
      value: formatNumber(talks.length),
      ...standing(filters, days && comparePeriods(talks.length, previous.length, days)),
      trend: trend(() => 1),
      note:
        count('accepted') > 0
          ? `${count('accepted')} more ${count('accepted') === 1 ? 'is' : 'are'} accepted and still to come.`
          : talks.length > 0
            ? 'No further talks are booked yet.'
            : 'No talks match these filters.',
    },
    {
      id: 'audience',
      label: 'Estimated audience',
      value: formatNumber(audience),
      ...standing(filters, days && comparePeriods(audience, sum(previous, 'estAudience'), days)),
      trend: trend((c) => c.estAudience ?? 0),
      note:
        talks.length > 0
          ? `About ${formatNumber(Math.round(audience / talks.length))} people in the room per talk.`
          : 'No talks match these filters.',
    },
    {
      id: 'leads',
      label: 'Leads passed to sales',
      value: formatNumber(leads),
      ...standing(filters, days && comparePeriods(leads, previousLeads, days)),
      trend: trend((c) => c.leadsToSales ?? 0),
      note:
        sum(talks, 'qrScans') > 0
          ? `${formatPercent(leads / sum(talks, 'qrScans'))} of QR scans became a conversation with sales.`
          : 'No QR scans recorded for these talks.',
    },
    {
      id: 'cost_per_lead',
      label: 'Cost per lead',
      value: perLead === undefined ? '–' : formatUsd(Math.round(perLead)),
      ...standing(filters, compareWith && perLead !== undefined ? comparePeriods(perLead, previousPerLead) : undefined),
      goodWhen: 'down',
      trend: [],
      note: perLead === undefined ? 'No leads recorded for these talks.' : `${formatUsd(cost)} spent on ${talks.length} ${talks.length === 1 ? 'conference' : 'conferences'}.`,
    },
  ];

  return {
    kpis,
    audience: {
      rows: audienceRows,
      total: audience,
      bucket: bucketName(bucketDays),
      caption: largest
        ? `${largest.name} was the largest room, with about ${formatNumber(largest.estAudience ?? 0)} people.`
        : 'No talks match these filters.',
    },
    cfp: {
      ...(acceptanceRate !== undefined && { acceptanceRate }),
      byStatus: STATUS_ORDER.map((status) => ({ status, label: STATUS_LABELS[status], count: count(status) })).filter((row) => row.count > 0),
      caption:
        acceptanceRate === undefined
          ? 'No talk submissions have been decided yet.'
          : `${accepted} of ${decided} decided submissions were accepted. Organizers saying yes is a sign of standing in the community.`,
    },
    conferences: {
      rows,
      totals: {
        audience,
        qrScans: sum(talks, 'qrScans'),
        siteVisits: sum(talks, 'siteVisits'),
        leads,
        costUsd: cost,
        ...(perLead !== undefined && { costPerLead: perLead }),
      },
      caption: cheapest
        ? `${cheapest.name} produced leads most cheaply, at ${formatUsd(Math.round(cheapest.costPerLead!))} each.`
        : talks.length > 0
          ? 'None of these conferences has produced a lead yet.'
          : 'No talks match these filters.',
    },
    declined: {
      count: declinedRows.length,
      rows: declinedRows,
      caption:
        declinedRows.length > 0
          ? 'Each one is an audience we could not reach at current capacity.'
          : 'No invitations were turned down in this period.',
    },
  };
}
