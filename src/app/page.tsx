import { Suspense } from 'react';
import { FilterBar, FilterBarFallback } from '@/components/filters/filter-bar';
import { Card, Eyebrow, Headline } from '@/components/ui';
import config from '@/lib/config';
import { getDataStore } from '@/lib/data';
import { COMPARISON_LABELS, comparisonRange, toDataFilter } from '@/lib/filters';
import { getFilters } from '@/lib/filters/server';
import { formatDayRange, formatNumber } from '@/lib/format';

export default function Home({ searchParams }: PageProps<'/'>) {
  return (
    <main className="flex flex-1 flex-col justify-center gap-8 py-10">
      <div className="flex flex-col gap-4">
        <Eyebrow>{config.pages.overview}</Eyebrow>
        <Headline lead="DevRel," accent="measured." />
      </div>
      {/* The filters come from the URL, which is only known at request time. */}
      <Suspense fallback={<FilterBarFallback />}>
        <FilteredSummary searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function activities(count: number): string {
  return `${formatNumber(count)} ${count === 1 ? 'activity' : 'activities'}`;
}

/** A stand-in for the dashboard: it shows the filters reaching the data. */
async function FilteredSummary({ searchParams }: Pick<PageProps<'/'>, 'searchParams'>) {
  const { filters, context } = await getFilters(searchParams);
  const store = getDataStore();
  const compared = comparisonRange(filters, context);
  const [current, previous] = await Promise.all([
    store.getActivities(toDataFilter(filters)),
    compared ? store.getActivities({ ...toDataFilter(filters), ...compared }) : undefined,
  ]);

  return (
    <>
      <FilterBar filters={filters} context={context} />
      <Card className="max-w-2xl">
        <p>
          <span className="font-mono text-ink">{activities(current.length)}</span>{' '}
          <span className="text-muted">logged from {formatDayRange(filters.from, filters.to)}.</span>
        </p>
        <p className="mt-2 text-muted">
          {compared && previous
            ? `${COMPARISON_LABELS[filters.compare]}: ${activities(previous.length)} from ${formatDayRange(compared.from, compared.to)}.`
            : 'Compared with the targets set for each metric.'}
        </p>
        <p className="mt-4 text-muted">The dashboards arrive next.</p>
      </Card>
    </>
  );
}
