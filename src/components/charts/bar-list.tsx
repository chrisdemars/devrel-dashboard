import { formatNumber, formatPercent } from '@/lib/format';
import { chartColor } from '@/theme/tokens';

export interface BarListRow {
  label: string;
  value: number;
  /** Shown after the value, e.g. this row's part of the total. 0 to 1. */
  share?: number;
}

interface BarListProps {
  rows: BarListRow[];
  /** Position in the chart palette. One color for the whole list: the bars differ by size, not by kind. */
  colorIndex?: number;
}

/**
 * Horizontal bars, one per row, with the value printed beside each. Every
 * number is on show, so it needs no tooltip.
 */
export function BarList({ rows, colorIndex = 0 }: BarListProps) {
  const max = Math.max(...rows.map((row) => row.value), 0);

  return (
    <ul className="flex flex-col gap-3">
      {rows.map(({ label, value, share }) => (
        <li key={label} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span>{label}</span>
            <span className="tabular-nums">
              <span className="font-semibold">{formatNumber(value)}</span>
              {share !== undefined && <span className="ml-2 text-muted">{formatPercent(share)}</span>}
            </span>
          </div>
          <div aria-hidden="true" className="h-2 rounded-r-sm bg-raised">
            <div
              className="h-full rounded-r-sm"
              style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, background: chartColor(colorIndex) }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
