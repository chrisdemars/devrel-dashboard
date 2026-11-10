import type { SourceStatus } from '@/lib/sources/core';
import { cx } from './cx';

// Each status has its own icon and label, so it reads without color.
const STATUS: Record<SourceStatus, { label: string; icon: string; tone: string }> = {
  ok: { label: 'Connected', icon: '✓', tone: 'text-positive' },
  not_configured: { label: 'Not set up', icon: '○', tone: 'text-warning' },
  placeholder: { label: 'Access needed', icon: '◌', tone: 'text-neutral' },
  error: { label: 'Error', icon: '✕', tone: 'text-negative' },
};

/** The state of a data source. */
export function StatusPill({ status, className }: { status: SourceStatus; className?: string }) {
  const { label, icon, tone } = STATUS[status];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1 font-mono text-[0.7rem] tracking-wider whitespace-nowrap uppercase',
        className,
      )}
    >
      <span aria-hidden="true" className={cx('text-sm leading-none font-bold', tone)}>
        {icon}
      </span>
      {label}
    </span>
  );
}
