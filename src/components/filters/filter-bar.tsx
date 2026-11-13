import { getDataStore } from '@/lib/data';
import { describeFilters, type FilterContext, type Filters } from '@/lib/filters';
import { FilterControls } from './filter-controls';

interface FilterBarProps {
  /** From `getFilters(searchParams)` in src/lib/filters/server.ts. */
  filters: Filters;
  context: FilterContext;
}

/**
 * The filters shared by every dashboard: tags, date range and comparison.
 * In print the controls are replaced by one line saying what was selected.
 */
export async function FilterBar({ filters, context }: FilterBarProps) {
  const tags = await getDataStore().getTags();

  return (
    <>
      <FilterControls filters={filters} context={context} tags={tags} />
      <p className="hidden font-mono text-xs text-muted print:block">{describeFilters(filters)}</p>
    </>
  );
}

/** Holds the filter bar's place while it loads, so the page below does not jump. */
export function FilterBarFallback() {
  return <div aria-hidden="true" className="h-[6.125rem] rounded-card border border-line bg-surface print:hidden" />;
}
