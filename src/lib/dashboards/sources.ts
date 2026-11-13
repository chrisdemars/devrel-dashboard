// The Data sources page: every connector grouped by category, with its state,
// what it still needs, how to set it up and when it last collected.

import { STATUS, type Snapshot, type SourceCategory, type SourceResult, type SourceStatus } from '../sources';

export interface SourceCard {
  id: string;
  category: SourceCategory;
  name: string;
  status: SourceStatus;
  /** Settings or files still needed. Names only, never values. */
  missing: string[];
  /** Why there is no data feed yet, for a placeholder. */
  note?: string;
  /** How to connect it: steps first, then what each missing setting is. */
  setup: string[];
  /** Settings a future connector would read. */
  planned: string[];
  /** The last `npm run collect` for this source. */
  lastRun?: { at: string; status: SourceStatus; error?: string };
}

export interface SourcesPage {
  /** One entry per status, in a fixed order, zero counts included. */
  counts: { status: SourceStatus; label: string; count: number }[];
  groups: { category: SourceCategory; label: string; sources: SourceCard[] }[];
  /** When `npm run collect` last ran. Undefined when it never has. */
  lastCollectedAt?: string;
  summary: string;
}

const CATEGORY_ORDER: SourceCategory[] = ['cli', 'web', 'social', 'content', 'events', 'business', 'capacity'];
const CATEGORY_LABELS: Record<SourceCategory, string> = {
  cli: 'Packages and installs',
  web: 'Website',
  social: 'Social and video',
  content: 'Content',
  events: 'Events',
  business: 'Business impact',
  capacity: 'Capacity',
};

export const STATUS_LABELS: Record<SourceStatus, string> = {
  ok: 'Connected',
  not_configured: 'Not set up',
  placeholder: 'Access needed',
  error: 'Error',
};
const STATUS_ORDER: SourceStatus[] = [STATUS.OK, STATUS.NOT_CONFIGURED, STATUS.PLACEHOLDER, STATUS.ERROR];

/**
 * Lays out the results of the status check. A source's state is what the
 * check says, except that a failed last collection shows as an error: the
 * settings are there, but the pull did not work.
 */
export function getSourcesPage(results: SourceResult[], snapshot?: Snapshot): SourcesPage {
  const cards = results.map((result): SourceCard => {
    const last = snapshot?.sources[result.id];
    const failed = result.status === STATUS.OK && last?.status === STATUS.ERROR;
    return {
      id: result.id,
      category: result.category,
      name: result.name,
      status: failed ? STATUS.ERROR : result.status,
      missing: result.missing ?? [],
      ...(result.note && { note: result.note }),
      setup: [...(result.setup ?? []), ...(result.help ?? [])],
      planned: result.plannedConfig ?? [],
      ...(snapshot && last && { lastRun: { at: snapshot.generatedAt, status: last.status, ...(last.error && { error: last.error }) } }),
    };
  });

  const categories = [...CATEGORY_ORDER, ...new Set(cards.map((card) => card.category).filter((c) => !CATEGORY_ORDER.includes(c)))];
  const count = (status: SourceStatus) => cards.filter((card) => card.status === status).length;
  const connected = count(STATUS.OK);

  return {
    counts: STATUS_ORDER.map((status) => ({ status, label: STATUS_LABELS[status], count: count(status) })),
    groups: categories
      .map((category) => ({
        category,
        label: CATEGORY_LABELS[category] ?? category,
        sources: cards.filter((card) => card.category === category),
      }))
      .filter((group) => group.sources.length > 0),
    ...(snapshot && { lastCollectedAt: snapshot.generatedAt }),
    summary:
      cards.length === 0
        ? 'No sources are enabled. Check sources.enabled in devrel.config.ts.'
        : `${connected} of ${cards.length} sources ${connected === 1 ? 'is' : 'are'} connected.`,
  };
}
