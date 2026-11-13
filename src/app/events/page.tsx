import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BarList } from '@/components/charts/bar-list';
import { ChartCard, ChartEmpty } from '@/components/charts/chart-card';
import { TimeChart } from '@/components/charts/time-chart';
import { FilterBar, FilterBarFallback } from '@/components/filters/filter-bar';
import { Card, Eyebrow, Headline, KpiTile } from '@/components/ui';
import config from '@/lib/config';
import { getEvents, type Events } from '@/lib/dashboards/events';
import { getDataStore } from '@/lib/data';
import { getFilters } from '@/lib/filters/server';
import { formatDay, formatNumber, formatPercent, formatUsd } from '@/lib/format';

export const metadata: Metadata = { title: config.pages.events };

export default function EventsPage({ searchParams }: PageProps<'/events'>) {
  return (
    <main className="flex flex-1 flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Eyebrow>{config.pages.events}</Eyebrow>
        <Headline lead="On stage," accent="and what came of it." />
      </div>
      {/* The filters come from the URL, which is only known at request time. */}
      <Suspense fallback={<FilterBarFallback />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<'/events'>, 'searchParams'>) {
  const { filters, context } = await getFilters(searchParams);
  const { kpis, audience, cfp, conferences, declined } = await getEvents(getDataStore(), filters, context);
  const tagged = filters.tags.length > 0;

  return (
    <>
      <div className="flex flex-col gap-2">
        <FilterBar filters={filters} context={context} />
        {tagged && (
          <p className="text-sm text-muted">
            Tags narrow the conferences and talks. Declined requests are not tagged, so that list covers everything.
          </p>
        )}
      </div>

      <section aria-label="Headline numbers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ id, trend, ...kpi }) => (
          <KpiTile key={id} trend={trend.length > 1 ? trend : undefined} {...kpi} />
        ))}
      </section>

      <ChartCard
        title={`Estimated audience per ${audience.bucket}`}
        caption={audience.caption}
        table={{
          columns: ['Period', 'Estimated audience'],
          rows: audience.rows.map((row) => [row.period, formatNumber(row.values.audience)]),
        }}
      >
        {audience.total > 0 ? (
          <TimeChart
            kind="columns"
            series={[{ key: 'audience', label: 'Estimated audience', colorIndex: 0 }]}
            rows={audience.rows}
            label="Estimated audience of talks given, over time"
          />
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>

      <ConferenceTable conferences={conferences} />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ChartCard
          title={`Talk submissions${cfp.acceptanceRate === undefined ? '' : `: ${formatPercent(cfp.acceptanceRate)} accepted`}`}
          caption={cfp.caption}
          table={{ columns: ['Status', 'Conferences'], rows: cfp.byStatus.map((row) => [row.label, row.count]) }}
        >
          {cfp.byStatus.length > 0 ? (
            <BarList rows={cfp.byStatus.map((row) => ({ label: row.label, value: row.count }))} />
          ) : (
            <ChartEmpty />
          )}
        </ChartCard>

        <Card as="section" aria-labelledby="declined" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="declined" className="text-lg font-semibold">
              Invitations turned down: {declined.count}
            </h2>
            <p className="text-sm text-muted">{declined.caption}</p>
          </div>
          {declined.rows.length > 0 && (
            <ul className="flex flex-col text-sm">
              {declined.rows.map((row) => (
                <li key={row.id} className="flex flex-col gap-0.5 border-t border-line py-2.5">
                  <span>{row.title}</span>
                  <span className="text-xs text-muted">
                    {formatDay(row.date)}
                    {row.reason && ` · ${row.reason}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function ConferenceTable({ conferences }: { conferences: Events['conferences'] }) {
  const head = 'border-b border-line py-2 pl-4 text-right font-normal';
  const cell = 'border-b border-line py-2.5 pl-4 text-right';
  const money = (value: number | undefined) => (value === undefined ? '–' : formatUsd(Math.round(value)));
  const { rows, totals } = conferences;

  return (
    <Card as="section" aria-labelledby="conference-table" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="conference-table" className="text-lg font-semibold">
          What each conference cost and produced
        </h2>
        <p className="text-sm text-muted">{conferences.caption}</p>
      </div>
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
            <thead>
              <tr className="font-mono text-[0.7rem] tracking-[0.14em] text-muted uppercase">
                <th scope="col" className="border-b border-line py-2 font-normal">
                  Conference
                </th>
                {['Audience', 'QR scans', 'Site visits', 'Leads', 'Cost', 'Cost per lead'].map((column) => (
                  <th key={column} scope="col" className={head}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className="border-b border-line py-2.5 font-normal">
                    {row.name}
                    <span className="block text-xs text-muted">
                      {formatDay(row.date)}
                      {row.location && ` · ${row.location}`}
                    </span>
                  </th>
                  <td className={`${cell} text-muted`}>{formatNumber(row.audience)}</td>
                  <td className={`${cell} text-muted`}>{formatNumber(row.qrScans)}</td>
                  <td className={`${cell} text-muted`}>{formatNumber(row.siteVisits)}</td>
                  <td className={cell}>{formatNumber(row.leads)}</td>
                  <td className={`${cell} text-muted`}>{money(row.costUsd)}</td>
                  <td className={`${cell} font-semibold`}>{money(row.costPerLead)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="tabular-nums">
              <tr className="font-semibold">
                <th scope="row" className="py-2.5 font-semibold">
                  All {rows.length} {rows.length === 1 ? 'conference' : 'conferences'}
                </th>
                <td className="py-2.5 pl-4 text-right">{formatNumber(totals.audience)}</td>
                <td className="py-2.5 pl-4 text-right">{formatNumber(totals.qrScans)}</td>
                <td className="py-2.5 pl-4 text-right">{formatNumber(totals.siteVisits)}</td>
                <td className="py-2.5 pl-4 text-right">{formatNumber(totals.leads)}</td>
                <td className="py-2.5 pl-4 text-right">{money(totals.costUsd)}</td>
                <td className="py-2.5 pl-4 text-right">{money(totals.costPerLead)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <ChartEmpty />
      )}
    </Card>
  );
}
