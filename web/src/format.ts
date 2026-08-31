/** Formatting helpers. Everything the board prints goes through here. */

/**
 * Durations read as "2m14s", not "134 seconds". During an incident nobody wants
 * to divide in their head.
 */
export function duration(seconds: number): string {
  if (seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return m > 0 ? `${h}h${m}m` : `${h}h`;
  if (m > 0) return s > 0 ? `${m}m${s}s` : `${m}m`;
  return `${s}s`;
}

/**
 * Availability needs more decimals than a normal percentage: the whole argument
 * between 99.9 and 99.95 lives in the third digit.
 */
export function availability(pct: number): string {
  return `${pct.toFixed(pct >= 99.9 ? 3 : 2)}%`;
}

export function target(pct: number): string {
  return `${pct}%`;
}

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
});

export function timestamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' });

export function day(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : dayFmt.format(d);
}

export function relative(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  return `${duration((now - then) / 1000)} ago`;
}
