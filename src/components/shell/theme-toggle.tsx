'use client';

import { THEME_STORAGE_KEY } from './theme-script';

/**
 * Switches between the dark and light themes and remembers the choice.
 * The current theme lives on <html data-theme>, so the label is picked with
 * CSS and this component needs no state.
 */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be blocked (private windows). The theme still changes for this visit.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="cursor-pointer rounded-md border border-line px-2.5 py-1.5 font-mono text-[0.7rem] tracking-[0.14em] text-muted uppercase hover:bg-raised hover:text-ink"
    >
      <span className="sr-only">Switch to the </span>
      <span className="light:hidden">Light</span>
      <span className="hidden light:inline">Dark</span>
      <span className="sr-only"> theme</span>
    </button>
  );
}
