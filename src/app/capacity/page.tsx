import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BarList } from '@/components/charts/bar-list';
import { ChartCard, ChartEmpty } from '@/components/charts/chart-card';
import { TimeChart } from '@/components/charts/time-chart';
import { FilterBar, FilterBarFallback } from '@/components/filters/filter-bar';
import { Card, Eyebrow, Headline, KpiTile, VsPanel } from '@/components/ui';
import config from '@/lib/config';
import { formatRate, getCapacity, type Capacity, type StaffingRow } from '@/lib/dashboards/capacity';
import { getDataStore } from '@/lib/data';
import { getFilters } from '@/lib/filters/server';
import { formatDay, formatNumber } from '@/lib/format';

export const metadata: Metadata = { title: config.pages.capacity };

export default function CapacityPage({ searchParams }: PageProps<'/capacity'>) {
  return (
    <main className="flex flex-1 flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Eyebrow>{config.pages.capacity}</Eyebrow>
        <Headline lead="What the team can do," accent="and what one more person adds." />
      </div>
      {/* The filters come from the URL, which is only known at request time. */}
      <Suspense fallback={<FilterBarFallback />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<'/capacity'>, 'searchParams'>) {
  const { filters, context } = await getFilters(searchParams);
  const { kpis, output, crossTeam, declined, staffing } = await getCapacity(getDataStore(), filters, context, config.team.people);
  const tagged = filters.tags.length > 0;

  return (
    <>
      <div className="flex flex-col gap-2">
        <FilterBar filters={filters} context={context} />
        {tagged && (
          <p className="text-sm text-muted">
            Tags narrow the work counted here. Logged requests that were turned down are not tagged, so those cover everything.
          </p>
        )}
      </div>

      <section aria-label="Headline numbers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ id, trend, ...kpi }) => (
          <KpiTile key={id} trend={trend.length > 1 ? trend : undefined} {...kpi} />
        ))}
      </section>

      <ChartCard
        title={`Output per ${output.bucket}`}
        caption={output.caption}
        legend={output.series}
        table={{
          columns: ['Period', ...output.series.map((item) => item.label), 'Total'],
          rows: output.rows.map((row) => [
            row.period,
            ...output.series.map((item) => row.values[item.key] ?? 0),
            output.series.reduce((sum, item) => sum + (row.values[item.key] ?? 0), 0),
          ]),
        }}
      >
        {output.total > 0 ? (
          <TimeChart kind="columns" series={output.series} rows={output.rows} label="Pieces of work produced over time, by kind" />
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>

      <Staffing staffing={staffing} />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ChartCard
          title={`Contributions to other teams: ${formatNumber(crossTeam.count)}`}
          caption={crossTeam.caption}
          table={{
            columns: ['Date', 'Team', 'Contribution'],
            rows: crossTeam.rows.map((row) => [formatDay(row.date), row.team, row.title]),
          }}
        >
          {crossTeam.byTeam.length > 0 ? (
            <BarList rows={crossTeam.byTeam.map((row) => ({ label: row.label, value: row.count, share: row.count / crossTeam.count }))} />
          ) : (
            <ChartEmpty />
          )}
        </ChartCard>

        <ChartCard
          title={`Requests turned down: ${formatNumber(declined.count)}`}
          caption={declined.caption}
          table={{
            columns: ['Date', 'Request', 'Reason'],
            rows: declined.rows.map((row) => [formatDay(row.date), row.title, row.reason ?? '–']),
          }}
        >
          {declined.byKind.length > 0 ? (
            <BarList
              colorIndex={1}
              rows={declined.byKind.map((row) => ({ label: row.label, value: row.count, share: row.count / declined.count }))}
            />
          ) : (
            <ChartEmpty />
          )}
        </ChartCard>
      </div>
    </>
  );
}

function Figures({ rows, pick }: { rows: StaffingRow[]; pick: 'current' | 'projected' }) {
  return (
    <dl className="flex flex-col gap-3">
      {rows.map((row) => (
        <div key={row.id} className="flex flex-col">
          <dd className="text-2xl font-semibold tabular-nums">{formatRate(row[pick])}</dd>
          <dt className="text-sm text-muted">{row.label}</dt>
        </div>
      ))}
    </dl>
  );
}

function Staffing({ staffing }: { staffing: Capacity['staffing'] }) {
  const { people, rows, byType, caption } = staffing;
  const cell = 'border-t border-line py-2.5 pl-4 text-right';
  const today = `Today: ${formatRate(people)} ${people === 1 ? 'person' : 'people'}`;

  return (
    <Card as="section" aria-labelledby="staffing" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="staffing" className="text-lg font-semibold">
          What one more person would add, every 30 days
        </h2>
        <p className="text-sm text-muted">{caption}</p>
      </div>
      {rows[0].current > 0 ? (
        <VsPanel
          left={{ label: today, children: <Figures rows={rows} pick="current" /> }}
          right={{ label: 'With one more person', children: <Figures rows={rows} pick="projected" /> }}
        />
      ) : (
        <ChartEmpty />
      )}
      {byType.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="font-mono text-[0.7rem] tracking-[0.14em] text-muted uppercase">
                <th scope="col" className="py-2 font-normal">
                  Per 30 days
                </th>
                <th scope="col" className="py-2 pl-4 text-right font-normal">
                  Today
                </th>
                <th scope="col" className="py-2 pl-4 text-right font-normal">
                  With one more
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {byType.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className="border-t border-line py-2.5 font-normal">
                    {row.label}
                  </th>
                  <td className={`${cell} text-muted`}>{formatRate(row.current)}</td>
                  <td className={`${cell} font-semibold`}>{formatRate(row.projected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
