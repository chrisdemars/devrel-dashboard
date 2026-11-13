'use client';

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumber } from '@/lib/format';
import { chartColor } from '@/theme/tokens';

export interface TimeSeries {
  key: string;
  label: string;
  colorIndex: number;
}

export interface TimeRow {
  label: string;
  period: string;
  values: Record<string, number>;
}

interface TimeChartProps {
  /** `columns` stacks the series in thin columns; `line` draws one line per series. */
  kind: 'columns' | 'line';
  series: TimeSeries[];
  rows: TimeRow[];
  /** Read out by screen readers in place of the drawing. The table below the chart has the numbers. */
  label: string;
}

const AXIS = { fill: 'var(--muted)', fontSize: 11 };
const HEIGHT = 260;

interface TipProps {
  active?: boolean;
  payload?: { dataKey?: unknown; value?: unknown; payload?: TimeRow }[];
  series: TimeSeries[];
  kind: TimeChartProps['kind'];
}

/** One readout for every series at the hovered date. Values lead; names follow. */
function Tip({ active, payload, series, kind }: TipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  // Top of the stack first, to match the drawing.
  const listed = kind === 'columns' ? [...series].reverse() : series;
  const total = series.reduce((sum, { key }) => sum + (row.values[key] ?? 0), 0);

  return (
    <div className="rounded-md border border-line bg-raised px-3 py-2 text-sm shadow-lg">
      <p className="mb-1.5 font-mono text-[0.7rem] tracking-wider text-muted uppercase">{row.period}</p>
      <ul className="flex flex-col gap-1">
        {listed.map(({ key, label, colorIndex }) => (
          <li key={key} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: chartColor(colorIndex) }} />
            <span className="font-semibold tabular-nums">{formatNumber(row.values[key] ?? 0)}</span>
            <span className="text-muted">{label}</span>
          </li>
        ))}
      </ul>
      {kind === 'columns' && series.length > 1 && (
        <p className="mt-1.5 border-t border-line pt-1.5">
          <span className="font-semibold tabular-nums">{formatNumber(total)}</span> <span className="text-muted">Total</span>
        </p>
      )}
    </div>
  );
}

/** A chart over time: stacked columns or lines. Colors and text come from the theme tokens. */
export function TimeChart({ kind, series, rows, label }: TimeChartProps) {
  const data = rows.map((row) => ({ ...row, ...row.values }));
  const last = series.length - 1;
  const shared = (
    <>
      <CartesianGrid vertical={false} stroke="var(--line)" />
      <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--line)' }} minTickGap={24} />
      <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={formatNumber} allowDecimals={false} />
    </>
  );
  const margin = { top: 8, right: 8, bottom: 0, left: 0 };

  return (
    <div role="img" aria-label={label} style={{ height: HEIGHT }} className="w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        {kind === 'columns' ? (
          <BarChart data={data} margin={margin} barCategoryGap="20%" accessibilityLayer={false}>
            {shared}
            <Tooltip
              content={<Tip series={series} kind={kind} />}
              cursor={{ fill: 'var(--raised)', opacity: 0.6 }}
              isAnimationActive={false}
            />
            {series.map(({ key, colorIndex }, i) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="stack"
                maxBarSize={24}
                fill={chartColor(colorIndex)}
                // A surface-colored edge leaves a gap between the segments of a stack.
                stroke="var(--surface)"
                strokeWidth={series.length > 1 ? 1 : 0}
                radius={i === last ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        ) : (
          <LineChart data={data} margin={margin} accessibilityLayer={false}>
            {shared}
            <Tooltip
              content={<Tip series={series} kind={kind} />}
              cursor={{ stroke: 'var(--muted)', strokeWidth: 1 }}
              isAnimationActive={false}
            />
            {series.map(({ key, colorIndex }) => (
              <Line
                key={key}
                dataKey={key}
                type="monotone"
                stroke={chartColor(colorIndex)}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 5, fill: chartColor(colorIndex), stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
