import Link from 'next/link';
import { Suspense } from 'react';
import { FilterBar, FilterBarFallback } from '@/components/filters/filter-bar';
import { Card, Eyebrow, Headline, KpiTile, StatusPill } from '@/components/ui';
import config from '@/lib/config';
import { getOverview, type Overview } from '@/lib/dashboards/overview';
import { getDataStore } from '@/lib/data';
import { getFilters } from '@/lib/filters/server';
import { formatDay, formatNumber } from '@/lib/format';

export default function Home({ searchParams }: PageProps<'/'>) {
  return (
    <main className="flex flex-1 flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Eyebrow>{config.pages.overview}</Eyebrow>
        <Headline lead="DevRel," accent="measured." />
      </div>
      {/* The filters come from the URL, which is only known at request time. */}
      <Suspense fallback={<FilterBarFallback />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<'/'>, 'searchParams'>) {
  const { filters, context } = await getFilters(searchParams);
  const overview = await getOverview(getDataStore(), filters, context, config.launch);

  return (
    <>
      <div className="flex flex-col gap-2">
        <FilterBar filters={filters} context={context} />
        {filters.tags.length > 0 && (
          <p className="text-sm text-muted">
            Tags narrow the activity numbers (marked “filtered by tag”). Product, site and pipeline numbers always cover
            everything.
          </p>
        )}
      </div>

      <section aria-label="Headline numbers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {overview.kpis.map(({ id, label, tagged, ...kpi }) => (
          <KpiTile key={id} label={tagged && filters.tags.length > 0 ? `${label} · filtered by tag` : label} {...kpi} />
        ))}
        {overview.launch && <LaunchCountdown launch={overview.launch} />}
      </section>

      <SourceSummary sources={overview.sources} />
    </>
  );
}

function LaunchCountdown({ launch }: { launch: NonNullable<Overview['launch']> }) {
  const days = Math.abs(launch.daysAway);
  const unit = days === 1 ? 'day' : 'days';

  return (
    <Card className="flex flex-col gap-3">
      <Eyebrow>{launch.label}</Eyebrow>
      <p className="text-4xl leading-none font-semibold tracking-tight">
        {launch.daysAway === 0 ? 'Today' : formatNumber(days)}
        {launch.daysAway !== 0 && (
          <span className="ml-2 text-base font-normal text-muted">
            {launch.daysAway > 0 ? `${unit} to go` : `${unit} ago`}
          </span>
        )}
      </p>
      <p className="text-sm text-muted">
        {launch.daysAway > 0 ? 'Launches' : 'Launched'} {formatDay(launch.date)}.
      </p>
      <p className="mt-auto border-t border-line pt-3 text-sm text-muted">
        {launch.daysAway > 0
          ? 'Numbers captured before this date are the baseline that later growth is measured against.'
          : 'Everything before this date is the baseline that growth is measured against.'}
      </p>
    </Card>
  );
}

function SourceSummary({ sources }: { sources: Overview['sources'] }) {
  return (
    <Card as="section" aria-labelledby="sources-heading" className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <h2 id="sources-heading" className="font-mono text-xs tracking-[0.18em] text-muted uppercase">
        Data sources
      </h2>
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {sources.byStatus.map(({ status, count }) => (
          <li key={status} className="flex items-center gap-2">
            <span className="font-mono text-sm">{count}</span>
            <StatusPill status={status} />
          </li>
        ))}
      </ul>
      <Link href="/sources" className="ml-auto text-sm text-accent hover:underline print:hidden">
        See all {sources.total} sources <span aria-hidden="true">→</span>
      </Link>
    </Card>
  );
}
