import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ChartEmpty } from '@/components/charts/chart-card';
import { FilterBar, FilterBarFallback } from '@/components/filters/filter-bar';
import { Card, Eyebrow, Headline, KpiTile } from '@/components/ui';
import config from '@/lib/config';
import { getActivityLog, parseLogView, type ActivityLog, type LogChoice } from '@/lib/dashboards/activity';
import { getDataStore } from '@/lib/data';
import { getFilters } from '@/lib/filters/server';
import { formatDay, formatNumber } from '@/lib/format';

export const metadata: Metadata = { title: config.pages.activity };

export default function ActivityPage({ searchParams }: PageProps<'/activity'>) {
  return (
    <main className="flex flex-1 flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Eyebrow>{config.pages.activity}</Eyebrow>
        <Headline lead="Everything that was done," accent="in one list." />
      </div>
      {/* The filters come from the URL, which is only known at request time. */}
      <Suspense fallback={<FilterBarFallback />}>
        <Log searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Log({ searchParams }: Pick<PageProps<'/activity'>, 'searchParams'>) {
  const [{ filters, context }, params] = await Promise.all([getFilters(searchParams), searchParams]);
  const log = await getActivityLog(getDataStore(), filters, context, parseLogView(params));

  return (
    <>
      <FilterBar filters={filters} context={context} />

      <section aria-label="Headline numbers" className="grid gap-4 sm:grid-cols-3">
        {log.kpis.map(({ id, trend, ...kpi }) => (
          <KpiTile key={id} trend={trend.length > 1 ? trend : undefined} {...kpi} />
        ))}
      </section>

      <LogTable log={log} />
    </>
  );
}

function Choices({ label, choices }: { label: string; choices: LogChoice[] }) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1">
      <span className="mr-1 font-mono text-[0.7rem] tracking-[0.14em] text-muted uppercase">{label}</span>
      {choices.map((choice) => (
        <Link
          key={choice.key}
          href={choice.href}
          scroll={false}
          aria-current={choice.current ? 'true' : undefined}
          className="rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-raised hover:text-ink aria-[current=true]:bg-raised aria-[current=true]:text-ink"
        >
          {choice.label}
          {choice.count !== undefined && <span className="ml-1.5 tabular-nums opacity-70">{choice.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

function LogTable({ log }: { log: ActivityLog }) {
  const head = 'border-b border-line py-2 pl-4 text-right font-normal';
  const cell = 'border-b border-line py-2.5 pl-4 text-right align-top';

  return (
    <Card as="section" aria-labelledby="activity-log" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="activity-log" className="text-lg font-semibold">
          Activities
        </h2>
        <p className="text-sm text-muted">{log.caption}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Choices label="Type" choices={log.types} />
        <Choices label="Sort" choices={log.sorts} />
      </div>
      {log.rows.length > 0 ? (
        // Columns drop out on narrow screens instead of scrolling sideways; the detail view has every number.
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="font-mono text-[0.7rem] tracking-[0.14em] text-muted uppercase">
              <th scope="col" className="border-b border-line py-2 font-normal">
                Activity
              </th>
              <th scope="col" className="hidden border-b border-line py-2 pl-4 font-normal lg:table-cell">
                Tags
              </th>
              <th scope="col" className={head}>
                Reach
              </th>
              <th scope="col" className={`${head} hidden md:table-cell`}>
                Engagements
              </th>
              <th scope="col" className={`${head} hidden sm:table-cell`}>
                Key events
              </th>
              <th scope="col" className={`${head} hidden md:table-cell`}>
                Link
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {log.rows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="border-b border-line py-2.5 align-top font-normal">
                  <Link href={row.href} className="hover:underline">
                    {row.title}
                  </Link>
                  <span className="block text-xs text-muted">
                    {row.typeLabel} · {formatDay(row.date)}
                    {row.madeFromIt > 0 && ` · ${row.madeFromIt} made from it`}
                  </span>
                </th>
                <td className="hidden border-b border-line py-2.5 pl-4 align-top text-muted lg:table-cell">
                  {row.tags.length > 0 ? row.tags.join(', ') : '–'}
                </td>
                <td className={`${cell} font-semibold`}>{row.reach > 0 ? formatNumber(row.reach) : '–'}</td>
                <td className={`${cell} hidden text-muted md:table-cell`}>{row.engagements > 0 ? formatNumber(row.engagements) : '–'}</td>
                <td className={`${cell} hidden text-muted sm:table-cell`}>{row.keyEvents > 0 ? formatNumber(row.keyEvents) : '–'}</td>
                <td className={`${cell} hidden md:table-cell`}>
                  {row.url ? (
                    <a href={row.url} className="text-muted hover:text-ink hover:underline" aria-label={`Open "${row.title}"`}>
                      Open ↗
                    </a>
                  ) : (
                    <span className="text-muted">–</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ChartEmpty />
      )}
    </Card>
  );
}
