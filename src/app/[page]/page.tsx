// Stands in for dashboard pages that are not built yet, so every link in the
// navigation works. A real page at the same path (e.g. src/app/content/page.tsx)
// takes over automatically; remove this file once every page exists.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Card, Eyebrow, Headline } from '@/components/ui';
import config from '@/lib/config';
import { NAV_PAGES } from '@/lib/nav';

// Pages that have their own route. Add each one here as it is built.
const BUILT = ['/', '/launch', '/content', '/streams', '/events', '/pipeline', '/capacity'];
const PAGES = NAV_PAGES.filter(({ href }) => !BUILT.includes(href));

export function generateStaticParams() {
  return PAGES.map(({ href }) => ({ page: href.slice(1) }));
}

function labelFor(slug: string): string | undefined {
  const page = PAGES.find(({ href }) => href === `/${slug}`);
  return page && config.pages[page.id];
}

export async function generateMetadata({ params }: PageProps<'/[page]'>): Promise<Metadata> {
  return { title: labelFor((await params).page) };
}

export default function ComingSoon({ params }: PageProps<'/[page]'>) {
  return (
    <main className="flex flex-1 flex-col justify-center gap-8 py-10">
      {/* The page name comes from the URL, so it streams in. */}
      <Suspense fallback={null}>
        <Heading params={params} />
      </Suspense>
      <Card className="max-w-2xl">
        <p className="text-muted">This page is not built yet.</p>
      </Card>
    </main>
  );
}

async function Heading({ params }: Pick<PageProps<'/[page]'>, 'params'>) {
  const label = labelFor((await params).page);
  if (!label) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Eyebrow>Coming soon</Eyebrow>
      <Headline lead={label} accent="is on the way." />
    </div>
  );
}
