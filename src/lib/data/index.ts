// The one place pages get data from. DATA_MODE picks where it comes from:
//   sample    generated data for a fictional organization (the default; no setup)
//   supabase  your own data in Supabase (not available yet)

import config from '../config';
import sources from '../sources';
import { dataMode } from './mode';
import { DEFAULT_LAUNCH_DATE, generateSampleData, type SampleData } from './sample/generate';
import { createSampleStore } from './sample/store';
import type { DataStore } from './types';

/** Sample data shaped by the org config: its launch date, tags, key events and enabled sources. */
export function sampleDataFromConfig(): SampleData {
  return generateSampleData({
    launchDate: config.launch?.date ?? DEFAULT_LAUNCH_DATE,
    launchLabel: config.launch?.label ?? 'product launch',
    activityTypes: config.tags.builtIn,
    suggestedTags: config.tags.suggested,
    keyEvents: config.ga4.keyEvents,
    sources: sources.map(({ id, name, category }) => ({ id, name, category })),
  });
}

let sampleStore: DataStore | undefined;

export function getDataStore(): DataStore {
  const mode = dataMode();
  if (mode === 'supabase') {
    throw new Error('DATA_MODE=supabase is not available yet. Remove DATA_MODE or set it to "sample".');
  }
  sampleStore ??= createSampleStore(sampleDataFromConfig());
  return sampleStore;
}

export { dataMode } from './mode';
export * from './types';
