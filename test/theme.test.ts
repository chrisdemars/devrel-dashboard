// Checks every theme preset: the shared ones in src/theme/ and any your
// organization added there or in config/. A preset must define every token
// for both themes, and its colors must meet WCAG AA contrast.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import config from '../src/lib/config';
import { contrastRatio } from '../src/lib/color';
import { chartColor, CHART_COLORS, THEMES, TOKENS, type Theme, type Token } from '../src/theme/tokens';

const TEXT = 4.5; // WCAG AA for normal text
const GRAPHIC = 3; // WCAG AA for chart marks and icons

interface Preset {
  name: string;
  file: string;
  values: Record<Theme, Record<string, string>>;
}

function cssFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.css'))
    .map((file) => join(dir, file));
}

/** Reads the presets in a CSS file: each rule whose selector has [data-preset='name']. */
function presetsIn(file: string): Preset[] {
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const presets: Preset[] = [];
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const name = /\[data-preset=['"]([^'"]+)['"]\]/.exec(selector)?.[1];
    if (!name) continue;
    const values: Preset['values'] = { dark: {}, light: {} };
    for (const [, theme, token, value] of body.matchAll(/--(dark|light)-([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      values[theme as Theme][token] = value.trim();
    }
    presets.push({ name, file, values });
  }
  return presets;
}

const presets = [...cssFiles('src/theme'), ...cssFiles('config')].flatMap(presetsIn);

test('the default preset exists, and preset names are unique', () => {
  const names = presets.map((p) => p.name);
  expect(names).toContain('default');
  expect(new Set(names).size).toBe(names.length);
});

test('the preset named in the org config exists', () => {
  expect(presets.map((p) => p.name)).toContain(config.theme.preset);
});

test('tokens.css maps every token in dark, light and print', () => {
  const css = readFileSync('src/theme/tokens.css', 'utf8');
  for (const token of TOKENS) {
    expect(css.split(`--${token}: var(--dark-${token});`).length - 1, `${token} (dark)`).toBe(1);
    // Once for [data-theme='light'], once for print.
    expect(css.split(`--${token}: var(--light-${token});`).length - 1, `${token} (light and print)`).toBe(2);
  }
});

test('globals.css exposes every token to Tailwind', () => {
  const css = readFileSync('src/app/globals.css', 'utf8');
  for (const token of TOKENS) expect(css).toContain(`--color-${token}: var(--${token});`);
});

test('chartColor stays within the palette', () => {
  expect(chartColor(0)).toBe('var(--chart-1)');
  expect(chartColor(CHART_COLORS - 1)).toBe(`var(--chart-${CHART_COLORS})`);
  expect(chartColor(99)).toBe(`var(--chart-${CHART_COLORS})`);
  expect(chartColor(-1)).toBe('var(--chart-1)');
});

describe.each(presets)('preset "$name" ($file)', ({ values }) => {
  describe.each(THEMES)('%s theme', (theme) => {
    const color = (token: Token) => values[theme][token];
    const expectContrast = (foreground: Token, background: Token, minimum: number) =>
      expect(
        contrastRatio(color(foreground), color(background)),
        `${foreground} ${color(foreground)} on ${background} ${color(background)}`,
      ).toBeGreaterThanOrEqual(minimum);

    test('defines every token as a 6-digit hex color, and nothing else', () => {
      for (const token of TOKENS) expect(color(token), token).toMatch(/^#[0-9a-f]{6}$/i);
      expect(Object.keys(values[theme]).sort()).toEqual([...TOKENS].sort());
    });

    test('text is readable on every surface', () => {
      for (const surface of ['page', 'surface', 'raised'] as const) {
        expectContrast('ink', surface, TEXT);
        expectContrast('muted', surface, TEXT);
      }
    });

    test('accent and state text is readable on the page and on cards', () => {
      for (const token of ['accent', 'positive', 'negative', 'warning'] as const) {
        expectContrast(token, 'page', TEXT);
        expectContrast(token, 'surface', TEXT);
      }
    });

    test('text on the accent fill is readable across the gradient', () => {
      expectContrast('on-accent', 'accent-from', TEXT);
      expectContrast('on-accent', 'accent-to', TEXT);
    });

    test('chart colors and status marks stand out from the card surface', () => {
      expectContrast('neutral', 'surface', GRAPHIC);
      expectContrast('neutral', 'raised', GRAPHIC);
      for (let i = 1; i <= CHART_COLORS; i += 1) expectContrast(`chart-${i}` as Token, 'surface', GRAPHIC);
    });
  });
});
