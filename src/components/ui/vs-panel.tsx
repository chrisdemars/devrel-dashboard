import type { ReactNode } from 'react';
import { cx } from './cx';
import { Eyebrow } from './eyebrow';

interface Side {
  label: string;
  children: ReactNode;
}

interface VsPanelProps {
  left: Side;
  right: Side;
  className?: string;
}

/** Two things side by side, e.g. baseline and now, or with and without one more hire. */
export function VsPanel({ left, right, className }: VsPanelProps) {
  return (
    <div
      className={cx(
        'grid overflow-hidden rounded-card border border-line bg-surface break-inside-avoid sm:grid-cols-[1fr_auto_1fr]',
        className,
      )}
    >
      <div className="flex flex-col gap-3 p-5">
        <Eyebrow>{left.label}</Eyebrow>
        {left.children}
      </div>
      <div className="flex items-center gap-3 px-5 sm:flex-col sm:px-0" aria-hidden="true">
        <span className="h-px flex-1 bg-line sm:h-auto sm:w-px" />
        <span className="font-mono text-xs tracking-[0.18em] text-muted uppercase sm:px-3">vs.</span>
        <span className="h-px flex-1 bg-line sm:h-auto sm:w-px" />
      </div>
      <div className="flex flex-col gap-3 bg-raised p-5">
        <Eyebrow>{right.label}</Eyebrow>
        {right.children}
      </div>
    </div>
  );
}
