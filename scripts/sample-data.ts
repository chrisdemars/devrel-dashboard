// Usage:
//   npm run sample-data    write the generated sample data to data/sample/sample-data.json
//
// The dashboards generate the same data in memory; this file is for looking at
// it, or for loading it somewhere else. The output is identical on every run.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sampleDataFromConfig } from '../src/lib/data';

const OUT_DIR = process.env.SAMPLE_DATA_DIR ?? 'data/sample';

const data = sampleDataFromConfig();
const file = join(OUT_DIR, 'sample-data.json');
await mkdir(OUT_DIR, { recursive: true });
await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);

console.log(`Sample data from ${data.range.from} to ${data.range.to} (launch on ${data.launchDate})`);
for (const [name, value] of Object.entries(data)) {
  if (Array.isArray(value)) console.log(`  ${String(value.length).padStart(5)}  ${name}`);
}
console.log(`\nWritten to ${file}`);
