// The one place pages get data from. DATA_MODE picks where it comes from:
//   sample    generated data for a fictional organization (the default; no setup)
//   local     the numbers `npm run collect` has saved in data/snapshots, on this machine only
//   supabase  your own data in Supabase (not available yet)

import config from '../config';
import sources, { checkSources, snapshotDir } from '../sources';
import { dataMode } from './mode';
import { DEFAULT_LAUNCH_DATE, generateSampleData, type SampleData } from './sample/generate';
import { createSampleStore } from './sample/store';
import { createLocalStore, readSnapshots, snapshotsToData, snapshotStamp } from './local/store';
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
let localStore: { stamp: string; store: DataStore } | undefined;

/** The local store, rebuilt whenever `npm run collect` has written a new snapshot. */
function getLocalStore(): DataStore {
  const dir = snapshotDir();
  const stamp = snapshotStamp(dir);
  if (localStore?.stamp !== stamp) {
    const statuses = checkSources(sources).map(({ id, name, category, status, note, missing }) => ({
      id,
      name,
      category,
      status,
      ...(note && { note }),
      ...(missing?.length && { missing }),
    }));
    localStore = { stamp, store: createLocalStore(snapshotsToData(readSnapshots(dir)), statuses, new Date().toISOString().slice(0, 10)) };
  }
  return localStore.store;
}

export function getDataStore(): DataStore {
  const mode = dataMode();
  if (mode === 'supabase') {
    throw new Error('DATA_MODE=supabase is not available yet. Remove DATA_MODE or set it to "sample" or "local".');
  }
  if (mode === 'local') return getLocalStore();
  sampleStore ??= createSampleStore(sampleDataFromConfig());
  return sampleStore;
}

export { dataMode } from './mode';
export * from './types';
