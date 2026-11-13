import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BarList } from '@/components/charts/bar-list';
import { ChartCard, ChartEmpty } from '@/components/charts/chart-card';
import { TimeChart } from '@/components/charts/time-chart';
import { FilterBar, FilterBarFallback } from '@/components/filters/filter-bar';
import { AccessNeededCard, Eyebrow, Headline, KpiTile } from '@/components/ui';
import config from '@/lib/config';
import { getLaunch, labelFor } from '@/lib/dashboards/launch';
import { getDataStore } from '@/lib/data';
import { getFilters } from '@/lib/filters/server';
import { formatNumber, formatPercent } from '@/lib/format';

export const metadata: Metadata = { title: config.pages.launch };

export default function LaunchPage({ searchParams }: PageProps<'/launch'>) {
  return (
    <main className="flex flex-1 flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Eyebrow>{config.pages.launch}</Eyebrow>
        <Headline lead="Installs" accent="and adoption." />
      </div>
      {/* The filters come from the URL, which is only known at request time. */}
      <Suspense fallback={<FilterBarFallback />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<'/launch'>, 'searchParams'>) {
  const { filters, context } = await getFilters(searchParams);
  const { kpis, installs, funnel, activeUsers, signups } = await getLaunch(getDataStore(), filters, context);
  const usersSeries = [{ key: 'active_users', label: 'Weekly active users', colorIndex: 0 }];

  return (
    <>
      <div className="flex flex-col gap-2">
        <FilterBar filters={filters} context={context} />
        {filters.tags.length > 0 && (
          <p className="text-sm text-muted">Tags apply to activities. The product numbers on this page are not tagged, so they cover everything.</p>
        )}
      </div>

      <section aria-label="Headline numbers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ id, ...kpi }) => (
          <KpiTile key={id} {...kpi} />
        ))}
      </section>

      <ChartCard
        title={`Installs per ${installs.bucket}, by channel`}
        caption={installs.caption}
        legend={installs.series}
        table={{
          columns: ['Period', ...installs.series.map((s) => s.label), 'Total'],
          rows: installs.rows.map((row) => {
            const values = installs.series.map((s) => row.values[s.key] ?? 0);
            return [row.period, ...values.map(formatNumber), formatNumber(values.reduce((a, b) => a + b, 0))];
          }),
        }}
      >
        {installs.total > 0 ? (
          <TimeChart kind="columns" series={installs.series} rows={installs.rows} label="Installs over time, stacked by channel" />
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {funnel ? (
          <ChartCard
            title="From install to first real use"
            caption={funnel.caption}
            table={{
              columns: ['Step', 'People', 'Share of installs'],
              rows: funnel.steps.map((step) => [step.label, formatNumber(step.value), formatPercent(step.share)]),
            }}
          >
            {funnel.steps[0].value > 0 ? <BarList rows={funnel.steps} /> : <ChartEmpty />}
          </ChartCard>
        ) : (
          <AccessNeededCard title="From install to first real use" source="Product usage data">
            Ask the product team for opt-in usage data. It shows how many installs go on to a first real use, which
            matters more than the install count.
          </AccessNeededCard>
        )}

        {activeUsers ? (
          <ChartCard
            title="Weekly active users"
            caption={activeUsers.caption}
            mark="line"
            table={{
              columns: ['Week', 'Active users'],
              rows: activeUsers.rows.map((row) => [row.period, formatNumber(row.values.active_users)]),
            }}
          >
            {activeUsers.rows.some((row) => row.values.active_users > 0) ? (
              <TimeChart kind="line" series={usersSeries} rows={activeUsers.rows} label="Weekly active users over time" />
            ) : (
              <ChartEmpty />
            )}
          </ChartCard>
        ) : (
          <AccessNeededCard title="Weekly active users" source="Product usage data">
            Needs the same opt-in usage data. It shows whether people keep using the product after trying it.
          </AccessNeededCard>
        )}

        {signups ? (
          <ChartCard
            title="Sign-ups by “How did you hear about us?”"
            caption={signups.caption}
            table={{
              columns: ['Answer', 'Sign-ups', 'Share'],
              rows: signups.rows.map((row) => [labelFor(row.key), formatNumber(row.value), formatPercent(row.share)]),
            }}
          >
            {signups.total > 0 ? (
              <BarList rows={signups.rows.map((row) => ({ label: labelFor(row.key), value: row.value, share: row.share }))} />
            ) : (
              <ChartEmpty />
            )}
          </ChartCard>
        ) : (
          <AccessNeededCard title="Sign-ups by “How did you hear about us?”" source="Sign-up form">
            Ask for a “How did you hear about us?” field on the sign-up form. It is the simplest way to tie sign-ups to
            talks, posts and streams.
          </AccessNeededCard>
        )}

        <AccessNeededCard title="Free to paid" source="CRM">
          How many free users become sales conversations, trials or deals. Needs CRM access, or a monthly report that
          links free accounts to deals.
        </AccessNeededCard>
      </div>
    </>
  );
}
