import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BarList } from '@/components/charts/bar-list';
import { ChartCard, ChartEmpty } from '@/components/charts/chart-card';
import { TimeChart } from '@/components/charts/time-chart';
import { FilterBar, FilterBarFallback } from '@/components/filters/filter-bar';
import { AccessNeededCard, Card, Eyebrow, Headline, KpiTile } from '@/components/ui';
import config from '@/lib/config';
import { getContent, type Content } from '@/lib/dashboards/content';
import { labelFor } from '@/lib/dashboards/launch';
import { getDataStore } from '@/lib/data';
import { getFilters } from '@/lib/filters/server';
import { formatDay, formatNumber, formatPercent } from '@/lib/format';

export const metadata: Metadata = { title: config.pages.content };

export default function ContentPage({ searchParams }: PageProps<'/content'>) {
  return (
    <main className="flex flex-1 flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Eyebrow>{config.pages.content}</Eyebrow>
        <Headline lead="One post," accent="many formats." />
      </div>
      {/* The filters come from the URL, which is only known at request time. */}
      <Suspense fallback={<FilterBarFallback />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<'/content'>, 'searchParams'>) {
  const { filters, context } = await getFilters(searchParams);
  const content = await getContent(getDataStore(), filters, context);
  const { kpis, sessions, channels, subscribers } = content;
  const tagged = filters.tags.length > 0;

  return (
    <>
      <div className="flex flex-col gap-2">
        <FilterBar filters={filters} context={context} />
        {tagged && (
          <p className="text-sm text-muted">
            Tags narrow the posts and their reach (marked “filtered by tag”). Site traffic and subscriber numbers are
            not tagged, so they cover everything.
          </p>
        )}
      </div>

      <section aria-label="Headline numbers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ id, label, tagged: byTag, ...kpi }) => (
          <KpiTile key={id} label={byTag && tagged ? `${label} · filtered by tag` : label} {...kpi} />
        ))}
      </section>

      <PostTable posts={content.posts} tagged={tagged} />

      <Card as="section" aria-labelledby="top-posts" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="top-posts" className="text-lg font-semibold">
            Top posts: traffic and key events{tagged && <span className="font-normal text-muted"> · filtered by tag</span>}
          </h2>
          <p className="text-sm text-muted">{content.topCaption}</p>
        </div>
        {content.topByViews.length > 0 ? (
          <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
            <TopList title="By views" posts={content.topByViews} colorIndex={0} />
            {content.topByKeyEvents.length > 0 && (
              <TopList title="By key events" posts={content.topByKeyEvents} colorIndex={1} />
            )}
          </div>
        ) : (
          <ChartEmpty />
        )}
      </Card>

      <ChartCard
        title={`Site sessions per ${sessions.bucket}, by channel`}
        caption={sessions.caption}
        legend={sessions.series}
        table={{
          columns: ['Period', ...sessions.series.map((s) => s.label), 'Total'],
          rows: sessions.rows.map((row) => {
            const values = sessions.series.map((s) => row.values[s.key] ?? 0);
            return [row.period, ...values.map(formatNumber), formatNumber(values.reduce((a, b) => a + b, 0))];
          }),
        }}
      >
        {sessions.total > 0 ? (
          <TimeChart kind="columns" series={sessions.series} rows={sessions.rows} label="Site sessions over time, stacked by channel" />
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ChartCard
          title="Engaged sessions by channel"
          caption={content.channelCaption}
          table={{
            columns: ['Channel', 'Sessions', 'Engaged sessions', 'Engaged'],
            rows: channels.map((c) => [c.label, formatNumber(c.sessions), formatNumber(c.engaged), formatPercent(c.rate)]),
          }}
        >
          {channels.length > 0 ? (
            <BarList rows={channels.map((c) => ({ label: c.label, value: c.engaged, share: c.rate }))} />
          ) : (
            <ChartEmpty />
          )}
        </ChartCard>

        {subscribers ? (
          <ChartCard
            title="YouTube subscribers"
            caption={subscribers.caption}
            mark="line"
            table={{
              columns: ['Week', 'Subscribers'],
              rows: subscribers.rows.map((row) => [row.period, formatNumber(row.values.subscribers)]),
            }}
          >
            {subscribers.rows.length > 1 ? (
              <TimeChart
                kind="line"
                series={[{ key: 'subscribers', label: 'Subscribers', colorIndex: 0 }]}
                rows={subscribers.rows}
                label="YouTube subscribers over time"
              />
            ) : (
              <ChartEmpty>Pick a range of two weeks or more to see the trend.</ChartEmpty>
            )}
          </ChartCard>
        ) : (
          <AccessNeededCard title="YouTube subscribers" source="YouTube">
            Connect the YouTube source to track subscribers over time. See the Data sources page for what it needs.
          </AccessNeededCard>
        )}
      </div>
    </>
  );
}

function TopList({ title, posts, colorIndex }: { title: string; posts: Content['topByViews']; colorIndex: number }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-mono text-xs tracking-[0.18em] text-muted uppercase">{title}</h3>
      <BarList rows={posts.map((post) => ({ label: post.title, value: post.value }))} colorIndex={colorIndex} />
    </div>
  );
}

function PostTable({ posts, tagged }: { posts: Content['posts']; tagged: boolean }) {
  return (
    <Card as="section" aria-labelledby="post-reach" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="post-reach" className="text-lg font-semibold">
          Reach per post, across every format{tagged && <span className="font-normal text-muted"> · filtered by tag</span>}
        </h2>
        <p className="text-sm text-muted">{posts.caption}</p>
      </div>
      {posts.rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead>
              <tr className="font-mono text-[0.7rem] tracking-[0.14em] text-muted uppercase">
                <th scope="col" className="border-b border-line py-2 pr-4 font-normal">
                  Post
                </th>
                <th scope="col" className="border-b border-line py-2 pr-4 font-normal">
                  Also made into
                </th>
                <th scope="col" className="border-b border-line py-2 pr-4 text-right font-normal">
                  Post alone
                </th>
                <th scope="col" className="border-b border-line py-2 pr-4 text-right font-normal">
                  All formats
                </th>
                <th scope="col" className="border-b border-line py-2 text-right font-normal">
                  Multiplier
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {posts.rows.map((post) => (
                <tr key={post.id}>
                  <th scope="row" className="border-b border-line py-2.5 pr-4 font-normal">
                    {post.url ? (
                      <a href={post.url} className="hover:underline">
                        {post.title}
                      </a>
                    ) : (
                      post.title
                    )}
                    <span className="block text-xs text-muted">{formatDay(post.date)}</span>
                  </th>
                  <td className="border-b border-line py-2.5 pr-4 text-muted">
                    {post.formats.length > 0 ? post.formats.map(labelFor).join(', ') : '–'}
                  </td>
                  <td className="border-b border-line py-2.5 pr-4 text-right text-muted">{formatNumber(post.postReach)}</td>
                  <td className="border-b border-line py-2.5 pr-4 text-right font-semibold">{formatNumber(post.totalReach)}</td>
                  <td className="border-b border-line py-2.5 text-right">
                    {post.multiplier === undefined ? '–' : `${post.multiplier.toFixed(1)}×`}
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
