import { cx } from './cx';

/** A numbered badge for steps in a sequence. */
export function StepBadge({ step, className }: { step: number; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-linear-to-br from-accent-from to-accent-to font-mono text-xs font-semibold text-on-accent',
        className,
      )}
    >
      {String(step).padStart(2, '0')}
    </span>
  );
}
