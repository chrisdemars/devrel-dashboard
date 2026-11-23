// How each number on the dashboard is tied to DevRel. Every headline number
// carries one of these, and only numbers that can be traced to DevRel work
// are shown: company-wide totals never are. See "Attribution" in the README.

export const ATTRIBUTIONS = ['produced', 'direct', 'tracked', 'influenced'] as const;
export type Attribution = (typeof ATTRIBUTIONS)[number];

export const ATTRIBUTION_LABELS: Record<Attribution, string> = {
  produced: 'Produced',
  direct: 'Direct',
  tracked: 'Tracked',
  influenced: 'Influenced',
};

/** One sentence per level, for tooltips and the report's "How we count" section. */
export const ATTRIBUTION_DEFINITIONS: Record<Attribution, string> = {
  produced: 'Work DevRel did: posts, videos, streams, talks and help given to other teams.',
  direct: 'The audience of something DevRel made: its viewers, readers and attendees.',
  tracked: 'Actions that came through a DevRel link, QR code or code: visits, key events, sign-ups and installs.',
  influenced: 'Deals where sales confirmed a DevRel touchpoint. Influenced, not sourced.',
};
