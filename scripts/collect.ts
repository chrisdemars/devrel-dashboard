// Usage:
//   npm run status    show every source and what it still needs (no network calls)
//   npm run collect   pull every configured source and write a dated snapshot

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SourceResult } from '../src/lib/sources';

// Loading the sources also loads and validates devrel.config.ts. Show a config
// problem as a plain message instead of a stack trace.
const { default: sources, checkSources, runSource, snapshotDir, STATUS } = await import('../src/lib/sources').catch(
  (err: unknown) => {
    if (!(err instanceof Error) || err.name !== 'ConfigError') throw err;
    console.error(err.message);
    process.exit(1);
  },
);

const ICON: Record<SourceResult['status'], string> = { ok: '✔', not_configured: '○', placeholder: '◌', error: '✖' };
const SNAPSHOT_DIR = snapshotDir();

function printResults(results: SourceResult[]) {
  let category: string | undefined;
  for (const r of [...results].sort((a, b) => a.category.localeCompare(b.category))) {
    if (r.category !== category) {
      category = r.category;
      console.log(`\n${category.toUpperCase()}`);
    }
    console.log(`  ${ICON[r.status]} ${r.name}  [${r.status}]`);
    if (r.missing?.length) console.log(`      needs: ${r.missing.join(', ')}`);
    if (r.status === STATUS.PLACEHOLDER && r.note) console.log(`      ${r.note}`);
    if (r.error) console.log(`      error: ${r.error}`);
  }
  const counts = Object.values(STATUS).map((s) => `${results.filter((r) => r.status === s).length} ${s}`);
  console.log(`\n${counts.join(' · ')}`);
}

function status() {
  // Config check only, no network calls.
  printResults(checkSources(sources));
}

async function collect() {
  const results = await Promise.all(sources.map(runSource));
  const generatedAt = new Date().toISOString();
  const snapshot = { generatedAt, sources: Object.fromEntries(results.map((r) => [r.id, r])) };

  await mkdir(SNAPSHOT_DIR, { recursive: true });
  const body = `${JSON.stringify(snapshot, null, 2)}\n`;
  const dated = join(SNAPSHOT_DIR, `${generatedAt.slice(0, 10)}.json`);
  await writeFile(dated, body);
  await writeFile(join(SNAPSHOT_DIR, 'latest.json'), body);

  printResults(results);
  console.log(`\nSnapshot written to ${dated}`);
}

const command = process.argv[2];
if (command === 'status') status();
else if (command === 'collect') await collect();
else {
  console.error('Usage: npm run status | npm run collect');
  process.exit(1);
}
