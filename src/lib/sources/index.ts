// Every data source the dashboard knows about. To add one (another package
// manager, a new social network), write a Source object and list it here.
// `sources.enabled` in devrel.config.ts picks which of them are used.
import config, { ConfigError } from '../config';
import business from './business';
import cliDistribution from './cli-distribution';
import type { Source } from './core';
import ga4 from './ga4';
import manual from './manual';
import social from './social';

export const allSources: Source[] = [...cliDistribution, ga4, ...social, ...business, ...manual];

/** The sources picked by `enabled`: 'all', or a list of ids. Unknown ids are an error. */
export function selectSources(all: Source[], enabled: 'all' | string[]): Source[] {
  if (enabled === 'all') return all;
  const known = new Set(all.map((s) => s.id));
  const unknown = enabled.filter((id) => !known.has(id));
  if (unknown.length) {
    throw new ConfigError([
      `sources.enabled: unknown source ${unknown.map((id) => `"${id}"`).join(', ')}. Known sources: ${[...known].join(', ')}`,
    ]);
  }
  return all.filter((s) => enabled.includes(s.id));
}

const sources: Source[] = selectSources(allSources, config.sources.enabled);
export default sources;

export * from './core';
export { manualDir } from './manual';
