import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { BarList } from '@/components/charts/bar-list';
import { StaticColumns } from '@/components/charts/static-columns';
import { PrintButton } from '@/components/report/print-button';
import { Card, Eyebrow, KpiTile, StatusPill, VsPanel } from '@/components/ui';
import { APP_NAME } from '@/lib/app';
import config from '@/lib/config';
import { formatRate } from '@/lib/dashboards/capacity';
import { getReport, parseReportRequest, type Report } from '@/lib/dashboards/report';
import { getDataStore } from '@/lib/data';
import { getFilterContext } from '@/lib/filters/server';
import { formatDay, formatNumber } from '@/lib/format';

export const metadata: Metadata = { title: config.pages.report };

export default function ReportPage({ searchParams }: PageProps<'/report'>) {
  return (
    <main className="flex flex-1 flex-col gap-10">
      {/* The period and tags come from the URL, which is only known at request time. */}
      <Suspense fallback={<p className="text-sm text-muted">Preparing the report…</p>}>
        <ReportBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ReportBody({ searchParams }: Pick<PageProps<'/report'>, 'searchParams'>) {
  const [params, context] = await Promise.all([searchParams, getFilterContext()]);
  const report = await getReport(getDataStore(), parseReportRequest(params, context), context, {
    people: config.team.people,
    launch: config.launch,
  });
  const { reach, ask } = report;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <nav aria-label="Report period" className="flex flex-wrap items-center gap-1">
          <span className="mr-1 font-mono text-[0.7rem] tracking-[0.14em] text-muted uppercase">Period</span>
          {report.periods.map((period) => (
            <Link
              key={period.key}
              href={period.href}
              aria-current={period.current ? 'true' : undefined}
              className="rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-raised hover:text-ink aria-[current=true]:bg-raised aria-[current=true]:text-ink"
            >
              {period.label}
            </Link>
          ))}
        </nav>
        <PrintButton />
      </div>

      {/* The cover: a page of its own in print. */}
      <header className="flex flex-col gap-4 print:min-h-[85vh] print:justify-center print:break-after-page">
        <Eyebrow>
          {config.org.name} · {config.pages.report}
        </Eyebrow>
        <h1 className="text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl">
          <span className="block">Developer relations,</span>
          <span className="block text-accent">{report.period.label}.</span>
        </h1>
        <p className="text-muted">
          {report.rangeLabel}
          {report.inProgress && ' (quarter in progress)'} · Tags: {report.tags.length > 0 ? report.tags.join(', ') : 'all'} · Compared with
          the period before
        </p>
        <p className="hidden text-sm text-muted print:block">
          Prepared with {APP_NAME}. Numbers as of {formatDay(report.range.to)}.
        </p>
      </header>

      <Section id="headline" step="1" title="Headline numbers">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
          {report.kpis.map(({ id, trend, ...kpi }) => (
            <KpiTile key={id} trend={trend.length > 1 ? trend : undefined} {...kpi} />
          ))}
        </div>
      </Section>

      <Section id="reach" step="2" title="Reach" lead={reach.caption}>
        <div className="grid items-start gap-4 lg:grid-cols-2 print:grid-cols-1">
          <Figure title={`People reached, by format: ${formatNumber(reach.total)}`}>
            {reach.byFormat.length > 0 ? (
              <BarList rows={reach.byFormat.map((row) => ({ ...row, share: reach.total > 0 ? row.value / reach.total : 0 }))} />
            ) : (
              <Nothing />
            )}
          </Figure>
          <Figure title={`Site sessions per week: ${formatNumber(reach.sessions.total)} in all`}>
            {reach.sessions.total > 0 ? (
              <StaticColumns rows={reach.sessions.rows} label="Site sessions per week over the period" />
            ) : (
              <Nothing />
            )}
          </Figure>
        </div>
        <Figure title="Posts that travelled furthest, every format counted">
          {reach.topPosts.length > 0 ? (
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="font-mono text-[0.7rem] tracking-[0.14em] text-muted uppercase">
                  <th scope="col" className="py-2 font-normal">
                    Post
                  </th>
                  <th scope="col" className="py-2 pl-4 text-right font-normal">
                    Pieces
                  </th>
                  <th scope="col" className="py-2 pl-4 text-right font-normal">
                    Reach
                  </th>
                  <th scope="col" className="py-2 pl-4 text-right font-normal">
                    Multiplier
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {reach.topPosts.map((post) => (
                  <tr key={post.id}>
                    <th scope="row" className="border-t border-line py-2.5 font-normal">
                      {post.title}
                    </th>
                    <td className="border-t border-line py-2.5 pl-4 text-right text-muted">{post.formats}</td>
                    <td className="border-t border-line py-2.5 pl-4 text-right font-semibold">{formatNumber(post.totalReach)}</td>
                    <td className="border-t border-line py-2.5 pl-4 text-right">
                      {post.multiplier === undefined ? '–' : `${post.multiplier.toFixed(1)}×`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Nothing />
          )}
        </Figure>
        <p className="text-sm text-muted">
          On stage: {formatNumber(reach.events.talks)} {reach.events.talks === 1 ? 'talk' : 'talks'} to about{' '}
          {formatNumber(reach.events.audience)} people, with {formatNumber(reach.events.leads)}{' '}
          {reach.events.leads === 1 ? 'lead' : 'leads'} passed to sales.
        </p>
      </Section>

      <Section id="working" step="3" title="What is working, and what is not">
        <div className="grid items-start gap-4 md:grid-cols-2">
          <Notes title="Working" notes={report.working} empty="No notes are written for this period." />
          <Notes title="Not working" notes={report.notWorking} empty="No notes are written for this period." />
        </div>
      </Section>

      <Section
        id="access"
        step="4"
        title="Data access needed"
        lead={
          report.access.length > 0
            ? `${report.access.length} ${report.access.length === 1 ? 'source is' : 'sources are'} not connected. Each one is a number this report cannot show yet.`
            : 'Every source is connected.'
        }
      >
        {report.access.length > 0 && (
          <ul className="grid gap-3 md:grid-cols-2">
            {report.access.map((source) => (
              <li key={source.id} className="flex flex-col gap-2 rounded-card border border-dashed border-line p-4 break-inside-avoid">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 font-semibold">{source.name}</span>
                  <StatusPill status={source.status} />
                </div>
                {source.note && <p className="text-sm text-muted">{source.note}</p>}
                {source.missing.length > 0 && (
                  <p className="text-sm text-muted">
                    Needs: <span className="font-mono text-xs break-words">{source.missing.join(', ')}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="ask" step="5" title="The ask">
        <Notes title="What we are asking for" notes={ask.notes} empty="No ask is written for this period." />
        {ask.staffing.rows[0].current > 0 && (
          <Figure title="What one more person would add, every 30 days" caption={ask.staffing.caption}>
            <VsPanel
              left={{
                label: `Today: ${formatRate(ask.staffing.people)} ${ask.staffing.people === 1 ? 'person' : 'people'}`,
                children: <Figures rows={ask.staffing.rows} pick="current" />,
              }}
              right={{ label: 'With one more person', children: <Figures rows={ask.staffing.rows} pick="projected" /> }}
            />
          </Figure>
        )}
      </Section>
    </>
  );
}

function Section({ id, step, title, lead, children }: { id: string; step: string; title: string; lead?: string; children: ReactNode }) {
  return (
    // Each section starts a new page in print.
    <section aria-labelledby={`report-${id}`} className="flex flex-col gap-4 print:break-before-page">
      <div className="flex flex-col gap-1">
        <Eyebrow>Part {step} of 5</Eyebrow>
        <h2 id={`report-${id}`} className="text-2xl font-bold tracking-tight">
          {title}
        </h2>
        {lead && <p className="text-muted">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

function Figure({ title, caption, children }: { title: string; caption?: string; children: ReactNode }) {
  return (
    <Card as="figure" className="flex min-w-0 flex-col gap-4">
      <figcaption className="flex flex-col gap-1">
        <h3 className="font-semibold">{title}</h3>
        {caption && <p className="text-sm text-muted">{caption}</p>}
      </figcaption>
      {children}
    </Card>
  );
}

function Nothing() {
  return <p className="rounded-md bg-raised px-4 py-6 text-center text-sm text-muted">Nothing recorded for this period.</p>;
}

function Notes({ title, notes, empty }: { title: string; notes: string[]; empty: string }) {
  return (
    <Card className="flex flex-col gap-3">
      <h3 className="font-semibold">{title}</h3>
      {notes.length > 0 ? (
        <ul className="flex list-disc flex-col gap-2 pl-5">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{empty}</p>
      )}
    </Card>
  );
}

function Figures({ rows, pick }: { rows: Report['ask']['staffing']['rows']; pick: 'current' | 'projected' }) {
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
