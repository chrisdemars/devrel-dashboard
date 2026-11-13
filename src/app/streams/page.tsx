import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BarList } from '@/components/charts/bar-list';
import { ChartCard, ChartEmpty } from '@/components/charts/chart-card';
import { TimeChart } from '@/components/charts/time-chart';
import { FilterBar, FilterBarFallback } from '@/components/filters/filter-bar';
import { AccessNeededCard, Card, Eyebrow, Headline, KpiTile } from '@/components/ui';
import config from '@/lib/config';
import { labelFor } from '@/lib/dashboards/shared';
import { getStreams, type Streams } from '@/lib/dashboards/streams';
import { getDataStore } from '@/lib/data';
import { getFilters } from '@/lib/filters/server';
import { describeDelta, formatDay, formatNumber } from '@/lib/format';

export const metadata: Metadata = { title: config.pages.streams };

export default function StreamsPage({ searchParams }: PageProps<'/streams'>) {
  return (
    <main className="flex flex-1 flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Eyebrow>{config.pages.streams}</Eyebrow>
        <Headline lead="Live," accent="on every platform." />
      </div>
      {/* The filters come from the URL, which is only known at request time. */}
      <Suspense fallback={<FilterBarFallback />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<'/streams'>, 'searchParams'>) {
  const { filters, context } = await getFilters(searchParams);
  const { kpis, streams, platforms, followers, missingPlatforms } = await getStreams(getDataStore(), filters, context);
  const tagged = filters.tags.length > 0;

  return (
    <>
      <div className="flex flex-col gap-2">
        <FilterBar filters={filters} context={context} />
        {tagged && (
          <p className="text-sm text-muted">
            Tags narrow the livestreams and their viewers (marked “filtered by tag”). Follower counts are not tagged,
            so they cover everything.
          </p>
        )}
      </div>

      <section aria-label="Headline numbers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ id, label, tagged: byTag, ...kpi }) => (
          <KpiTile key={id} label={byTag && tagged ? `${label} · filtered by tag` : label} {...kpi} />
        ))}
      </section>

      <StreamTable streams={streams} tagged={tagged} />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ChartCard
          title={`Viewers per stream, by platform${tagged ? ' · filtered by tag' : ''}`}
          caption={platforms.caption}
          table={{
            columns: ['Platform', 'Streams', 'Live viewers', 'Peak concurrent', 'Replay views', 'Per stream'],
            rows: platforms.rows.map((row) => [
              row.label,
              row.streams,
              formatNumber(row.live),
              formatNumber(row.peak),
              formatNumber(row.replays),
              formatNumber(Math.round(row.perStream)),
            ]),
          }}
        >
          {platforms.rows.length > 0 ? (
            <BarList rows={platforms.rows.map((row) => ({ label: row.label, value: Math.round(row.perStream) }))} />
          ) : (
            <ChartEmpty />
          )}
        </ChartCard>

        {missingPlatforms.map(({ key, label, note }) => (
          <AccessNeededCard key={key} title={`${label} streams and followers`} source={label}>
            {note ?? `The ${label} source is not connected, so its viewers and followers are missing from this page.`}
          </AccessNeededCard>
        ))}
      </div>

      <ChartCard
        title="Followers by platform"
        caption={followers.caption}
        legend={followers.series}
        mark="line"
        table={{
          columns: ['Platform', 'Start of period', 'End of period', 'Change'],
          rows: followers.table.map((row) => [
            row.label,
            formatNumber(row.start),
            formatNumber(row.end),
            row.change === undefined ? '–' : describeDelta(row.change).text,
          ]),
        }}
      >
        {followers.rows.length > 1 ? (
          <TimeChart kind="line" series={followers.series} rows={followers.rows} label="Followers over time, by platform" />
        ) : (
          <ChartEmpty>
            {followers.table.length > 0 ? 'Pick a range of two weeks or more to see the trend.' : 'No follower counts collected yet.'}
          </ChartEmpty>
        )}
      </ChartCard>
    </>
  );
}

function StreamTable({ streams, tagged }: { streams: Streams['streams']; tagged: boolean }) {
  const cell = 'border-b border-line py-2.5 pr-4';
  const head = 'border-b border-line py-2 pr-4 font-normal';

  return (
    <Card as="section" aria-labelledby="stream-table" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="stream-table" className="text-lg font-semibold">
          Each livestream, on each platform{tagged && <span className="font-normal text-muted"> · filtered by tag</span>}
        </h2>
        <p className="text-sm text-muted">{streams.caption}</p>
      </div>
      {streams.rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
            <thead>
              <tr className="font-mono text-[0.7rem] tracking-[0.14em] text-muted uppercase">
                <th scope="col" className={head}>
                  Stream
                </th>
                <th scope="col" className={head}>
                  Platform
                </th>
                <th scope="col" className={`${head} text-right`}>
                  Live viewers
                </th>
                <th scope="col" className={`${head} text-right`}>
                  Peak concurrent
                </th>
                <th scope="col" className="border-b border-line py-2 text-right font-normal">
                  Replay views
                </th>
              </tr>
            </thead>
            {streams.rows.map((stream) => (
              <tbody key={stream.id} className="tabular-nums">
                <tr>
                  <th scope="rowgroup" rowSpan={stream.byPlatform.length + 1} className={`${cell} align-top font-normal`}>
                    {stream.url ? (
                      <a href={stream.url} className="hover:underline">
                        {stream.title}
                      </a>
                    ) : (
                      stream.title
                    )}
                    <span className="block text-xs text-muted">{formatDay(stream.date)}</span>
                  </th>
                  <th scope="row" className={`${cell} font-semibold`}>
                    All platforms
                  </th>
                  <td className={`${cell} text-right font-semibold`}>{formatNumber(stream.live)}</td>
                  <td className={`${cell} text-right font-semibold`}>{formatNumber(stream.peak)}</td>
                  <td className="border-b border-line py-2.5 text-right font-semibold">{formatNumber(stream.replays)}</td>
                </tr>
                {stream.byPlatform.map((row) => (
                  <tr key={row.platform} className="text-muted">
                    <th scope="row" className={`${cell} font-normal`}>
                      {labelFor(row.platform)}
                    </th>
                    <td className={`${cell} text-right`}>{formatNumber(row.live)}</td>
                    <td className={`${cell} text-right`}>{formatNumber(row.peak)}</td>
                    <td className="border-b border-line py-2.5 text-right">{formatNumber(row.replays)}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      ) : (
        <ChartEmpty />
      )}
    </Card>
  );
}
