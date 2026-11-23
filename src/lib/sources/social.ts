// Social, video and livestream sources. Only Metricool for now: it reports
// single posts and videos, so DevRel's own can be picked out of company accounts.

import type { Source } from './core';
import { metricool } from './metricool';

const social: Source[] = [metricool];
export default social;
export { metricool };
