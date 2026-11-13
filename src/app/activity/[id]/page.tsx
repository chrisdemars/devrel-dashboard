import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Card, Eyebrow } from '@/components/ui';
import config from '@/lib/config';
import { getActivityDetail, logHref, parseLogView, type RelatedActivity } from '@/lib/dashboards/activity';
import { getDataStore } from '@/lib/data';
import { getFilters } from '@/lib/filters/server';
import { formatDay, formatNumber } from '@/lib/format';

export const metadata: Metadata = { title: config.pages.activity };

export default function ActivityDetailPage(props: PageProps<'/activity/[id]'>) {
  return (
    <main className="flex flex-1 flex-col gap-8">
      {/* Which activity, and the filters to go back to, come from the URL. */}
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <Detail {...props} />
      </Suspense>
    </main>
  );
}

async function Detail({ params, searchParams }: PageProps<'/activity/[id]'>) {
  const [{ id }, query, { filters }] = await Promise.all([params, searchParams, getFilters(searchParams)]);
  const detail = await getActivityDetail(getDataStore(), decodeURIComponent(id));
  if (!detail) notFound();

  const view = parseLogView(query);
  const { activity, metrics, madeFrom, derived } = detail;
  const cell = 'border-t border-line py-2.5';
  const facts = [
    ['Date', formatDay(activity.date)],
    ['Tags', detail.tags.length > 0 ? detail.tags.join(', ') : undefined],
    ['Team', activity.team],
    ['Campaign', activity.utmCampaign],
    ['Estimated audience', activity.estAudience === undefined ? undefined : formatNumber(activity.estAudience)],
    ['Notes', activity.notes],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]));

  return (
    <>
      <div className="flex flex-col gap-4">
        <Link href={logHref(filters, view)} className="font-mono text-[0.7rem] tracking-[0.14em] text-muted uppercase hover:text-ink">
          ← {config.pages.activity}
        </Link>
        <Eyebrow>{detail.typeLabel}</Eyebrow>
        <h1 className="text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl">{activity.title}</h1>
        {activity.url && (
          <a href={activity.url} className="self-start text-sm break-all text-muted hover:text-ink hover:underline">
            {activity.url} ↗
          </a>
        )}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card as="section" aria-labelledby="details" className="flex flex-col gap-4">
          <h2 id="details" className="text-lg font-semibold">
            Details
          </h2>
          <dl className="flex flex-col text-sm">
            {facts.map(([name, value]) => (
              <div key={name} className="flex justify-between gap-6 border-t border-line py-2.5">
                <dt className="text-muted">{name}</dt>
                <dd className="text-right">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card as="section" aria-labelledby="numbers" className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="numbers" className="text-lg font-semibold">
              Its numbers
            </h2>
            <p className="text-sm text-muted">
              {metrics.length > 0
                ? `It reached ${formatNumber(detail.reach)} people on its own.`
                : 'No numbers are recorded for this activity.'}
            </p>
          </div>
          {metrics.length > 0 && (
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="font-mono text-[0.7rem] tracking-[0.14em] text-muted uppercase">
                  <th scope="col" className="py-2 font-normal">
                    Platform
                  </th>
                  <th scope="col" className="py-2 pl-4 font-normal">
                    Number
                  </th>
                  <th scope="col" className="py-2 pl-4 text-right font-normal">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {metrics.map((row) => (
                  <tr key={`${row.platform}-${row.metric}`}>
                    <th scope="row" className={`${cell} font-normal`}>
                      {row.platformLabel}
                    </th>
                    <td className={`${cell} pl-4 text-muted`}>{row.metricLabel}</td>
                    <td className={`${cell} pl-4 text-right font-semibold`}>{formatNumber(row.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {(madeFrom || derived.length > 0) && (
        <Card as="section" aria-labelledby="formats" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="formats" className="text-lg font-semibold">
              {derived.length > 0 ? `Made from it: ${derived.length}` : 'Where it came from'}
            </h2>
            <p className="text-sm text-muted">
              {derived.length > 0
                ? `With everything made from it, this work reached ${formatNumber(detail.familyReach)} people; ${formatNumber(detail.reach)} of them on its own.`
                : 'This was made from an earlier piece of work.'}
            </p>
          </div>
          <ul className="flex flex-col">
            {madeFrom && <Related item={madeFrom} href={logHref(filters, view, madeFrom.id)} />}
            {derived.map((item) => (
              <Related key={item.id} item={item} href={logHref(filters, view, item.id)} />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function Related({ item, href }: { item: RelatedActivity; href: string }) {
  return (
    <li className="flex items-baseline justify-between gap-4 border-t border-line py-2.5 text-sm">
      <span className="min-w-0">
        <Link href={href} className="hover:underline">
          {item.title}
        </Link>
        <span className="block text-xs text-muted">
          {item.typeLabel} · {formatDay(item.date)}
        </span>
      </span>
      <span className="font-semibold tabular-nums">{item.reach > 0 ? formatNumber(item.reach) : '–'}</span>
    </li>
  );
}
