// How a headline number stands against the comparison picked in the filter
// bar: a change, progress toward a target, or a plain sentence when there is
// nothing to compare with. Shared by every dashboard.

import { COMPARISON_LABELS, type Filters } from '../filters';
import { formatPercent } from '../format';
import { periodRange, targetProgress, type PeriodComparison } from '../metrics';

export interface Standing {
  /** Change against the selected comparison, as a fraction. */
  delta?: number;
  deltaLabel?: string;
  /** Said in place of a change: target progress, or why there is nothing to compare with. */
  detail?: string;
  /** Progress toward the target, when comparing with targets. */
  progress?: number;
}

export interface TargetInput {
  /** The number so far in the target's period. */
  actual: number;
  /** The target. Leave out when none is set for the period. */
  value?: number;
  /** e.g. '2027-Q1'. */
  period: string;
  format: (value: number) => string;
}

/** How a KPI stands against the selected comparison. */
export function standing(
  filters: Filters,
  compared: PeriodComparison | undefined,
  target?: TargetInput,
): Standing {
  if (filters.compare === 'target') {
    if (!target) return { detail: 'Targets are not set for this number.' };
    if (target.value === undefined) return { detail: `No target set for ${target.period}.` };
    const progress = targetProgress(target.actual, target.value, periodRange(target.period), filters.to);
    if (progress.fraction === undefined) return { detail: `No target set for ${target.period}.` };
    const pace = progress.met ? 'target met' : progress.onTrack ? 'on track' : 'behind pace';
    return {
      progress: progress.fraction,
      detail: `${target.period}: ${target.format(target.actual)} of ${target.format(target.value)} (${formatPercent(progress.fraction)}), ${pace}`,
    };
  }
  if (!compared || compared.change === undefined) {
    if (compared && compared.current > 0) {
      return { detail: filters.compare === 'baseline' ? 'New since the baseline.' : 'New since the previous period.' };
    }
    return {
      detail:
        filters.compare === 'baseline'
          ? 'Nothing in the baseline to compare with.'
          : 'Nothing in the previous period to compare with.',
    };
  }
  return {
    delta: compared.change,
    deltaLabel: `${COMPARISON_LABELS[filters.compare]}${compared.basis === 'daily_average' ? ', per day' : ''}`,
  };
}

