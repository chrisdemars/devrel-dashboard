// Every data source the dashboard knows about. To add one (another package
// manager, a new social network), write a Source object and list it here.
import business from './business';
import cliDistribution from './cli-distribution';
import type { Source } from './core';
import ga4 from './ga4';
import manual from './manual';
import social from './social';

const sources: Source[] = [...cliDistribution, ga4, ...social, ...business, ...manual];
export default sources;

export * from './core';
export { manualDir } from './manual';
