// Shared helpers for source connectors.
//
// A source is a plain object:
//   {
//     id, name, category,          // identity and grouping
//     env: [{ name, required, help }],  // config it reads from .env
//     requireAny: ['A', 'B'],      // optional: at least one of these must be set
//     placeholder: 'why',          // optional: no connector yet; always reports "placeholder"
//     collect: async () => ({ metrics, note?, status? })
//   }
//
// Every run produces one of these statuses, so the dashboard can show a
// placeholder card for anything that isn't connected yet:
//   ok              data was pulled
//   not_configured  required .env values are missing (see `missing`)
//   placeholder     the source is known but has no data feed yet (see `note`)
//   error           configured, but the pull failed (see `error`)

export const STATUS = Object.freeze({
  OK: 'ok',
  NOT_CONFIGURED: 'not_configured',
  PLACEHOLDER: 'placeholder',
  ERROR: 'error',
});

export function env(name) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function envList(name) {
  return (env(name) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function missingConfig(source) {
  const missing = (source.env ?? [])
    .filter((e) => e.required && !env(e.name))
    .map((e) => e.name);
  if (source.requireAny?.length && !source.requireAny.some((n) => env(n))) {
    missing.push(`one of: ${source.requireAny.join(', ')}`);
  }
  return missing;
}

export async function getJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'devrel-dashboard', accept: 'application/json', ...headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`);
  return res.json();
}

export function lookbackDays() {
  const days = Number(env('COLLECT_LOOKBACK_DAYS') ?? 28);
  return Number.isFinite(days) && days > 0 ? Math.floor(days) : 28;
}

export async function runSource(source) {
  const base = { id: source.id, name: source.name, category: source.category };

  if (source.placeholder) {
    return {
      ...base,
      status: STATUS.PLACEHOLDER,
      note: source.placeholder,
      plannedConfig: (source.env ?? []).map((e) => e.name),
    };
  }

  const missing = missingConfig(source);
  if (missing.length) {
    return {
      ...base,
      status: STATUS.NOT_CONFIGURED,
      missing,
      help: (source.env ?? []).filter((e) => missing.includes(e.name) || source.requireAny?.includes(e.name)).map((e) => `${e.name}: ${e.help}`),
    };
  }

  try {
    const result = await source.collect();
    return { ...base, status: STATUS.OK, ...result };
  } catch (err) {
    return { ...base, status: STATUS.ERROR, error: err.message };
  }
}
