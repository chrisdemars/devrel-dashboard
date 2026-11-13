import { describeDelta, formatNumber } from '@/lib/format';
import { Card } from './card';
import { cx } from './cx';
import { Eyebrow } from './eyebrow';
import { Sparkline } from './sparkline';

interface KpiTileProps {
  label: string;
  /** A number is formatted compactly (12.9K). Pass a string to control the format, e.g. "38%" or "$4.2M". */
  value: number | string;
  /** Change as a fraction (0.22 = up 22%), compared with `deltaLabel`. */
  delta?: number;
  /** What the change is measured against, e.g. "vs last quarter". */
  deltaLabel?: string;
  /** A line shown when there is no change to show, e.g. "77% of the Q1 target" or "New since the baseline". */
  detail?: string;
  /** Progress toward a target as a fraction (0.77). Drawn as a bar; say the same in `detail`. */
  progress?: number;
  /** Which direction is good. Use 'down' for costs. */
  goodWhen?: 'up' | 'down';
  /** Values over time, oldest first. */
  trend?: number[];
  /** The "so what" line: what the number means and what happens next. */
  note?: string;
  className?: string;
}

const ARROW = { up: '▲', down: '▼', flat: '●' } as const;
const TONE = { positive: 'text-positive', negative: 'text-negative', neutral: 'text-muted' } as const;

/** One headline number with its change, trend and "so what" line. */
export function KpiTile({
  label,
  value,
  delta,
  deltaLabel,
  detail,
  progress,
  goodWhen = 'up',
  trend,
  note,
  className,
}: KpiTileProps) {
  const change = delta === undefined ? undefined : describeDelta(delta, goodWhen);

  return (
    <Card className={cx('flex flex-col gap-3', className)}>
      <Eyebrow>{label}</Eyebrow>
      <div className="flex items-end justify-between gap-4">
        <p className="text-4xl leading-none font-semibold tracking-tight">
          {typeof value === 'number' ? formatNumber(value) : value}
        </p>
        {trend && <Sparkline values={trend} label={`${label} trend`} className="shrink-0" />}
      </div>
      {change && (
        <p className="text-sm">
          {/* The arrow and sign carry the direction, so it never depends on color alone. */}
          <span className={cx('font-mono font-medium', TONE[change.tone])}>
            <span aria-hidden="true" className="mr-1 text-[0.7em]">
              {ARROW[change.direction]}
            </span>
            {change.text}
          </span>
          {deltaLabel && <span className="text-muted"> {deltaLabel}</span>}
        </p>
      )}
      {progress !== undefined && Number.isFinite(progress) && (
        // Decorative: `detail` says the same in words.
        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-raised">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(Math.max(progress, 0), 1) * 100}%` }} />
        </div>
      )}
      {detail && <p className="text-sm text-muted">{detail}</p>}
      {note && <p className="mt-auto border-t border-line pt-3 text-sm text-muted">{note}</p>}
    </Card>
  );
}
