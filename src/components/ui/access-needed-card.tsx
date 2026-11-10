import type { ReactNode } from 'react';
import { cx } from './cx';
import { Eyebrow } from './eyebrow';
import { StatusPill } from './status-pill';

interface AccessNeededCardProps {
  /** What is missing, e.g. "Influenced pipeline". */
  title: string;
  /** Where the data would come from, e.g. "CRM". */
  source: string;
  /** What to ask for, and from whom. */
  children: ReactNode;
  className?: string;
}

/**
 * Stands in for a chart whose data source is not connected yet. The gap is
 * shown on purpose: it makes the case for the access request.
 */
export function AccessNeededCard({ title, source, children, className }: AccessNeededCardProps) {
  return (
    <section className={cx('flex flex-col gap-3 rounded-card border border-dashed border-line p-5 break-inside-avoid', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>{source}</Eyebrow>
        <StatusPill status="placeholder" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="text-sm text-muted">{children}</div>
    </section>
  );
}
