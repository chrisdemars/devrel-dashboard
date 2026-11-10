// A DataStore that answers from generated sample data held in memory.

import { inRange } from '../dates';
import type { DataFilter, DataStore, DealTotals, InfluencedDeal } from '../types';
import type { SampleData } from './generate';

function hasAnyTag(tags: string[], wanted: string[] | undefined): boolean {
  return !wanted?.length || wanted.some((tag) => tags.includes(tag));
}

function matches(item: { date: string; tags: string[] }, filter: DataFilter = {}): boolean {
  return inRange(item.date, filter) && hasAnyTag(item.tags, filter.tags);
}

export function summarizeDeals(deals: InfluencedDeal[]): DealTotals {
  const won = deals.filter((deal) => deal.stage === 'won');
  const sum = (items: InfluencedDeal[]) => items.reduce((total, deal) => total + deal.amountUsd, 0);
  const touchpoints = [...new Set(deals.map((deal) => deal.touchpoint))].sort();
  return {
    count: deals.length,
    amountUsd: sum(deals),
    wonCount: won.length,
    wonAmountUsd: sum(won),
    byTouchpoint: touchpoints.map((touchpoint) => {
      const group = deals.filter((deal) => deal.touchpoint === touchpoint);
      return { touchpoint, count: group.length, amountUsd: sum(group) };
    }),
  };
}

export function createSampleStore(data: SampleData): DataStore {
  const deals = (range = {}) => data.deals.filter((deal) => inRange(deal.date, range));

  return {
    mode: 'sample',
    getDateRange: async () => data.range,
    getTags: async () => data.tags,
    getActivities: async (filter) => data.activities.filter((activity) => matches(activity, filter)),
    getActivityMetrics: async (filter) => {
      const ids = new Set(data.activities.filter((activity) => matches(activity, filter)).map((activity) => activity.id));
      return data.activityMetrics.filter((metric) => ids.has(metric.activityId));
    },
    getConferences: async (filter) => data.conferences.filter((conference) => matches(conference, filter)),
    getInfluencedDeals: async (range) => deals(range),
    getDealTotals: async (range) => summarizeDeals(deals(range)),
    getMetricPoints: async (query = {}) =>
      data.metricPoints.filter((p) => inRange(p.date, query) && (!query.metrics?.length || query.metrics.includes(p.metric))),
    getSourceStatuses: async () => data.sourceStatuses,
    getTargets: async () => data.targets,
    getReportNotes: async (period) => data.reportNotes.filter((note) => !period || note.period === period),
    getDeclinedRequests: async (range = {}) => data.declinedRequests.filter((request) => inRange(request.date, range)),
  };
}
