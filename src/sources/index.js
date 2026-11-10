// Every data source the dashboard knows about. To add one (another package
// manager, a new social network), write a source object and list it here.
import cliDistribution from './cli-distribution.js';
import ga4 from './ga4.js';
import social from './social.js';
import business from './business.js';
import manual from './manual.js';

export default [...cliDistribution, ga4, ...social, ...business, ...manual];
