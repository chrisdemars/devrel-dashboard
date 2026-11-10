import { cx } from './cx';

interface HeadlineProps {
  /** First line, in the main text color. */
  lead: string;
  /** Second line, in the accent color. */
  accent: string;
  as?: 'h1' | 'h2';
  className?: string;
}

/** A large headline in two tones. */
export function Headline({ lead, accent, as: Tag = 'h1', className }: HeadlineProps) {
  return (
    <Tag className={cx('text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl', className)}>
      <span className="block">{lead}</span>
      <span className="block text-accent">{accent}</span>
    </Tag>
  );
}
