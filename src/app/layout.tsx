import type { Metadata } from 'next';
import config from '@/lib/config';
import './globals.css';

export const metadata: Metadata = {
  title: `${config.org.name} DevRel Dashboard`,
  description: 'Track DevRel activity and show its impact.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
