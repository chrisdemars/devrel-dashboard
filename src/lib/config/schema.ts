// The shape of devrel.config.ts: everything specific to one organization.
// Secrets (API keys, tokens) never go here; they stay in .env.

import { z } from 'zod';

const text = z.string().trim().min(1, 'must not be empty');

const list = z
  .array(text)
  .default([])
  .refine((items) => new Set(items).size === items.length, 'must not contain duplicates');

/** True for a real calendar date; rejects 2026-13-01 and 2026-02-30. */
function isCalendarDate(value: string): boolean {
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

const isoDate = z.string().superRefine((value, ctx) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) ctx.addIssue('must be a date like 2026-12-31');
  else if (!isCalendarDate(value)) ctx.addIssue('is not a real calendar date');
});

/** Navigation and heading label for each page. */
export const PAGE_LABELS = {
  overview: 'Overview',
  launch: 'Product launch',
  content: 'Content',
  streams: 'Streams and social',
  events: 'Events',
  pipeline: 'Pipeline and impact',
  capacity: 'Capacity and the ask',
  activity: 'Activity log',
  sources: 'Data sources',
  admin: 'Admin',
  report: 'Report',
} as const;

export type PageId = keyof typeof PAGE_LABELS;

/** Activity types. Every activity carries exactly one of these tags. */
export const BUILT_IN_TAGS = [
  'blog',
  'short',
  'long-form-video',
  'livestream',
  'talk',
  'cross-team',
  'community',
  'feedback',
];

const pageLabels = Object.fromEntries(
  Object.entries(PAGE_LABELS).map(([id, label]) => [id, text.default(label)]),
) as Record<PageId, z.ZodDefault<typeof text>>;

export const configSchema = z.strictObject({
  org: z.strictObject({
    /** Your organization's name, used in the report. */
    name: text,
    url: z.url('must be a full URL, e.g. https://example.com').optional(),
    logo: z
      .strictObject({
        /** A path under public/ (e.g. /logo.svg) or a full URL. */
        src: text,
        alt: text.optional(),
      })
      .optional(),
  }),

  theme: z
    .strictObject({
      /** Name of a theme preset: 'default', or one you added (see src/theme/default.css). */
      preset: text.default('default'),
      /** Font family names. Anything left out uses the system font. */
      fonts: z
        .strictObject({
          heading: text.optional(),
          body: text.optional(),
          mono: text.optional(),
          /**
           * Stylesheets that load the fonts named above: full URLs (e.g. a
           * Google Fonts link) or paths under public/ (e.g. /fonts/fonts.css).
           * Not needed for fonts already installed on your viewers' devices.
           */
          stylesheets: list,
        })
        .prefault({}),
    })
    .prefault({}),

  sources: z
    .strictObject({
      /** 'all', or the ids of the sources to show and collect (see `npm run status`). */
      enabled: z.union([z.literal('all'), list], { error: "must be 'all' or a list of source ids" }).default('all'),
    })
    .prefault({}),

  /** Public package and repo names to track. No credentials needed. */
  packages: z
    .strictObject({
      npm: list,
      homebrewFormulae: list,
      homebrewCasks: list,
      pypi: list,
      /** namespace/repo on Docker Hub. */
      docker: list,
      /** owner/repo on GitHub. */
      github: list,
    })
    .prefault({}),

  ga4: z
    .strictObject({
      /** Key event names to report. Empty means every event marked as a key event. */
      keyEvents: list,
    })
    .prefault({}),

  /** The launch the dashboard counts down to and measures growth against. */
  launch: z
    .strictObject({
      date: isoDate,
      label: text,
    })
    .optional(),

  team: z
    .strictObject({
      /** How many people do the work the dashboard tracks. The staffing model on the Capacity page starts from it. */
      people: z.number({ error: 'must be a number' }).positive('must be more than 0').default(1),
    })
    .prefault({}),

  /** Rename pages. Anything left out keeps its default label. */
  pages: z.strictObject(pageLabels).prefault({}),

  tags: z
    .strictObject({
      /** Activity types. */
      builtIn: list.default(BUILT_IN_TAGS).refine((items) => items.length > 0, 'needs at least one activity type'),
      /** Free-form tags offered as suggestions when logging an activity. */
      suggested: list,
    })
    .prefault({}),
});

/** What you write in devrel.config.ts. Only `org.name` is required. */
export type DevrelConfigInput = z.input<typeof configSchema>;

/** The validated config, with every default filled in. */
export type DevrelConfig = z.output<typeof configSchema>;

/** Gives devrel.config.ts type checking and editor autocomplete. */
export function defineConfig(config: DevrelConfigInput): DevrelConfigInput {
  return config;
}

export class ConfigError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(
      [
        'Invalid DevRel config. Fix config/devrel.config.ts (or devrel.config.example.ts if you have not created your own):',
        ...problems.map((p) => `  - ${p}`),
      ].join('\n'),
    );
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

function describe(issue: z.core.$ZodIssue): string {
  const path = issue.path.join('.');
  if (issue.code === 'unrecognized_keys') {
    const keys = issue.keys.map((k) => (path ? `${path}.${k}` : k)).join(', ');
    return `${keys}: unknown setting (check the spelling)`;
  }
  if (issue.code === 'invalid_type' && issue.input === undefined) return `${path}: is required`;
  if (issue.code === 'invalid_type') return `${path}: must be ${/^[aeiou]/.test(issue.expected) ? 'an' : 'a'} ${issue.expected}`;
  return `${path || 'config'}: ${issue.message}`;
}

/** Validates a config and fills in defaults. Throws a ConfigError listing every problem. */
export function parseConfig(input: unknown): DevrelConfig {
  const result = configSchema.safeParse(input, { reportInput: true });
  if (!result.success) throw new ConfigError(result.error.issues.map(describe));
  return result.data;
}
