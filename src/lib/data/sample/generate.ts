// Generates sample data for a fictional organization, so every page works
// with no setup. Nothing here is real: titles, events, accounts and numbers
// are all made up.
//
// The data covers seven months around a product launch: four before, three
// after. It depends only on the options passed in (never on today's date or
// Math.random), so the output is identical across runs.

import { addDays, addMonths, daysBetween, eachDay, quarterOf, weekday } from '../dates';
import type { SourceCategory } from '../../sources/core';
import type {
  Activity,
  ActivityMetric,
  CfpStatus,
  Conference,
  DateRange,
  DeclinedRequest,
  InfluencedDeal,
  MetricPoint,
  ReportNote,
  SourceStatusInfo,
  Tag,
  Target,
} from '../types';
import { createRandom, type Random } from './random';

export interface SampleOptions {
  /** YYYY-MM-DD. The data runs from four months before to three months after. */
  launchDate: string;
  launchLabel: string;
  /** The built-in activity types. Activities are only generated for the types listed. */
  activityTypes: string[];
  /** Free-form tags, spread across the activities. */
  suggestedTags: string[];
  /** GA4 key event names. */
  keyEvents: string[];
  sources: { id: string; name: string; category: SourceCategory }[];
  seed?: number;
}

export interface SampleData {
  range: DateRange;
  launchDate: string;
  tags: Tag[];
  activities: Activity[];
  activityMetrics: ActivityMetric[];
  conferences: Conference[];
  deals: InfluencedDeal[];
  metricPoints: MetricPoint[];
  sourceStatuses: SourceStatusInfo[];
  targets: Target[];
  reportNotes: ReportNote[];
  declinedRequests: DeclinedRequest[];
}

export const DEFAULT_LAUNCH_DATE = '2026-12-15';
export const DEFAULT_KEY_EVENTS = ['product_click', 'demo_request', 'install_click'];
const SITE = 'https://example.com';

const BLOG_TITLES = [
  'What your lockfile is not telling you',
  'Five checks to run before you upgrade a major version',
  'How to read a dependency tree without getting lost',
  'A field guide to end-of-life runtimes',
  'Pinning versions: when it helps and when it hurts',
  'What happens to a package after its maintainer leaves',
  'Auditing a project in ten minutes',
  'Semantic versioning in practice, not in theory',
  'Why transitive dependencies deserve a second look',
  'Keeping old services safe while you plan the rewrite',
  'A checklist for adopting a new open source library',
  'Getting started with the command line tool',
  'Three ways teams use the first scan',
  'From first scan to a weekly habit',
  'What we learned from the first thousand installs',
  'Reading a scan report: a walkthrough',
];

const VIDEO_TITLES = [
  'A tour of the dependency graph',
  'Live upgrade: a five-year-old service',
  'Questions from the community, answered',
  'How the scanner decides what to flag',
  'Setting up continuous checks in a pipeline',
  'Office hours: bring your own lockfile',
  'Launch walkthrough and demo',
];

// Made-up events. `offset` is days from the launch date.
const EVENTS: { name: string; location: string; offset: number; status: CfpStatus; talk: string }[] = [
  { name: 'Harbor Dev Summit', location: 'Lisbon', offset: -104, status: 'given', talk: 'The quiet risk in your dependency tree' },
  { name: 'Maple JS Days', location: 'Toronto', offset: -82, status: 'rejected', talk: 'Upgrades without fear' },
  { name: 'Lakeside Open Source Days', location: 'Zurich', offset: -61, status: 'given', talk: 'Living with end-of-life software' },
  { name: 'Cascade Cloud Conf', location: 'Seattle', offset: -40, status: 'declined', talk: 'Keynote panel on software supply chains' },
  { name: 'Juniper Security Forum', location: 'Austin', offset: -19, status: 'given', talk: 'What a scan can and cannot tell you' },
  { name: 'Granite Node Meetup', location: 'Denver', offset: -5, status: 'rejected', talk: 'Lockfiles, explained' },
  { name: 'Prairie Web Conf', location: 'Chicago', offset: 16, status: 'given', talk: 'Launch demo: scan a project in a minute' },
  { name: 'Tidewater Tech Week', location: 'Rotterdam', offset: 51, status: 'given', talk: 'Lessons from the first thousand installs' },
  { name: 'Summit of Small Tools', location: 'Berlin', offset: 112, status: 'accepted', talk: 'Small tools, big habits' },
  { name: 'Orchard Developer Days', location: 'Dublin', offset: 140, status: 'submitted', talk: 'A year of scanning in the open' },
];

const CROSS_TEAM = [
  'Rewrote the quickstart with the docs team',
  'Reviewed error messages with the engineering team',
  'Tested the installer on three platforms before release',
  'Wrote the migration guide with the docs team',
  'Recorded a demo for the sales kickoff',
  'Reviewed the sign-up flow with the product team',
  'Drafted release notes with the engineering team',
  'Ran an internal workshop on the command line tool',
];

const COMMUNITY = [
  'Answered questions in the community forum',
  'Triaged new issues on the public repository',
  'Hosted community office hours',
  'Answered questions in the chat server',
  'Reviewed a community contribution',
  'Hosted community office hours',
];

const FEEDBACK: { title: string; shipped: boolean }[] = [
  { title: 'Install fails behind a corporate proxy', shipped: true },
  { title: 'Scan output is hard to read in narrow terminals', shipped: true },
  { title: 'No way to ignore a single finding', shipped: false },
  { title: 'Sign-up asks for too many fields', shipped: true },
  { title: 'Docs search returns nothing for "offline"', shipped: false },
  { title: 'Request for a machine-readable report format', shipped: false },
];

const DECLINED: Omit<DeclinedRequest, 'id' | 'date'>[] = [
  { kind: 'conference', title: 'Invitation to speak at a regional meetup', reason: 'Clashed with a product deadline' },
  { kind: 'workshop', title: 'Half-day workshop request from a conference', reason: 'No time to prepare the material' },
  { kind: 'content', title: 'Guest post for a partner newsletter', reason: 'Blog schedule already at capacity' },
  { kind: 'conference', title: 'Panel seat at an online summit', reason: 'Same week as another talk' },
  { kind: 'cross-team', title: 'Sample app for the sales team', reason: 'No capacity this quarter' },
  { kind: 'content', title: 'Video series on upgrade strategies', reason: 'One person cannot film and edit weekly' },
  { kind: 'workshop', title: 'Customer workshop on continuous checks', reason: 'No time to prepare the material' },
];

const SESSION_CHANNELS = { organic_search: 220, organic_social: 90, referral: 45, direct: 70 };
// Install channel -> the source it is collected from, and installs per day once things settle.
const INSTALL_CHANNELS = [
  { channel: 'npm', source: 'npm', base: 60 },
  { channel: 'homebrew', source: 'homebrew', base: 22 },
  { channel: 'github', source: 'github', base: 14 },
  { channel: 'docker', source: 'docker-hub', base: 9 },
];
const HEARD_FROM = { conference: 0.22, blog: 0.2, video: 0.14, livestream: 0.08, social: 0.12, search: 0.16, other: 0.08 };
const FOLLOWERS = { youtube: 4200, x: 9800, linkedin: 6100, twitch: 850 };
const STREAM_PLATFORMS = { youtube: 1, twitch: 0.55, linkedin: 0.4, x: 0.3 };
// Sources shown as not connected, so the "access needed" cards have something to show.
const SAMPLE_GAPS: Record<string, Pick<SourceStatusInfo, 'status' | 'note' | 'missing'>> = {
  crm: { status: 'placeholder', note: 'No CRM access yet. Deals are logged by hand until then.' },
  facebook: { status: 'placeholder', note: 'No access yet. Ask the social team for a monthly export.' },
  metricool: { status: 'not_configured', missing: ['METRICOOL_API_TOKEN'] },
};

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const pad = (n: number) => String(n).padStart(2, '0');
const noise = (random: Random, spread = 0.15) => 1 + random.float(-spread, spread);
const weekdayFactor = (day: string) => (weekday(day) === 0 || weekday(day) === 6 ? 0.6 : 1);

export function generateSampleData(options: SampleOptions): SampleData {
  const { launchDate, launchLabel, suggestedTags } = options;
  const random = createRandom(options.seed ?? 20_261_215);
  const keyEvents = options.keyEvents.length ? options.keyEvents : DEFAULT_KEY_EVENTS;
  const has = (type: string) => options.activityTypes.includes(type);
  const range: DateRange = { from: addMonths(launchDate, -4), to: addMonths(launchDate, 3) };
  const days = eachDay(range.from, range.to);
  const sinceLaunch = (day: string) => daysBetween(launchDate, day);
  const launched = (day: string) => day >= launchDate;
  // Reach grows a little all the time and jumps once the product is out.
  const growth = (day: string) => (1 + (0.35 * daysBetween(range.from, day)) / days.length) * (launched(day) ? 1.3 : 1);
  const customTag = (i: number) => (suggestedTags.length ? [suggestedTags[i % suggestedTags.length]] : []);

  const activities: Activity[] = [];
  const activityMetrics: ActivityMetric[] = [];
  const measure = (activityId: string, platform: string, metric: ActivityMetric['metric'], value: number) =>
    activityMetrics.push({ activityId, platform, metric, value: Math.max(Math.round(value), 0) });

  // ---- Content: a blog post every two weeks, and what was made from each ----
  const blogDays = days.filter((day, i) => weekday(day) === 2 && Math.floor(i / 7) % 2 === 0);
  const blogDaySet = new Set(blogDays);
  if (has('blog')) {
    blogDays.forEach((date, i) => {
      const n = pad(i + 1);
      const title = BLOG_TITLES[i % BLOG_TITLES.length];
      const tags = customTag(i);
      const campaign = slug(title).split('-').slice(0, 4).join('-');
      const blogId = `blog-${n}`;
      activities.push({ id: blogId, type: 'blog', title, date, url: `${SITE}/blog/${slug(title)}`, utmCampaign: campaign, tags: ['blog', ...tags] });
      const views = random.int(900, 2600) * growth(date);
      measure(blogId, 'blog', 'views', views);
      // Some posts convert far better than their traffic suggests. The rate depends only on the post's
      // position, so it draws no random numbers and leaves the rest of the sample data unchanged.
      measure(blogId, 'blog', 'key_events', views * (0.012 + 0.011 * ((i * 3) % 5)));
      // The social posts announcing it count toward the blog post itself.
      for (const platform of ['x', 'linkedin']) {
        const reach = random.int(1400, 6200) * growth(date);
        measure(blogId, platform, 'reach', reach);
        measure(blogId, platform, 'engagements', reach * random.float(0.02, 0.06));
      }

      const shortDate = addDays(date, 3);
      if (has('short') && shortDate <= range.to) {
        const id = `short-${n}`;
        activities.push({ id, type: 'short', title: `Short: ${title}`, date: shortDate, parentId: blogId, utmCampaign: campaign, tags: ['short', ...tags] });
        measure(id, 'youtube', 'views', random.int(1500, 9000) * growth(shortDate));
      }

      const streamDate = addDays(date, 7);
      if (has('livestream') && i % 2 === 0 && streamDate <= range.to) {
        const id = `livestream-${n}`;
        activities.push({ id, type: 'livestream', title: `Live: ${title}`, date: streamDate, parentId: blogId, utmCampaign: campaign, tags: ['livestream', ...tags] });
        const live = random.int(40, 160) * growth(streamDate);
        for (const [platform, share] of Object.entries(STREAM_PLATFORMS)) {
          measure(id, platform, 'live_viewers', live * share * noise(random));
          measure(id, platform, 'peak_viewers', live * share * random.float(1.3, 1.9));
          measure(id, platform, 'replay_views', live * share * random.float(3, 8));
        }
      }
    });
  }

  if (has('long-form-video')) {
    VIDEO_TITLES.forEach((title, i) => {
      const date = addDays(addMonths(range.from, i), 9);
      if (date > range.to) return;
      const id = `video-${pad(i + 1)}`;
      activities.push({ id, type: 'long-form-video', title, date, url: `${SITE}/videos/${slug(title)}`, tags: ['long-form-video', ...customTag(i + 1)] });
      measure(id, 'youtube', 'views', random.int(600, 3200) * growth(date));
    });
  }

  // ---- Conferences. Upcoming ones (accepted, submitted) fall after the data window. ----
  const conferences: Conference[] = [];
  const talkBumps: string[] = [];
  EVENTS.forEach((event, i) => {
    const date = addDays(launchDate, event.offset);
    const id = `conference-${pad(i + 1)}`;
    const tag = slug(event.name);
    const conference: Conference = { id, name: event.name, date, location: event.location, cfpStatus: event.status, tags: [tag] };
    if (event.status === 'given') {
      const estAudience = random.int(15, 60) * 10;
      const qrScans = Math.round(estAudience * random.float(0.08, 0.15));
      conference.estAudience = estAudience;
      conference.qrScans = qrScans;
      // Scans plus people who typed the link later. Worked out from the position, so it draws no random numbers.
      conference.siteVisits = Math.round(qrScans * (1.4 + 0.2 * (i % 4)));
      conference.leadsToSales = Math.max(Math.round(qrScans * random.float(0.05, 0.12)), 1);
      conference.costUsd = random.int(12, 48) * 100;
      talkBumps.push(date);
      if (has('talk')) {
        conference.activityId = `talk-${pad(i + 1)}`;
        activities.push({
          id: conference.activityId,
          type: 'talk',
          title: `${event.talk} (${event.name})`,
          date,
          utmCampaign: `${tag}-${date.slice(0, 4)}`,
          costUsd: conference.costUsd,
          estAudience,
          tags: ['talk', tag, ...customTag(i)],
        });
      }
    }
    conferences.push(conference);
  });

  // ---- Work that is not content: other teams, community, product feedback ----
  const spread = (count: number, i: number, shift: number) => days[Math.min(Math.floor(((i + 0.5) * days.length) / count) + shift, days.length - 1)];
  if (has('cross-team')) {
    CROSS_TEAM.forEach((title, i) => {
      activities.push({ id: `cross-team-${pad(i + 1)}`, type: 'cross-team', title, date: spread(CROSS_TEAM.length, i, 2), tags: ['cross-team', ...customTag(i + 2)] });
    });
  }
  if (has('community')) {
    COMMUNITY.forEach((title, i) => {
      const threads = random.int(6, 24);
      activities.push({ id: `community-${pad(i + 1)}`, type: 'community', title, date: spread(COMMUNITY.length, i, 5), notes: `${threads} threads or issues handled`, tags: ['community'] });
    });
  }
  if (has('feedback')) {
    FEEDBACK.forEach(({ title, shipped }, i) => {
      activities.push({
        id: `feedback-${pad(i + 1)}`,
        type: 'feedback',
        title,
        date: spread(FEEDBACK.length, i, 8),
        notes: shipped ? 'Shipped by the product team' : 'Logged with the product team',
        tags: ['feedback', ...customTag(i)],
      });
    });
  }
  activities.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const declinedRequests: DeclinedRequest[] = DECLINED.map((request, i) => ({
    id: `declined-${pad(i + 1)}`,
    date: spread(DECLINED.length, i, 11),
    ...request,
  }));

  // ---- Daily metrics ----
  const metricPoints: MetricPoint[] = [];
  const point = (date: string, metric: MetricPoint['metric'], value: number, source: string, dimensions?: Record<string, string>) =>
    metricPoints.push({ date, metric, value: Math.max(Math.round(value), 0), source, ...(dimensions && { dimensions }) });
  // Installs and visits rise for a few days after each talk.
  const talkBump = (day: string) =>
    1 + talkBumps.reduce((bump, talk) => { const d = daysBetween(talk, day); return bump + (d >= 0 && d < 6 ? 0.5 * (1 - d / 6) : 0); }, 0);

  const activations: number[] = [];
  for (const day of days) {
    let sessions = 0;
    for (const [channel, base] of Object.entries(SESSION_CHANNELS)) {
      const blogLift = channel === 'organic_social' && (blogDaySet.has(day) || blogDaySet.has(addDays(day, -1))) ? 1.6 : 1;
      const value = base * growth(day) * weekdayFactor(day) * blogLift * (channel === 'referral' ? talkBump(day) : 1) * noise(random);
      sessions += value;
      point(day, 'sessions', value, 'ga4', { channel });
      point(day, 'engaged_sessions', value * random.float(0.55, 0.68), 'ga4', { channel });
    }
    keyEvents.forEach((event, i) => {
      point(day, 'key_events', sessions * (0.022 / (i + 1)) * (launched(day) ? 2 : 1) * noise(random, 0.3), 'ga4', { event });
    });

    if (launched(day)) {
      const d = sinceLaunch(day);
      // A launch-day spike that settles within a couple of weeks, then steady growth.
      const curve = (1 + 3 * Math.exp(-d / 6)) * (1 + 0.012 * d) * talkBump(day) * weekdayFactor(day);
      let installs = 0;
      for (const { channel, source, base } of INSTALL_CHANNELS) {
        const value = Math.round(base * curve * noise(random));
        installs += value;
        point(day, 'installs', value, source, { channel });
      }
      for (const [heardFrom, share] of Object.entries(HEARD_FROM)) {
        point(day, 'signups', installs * 0.28 * share * noise(random, 0.25), 'product-signups', { heard_from: heardFrom });
      }
      // Activation improves as the quickstart and tutorials land.
      const activated = Math.round(installs * Math.min(0.36 + 0.001 * d, 0.48) * noise(random, 0.08));
      activations.push(activated);
      point(day, 'activations', activated, 'product-telemetry');
      if (weekday(day) === 1) {
        const lastTwoWeeks = activations.slice(-14).reduce((a, b) => a + b, 0);
        point(day, 'active_users', lastTwoWeeks * 0.6, 'product-telemetry');
      }
    }
  }

  const followers = { ...FOLLOWERS };
  for (const day of days.filter((d) => weekday(d) === 1)) {
    for (const platform of Object.keys(followers) as (keyof typeof followers)[]) {
      followers[platform] *= 1 + random.float(0.006, 0.014) * (launched(day) ? 1.5 : 1);
      point(day, 'followers', followers[platform], 'follower-counts', { platform });
    }
  }

  // ---- Deals sales linked to DevRel ----
  const given = conferences.filter((c) => c.cfpStatus === 'given');
  const deals: InfluencedDeal[] = Array.from({ length: 9 }, (_, i) => {
    const touchpoint = (['conference', 'content', 'demo', 'conference', 'livestream'] as const)[i % 5];
    const from = touchpoint === 'conference' ? given[i % given.length] : undefined;
    const date = from ? addDays(from.date, random.int(6, 30)) : spread(9, i, random.int(0, 9));
    return {
      id: `deal-${pad(i + 1)}`,
      date: date > range.to ? range.to : date,
      name: `Account ${pad(i + 1)}`,
      amountUsd: random.int(24, 180) * 500,
      stage: (['open', 'won', 'open', 'won', 'lost', 'open'] as const)[i % 6],
      touchpoint,
      ...(from?.activityId && { activityId: from.activityId }),
    };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  // ---- Targets and report notes, per quarter ----
  const quarters = [...new Set(days.map(quarterOf))];
  const total = (metric: MetricPoint['metric'], quarter: string) =>
    metricPoints.filter((p) => p.metric === metric && quarterOf(p.date) === quarter).reduce((sum, p) => sum + p.value, 0);
  const targets: Target[] = quarters.flatMap((period) => {
    const goal = (metric: Target['metric'], value: number, stretch: number): Target[] =>
      value > 0 ? [{ metric, period, value: Math.ceil((value * stretch) / 100) * 100 }] : [];
    return [
      ...goal('sessions', total('sessions', period), 1.1),
      ...goal('key_events', total('key_events', period), 1.2),
      ...goal('installs', total('installs', period), 1.15),
      ...goal('signups', total('signups', period), 1.25),
      { metric: 'influenced_pipeline_usd' as const, period, value: 150_000 },
    ];
  });

  const reportNotes: ReportNote[] = quarters.flatMap((period) => {
    const afterLaunch = period >= quarterOf(launchDate);
    const notes: Omit<ReportNote, 'id' | 'period'>[] = [
      { section: 'so_what', metric: 'sessions', text: 'Blog traffic keeps growing from search, which costs nothing per visit. The plan is to keep the two-week cadence.' },
      { section: 'so_what', metric: 'key_events', text: 'Visitors from DevRel content click through to product pages more than average. Each post now ends with one clear next step.' },
      ...(afterLaunch
        ? [
            { section: 'so_what' as const, metric: 'installs' as const, text: `Installs jump after every talk since the ${launchLabel}. Two more talks are booked for next quarter.` },
            { section: 'so_what' as const, metric: 'influenced_pipeline_usd' as const, text: 'Most influenced deals started with a conference conversation. Leads are now logged the same day.' },
          ]
        : []),
      { section: 'working', text: 'One blog post now becomes a short video, a livestream and social posts, so each post reaches four to five times the audience.' },
      { section: 'working', text: 'Conference talks with a QR code on the last slide produce leads we can count.' },
      { section: 'not_working', text: 'Livestreams on the smallest platform draw few viewers for the setup time. We will stop streaming there next quarter.' },
      { section: 'ask', text: 'One more developer advocate, to return to weekly blog posts and accept the talks we now turn down.' },
      { section: 'ask', text: 'Read access to the CRM, so influenced pipeline is measured and not hand-logged.' },
    ];
    return notes.map((note, i) => ({ id: `note-${period}-${pad(i + 1)}`, period, ...note }));
  });

  // ---- Tags and source statuses ----
  const customTags = [...new Set(activities.flatMap((a) => a.tags).concat(conferences.flatMap((c) => c.tags), suggestedTags))].filter(
    (name) => !options.activityTypes.includes(name),
  );
  const tags: Tag[] = [
    ...options.activityTypes.map((name) => ({ name, kind: 'type' as const })),
    ...customTags.sort().map((name) => ({ name, kind: 'custom' as const })),
  ];

  const sourceStatuses: SourceStatusInfo[] = options.sources.map(({ id, name, category }) => ({
    id,
    name,
    category,
    ...(SAMPLE_GAPS[id] ?? { status: 'ok' as const, lastCollectedAt: `${range.to}T06:00:00.000Z` }),
  }));

  return { range, launchDate, tags, activities, activityMetrics, conferences, deals, metricPoints, sourceStatuses, targets, reportNotes, declinedRequests };
}
