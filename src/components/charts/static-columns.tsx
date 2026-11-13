import { formatNumber } from '@/lib/format';
import { chartColor } from '@/theme/tokens';

interface StaticColumnsProps {
  rows: { label: string; value: number }[];
  /** Read out by screen readers in place of the drawing. */
  label: string;
  colorIndex?: number;
}

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 10, right: 8, bottom: 26, left: 44 };

/** The next round number at or above `value` (1, 2, 2.5, 5 or 10 times a power of ten), so the axis reads cleanly. */
export function niceMax(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((n) => n * power >= value) ?? 10;
  return step * power;
}

/**
 * A column chart drawn as plain SVG on the server: one series, no scripts.
 * It scales to any width and prints sharply, so the report uses it.
 */
export function StaticColumns({ rows, label, colorIndex = 0 }: StaticColumnsProps) {
  const max = niceMax(Math.max(...rows.map((row) => row.value), 1));
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const step = plotWidth / Math.max(rows.length, 1);
  const barWidth = Math.min(24, step * 0.6);
  // About six date labels, whatever the number of columns.
  const every = Math.max(Math.ceil(rows.length / 6), 1);
  const y = (value: number) => PAD.top + plotHeight - (value / max) * plotHeight;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label} className="h-auto w-full">
      {[0, 0.5, 1].map((part) => (
        <g key={part}>
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(max * part)} y2={y(max * part)} stroke="var(--line)" strokeWidth={1} />
          <text x={PAD.left - 8} y={y(max * part) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
            {formatNumber(Math.round(max * part))}
          </text>
        </g>
      ))}
      {rows.map((row, i) => {
        const height = Math.max((row.value / max) * plotHeight, row.value > 0 ? 1 : 0);
        const x = PAD.left + step * i + (step - barWidth) / 2;
        const radius = Math.min(4, height);
        return (
          <g key={`${row.label}-${i}`}>
            {height > 0 && (
              // Rounded at the top only: the bar stands on the baseline.
              <path
                d={`M${x},${y(0)} V${y(0) - height + radius} Q${x},${y(0) - height} ${x + radius},${y(0) - height} H${x + barWidth - radius} Q${x + barWidth},${y(0) - height} ${x + barWidth},${y(0) - height + radius} V${y(0)} Z`}
                fill={chartColor(colorIndex)}
              />
            )}
            {i % every === 0 && (
              <text x={x + barWidth / 2} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
                {row.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
