// The dashboard pages shown in the top navigation, in order.
// Labels come from `pages` in the org config.

import type { PageId } from './config/schema';

/** `filtered` pages show the filter bar; links between them keep the filters. */
export const NAV_PAGES: { id: PageId; href: string; filtered: boolean }[] = [
  { id: 'overview', href: '/', filtered: true },
  { id: 'launch', href: '/launch', filtered: true },
  { id: 'content', href: '/content', filtered: true },
  { id: 'streams', href: '/streams', filtered: true },
  { id: 'events', href: '/events', filtered: true },
  { id: 'pipeline', href: '/pipeline', filtered: true },
  { id: 'capacity', href: '/capacity', filtered: true },
  { id: 'activity', href: '/activity', filtered: true },
  { id: 'sources', href: '/sources', filtered: false },
];
