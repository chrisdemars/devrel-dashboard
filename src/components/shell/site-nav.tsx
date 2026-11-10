import Link from 'next/link';
import { Suspense } from 'react';
import config from '@/lib/config';
import { NAV_PAGES } from '@/lib/nav';
import { NavLinks } from './nav-links';
import { ThemeToggle } from './theme-toggle';

function Brand() {
  const { name, logo } = config.org;
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5 font-semibold tracking-tight">
      {logo && (
        // A plain <img>: logos are usually SVGs of unknown size, which next/image cannot size or optimize.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo.src} alt={logo.alt ?? name} className="h-6 w-auto" />
      )}
      {/* With a logo, the name is still there for screen readers when the logo has its own alt text. */}
      <span className={logo ? 'sr-only' : undefined}>{name}</span>
      <span className="font-mono text-[0.7rem] font-normal tracking-[0.14em] text-muted uppercase">DevRel</span>
    </Link>
  );
}

/** The top navigation shown on every page. Hidden in print. */
export function SiteNav() {
  const items = NAV_PAGES.map(({ id, href }) => ({ href, label: config.pages[id] }));

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-page/90 backdrop-blur print:hidden">
      <div className="mx-auto flex h-12 w-full max-w-shell items-center justify-between gap-4 px-4">
        <Brand />
        <ThemeToggle />
      </div>
      {/* The links get their own row: nine labels, which an organization can rename, do not fit beside the brand. */}
      {/* On narrow screens the row scrolls sideways instead of wrapping. */}
      <nav aria-label="Pages" className="mx-auto h-10 w-full max-w-shell overflow-x-auto px-1.5">
        {/* usePathname needs a Suspense boundary so the rest of the page can be prerendered. */}
        <Suspense fallback={null}>
          <NavLinks items={items} />
        </Suspense>
      </nav>
    </header>
  );
}
