'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { FILTER_PARAMS } from '@/lib/filters';

interface NavLinksProps {
  items: { href: string; label: string; filtered: boolean }[];
}

/**
 * The page links in the top navigation, with the current page marked.
 * Links to pages with a filter bar keep the current filters.
 */
export function NavLinks({ items }: NavLinksProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = new URLSearchParams();
  for (const key of FILTER_PARAMS) {
    const value = searchParams.get(key);
    if (value) filters.set(key, value);
  }
  const query = filters.size > 0 ? `?${filters.toString().replaceAll('%2C', ',')}` : '';

  return (
    <ul className="flex items-center gap-1">
      {items.map(({ href, label, filtered }) => {
        const current = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={filtered ? `${href}${query}` : href}
              aria-current={current ? 'page' : undefined}
              className="block rounded-md px-2.5 py-1.5 font-mono text-[0.7rem] tracking-[0.14em] whitespace-nowrap text-muted uppercase hover:bg-raised hover:text-ink aria-[current=page]:bg-raised aria-[current=page]:text-ink"
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
