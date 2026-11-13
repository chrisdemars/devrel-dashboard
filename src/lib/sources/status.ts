// The state of every source worked out from settings and files alone, with no
// network calls. `npm run status` and the Data sources page both use this, so
// they always agree.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { missingConfig, missingHelp, STATUS, type Source, type SourceResult } from './core';
import { manualDir } from './manual';

export function snapshotDir(): string {
  return process.env.SNAPSHOT_DIR ?? 'data/snapshots';
}

/** One source's state. `exists` is replaceable so tests need no files. */
export function checkSource(source: Source, exists: (path: string) => boolean = existsSync): SourceResult {
  const base = {
    id: source.id,
    name: source.name,
    category: source.category,
    ...(source.setup && { setup: source.setup }),
  };
  if (source.placeholder || (!source.collect && !source.file)) {
    return {
      ...base,
      status: STATUS.PLACEHOLDER,
      note: source.placeholder ?? 'No connector yet.',
      plannedConfig: (source.env ?? []).map((e) => e.name),
    };
  }
  if (source.file) {
    // The folder is chosen at run time, so the app's bundler is told not to trace it.
    const path = join(/* turbopackIgnore: true */ manualDir(), source.file);
    const found = exists(path);
    return {
      ...base,
      status: found ? STATUS.OK : STATUS.NOT_CONFIGURED,
      missing: found ? [] : [path],
      help: found ? [] : [`Copy templates/${source.file} to ${path} and add a row per item.`],
    };
  }
  const missing = missingConfig(source);
  return {
    ...base,
    status: missing.length ? STATUS.NOT_CONFIGURED : STATUS.OK,
    missing,
    help: missing.length ? missingHelp(source) : [],
  };
}

export function checkSources(sources: Source[], exists?: (path: string) => boolean): SourceResult[] {
  return sources.map((source) => checkSource(source, exists));
}

/** What `npm run collect` last wrote. */
export interface Snapshot {
  generatedAt: string;
  sources: Record<string, SourceResult>;
}

/** The latest snapshot, or undefined when nothing has been collected yet or the file cannot be read. */
export async function readLatestSnapshot(dir: string = snapshotDir()): Promise<Snapshot | undefined> {
  try {
    const text = await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, 'latest.json'), 'utf8');
    const snapshot = JSON.parse(text) as Partial<Snapshot>;
    if (typeof snapshot.generatedAt !== 'string' || !snapshot.sources || typeof snapshot.sources !== 'object') return undefined;
    return snapshot as Snapshot;
  } catch {
    return undefined;
  }
}
