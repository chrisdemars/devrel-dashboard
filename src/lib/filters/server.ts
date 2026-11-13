// Filters for server components. A page passes on its `searchParams`:
//
//   const { filters, context } = await getFilters(searchParams);
//   const activities = await getDataStore().getActivities(toDataFilter(filters));
//
// `searchParams` is only known at request time, so the component that calls
// this must sit inside a <Suspense> boundary.

import config from '../config';
import { getDataStore } from '../data';
import { parseFilters, type FilterContext, type Filters, type SearchParamsInput } from './index';

/** The dates the filters are worked out against: the data's first and last day, and the launch. */
export async function getFilterContext(): Promise<FilterContext> {
  const { from, to } = await getDataStore().getDateRange();
  return { dataFrom: from, today: to, launchDate: config.launch?.date };
}

export async function getFilters(
  searchParams: Promise<SearchParamsInput> | SearchParamsInput,
): Promise<{ filters: Filters; context: FilterContext }> {
  const [params, context] = await Promise.all([searchParams, getFilterContext()]);
  return { filters: parseFilters(params, context), context };
}
