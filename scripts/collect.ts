// Usage:
//   npm run status    show every source and what it still needs (no network calls)
//   npm run collect   pull every configured source and write a dated snapshot

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sources, { manualDir, missingConfig, runSource, STATUS, type SourceResult } from '../src/lib/sources';

const ICON: Record<SourceResult['status'], string> = { ok: '✔', not_configured: '○', placeholder: '◌', error: '✖' };
const SNAPSHOT_DIR = process.env.SNAPSHOT_DIR ?? 'data/snapshots';

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
  const results: SourceResult[] = sources.map((s) => {
    const base = { id: s.id, name: s.name, category: s.category };
    if (s.placeholder) return { ...base, status: STATUS.PLACEHOLDER, note: s.placeholder };
    const missing = s.file
      ? existsSync(join(manualDir(), s.file))
        ? []
        : [join(manualDir(), s.file)]
      : missingConfig(s);
    return { ...base, status: missing.length ? STATUS.NOT_CONFIGURED : STATUS.OK, missing };
  });
  printResults(results);
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
