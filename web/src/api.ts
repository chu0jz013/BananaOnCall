/** Mirrors internal/domain — keep the two in step when the Go types change. */

export interface DailyCount {
  date: string;
  good: number;
  total: number;
}

export interface ErrorBudget {
  totalSeconds: number;
  consumedSeconds: number;
  remainingSeconds: number;
  consumedPercent: number;
}

export interface SLIStatus {
  key: string;
  label: string;
  detail: string;
  target: number;
  actual: number;
  meeting: boolean;
  windowDays: number;
  errorBudget: ErrorBudget;
  days: DailyCount[];
}

export interface Incident {
  id: string;
  title: string;
  severity: string;
  service: string;
  state: string;
  startedAt: string;
  ackedAt?: string;
  resolvedAt?: string;
  alertCount: number;
}

export interface Aggregate {
  seconds: number;
  sampleSize: number;
}

export type Health = 'operational' | 'degraded' | 'down';

export interface Board {
  generatedAt: string;
  health: Health;
  slis: SLIStatus[];
  activeIncidents: Incident[];
  recentIncidents: Incident[];
  mtta: Aggregate;
  mttr: Aggregate;
}

/**
 * Baked in at build time by Vite. `make web-build` sets it from the deployed
 * stack, so the same source targets LocalStack or real AWS unchanged.
 */
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export async function fetchBoard(signal?: AbortSignal): Promise<Board> {
  const res = await fetch(`${API_BASE}/v1/status`, { signal });
  if (!res.ok) {
    throw new Error(`status endpoint returned ${res.status}`);
  }
  return res.json() as Promise<Board>;
}
