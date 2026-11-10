import { Card, Eyebrow, Headline } from '@/components/ui';
import config from '@/lib/config';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col justify-center gap-8 py-10">
      <div className="flex flex-col gap-4">
        <Eyebrow>{config.pages.overview}</Eyebrow>
        <Headline lead={`${config.org.name} DevRel,`} accent="measured." />
      </div>
      <Card className="max-w-2xl">
        <p className="text-muted">
          The data collector and the design system are ready. Run <code className="font-mono text-ink">npm run status</code>{' '}
          to see which sources are connected. The dashboards arrive next.
        </p>
      </Card>
    </main>
  );
}
