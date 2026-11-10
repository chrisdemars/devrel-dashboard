// The dashboard pages shown in the top navigation, in order.
// Labels come from `pages` in the org config.

import type { PageId } from './config/schema';

export const NAV_PAGES: { id: PageId; href: string }[] = [
  { id: 'overview', href: '/' },
  { id: 'launch', href: '/launch' },
  { id: 'content', href: '/content' },
  { id: 'streams', href: '/streams' },
  { id: 'events', href: '/events' },
  { id: 'pipeline', href: '/pipeline' },
  { id: 'capacity', href: '/capacity' },
  { id: 'activity', href: '/activity' },
  { id: 'sources', href: '/sources' },
];
