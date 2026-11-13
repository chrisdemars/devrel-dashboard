import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Card, Eyebrow, Headline, StatusPill } from '@/components/ui';
import config from '@/lib/config';
import { getSourcesPage, type SourceCard } from '@/lib/dashboards/sources';
import { dataMode } from '@/lib/data';
import sources, { checkSources, readLatestSnapshot } from '@/lib/sources';

export const metadata: Metadata = { title: config.pages.sources };

export default function SourcesPage() {
  return (
    <main className="flex flex-1 flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Eyebrow>{config.pages.sources}</Eyebrow>
        <Headline lead="Where the numbers come from," accent="and what is still missing." />
      </div>
      {/* Settings and files are read when the page is asked for, not when the app is built. */}
      <Suspense fallback={<p className="text-sm text-muted">Checking the sources…</p>}>
        <Sources />
      </Suspense>
    </main>
  );
}

const when = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
const formatTime = (iso: string) => (Number.isNaN(Date.parse(iso)) ? iso : `${when.format(new Date(iso))} UTC`);

async function Sources() {
  await connection();
  const page = getSourcesPage(checkSources(sources), await readLatestSnapshot());

  return (
    <>
      <Card as="section" aria-label="Summary" className="flex flex-col gap-3">
        <p className="text-lg font-semibold">{page.summary}</p>
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          {page.counts.map(({ status, label, count }) => (
            <li key={status}>
              <span className="font-semibold text-ink tabular-nums">{count}</span> {label.toLowerCase()}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">
          {page.lastCollectedAt
            ? `Last collected ${formatTime(page.lastCollectedAt)}.`
            : 'Nothing has been collected yet. Run "npm run collect" once a source is connected.'}{' '}
          This page shows the same states as &quot;npm run status&quot;.
          {dataMode() === 'sample' && ' The dashboards are showing sample data, whatever is connected here.'}
        </p>
      </Card>

      {page.groups.map((group) => (
        <section key={group.category} aria-labelledby={`group-${group.category}`} className="flex flex-col gap-4">
          <h2 id={`group-${group.category}`} className="text-lg font-semibold">
            {group.label}
          </h2>
          <div className="grid items-start gap-4 md:grid-cols-2">
            {group.sources.map((source) => (
              <SourceCardView key={source.id} source={source} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function SourceCardView({ source }: { source: SourceCard }) {
  const { lastRun } = source;
  return (
    <Card as="article" aria-labelledby={`source-${source.id}`} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={`source-${source.id}`} className="min-w-0 font-semibold">
          {source.name}
        </h3>
        <StatusPill status={source.status} />
      </div>

      {source.note && <p className="text-sm text-muted">{source.note}</p>}

      {source.missing.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-muted">Still needs:</p>
          <ul className="flex flex-col gap-1">
            {source.missing.map((item) => (
              <li key={item} className="font-mono text-xs break-words">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lastRun?.error && <p className="text-sm break-words text-negative">Last collection failed: {lastRun.error}</p>}

      <p className="text-xs text-muted">
        {lastRun ? `Last collected ${formatTime(lastRun.at)}` : 'Not collected yet'}
      </p>

      {(source.setup.length > 0 || source.planned.length > 0) && (
        <details className="text-sm">
          <summary className="cursor-pointer font-mono text-[0.7rem] tracking-[0.14em] text-muted uppercase hover:text-ink">
            Setup notes
          </summary>
          {source.setup.length > 0 && (
            <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-muted">
              {source.setup.map((step) => (
                <li key={step} className="break-words">
                  {step}
                </li>
              ))}
            </ol>
          )}
          {source.planned.length > 0 && (
            <p className="mt-3 text-muted">
              When access is granted, the connector will read: <span className="font-mono text-xs break-words">{source.planned.join(', ')}</span>
            </p>
          )}
        </details>
      )}
    </Card>
  );
}
