// Every design token and primitive, in both themes, for the default preset and
// the preset named in the org config. Use it to check a new preset by eye.

import type { Metadata } from 'next';
import { AccessNeededCard, Card, Eyebrow, Headline, KpiTile, Sparkline, StatusPill, StepBadge, VsPanel } from '@/components/ui';
import config from '@/lib/config';
import { chartColor, CHART_COLORS, THEMES, TOKENS, type Theme } from '@/theme/tokens';

export const metadata: Metadata = { title: 'Styleguide' };

const SURFACE_TOKENS = TOKENS.filter((token) => !token.startsWith('chart-'));
const TREND = [18, 22, 21, 27, 31, 30, 36, 41, 39, 47, 52, 58];
const BARS = [64, 48, 40, 33, 27, 22, 16, 11];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <Eyebrow>{title}</Eyebrow>
      {children}
    </section>
  );
}

function Swatch({ token }: { token: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="size-9 shrink-0 rounded-md border border-line" style={{ background: `var(--${token})` }} />
      <code className="font-mono text-xs text-muted">{token}</code>
    </div>
  );
}

/** A small bar chart of the chart palette, with the gaps and rounded ends charts will use. */
function ChartPalette() {
  const max = Math.max(...BARS);
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex h-32 items-end gap-0.5" role="img" aria-label="The eight chart colors, in series order">
        {BARS.slice(0, CHART_COLORS).map((value, i) => (
          <span
            key={i}
            className="max-w-6 flex-1 rounded-t"
            style={{ height: `${(value / max) * 100}%`, background: chartColor(i) }}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {BARS.slice(0, CHART_COLORS).map((_, i) => (
          <li key={i} className="flex items-center gap-2 font-mono text-xs text-muted">
            <span className="size-3 rounded-sm" style={{ background: chartColor(i) }} />
            chart-{i + 1}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Showcase() {
  return (
    <div className="flex flex-col gap-10">
      <Section title="Headline and eyebrow">
        <Headline as="h2" lead="DevRel, measured." accent="Impact, shown." />
      </Section>

      <Section title="KPI tiles">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiTile
            label="Product installs"
            value={12_940}
            delta={0.22}
            deltaLabel="vs last quarter"
            trend={TREND}
            note="Installs follow each conference talk. Two more talks are booked for next quarter."
          />
          <KpiTile
            label="Cost per lead"
            value="$184"
            delta={-0.12}
            deltaLabel="vs last quarter"
            goodWhen="down"
            trend={[...TREND].reverse()}
          />
          <KpiTile label="Activation rate" value="38%" delta={0} deltaLabel="vs baseline" />
        </div>
      </Section>

      <Section title="Card, step badges and sparkline">
        <Card className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold">How one blog post becomes five</h3>
          <ol className="flex flex-col gap-3">
            {['Publish the blog post', 'Cut a short video from it', 'Cover it on the livestream'].map((step, i) => (
              <li key={step} className="flex items-center gap-3">
                <StepBadge step={i + 1} />
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-3 border-t border-line pt-4 text-sm text-muted">
            <Sparkline values={TREND} label="Reach over the last 12 weeks" />
            Reach over the last 12 weeks
          </div>
        </Card>
      </Section>

      <Section title="Vs. panel">
        <VsPanel
          left={{
            label: 'Today',
            children: (
              <>
                <p className="text-3xl font-semibold">2 posts a month</p>
                <p className="text-sm text-muted">One person covering content, events and streams.</p>
              </>
            ),
          }}
          right={{
            label: 'With one more hire',
            children: (
              <>
                <p className="text-3xl font-semibold">5 posts a month</p>
                <p className="text-sm text-muted">Based on output per person over the last two quarters.</p>
              </>
            ),
          }}
        />
      </Section>

      <Section title="Status pills">
        <div className="flex flex-wrap gap-2">
          <StatusPill status="ok" />
          <StatusPill status="not_configured" />
          <StatusPill status="placeholder" />
          <StatusPill status="error" />
        </div>
      </Section>

      <Section title="Access needed card">
        <div className="grid gap-4 sm:grid-cols-2">
          <AccessNeededCard title="Influenced pipeline" source="CRM">
            Ask for read access to the CRM, or a monthly report of deals with a DevRel touchpoint.
          </AccessNeededCard>
          <AccessNeededCard title="Activation and active users" source="Product usage">
            Ask the product team for opt-in usage data: first use and weekly active users.
          </AccessNeededCard>
        </div>
      </Section>

      <Section title="Chart palette">
        <ChartPalette />
      </Section>

      <Section title="Color tokens">
        <Card className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {SURFACE_TOKENS.map((token) => (
            <Swatch key={token} token={token} />
          ))}
        </Card>
      </Section>
    </div>
  );
}

function Preview({ preset, theme }: { preset: string; theme: Theme }) {
  return (
    <section aria-label={`${preset} preset, ${theme} theme`} className="flex flex-col gap-3 break-before-page first:break-before-auto">
      <h2 className="font-mono text-xs tracking-[0.18em] text-muted uppercase">
        {preset} · {theme}
      </h2>
      {/* data-preset and data-theme together re-map the tokens for this box only. */}
      <div data-preset={preset} data-theme={theme} className="rounded-card border border-line bg-page p-5 text-ink sm:p-8">
        <Showcase />
      </div>
    </section>
  );
}

export default function Styleguide() {
  const presets = [...new Set(['default', config.theme.preset])];

  return (
    <main className="flex flex-col gap-12">
      <div className="flex flex-col gap-4">
        <Eyebrow>Styleguide</Eyebrow>
        <Headline lead="Every building block," accent="in both themes." />
        <p className="max-w-2xl text-muted">
          The design tokens and primitives, shown for {presets.length === 1 ? 'the default preset' : 'each preset'} in the
          dark and light themes. Printing this page always uses the light theme.
        </p>
      </div>
      {presets.flatMap((preset) => THEMES.map((theme) => <Preview key={`${preset}-${theme}`} preset={preset} theme={theme} />))}
    </main>
  );
}
