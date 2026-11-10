export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <p className="font-mono text-xs tracking-widest uppercase opacity-60">DevRel Dashboard</p>
      <h1 className="text-4xl font-bold tracking-tight">Setup in progress</h1>
      <p className="opacity-80">
        The data collector is ready. Run <code className="font-mono">npm run status</code> to see which sources are
        connected. Dashboards arrive in upcoming issues.
      </p>
    </main>
  );
}
