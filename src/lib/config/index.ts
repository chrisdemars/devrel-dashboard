// The active org config, validated once when the app or the collector starts.
//
// `@devrel/config` resolves to config/devrel.config.ts when that file exists,
// and to devrel.config.example.ts otherwise (the "@devrel/*" paths entry in
// tsconfig.json lists both, in that order).

import userConfig from '@devrel/config';
import { parseConfig, type DevrelConfig } from './schema';

const config: DevrelConfig = parseConfig(userConfig);
export default config;

/**
 * Reads a setting by its dotted path, e.g. 'packages.npm'.
 * Returns undefined when the path does not exist.
 */
export function configValue(path: string): unknown {
  let value: unknown = config;
  for (const key of path.split('.')) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

export * from './schema';
