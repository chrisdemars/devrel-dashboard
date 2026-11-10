// The UTM naming convention, in code. Pure functions, no I/O.
//
// Every shared link gets the same three answers: where it was posted
// (utm_source), what kind of place that is (utm_medium) and what it promotes
// (utm_campaign). Fixing the first two per channel keeps the analytics reports
// free of near-duplicates such as "YouTube", "youtube.com" and "yt".
//
// Every value is lowercase ASCII with words joined by hyphens.

/** A mistake in the input (bad URL, unknown channel, missing value). The message is safe to show as is. */
export class UtmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UtmError';
  }
}

interface Channel {
  /** A fixed utm_source. Left out when the source comes from the platform or the event. */
  source?: string;
  medium: string;
  /** The utm_content used when none is given. */
  content?: string;
  /** The source is one of these platforms. */
  platforms?: readonly string[];
  /** The source is any platform name, with this one as the default. */
  defaultPlatform?: string;
  /** The source is the event slug. */
  event?: boolean;
  use: string;
}

export const LIVESTREAM_PLATFORMS = ['youtube', 'twitch', 'linkedin', 'x', 'facebook'] as const;

const CHANNELS = {
  youtube: { source: 'youtube', medium: 'video', use: 'Video descriptions and pinned comments' },
  'youtube-short': { source: 'youtube', medium: 'video', content: 'short', use: 'Short-form video descriptions' },
  livestream: { medium: 'livestream', platforms: LIVESTREAM_PLATFORMS, use: 'Stream descriptions, overlays and chat' },
  x: { source: 'x', medium: 'social', use: 'Posts on X' },
  linkedin: { source: 'linkedin', medium: 'social', use: 'Posts on LinkedIn' },
  facebook: { source: 'facebook', medium: 'social', use: 'Posts on Facebook' },
  blog: { source: 'blog', medium: 'referral', use: 'Links from one of your blog posts to another page' },
  newsletter: { source: 'newsletter', medium: 'email', use: 'Newsletters and other email' },
  conference: { medium: 'conference', content: 'slides', event: true, use: 'Conference slides and the QR code on them' },
  community: { medium: 'community', defaultPlatform: 'discord', use: 'Discord, forums and other community spaces' },
} satisfies Record<string, Channel>;

export type ChannelId = keyof typeof CHANNELS;

export const CHANNEL_IDS = Object.keys(CHANNELS) as ChannelId[];

export interface ChannelInfo {
  id: ChannelId;
  /** The utm_source, or a placeholder such as "<platform>" when it depends on the input. */
  source: string;
  medium: string;
  /** The default utm_content, if the channel has one. */
  content?: string;
  use: string;
}

export interface UtmParams {
  source: string;
  medium: string;
  campaign: string;
  content?: string;
  term?: string;
}

export interface UtmInput {
  /** One of CHANNEL_IDS. */
  channel: string;
  /** What is being promoted, e.g. "cli-launch". Optional for a conference, where it defaults to the event. */
  campaign?: string;
  content?: string;
  term?: string;
  /** Livestream (required) and community (optional): where the link is posted. */
  platform?: string;
  /** Conference: the event name, e.g. "ExampleConf". */
  event?: string;
  /** Conference: the event's year or date, e.g. 2026 or "2026-06-12". */
  date?: string | number;
}

export interface UtmUrlInput extends UtmInput {
  url: string;
}

// Letters that Unicode normalization does not split into a base letter and an accent.
const LETTERS: Record<string, string> = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ð: 'd', ł: 'l', þ: 'th' };

/**
 * Lowercase ASCII with words joined by single hyphens: "Café Déjà Vu!" becomes
 * "cafe-deja-vu". Returns an empty string when nothing usable is left.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // the accents split off by NFKD
    .toLowerCase()
    .replace(/[ßæœøđðłþ]/g, (letter) => LETTERS[letter])
    .replace(/['’]/g, '') // "Acme's" reads better as "acmes" than "acme-s"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A slug that must not come out empty. `name` is used in the error message. */
function requireSlug(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new UtmError(`${name} is required.`);
  const slug = slugify(value);
  if (!slug) throw new UtmError(`${name} "${value}" has no letters or numbers to use.`);
  return slug;
}

function optionalSlug(name: string, value: string | undefined): string | undefined {
  return value?.trim() ? requireSlug(name, value) : undefined;
}

function yearOf(date: string | number): string {
  const match = /^(\d{4})(-\d{2}(-\d{2})?)?$/.exec(String(date).trim());
  if (!match) throw new UtmError(`The date "${date}" must be a year or a date, like 2026 or 2026-06-12.`);
  return match[1];
}

/**
 * The campaign for a conference: the event name plus its year, e.g.
 * ("ExampleConf", "2026-06-12") gives "exampleconf-2026". The year is not added twice
 * when the name already has it.
 */
export function conferenceCampaign(event: string, date?: string | number): string {
  const slug = requireSlug('The event name', event);
  if (date === undefined || date === '') return slug;
  const year = yearOf(date);
  return slug.split('-').includes(year) ? slug : `${slug}-${year}`;
}

export function isChannel(value: string): value is ChannelId {
  return Object.hasOwn(CHANNELS, value);
}

function channelSource(id: ChannelId, channel: Channel, input: UtmInput): string {
  if (channel.source) return channel.source;
  if (channel.event) return conferenceCampaign(input.event ?? '', input.date);
  if (channel.platforms) {
    const choices = channel.platforms.join(', ');
    if (!input.platform?.trim()) throw new UtmError(`The ${id} channel needs a platform: ${choices}.`);
    const platform = slugify(input.platform);
    if (!channel.platforms.includes(platform)) {
      throw new UtmError(`Unknown ${id} platform "${input.platform}". Use one of: ${choices}.`);
    }
    return platform;
  }
  return requireSlug('The platform', input.platform ?? channel.defaultPlatform);
}

/** The UTM values for a channel and campaign, following the convention. */
export function buildUtmParams(input: UtmInput): UtmParams {
  const id = input.channel?.trim().toLowerCase() ?? '';
  if (!id) throw new UtmError(`A channel is required. Use one of: ${CHANNEL_IDS.join(', ')}.`);
  if (!isChannel(id)) throw new UtmError(`Unknown channel "${input.channel}". Use one of: ${CHANNEL_IDS.join(', ')}.`);
  const channel: Channel = CHANNELS[id];

  const source = channelSource(id, channel, input);
  // A conference link promotes the event itself unless a campaign says otherwise.
  const campaign = channel.event && !input.campaign?.trim() ? source : requireSlug('A campaign', input.campaign);
  const content = optionalSlug('The content', input.content) ?? channel.content;
  const term = optionalSlug('The term', input.term);

  return { source, medium: channel.medium, campaign, ...(content && { content }), ...(term && { term }) };
}

function parseUrl(value: string): URL {
  const text = value?.trim();
  if (!text) throw new UtmError('A URL is required.');
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new UtmError(`"${text}" is not a valid URL. Use a full link such as https://example.com/page.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UtmError(`"${text}" must start with http:// or https://.`);
  }
  return url;
}

function isUtmPair(pair: string): boolean {
  const key = pair.split('=')[0].replace(/\+/g, ' ');
  try {
    return decodeURIComponent(key).trim().toLowerCase().startsWith('utm_');
  } catch {
    return false; // not valid percent-encoding, so not one of ours
  }
}

/**
 * Tags a link. Other query parameters and the #fragment are kept as they are;
 * any utm_* parameters already on the link are replaced. The order is always
 * source, medium, campaign, content, term.
 */
export function buildUtmUrl(input: UtmUrlInput): string {
  const url = parseUrl(input.url);
  const utm = buildUtmParams(input);

  // The query is edited as text because URLSearchParams would re-encode the
  // parameters that are not ours (%20 becomes +, for example).
  const kept = url.search
    .slice(1)
    .split('&')
    .filter((pair) => pair && !isUtmPair(pair));
  const tags = (['source', 'medium', 'campaign', 'content', 'term'] as const).flatMap((key) =>
    utm[key] ? [`utm_${key}=${utm[key]}`] : [],
  );
  url.search = [...kept, ...tags].join('&');
  return url.toString();
}

/** Every channel with its source and medium, for help output and the README table. */
export function listChannels(): ChannelInfo[] {
  return CHANNEL_IDS.map((id) => {
    const channel: Channel = CHANNELS[id];
    const source = channel.source ?? (channel.event ? '<event>' : '<platform>');
    return { id, source, medium: channel.medium, ...(channel.content && { content: channel.content }), use: channel.use };
  });
}
