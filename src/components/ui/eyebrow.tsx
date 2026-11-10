import type { ComponentProps } from 'react';
import { cx } from './cx';

/** A small uppercase label above a section or a number. */
export function Eyebrow({ className, ...rest }: ComponentProps<'p'>) {
  return <p className={cx('font-mono text-xs tracking-[0.18em] text-muted uppercase', className)} {...rest} />;
}
