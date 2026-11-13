// Shared types and helpers for source connectors.
//
// Every run produces one of these statuses, so the dashboard can show a
// placeholder card for anything that isn't connected yet:
//   ok              data was pulled
//   not_configured  required settings or files are missing (see `missing`)
//   placeholder     the source is known but has no data feed yet (see `note`)
//   error           configured, but the pull failed (see `error`)

import { configValue } from '../config';

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
  /**
   * Dotted path of the matching list in devrel.config.ts, e.g. 'packages.npm'.
   * The config holds the usual value; the .env variable overrides it when set.
   */
  config?: string;
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
  /** Settings read from .env, or from devrel.config.ts for entries with `config`. */
  env?: EnvVar[];
  /** At least one of these env vars must be set. */
  requireAny?: string[];
  /** No connector yet: always reports "placeholder" with this note. */
  placeholder?: string;
  /** Steps to connect the source, shown on the Data sources page. */
  setup?: string[];
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
  /** Steps to connect the source. */
  setup?: string[];
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

/** A list setting: the .env variable when set, otherwise the list in devrel.config.ts. */
export function listSetting(source: Source, name: string): string[] {
  const fromEnv = envList(name);
  if (fromEnv.length) return fromEnv;
  const path = source.env?.find((e) => e.name === name)?.config;
  const fromConfig = path ? configValue(path) : undefined;
  return Array.isArray(fromConfig) ? fromConfig.map(String) : [];
}

/** How a setting is named in messages, e.g. "packages.npm in devrel.config.ts (or CLI_NPM_PACKAGES in .env)". */
function label(e: EnvVar): string {
  return e.config ? `${e.config} in devrel.config.ts (or ${e.name} in .env)` : e.name;
}

function isSet(source: Source, e: EnvVar): boolean {
  return e.config ? listSetting(source, e.name).length > 0 : Boolean(env(e.name));
}

function missingVars(source: Source): EnvVar[] {
  return (source.env ?? []).filter((e) => e.required && !isSet(source, e));
}

function requireAnyVars(source: Source): EnvVar[] {
  return (source.requireAny ?? []).map((name) => source.env?.find((e) => e.name === name) ?? { name, help: '' });
}

export function missingConfig(source: Source): string[] {
  const missing = missingVars(source).map(label);
  const any = requireAnyVars(source);
  if (any.length && !any.some((e) => isSet(source, e))) {
    missing.push(`one of: ${any.map(label).join(', ')}`);
  }
  return missing;
}

/** What each missing setting is, one line per setting. */
export function missingHelp(source: Source): string[] {
  return [...new Set([...missingVars(source), ...requireAnyVars(source)])]
    .filter((e) => e.help)
    .map((e) => `${label(e)}: ${e.help}`);
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
      help: missingHelp(source),
    };
  }

  try {
    const result = await source.collect();
    return { ...base, ...result, status: result.status ?? STATUS.OK };
  } catch (err) {
    return { ...base, status: STATUS.ERROR, error: err instanceof Error ? err.message : String(err) };
  }
}
