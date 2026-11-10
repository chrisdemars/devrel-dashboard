import type { ComponentProps, ElementType } from 'react';
import { cx } from './cx';

type CardProps<T extends ElementType> = { as?: T } & Omit<ComponentProps<T>, 'as'>;

/** A bordered surface: the building block of every dashboard grid. */
export function Card<T extends ElementType = 'div'>({ as, className, ...rest }: CardProps<T>) {
  const Tag: ElementType = as ?? 'div';
  // break-inside-avoid keeps a card on one page when printed.
  return <Tag className={cx('rounded-card border border-line bg-surface p-5 break-inside-avoid', className)} {...rest} />;
}
