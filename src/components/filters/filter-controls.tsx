'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useOptimistic, useRef, useState, useTransition } from 'react';
import { cx } from '@/components/ui/cx';
import type { Tag } from '@/lib/data/types';
import {
  COMPARISONS,
  COMPARISON_LABELS,
  RANGE_LABELS,
  RANGE_PRESETS,
  filterHref,
  isDefaultFilters,
  updateFilters,
  type FilterChange,
  type FilterContext,
  type Filters,
} from '@/lib/filters';

const LABEL = 'font-mono text-[0.7rem] tracking-[0.14em] uppercase';
const CONTROL = cx(LABEL, 'rounded-md border border-line px-2.5 py-1.5 text-muted hover:bg-raised hover:text-ink');

interface FilterControlsProps {
  filters: Filters;
  context: FilterContext;
  tags: Tag[];
}

/** The interactive filter bar. Every change goes to the URL, and the page re-renders from it. */
export function FilterControls({ filters, context, tags }: FilterControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  // Controls show the new choice at once, while the page catches up.
  const [shown, setShown] = useOptimistic(filters);

  function change(update: FilterChange) {
    const next = updateFilters(shown, update, context);
    startTransition(() => {
      setShown(next);
      router.replace(filterHref(pathname, next), { scroll: false });
    });
  }

  return (
    <div
      aria-busy={pending}
      className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card border border-line bg-surface px-4 py-3 print:hidden"
    >
      <TagPicker tags={tags} selected={shown.tags} onChange={(next) => change({ tags: next })} />

      <Choice
        legend="Date range"
        options={RANGE_PRESETS}
        labels={RANGE_LABELS}
        value={shown.preset}
        onChange={(preset) => change({ preset })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <DateField label="From" value={shown.from} max={shown.to} onChange={(from) => change({ from })} />
        <span aria-hidden="true" className="text-muted">
          –
        </span>
        <DateField label="To" value={shown.to} min={shown.from} onChange={(to) => change({ to })} />
      </div>

      <Choice
        legend="Compare"
        options={COMPARISONS}
        labels={COMPARISON_LABELS}
        value={shown.compare}
        onChange={(compare) => change({ compare })}
      />

      {!isDefaultFilters(shown) && (
        <Link href={pathname} replace scroll={false} className={cx(LABEL, 'ml-auto text-accent hover:underline')}>
          Reset<span className="sr-only"> filters</span>
        </Link>
      )}
    </div>
  );
}

interface ChoiceProps<T extends string> {
  legend: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}

/** Pick one of a few options. Real radio buttons, so the arrow keys work. */
function Choice<T extends string>({ legend, options, labels, value, onChange }: ChoiceProps<T>) {
  const name = useId();
  return (
    <fieldset className="flex flex-wrap items-center gap-1">
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <label
          key={option}
          className={cx(
            LABEL,
            'cursor-pointer rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted hover:bg-raised hover:text-ink',
            'has-checked:bg-raised has-checked:text-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent',
          )}
        >
          <input
            type="radio"
            name={name}
            className="sr-only"
            checked={option === value}
            onChange={() => onChange(option)}
          />
          {labels[option]}
        </label>
      ))}
    </fieldset>
  );
}

interface DateFieldProps {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}

function DateField({ label, value, min, max, onChange }: DateFieldProps) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <input
        // Uncontrolled, so a half-typed date is not overwritten. The key resets it when the filters change.
        key={value}
        type="date"
        defaultValue={value}
        min={min}
        max={max}
        onChange={(event) => {
          // Empty while a date is half typed; wait for a whole one.
          if (event.target.value) onChange(event.target.value);
        }}
        className="rounded-md border border-line bg-page px-2 py-1 font-mono text-xs text-ink [color-scheme:dark] light:[color-scheme:light]"
      />
    </label>
  );
}

interface TagPickerProps {
  tags: Tag[];
  selected: string[];
  onChange: (tags: string[]) => void;
}

/** A button that opens a list of checkboxes, grouped into activity types and other tags. */
function TagPicker({ tags, selected, onChange }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Close when a click or the focus lands outside, or on Escape.
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  // A tag from a shared link that no longer exists still shows, so it can be unticked.
  const known = new Set(tags.map((tag) => tag.name));
  const groups = [
    { legend: 'Activity type', names: tags.filter((tag) => tag.kind === 'type').map((tag) => tag.name) },
    {
      legend: 'Other tags',
      names: [...tags.filter((tag) => tag.kind === 'custom').map((tag) => tag.name), ...selected.filter((tag) => !known.has(tag))],
    },
  ].filter((group) => group.names.length > 0);

  function toggle(name: string) {
    onChange(selected.includes(name) ? selected.filter((tag) => tag !== name) : [...selected, name]);
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className={cx(CONTROL, 'cursor-pointer whitespace-nowrap', selected.length > 0 && 'text-ink')}
      >
        Tags: {selected.length === 0 ? 'All' : selected.length === 1 ? selected[0] : `${selected.length} selected`}
        <span aria-hidden="true" className="ml-1.5">
          {open ? '▴' : '▾'}
        </span>
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute top-full left-0 z-20 mt-2 flex max-h-[70vh] w-64 flex-col gap-4 overflow-y-auto rounded-card border border-line bg-raised p-4 shadow-lg"
      >
        {groups.map(({ legend, names }) => (
          <fieldset key={legend} className="flex flex-col gap-1.5">
            <legend className={cx(LABEL, 'mb-2 text-muted')}>{legend}</legend>
            {names.map((name) => (
              <label key={name} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(name)}
                  onChange={() => toggle(name)}
                  className="size-4 accent-(--accent)"
                />
                {name}
              </label>
            ))}
          </fieldset>
        ))}
        {groups.length === 0 && <p className="text-sm text-muted">No tags yet.</p>}
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} className={cx(LABEL, 'cursor-pointer self-start text-accent hover:underline')}>
            Clear tags
          </button>
        )}
      </div>
    </div>
  );
}
