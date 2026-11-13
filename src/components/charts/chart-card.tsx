import type { ReactNode } from 'react';
import { Card } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { chartColor } from '@/theme/tokens';

export interface LegendItem {
  label: string;
  colorIndex: number;
}

export interface ChartTable {
  columns: string[];
  rows: (string | number)[][];
}

interface ChartCardProps {
  title: string;
  /** The "so what" line: what the chart means, in one sentence. */
  caption: string;
  /** One entry per series. Leave out for a single series: the title already names it. */
  legend?: LegendItem[];
  /** The same numbers as a table, for screen readers and for anyone who wants exact values. */
  table: ChartTable;
  /** `line` draws legend keys as strokes instead of squares. */
  mark?: 'bar' | 'line';
  className?: string;
  children: ReactNode;
}

/** The frame every chart sits in: title, "so what" caption, legend and a table of the same data. */
export function ChartCard({ title, caption, legend, table, mark = 'bar', className, children }: ChartCardProps) {
  return (
    <Card as="figure" className={cx('flex min-w-0 flex-col gap-4', className)}>
      <figcaption className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted">{caption}</p>
      </figcaption>

      {legend && legend.length > 1 && (
        <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {legend.map(({ label, colorIndex }) => (
            <li key={label} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={mark === 'line' ? 'h-0.5 w-4 rounded-full' : 'size-2.5 rounded-xs'}
                style={{ background: chartColor(colorIndex) }}
              />
              {label}
            </li>
          ))}
        </ul>
      )}

      {children}

      <details className="text-sm print:hidden">
        <summary className="cursor-pointer font-mono text-[0.7rem] tracking-[0.14em] text-muted uppercase hover:text-ink">
          Show as a table
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left tabular-nums">
            <thead>
              <tr>
                {table.columns.map((column, i) => (
                  <th key={column} scope="col" className={cx('border-b border-line py-1.5 pr-4 font-medium', i > 0 && 'text-right')}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) =>
                    i === 0 ? (
                      <th key={i} scope="row" className="border-b border-line py-1.5 pr-4 font-normal whitespace-nowrap">
                        {cell}
                      </th>
                    ) : (
                      <td key={i} className="border-b border-line py-1.5 pr-4 text-right text-muted">
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

/** Shown inside a chart card when the filters leave nothing to draw. */
export function ChartEmpty({ children = 'Nothing to show for these filters.' }: { children?: ReactNode }) {
  return <p className="flex h-40 items-center justify-center rounded-md bg-raised text-sm text-muted">{children}</p>;
}
