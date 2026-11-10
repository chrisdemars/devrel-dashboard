// Shared types and helpers for source connectors.
//
// Every run produces one of these statuses, so the dashboard can show a
// placeholder card for anything that isn't connected yet:
//   ok              data was pulled
//   not_configured  required .env values or files are missing (see `missing`)
//   placeholder     the source is known but has no data feed yet (see `note`)
//   error           configured, but the pull failed (see `error`)

export const STATUS = {
  OK: 'ok',
  NOT_CONFIGURED: 'not_configured',
  PLACEHOLDER: 'placeholder',
  ERROR: 'error',
} as const;

export type SourceStatus = (typeof STATUS)[keyof typeof STATUS];

export type SourceCategory = 'cli' | 'web' | 'social' | 'business' | 'events' | 'content' | 'capacity';

export interface EnvVar {
  name: string;
  required?: boolean;
  help: string;
}

/** What a connector's `collect()` returns. It may override the status (e.g. a stub). */
export interface CollectResult {
  status?: SourceStatus;
  metrics?: Record<string, unknown>;
  note?: string;
  period?: { days: number };
  missing?: string[];
  help?: string[];
}

export interface Source {
  id: string;
  name: string;
  category: SourceCategory;
  /** Config read from .env. */
  env?: EnvVar[];
  /** At least one of these env vars must be set. */
  requireAny?: string[];
  /** No connector yet: always reports "placeholder" with this note. */
  placeholder?: string;
  /** Manual logs: the CSV file name under the manual data directory. */
  file?: string;
  collect?: () => Promise<CollectResult>;
}

export interface SourceResult extends Omit<CollectResult, 'status'> {
  id: string;
  name: string;
  category: SourceCategory;
  status: SourceStatus;
  error?: string;
  plannedConfig?: string[];
}

export function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function envList(name: string): string[] {
  return (env(name) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function missingConfig(source: Source): string[] {
  const missing = (source.env ?? []).filter((e) => e.required && !env(e.name)).map((e) => e.name);
  if (source.requireAny?.length && !source.requireAny.some((n) => env(n))) {
    missing.push(`one of: ${source.requireAny.join(', ')}`);
  }
  return missing;
}

export async function getJson<T = unknown>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'devrel-dashboard', accept: 'application/json', ...headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`);
  return (await res.json()) as T;
}

export function lookbackDays(): number {
  const days = Number(env('COLLECT_LOOKBACK_DAYS') ?? 28);
  return Number.isFinite(days) && days > 0 ? Math.floor(days) : 28;
}

export async function runSource(source: Source): Promise<SourceResult> {
  const base = { id: source.id, name: source.name, category: source.category };

  if (source.placeholder || !source.collect) {
    return {
      ...base,
      status: STATUS.PLACEHOLDER,
      note: source.placeholder ?? 'No connector yet.',
      plannedConfig: (source.env ?? []).map((e) => e.name),
    };
  }

  const missing = missingConfig(source);
  if (missing.length) {
    return {
      ...base,
      status: STATUS.NOT_CONFIGURED,
      missing,
      help: (source.env ?? [])
        .filter((e) => missing.includes(e.name) || source.requireAny?.includes(e.name))
        .map((e) => `${e.name}: ${e.help}`),
    };
  }

  try {
    const result = await source.collect();
    return { ...base, ...result, status: result.status ?? STATUS.OK };
  } catch (err) {
    return { ...base, status: STATUS.ERROR, error: err instanceof Error ? err.message : String(err) };
  }
}
