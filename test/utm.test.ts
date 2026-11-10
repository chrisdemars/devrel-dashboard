import { describe, expect, test } from 'vitest';
import {
  buildUtmParams,
  buildUtmUrl,
  CHANNEL_IDS,
  conferenceCampaign,
  listChannels,
  slugify,
  UtmError,
} from '../src/lib/utm';

const BASE = 'https://example.com/blog/post';

describe('slugify', () => {
  test('lowercases and joins words with hyphens', () => {
    expect(slugify('CLI Launch')).toBe('cli-launch');
    expect(slugify('ExampleConf 2026')).toBe('exampleconf-2026');
  });

  test('turns accented and special letters into plain ASCII', () => {
    expect(slugify('Café Déjà Vu')).toBe('cafe-deja-vu');
    expect(slugify('Straße Ærø Łódź')).toBe('strasse-aero-lodz');
  });

  test('collapses punctuation and repeated separators', () => {
    expect(slugify('  spring -- sale__2026!!  ')).toBe('spring-sale-2026');
    expect(slugify('a/b\\c.d,e')).toBe('a-b-c-d-e');
    expect(slugify('--already--slugged--')).toBe('already-slugged');
  });

  test('drops apostrophes instead of splitting the word', () => {
    expect(slugify("Acme's Dev Day")).toBe('acmes-dev-day');
  });

  test('returns an empty string when nothing usable is left', () => {
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
    expect(slugify('!!! ???')).toBe('');
    expect(slugify('日本語')).toBe('');
  });
});

describe('the channel table', () => {
  const expected: Record<string, { source: string; medium: string; content?: string; extra?: object }> = {
    youtube: { source: 'youtube', medium: 'video' },
    'youtube-short': { source: 'youtube', medium: 'video', content: 'short' },
    livestream: { source: 'twitch', medium: 'livestream', extra: { platform: 'twitch' } },
    x: { source: 'x', medium: 'social' },
    linkedin: { source: 'linkedin', medium: 'social' },
    facebook: { source: 'facebook', medium: 'social' },
    blog: { source: 'blog', medium: 'referral' },
    newsletter: { source: 'newsletter', medium: 'email' },
    conference: { source: 'exampleconf-2026', medium: 'conference', content: 'slides', extra: { event: 'ExampleConf 2026' } },
    community: { source: 'discord', medium: 'community' },
  };

  test('covers every channel', () => {
    expect(Object.keys(expected).sort()).toEqual([...CHANNEL_IDS].sort());
  });

  test.each(Object.entries(expected))('%s has the expected source and medium', (channel, want) => {
    const params = buildUtmParams({ channel, campaign: 'cli-launch', ...want.extra });
    expect(params).toEqual({
      source: want.source,
      medium: want.medium,
      campaign: 'cli-launch',
      ...(want.content && { content: want.content }),
    });
  });

  test('listChannels describes every channel, with placeholders for sources that vary', () => {
    const channels = listChannels();
    expect(channels.map((c) => c.id)).toEqual(CHANNEL_IDS);
    const byId = Object.fromEntries(channels.map((c) => [c.id, c]));
    expect(byId.youtube).toMatchObject({ source: 'youtube', medium: 'video' });
    expect(byId.livestream).toMatchObject({ source: '<platform>', medium: 'livestream' });
    expect(byId.conference).toMatchObject({ source: '<event>', medium: 'conference', content: 'slides' });
    for (const c of channels) expect(c.use).not.toBe('');
  });
});

describe('buildUtmParams', () => {
  test('cleans up the campaign, content and term', () => {
    expect(
      buildUtmParams({ channel: 'x', campaign: 'CLI Launch!', content: 'Pinned Post', term: 'Supply Chain' }),
    ).toEqual({ source: 'x', medium: 'social', campaign: 'cli-launch', content: 'pinned-post', term: 'supply-chain' });
  });

  test('accepts the channel in any case', () => {
    expect(buildUtmParams({ channel: ' YouTube ', campaign: 'cli-launch' }).source).toBe('youtube');
  });

  test('an unknown channel lists the valid ones', () => {
    expect(() => buildUtmParams({ channel: 'tiktok', campaign: 'cli-launch' })).toThrow(UtmError);
    expect(() => buildUtmParams({ channel: 'tiktok', campaign: 'cli-launch' })).toThrow(
      /^Unknown channel "tiktok"\. Use one of: youtube, youtube-short, .*community\.$/,
    );
    expect(() => buildUtmParams({ channel: '', campaign: 'cli-launch' })).toThrow(/A channel is required/);
    // Names inherited from Object.prototype are not channels.
    expect(() => buildUtmParams({ channel: 'constructor', campaign: 'cli-launch' })).toThrow(/Unknown channel/);
  });

  test('the campaign is required and must not come out empty', () => {
    expect(() => buildUtmParams({ channel: 'youtube' })).toThrow('A campaign is required.');
    expect(() => buildUtmParams({ channel: 'youtube', campaign: '  ' })).toThrow('A campaign is required.');
    expect(() => buildUtmParams({ channel: 'youtube', campaign: '!!!' })).toThrow(
      'A campaign "!!!" has no letters or numbers to use.',
    );
  });

  test('a given content replaces the channel default', () => {
    expect(buildUtmParams({ channel: 'youtube-short', campaign: 'cli-launch', content: 'Pinned Comment' }).content).toBe(
      'pinned-comment',
    );
  });

  test('a livestream takes its source from the platform', () => {
    for (const platform of ['youtube', 'twitch', 'linkedin', 'x', 'facebook']) {
      expect(buildUtmParams({ channel: 'livestream', campaign: 'cli-launch', platform })).toMatchObject({
        source: platform,
        medium: 'livestream',
      });
    }
    expect(buildUtmParams({ channel: 'livestream', campaign: 'cli-launch', platform: 'Twitch' }).source).toBe('twitch');
  });

  test('a livestream without a known platform is an error', () => {
    expect(() => buildUtmParams({ channel: 'livestream', campaign: 'cli-launch' })).toThrow(
      'The livestream channel needs a platform: youtube, twitch, linkedin, x, facebook.',
    );
    expect(() => buildUtmParams({ channel: 'livestream', campaign: 'cli-launch', platform: 'vimeo' })).toThrow(
      'Unknown livestream platform "vimeo". Use one of: youtube, twitch, linkedin, x, facebook.',
    );
  });

  test('community defaults to discord and accepts any platform', () => {
    expect(buildUtmParams({ channel: 'community', campaign: 'cli-launch' }).source).toBe('discord');
    expect(buildUtmParams({ channel: 'community', campaign: 'cli-launch', platform: 'Acme Forum' })).toMatchObject({
      source: 'acme-forum',
      medium: 'community',
    });
  });
});

describe('conference naming', () => {
  test('the campaign is the event name plus the year', () => {
    expect(conferenceCampaign('ExampleConf', 2026)).toBe('exampleconf-2026');
    expect(conferenceCampaign('ExampleConf', '2026')).toBe('exampleconf-2026');
    expect(conferenceCampaign('Dev Conf Europe', '2026-06-12')).toBe('dev-conf-europe-2026');
    expect(conferenceCampaign('ExampleConf', '2026-06')).toBe('exampleconf-2026');
  });

  test('the year is not added twice', () => {
    expect(conferenceCampaign('ExampleConf 2026', '2026-06-12')).toBe('exampleconf-2026');
    expect(conferenceCampaign('ExampleConf 2026 Europe', 2026)).toBe('exampleconf-2026-europe');
  });

  test('without a date the event name is used as is', () => {
    expect(conferenceCampaign('ExampleConf')).toBe('exampleconf');
    expect(conferenceCampaign('ExampleConf 2026')).toBe('exampleconf-2026');
  });

  test('a bad date or an empty event name is an error', () => {
    expect(() => conferenceCampaign('ExampleConf', 'June 2026')).toThrow(
      'The date "June 2026" must be a year or a date, like 2026 or 2026-06-12.',
    );
    expect(() => conferenceCampaign('')).toThrow('The event name is required.');
    expect(() => conferenceCampaign('???')).toThrow(/has no letters or numbers/);
  });

  test('the event is both the source and the campaign', () => {
    expect(buildUtmParams({ channel: 'conference', event: 'ExampleConf', date: '2026-06-12' })).toEqual({
      source: 'exampleconf-2026',
      medium: 'conference',
      campaign: 'exampleconf-2026',
      content: 'slides',
    });
  });

  test('a campaign can be set separately from the event', () => {
    expect(
      buildUtmParams({ channel: 'conference', event: 'ExampleConf 2026', campaign: 'CLI Launch', content: 'qr' }),
    ).toEqual({ source: 'exampleconf-2026', medium: 'conference', campaign: 'cli-launch', content: 'qr' });
  });

  test('a conference needs an event', () => {
    expect(() => buildUtmParams({ channel: 'conference', campaign: 'cli-launch' })).toThrow(
      'The event name is required.',
    );
  });
});

describe('buildUtmUrl', () => {
  test('tags a plain link', () => {
    expect(buildUtmUrl({ url: BASE, channel: 'youtube', campaign: 'cli-launch' })).toBe(
      `${BASE}?utm_source=youtube&utm_medium=video&utm_campaign=cli-launch`,
    );
  });

  test('keeps the order source, medium, campaign, content, term', () => {
    const tagged = buildUtmUrl({ url: BASE, channel: 'x', term: 'b', content: 'a', campaign: 'cli-launch' });
    expect([...new URL(tagged).searchParams.keys()]).toEqual([
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term',
    ]);
  });

  test('preserves existing query parameters and the hash', () => {
    expect(buildUtmUrl({ url: `${BASE}?ref=home&q=a%20b+c#install`, channel: 'newsletter', campaign: 'cli-launch' })).toBe(
      `${BASE}?ref=home&q=a%20b+c&utm_source=newsletter&utm_medium=email&utm_campaign=cli-launch#install`,
    );
  });

  test('replaces existing utm_* parameters instead of duplicating them', () => {
    const tagged = buildUtmUrl({
      url: `${BASE}?utm_source=old&page=2&UTM_Medium=cpc&utm_campaign=old&utm_content=old&utm_term=old&utm_id=7#top`,
      channel: 'linkedin',
      campaign: 'cli-launch',
    });
    expect(tagged).toBe(`${BASE}?page=2&utm_source=linkedin&utm_medium=social&utm_campaign=cli-launch#top`);
  });

  test('adds a path to a bare domain', () => {
    expect(buildUtmUrl({ url: ' https://example.com ', channel: 'blog', campaign: 'cli-launch' })).toBe(
      'https://example.com/?utm_source=blog&utm_medium=referral&utm_campaign=cli-launch',
    );
  });

  test('tags a conference link', () => {
    expect(buildUtmUrl({ url: 'https://example.com/cli', channel: 'conference', event: 'ExampleConf 2026', content: 'qr' })).toBe(
      'https://example.com/cli?utm_source=exampleconf-2026&utm_medium=conference&utm_campaign=exampleconf-2026&utm_content=qr',
    );
  });

  test('an invalid URL is a clear error', () => {
    const tag = (url: string) => () => buildUtmUrl({ url, channel: 'youtube', campaign: 'cli-launch' });
    expect(tag('')).toThrow('A URL is required.');
    expect(tag('example.com/post')).toThrow(
      '"example.com/post" is not a valid URL. Use a full link such as https://example.com/page.',
    );
    expect(tag('ftp://example.com/file')).toThrow('"ftp://example.com/file" must start with http:// or https://.');
    expect(tag('mailto:hello@example.com')).toThrow(/must start with http/);
    expect(tag('javascript:alert(1)')).toThrow(UtmError);
  });

  test('an unknown channel is an error', () => {
    expect(() => buildUtmUrl({ url: BASE, channel: 'tiktok', campaign: 'cli-launch' })).toThrow(/Unknown channel "tiktok"/);
  });
});
