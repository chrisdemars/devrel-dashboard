import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import '@devrel-theme/theme.css';
import { SiteNav } from '@/components/shell/site-nav';
import { ThemeScript } from '@/components/shell/theme-script';
import { APP_NAME } from '@/lib/app';
import config from '@/lib/config';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: 'Track DevRel activity and show its impact.',
};

/** Puts each font from the org config in front of the built-in font stack. */
function fontVariables(): CSSProperties {
  const { heading, body, mono } = config.theme.fonts;
  const named = (font: string, fallback: string) => `${JSON.stringify(font)}, ${fallback}`;
  return {
    ...(body && { '--ff-body': named(body, 'ui-sans-serif, system-ui, sans-serif') }),
    ...(heading && { '--ff-heading': named(heading, 'var(--ff-body)') }),
    ...(mono && { '--ff-mono': named(mono, 'ui-monospace, monospace') }),
  } as CSSProperties;
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // The theme script may change data-theme before React loads, hence suppressHydrationWarning.
    <html
      lang="en"
      data-theme="dark"
      data-preset={config.theme.preset}
      style={fontVariables()}
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
        {config.theme.fonts.stylesheets.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
      </head>
      <body className="flex min-h-full flex-col">
        <SiteNav />
        <div className="mx-auto flex w-full max-w-shell flex-1 flex-col px-4 py-10">{children}</div>
        <footer className="border-t border-line print:hidden">
          <div className="mx-auto flex w-full max-w-shell items-center justify-between gap-4 px-4 py-4 font-mono text-[0.7rem] tracking-[0.14em] text-muted uppercase">
            <span>{APP_NAME}</span>
            <Link href="/styleguide" className="hover:text-ink">
              Styleguide
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
