# devrel-dashboard
[![CI](https://github.com/chrisdemars/devrel-dashboard/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/chrisdemars/devrel-dashboard/actions/workflows/ci.yml)

An open-source dashboard for tracking Developer Relations activity and showing its impact: reach, product adoption, pipeline and cost per outcome.

> **Status:** early. The data collector works today; the dashboard UI is in progress.

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
| `org.name`, `org.url`, `org.logo` | Name, link and logo shown in the app and the report | `name` is required |
| `theme.preset`, `theme.fonts` | Theme preset and the heading, body and monospace fonts | `default`; Inter and JetBrains Mono |
| `sources.enabled` | `'all'`, or a list of source ids to show and collect | `'all'` |
| `packages.*` | npm, Homebrew, PyPI, Docker Hub and GitHub names to track | none |
| `ga4.keyEvents` | GA4 key events to report | every key event |
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

## Project layout
```
devrel.config.example.ts   Example org config (copy to config/devrel.config.ts)
src/app/                   Next.js App Router pages
src/lib/config/            Config schema, defaults and validation
src/lib/sources/           Data source connectors (one Source object each)
src/lib/csv.ts             CSV reader for the manual logs
scripts/collect.ts         The status and collect commands
templates/                 Header-only CSV templates for manual logs
test/                      Unit tests
```

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

Each source reports one of these statuses: `ok`, `not_configured` (lists what's missing), `placeholder` (no data feed yet), or `error`.

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
