# devrel-dashboard
An open-source dashboard for tracking Developer Relations activity and showing its impact: reach, product adoption, pipeline and cost per outcome.

> **Status:** early. The data collector works today; the dashboard UI is in progress.

Built with Next.js 16, TypeScript and Tailwind CSS 4.

## Use it for your team
Fork or clone this repo, then plug in your own details. Nothing here is tied to a specific company:
- **Keys and tokens** go in `.env` (copy `.env.example`). It's gitignored.
- **Your data** lives in your own storage (local files today, your own Supabase project soon).
- **Your branding and settings** will come from a config file and theme tokens (coming soon).

The data collector pulls metrics from every source into dated JSON snapshots. Sources you haven't connected yet still appear, marked as not configured or placeholder, so the gaps are visible.

## Setup
Requires Node 22.9 or later.

```sh
npm install
cp .env.example .env    # or copy over only the variables you need
npm run dev             # dashboard at http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Start the dashboard in development mode |
| `npm run build` / `npm start` | Production build and server |
| `npm run status` | Show every data source and what it still needs (no network calls) |
| `npm run collect` | Pull every configured source and write `data/snapshots/<date>.json` |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript checks |

## Project layout
```
src/app/            Next.js App Router pages
src/lib/sources/    Data source connectors (one Source object each)
src/lib/csv.ts      CSV reader for the manual logs
scripts/collect.ts  The status and collect commands
templates/          Header-only CSV templates for manual logs
test/               Unit tests
```

## Sources

| Category | Source | How it connects |
|---|---|---|
| CLI | npm, Homebrew, PyPI, Docker Hub, GitHub | Public APIs. Set the package or repo names in `.env` |
| CLI | Other package managers | Manual log: `other-package-installs.csv` |
| Web | GA4 | Service account. Setup steps are in `src/lib/sources/ga4.ts` |
| Social | YouTube | Data API key and channel IDs |
| Social | Metricool | Credentials are read, but the connector is still a stub |
| Social | Facebook | Placeholder, or the manual `facebook-export.csv` |
| Business | CRM, CLI telemetry, portal sign-ups | Placeholders until access is granted |
| Manual | Followers, conferences, content multiplier, sales-flagged deals, cross-team work, declined requests | CSV logs |

Each source reports one of these statuses: `ok`, `not_configured` (lists what's missing), `placeholder` (no data feed yet), or `error`.

## Manual logs
Copy a header-only template from `templates/` into `data/manual/` and add rows. You can also export the matching Google Sheet tab as CSV to the same place.

## Adding a source
Write a `Source` object (the type and statuses are in `src/lib/sources/core.ts`) and add it to the list in `src/lib/sources/index.ts`. Add a test in `test/`.

## What stays local
`.env`, `secrets/` (service account keys) and `data/` (snapshots and manual logs, which can include lead and deal details) are gitignored. Back up `data/`, because the snapshots are your baselines.

## License
[MIT](LICENSE)
