// The design tokens every theme preset must define, as --dark-<name> and
// --light-<name>. Keep in step with src/theme/default.css and tokens.css;
// test/theme.test.ts fails if they drift apart.

export const CHART_COLORS = 8;

export const TOKENS = [
  'page',
  'surface',
  'raised',
  'line',
  'ink',
  'muted',
  'accent',
  'accent-from',
  'accent-to',
  'on-accent',
  'positive',
  'negative',
  'warning',
  'neutral',
  ...Array.from({ length: CHART_COLORS }, (_, i) => `chart-${i + 1}`),
] as const;

export type Token = (typeof TOKENS)[number];

export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

/** CSS color for a chart series, by position. Series past the last color share it: group them as "Other" instead. */
export function chartColor(index: number): string {
  return `var(--chart-${Math.min(Math.max(Math.floor(index), 0), CHART_COLORS - 1) + 1})`;
}
