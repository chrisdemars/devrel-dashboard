import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BarList } from '@/components/charts/bar-list';
import { ChartCard, ChartEmpty } from '@/components/charts/chart-card';
import { TimeChart } from '@/components/charts/time-chart';
import { FilterBar, FilterBarFallback } from '@/components/filters/filter-bar';
import { AccessNeededCard, Card, Eyebrow, Headline, KpiTile } from '@/components/ui';
import config from '@/lib/config';
import { getPipeline, type Pipeline } from '@/lib/dashboards/pipeline';
import { getDataStore } from '@/lib/data';
import { getFilters } from '@/lib/filters/server';
import { formatNumber, formatPercent, formatUsd } from '@/lib/format';

export const metadata: Metadata = { title: config.pages.pipeline };

export default function PipelinePage({ searchParams }: PageProps<'/pipeline'>) {
  return (
    <main className="flex flex-1 flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Eyebrow>{config.pages.pipeline}</Eyebrow>
        <Headline lead="From attention" accent="to revenue." />
      </div>
      {/* The filters come from the URL, which is only known at request time. */}
      <Suspense fallback={<FilterBarFallback />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<'/pipeline'>, 'searchParams'>) {
  const { filters, context } = await getFilters(searchParams);
  const { kpis, keyEvents, touchpoints, channels, crm } = await getPipeline(getDataStore(), filters, context);

  return (
    <>
      <div className="flex flex-col gap-2">
        <FilterBar filters={filters} context={context} />
        {filters.tags.length > 0 && (
          <p className="text-sm text-muted">Tags apply to activities. Key events and deals are not tagged, so this page covers everything.</p>
        )}
      </div>

      <section aria-label="Headline numbers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ id, ...kpi }) => (
          <KpiTile key={id} {...kpi} />
        ))}
      </section>

      <ChartCard
        title={`Key events per ${keyEvents.bucket}, by event`}
        caption={keyEvents.caption}
        legend={keyEvents.series}
        table={{
          columns: ['Period', ...keyEvents.series.map((s) => s.label), 'Total'],
          rows: keyEvents.rows.map((row) => {
            const values = keyEvents.series.map((s) => row.values[s.key] ?? 0);
            return [row.period, ...values.map(formatNumber), formatNumber(values.reduce((a, b) => a + b, 0))];
          }),
        }}
      >
        {keyEvents.total > 0 ? (
          <TimeChart kind="columns" series={keyEvents.series} rows={keyEvents.rows} label="Key events over time, stacked by event" />
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ChartCard
          title="Influenced pipeline by touchpoint"
          caption={touchpoints.caption}
          table={{
            columns: ['Touchpoint', 'Deals', 'Pipeline', 'Share'],
            rows: touchpoints.rows.map((row) => [row.label, row.count, formatUsd(row.amountUsd), formatPercent(row.share)]),
          }}
        >
          {touchpoints.rows.length > 0 ? (
            <BarList
              rows={touchpoints.rows.map((row) => ({ label: row.label, value: row.amountUsd, share: row.share }))}
              format={formatUsd}
            />
          ) : (
            <ChartEmpty />
          )}
        </ChartCard>

        {crm && (
          <AccessNeededCard title="Deals straight from the CRM" source="CRM">
            {crm.note ?? 'The CRM is not connected, so influenced deals are logged by hand.'} With read access, or a
            monthly report of deals that touched DevRel content or events, these numbers would be complete and current.
          </AccessNeededCard>
        )}
      </div>

      <ChannelTable channels={channels} />
    </>
  );
}

function ChannelTable({ channels }: { channels: Pipeline['channels'] }) {
  const head = 'border-b border-line py-2 pl-4 text-right font-normal';
  const cell = 'border-b border-line py-2.5 pl-4 text-right';

  return (
    <Card as="section" aria-labelledby="channel-cost" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="channel-cost" className="text-lg font-semibold">
          Spend and influenced deals, by channel
        </h2>
        <p className="text-sm text-muted">{channels.caption}</p>
      </div>
      {channels.rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <thead>
              <tr className="font-mono text-[0.7rem] tracking-[0.14em] text-muted uppercase">
                <th scope="col" className="border-b border-line py-2 font-normal">
                  Channel
                </th>
                {['Spend', 'Deals', 'Pipeline', 'Cost per deal'].map((column) => (
                  <th key={column} scope="col" className={head}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {channels.rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className="border-b border-line py-2.5 font-normal">
                    {row.label}
                  </th>
                  <td className={`${cell} text-muted`}>{row.spendUsd > 0 ? formatUsd(row.spendUsd) : 'None logged'}</td>
                  <td className={cell}>{formatNumber(row.deals)}</td>
                  <td className={cell}>{formatUsd(row.pipelineUsd)}</td>
                  <td className={`${cell} font-semibold`}>
                    {row.costPerDeal === undefined ? '–' : formatUsd(Math.round(row.costPerDeal))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ChartEmpty />
      )}
    </Card>
  );
}
