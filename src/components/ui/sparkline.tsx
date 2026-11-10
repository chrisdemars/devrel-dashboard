interface SparklineProps {
  /** Values in time order, oldest first. */
  values: number[];
  /** Read out by screen readers, e.g. "Installs over the last 12 weeks". */
  label: string;
  className?: string;
}

const WIDTH = 120;
const HEIGHT = 32;
const PAD = 4;

/** A small trend line. The latest point is marked in the accent color. */
export function Sparkline({ values, label, className }: SparklineProps) {
  const points = values.filter((v) => Number.isFinite(v));
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;
  const x = (i: number) => PAD + (i * (WIDTH - PAD * 2)) / (points.length - 1);
  // A flat series is drawn through the middle.
  const y = (v: number) => (span === 0 ? HEIGHT / 2 : HEIGHT - PAD - ((v - min) * (HEIGHT - PAD * 2)) / span);
  const last = points.length - 1;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} role="img" aria-label={label} className={className}>
      <polyline
        points={points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
        fill="none"
        stroke="var(--muted)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={x(last)} cy={y(points[last])} r="3.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}
