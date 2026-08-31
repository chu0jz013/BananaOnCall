import type { DailyCount, Health } from './api';

export type DayState = 'good' | 'warning' | 'critical' | 'empty';

export const STATE_LABEL: Record<DayState, string> = {
  good: 'Met target',
  warning: 'Below target',
  critical: 'Well below target',
  empty: 'No data',
};

export const STATE_CLASS: Record<DayState, string> = {
  good: 'st-good',
  warning: 'st-warning',
  critical: 'st-critical',
  empty: 'st-empty',
};

/** Availability for one day, or null when nothing was recorded. */
export function dayRate(d: DailyCount): number | null {
  return d.total > 0 ? (d.good / d.total) * 100 : null;
}

/**
 * Grades one day against the SLI's target.
 *
 * The warning band is one further allowance-width below the target: for a 99.9%
 * target that is 99.8-99.9. It marks a day that stayed usable but ate real
 * budget, which is the distinction an error-budget policy actually turns on.
 */
export function classifyDay(d: DailyCount, target: number): DayState {
  const rate = dayRate(d);
  if (rate === null) return 'empty';
  if (rate >= target) return 'good';
  return rate >= target - (100 - target) ? 'warning' : 'critical';
}

export const HEALTH_COPY: Record<Health, { word: string; note: string; cls: string }> = {
  operational: {
    word: 'All systems operational',
    note: 'No open incidents, and every indicator is inside its target.',
    cls: 'st-good',
  },
  degraded: {
    word: 'Degraded',
    note: 'Something is open or an indicator is outside its target.',
    cls: 'st-warning',
  },
  down: {
    word: 'Major incident',
    note: 'A critical alert is open right now.',
    cls: 'st-critical',
  },
};
