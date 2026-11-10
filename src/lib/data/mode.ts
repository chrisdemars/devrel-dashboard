// Kept apart from the data store so the navigation can ask for the mode
// without loading the store.

import type { DataMode } from './types';

const MODES: DataMode[] = ['sample', 'supabase'];

/** The active data mode, from the DATA_MODE environment variable. */
export function dataMode(): DataMode {
  const value = process.env.DATA_MODE?.trim().toLowerCase() || 'sample';
  if (!MODES.includes(value as DataMode)) {
    throw new Error(`DATA_MODE is "${process.env.DATA_MODE}". Use one of: ${MODES.join(', ')}.`);
  }
  return value as DataMode;
}
