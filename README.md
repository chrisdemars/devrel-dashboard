# devrel-dashboard
[![CI](https://github.com/chrisdemars/devrel-dashboard/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/chrisdemars/devrel-dashboard/actions/workflows/ci.yml)

An open-source dashboard for tracking Developer Relations activity and showing its impact: reach, product adoption, pipeline and cost per outcome.

> **Status:** early. The data collector and the design system work today; the dashboards are in progress.

Built with Next.js 16, TypeScript and Tailwind CSS 4.

## Use it for your team
Fork or clone this repo, then plug in your own details. Nothing here is tied to a specific company:
- **Your organization's settings** go in `config/devrel.config.ts`: name, logo, theme, which sources to use, package names, GA4 key events, launch date, page labels and tags. See [Configuration](#configuration).
- **Keys and tokens** go in `.env` (copy `.env.example`). It's gitignored.
- **Your data** lives in your own storage (local files today, your own Supabase project soon).

The data collector pulls metrics from every source into dated JSON snapshots. Sources you haven't connected yet still appear, marked as not configured or placeholder, so the gaps are visible.

## Setup
Requires Node 22.9 or later.

```sh
npm install
npm run dev             # dashboard at http://localhost:3000
```

A fresh clone runs as is, using the example config. When you're ready:

```sh
mkdir config && cp devrel.config.example.ts config/devrel.config.ts    # your organization's settings
cp .env.example .env                                                   # keys and tokens, as you need them
```

| Command | What it does |
|---|---|
| `npm run dev` | Start the dashboard in development mode |
| `npm run build` / `npm start` | Production build and server |
| `npm run status` | Show every data source and what it still needs (no network calls) |
| `npm run collect` | Pull every configured source and write `data/snapshots/<date>.json` |
| `npm run sample-data` | Write the generated sample data to `data/sample/sample-data.json`, to look at it |
| `npm run utm` | Tag a link with UTM parameters, and optionally make a QR code for it |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript checks |

## Configuration
Everything specific to your organization lives in one typed file, `config/devrel.config.ts`. If it doesn't exist, `devrel.config.example.ts` is used instead, so you never need to edit a shared file.

```ts
import { defineConfig } from '@/lib/config/schema';

export default defineConfig({
  org: { name: 'Acme', url: 'https://example.com' },
  sources: { enabled: 'all' },
  packages: { npm: ['@acme/cli'], github: ['acme/cli'] },
  ga4: { keyEvents: ['product_click', 'demo_request'] },
  launch: { date: '2026-12-15', label: 'Acme CLI launch' },
});
```

| Setting | What it controls | Default |
|---|---|---|
| `org.name`, `org.url`, `org.logo` | Your organization's name and link, used in the report, and an optional logo for the navigation | `name` is required |
| `theme.preset`, `theme.fonts` | Theme preset, and the heading, body and monospace fonts. See [Theme](#theme) | `default`; system fonts |
| `sources.enabled` | `'all'`, or a list of source ids to show and collect | `'all'` |
| `packages.*` | npm, Homebrew, PyPI, Docker Hub and GitHub names to track | none |
| `ga4.keyEvents` | GA4 key events to report | every key event |
| `team.people` | How many people do the work; the staffing model on the Capacity page starts from it | `1` |
| `launch.date`, `launch.label` | The launch the dashboard counts down to | none |
| `pages.*` | Labels for each page | built-in labels |
| `tags.builtIn`, `tags.suggested` | Activity types, and free-form tags to suggest | 8 activity types; none |

Only `org.name` is required. The full list, with defaults, is in `src/lib/config/schema.ts`.

The config is checked when the app or the collector starts. A mistake stops it with a message that names each setting to fix:

```
Invalid DevRel config. Fix config/devrel.config.ts (or devrel.config.example.ts if you have not created your own):
  - org.name: is required
  - launch.date: must be a date like 2026-12-31
```

Secrets never go in the config; they stay in `.env`. The package and key event variables in `.env` (`CLI_NPM_PACKAGES`, `GA4_KEY_EVENTS` and so on) still work, and replace the matching config list when set.

## Data and sample data
Pages read everything through one interface, `DataStore` in `src/lib/data/types.ts`, so they never know where the data lives. `DATA_MODE` picks the implementation:

| `DATA_MODE` | What you get |
|---|---|
| `sample` (default) | Generated data for a fictional organization. No setup, and a "Sample data" badge in the navigation |
| `supabase` | Your own data in your own Supabase project. Not available yet |

The sample data covers seven months around the launch date in your config (four before, three after): a blog post every two weeks with the short, livestream and social posts made from it, conference talks with costs and leads, installs that ramp up after launch, site traffic and key events, followers, deals, cross-team work, declined requests, targets and report notes. It uses your config's tags and key event names.

It is generated from a fixed seed, so it is identical on every run and on every machine. Nothing in it is real. The dashboards treat the last day of the sample data as "today".

## Theme
The dashboard is dark by default, with a light theme behind the toggle in the navigation. Printing always uses the light theme. Open `/styleguide` to see every color token and building block in both themes.

**Colors.** All colors are tokens in one file, `src/theme/default.css`: a dark and a light value for each of the page, surfaces, text, accent, states and eight chart colors. To use your own colors without editing shared files:

1. Copy `src/theme/default.css` to a new file, such as `src/theme/acme.css`. Change the selector to `[data-preset='acme']` and edit the values.
2. Create `config/theme.css` containing `@import '../src/theme/acme.css';`.
3. Set `theme: { preset: 'acme' }` in `config/devrel.config.ts`.

`npm test` then checks your preset: it must define every token, text must meet WCAG AA contrast (4.5:1) on every surface, and chart colors must reach 3:1 on cards. The styleguide shows your preset next to the default.

The eight chart colors are a set. Their order keeps neighboring series distinguishable for color-blind readers, so change them together.

**Fonts.** System fonts are used unless you name your own. Give the family names and a stylesheet that loads them, either a full URL or a file under `public/`:

```ts
theme: {
  fonts: {
    heading: 'Inter',
    body: 'Inter',
    mono: 'JetBrains Mono',
    stylesheets: ['https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=JetBrains+Mono:wght@400..700&display=swap'],
  },
},
```

A stylesheet URL on another site, such as Google Fonts, is requested by each viewer's browser. Host the fonts under `public/` if you'd rather avoid that.

**Logo.** Optional. Put the file under `public/` and set `org.logo` to `{ src: '/logo.svg', alt: 'Acme' }`. It appears beside the app name in the navigation.

## Project layout
```
devrel.config.example.ts   Example org config (copy to config/devrel.config.ts)
src/app/                   Next.js App Router pages
src/components/ui/         Building blocks: Card, KpiTile, Headline, StatusPill and more
src/components/shell/      Navigation and theme toggle
src/theme/                 Color tokens: the default preset and the dark, light and print mapping
src/lib/config/            Config schema, defaults and validation
src/lib/data/              Data types, the DataStore interface and the sample data generator
src/lib/sources/           Data source connectors (one Source object each)
src/lib/csv.ts             CSV reader for the manual logs
src/lib/utm.ts             UTM naming convention and link builder
src/lib/qr.ts              QR codes as SVG
scripts/collect.ts         The status and collect commands
scripts/sample-data.ts     The sample-data command
scripts/utm.ts             The utm command
templates/                 Header-only CSV templates for manual logs
test/                      Unit tests
```

## Leadership report
`/report` lays one quarter out for print: a cover, headline numbers, reach, what is working and what is not, the data access still needed, and the ask. Pick the quarter with `?period=2027-Q1` and narrow it with `?tags=`. "Export PDF" opens the browser's print dialog; choose "Save as PDF". It prints in the light theme with a section per page and page numbers. The narrative text comes from report notes.

## UTM links and QR codes
Tag every link you share, so traffic can be traced back to the channel and the event it came from. `npm run utm` builds the link for you and keeps the naming consistent:

```sh
npm run utm -- --url https://example.com/blog/post --channel youtube --campaign cli-launch
npm run utm -- --url https://example.com/cli --channel conference --event "ExampleConf 2026" --qr
npm run utm -- --list      # the channels and their source and medium
```

The first command prints:

```
https://example.com/blog/post?utm_source=youtube&utm_medium=video&utm_campaign=cli-launch
```

Each channel has a fixed `utm_source` and `utm_medium`:

| Channel | `utm_source` | `utm_medium` | Default `utm_content` | Use it for |
|---|---|---|---|---|
| `youtube` | `youtube` | `video` | | Video descriptions and pinned comments |
| `youtube-short` | `youtube` | `video` | `short` | Short-form video descriptions |
| `livestream` | the `--platform`: `youtube`, `twitch`, `linkedin`, `x` or `facebook` | `livestream` | | Stream descriptions, overlays and chat |
| `x` | `x` | `social` | | Posts on X |
| `linkedin` | `linkedin` | `social` | | Posts on LinkedIn |
| `facebook` | `facebook` | `social` | | Posts on Facebook |
| `blog` | `blog` | `referral` | | Links from one of your blog posts to another page |
| `newsletter` | `newsletter` | `email` | | Newsletters and other email |
| `conference` | the `--event`, e.g. `exampleconf-2026` | `conference` | `slides`, or `qr` with `--qr` | Conference slides and the QR code on them |
| `community` | the `--platform` (`discord` if not given) | `community` | | Discord, forums and other community spaces |

The rules:
- **Every value is lowercase ASCII with words joined by hyphens.** The command cleans up what you type: `"CLI Launch"` becomes `cli-launch`.
- **`utm_campaign` is required.** It names what you're promoting (`cli-launch`) or the event (`exampleconf-2026`), and stays the same across channels so they can be compared.
- **Each conference gets its own campaign**, built from the event name and year. `--event "ExampleConf" --date 2026-06-12` gives `exampleconf-2026`. Add `--campaign` to promote something else at the event; the event stays the source.
- **`utm_content` and `utm_term` are optional** (`--content`, `--term`). Use content to tell two links in the same place apart, such as `description` and `pinned-comment`.
- Other query parameters and the `#fragment` on the link are kept. Any `utm_*` parameters already on it are replaced. The order is always source, medium, campaign, content, term.

With `--qr`, the QR code is written as an SVG file to `data/qr/<campaign>-<channel>.svg` (gitignored); `--out <path>` writes it somewhere else. Put it on the last slide of a talk. SVG stays sharp at any size.

## Sources

| Category | Source | How it connects |
|---|---|---|
| CLI | npm, Homebrew, PyPI, Docker Hub, GitHub | Public APIs. Set the package or repo names under `packages` in the config |
| CLI | Other package managers | Manual log: `other-package-installs.csv` |
| Web | GA4 | Service account. Setup steps are in `src/lib/sources/ga4.ts` |
| Social | YouTube | Data API key and channel IDs |
| Social | Metricool | Credentials are read, but the connector is still a stub |
| Social | Facebook | Placeholder, or the manual `facebook-export.csv` |
| Business | CRM, product usage, product sign-ups | Placeholders until access is granted |
| Manual | Followers, conferences, content multiplier, sales-flagged deals, cross-team work, declined requests | CSV logs |

Each source reports one of these statuses: `ok`, `not_configured` (lists what's missing), `placeholder` (no data feed yet), or `error`. `npm run status` prints them, and the Data sources page in the app shows the same states with setup notes for each source.

## Manual logs
Copy a header-only template from `templates/` into `data/manual/` and add rows. You can also export the matching Google Sheet tab as CSV to the same place.

## Adding a source
Write a `Source` object (the type and statuses are in `src/lib/sources/core.ts`) and add it to the list in `src/lib/sources/index.ts`. For a non-secret list setting such as package names, give the entry a `config` path and read it with `listSetting`, so it can come from the config or from `.env`. Add a test in `test/`.

## What stays local
`.env`, `secrets/` (service account keys) and `data/` (snapshots and manual logs, which can include lead and deal details) are gitignored. Back up `data/`, because the snapshots are your baselines.

## Contributing
Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup and the checks to run, and follow the [code of conduct](CODE_OF_CONDUCT.md). Report security issues privately, as described in [SECURITY.md](SECURITY.md).

## License
[MIT](LICENSE)
