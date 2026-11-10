'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavLinksProps {
  items: { href: string; label: string }[];
}

/** The page links in the top navigation, with the current page marked. */
export function NavLinks({ items }: NavLinksProps) {
  const pathname = usePathname();

  return (
    <ul className="flex items-center gap-1">
      {items.map(({ href, label }) => {
        const current = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
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
