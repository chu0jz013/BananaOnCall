/*
 * The simulation engine, kept free of React so it can be exercised on its own —
 * the same split the product itself makes between internal/domain and its
 * adapters. Nothing here touches the network.
 */

/** The event text the reducer needs; the view carries the rest. */
export interface EventLabels {
  readonly evAccepted: string;
  readonly evQueued: string;
  readonly evFlood: string;
  readonly evClosed: string;
  readonly evPrimary: string;
  readonly evSecondary: string;
  readonly evWarRoom: string;
  readonly evAcked: string;
  readonly evResolved: string;
  readonly evRepeat: (n: number) => string;
}

export type Phase = 'idle' | 'running' | 'acked' | 'resolved';
export type Payload = 'firing' | 'resolved' | 'flood';

/** Escalation policy ep-critical: primary, secondary at 5m, war room at 10m. */
export const BEATS = [0, 300, 600] as const;
export const REPEAT_EVERY = 600;
export const MAX_REPEATS = 50;

export interface Ev {
  readonly t: number;
  readonly text: string;
}

export interface State {
  readonly phase: Phase;
  readonly payload: Payload;
  readonly elapsed: number;
  readonly speed: 1 | 60;
  readonly paused: boolean;
  readonly stage: number;
  readonly level: number;
  readonly events: readonly Ev[];
}

export const initial: State = {
  phase: 'idle',
  payload: 'firing',
  elapsed: 0,
  speed: 60,
  paused: false,
  stage: 0,
  level: 0,
  events: [],
};

export type Action =
  | { type: 'fire'; labels: EventLabels }
  | { type: 'reset' }
  | { type: 'payload'; payload: Payload }
  | { type: 'speed'; speed: 1 | 60 }
  | { type: 'pause' }
  | { type: 'tick'; dt: number; labels: EventLabels }
  | { type: 'ack'; labels: EventLabels }
  | { type: 'resolve'; labels: EventLabels };

function log(s: State, text: string, t = s.elapsed): State {
  return { ...s, events: [...s.events, { t, text }] };
}

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'reset':
      return { ...initial, payload: s.payload, speed: s.speed };

    case 'payload':
      return s.phase === 'idle' ? { ...s, payload: a.payload } : s;

    case 'speed':
      return { ...s, speed: a.speed };

    case 'pause':
      return s.phase === 'running' ? { ...s, paused: !s.paused } : s;

    case 'fire': {
      const L = a.labels;
      let next: State = { ...initial, payload: s.payload, speed: s.speed, phase: 'running' };
      next = log(next, L.evAccepted, 0.04);
      next = log(next, s.payload === 'flood' ? L.evFlood : L.evQueued, 0.31);
      if (s.payload === 'resolved') {
        next = log(next, L.evClosed, 0.62);
        return { ...next, phase: 'resolved', stage: 4 };
      }
      return { ...next, level: 1, events: [...next.events, { t: 1.0, text: L.evPrimary }] };
    }

    case 'tick': {
      if (s.phase !== 'running' || s.paused) return s;
      const elapsed = s.elapsed + a.dt;
      let next: State = { ...s, elapsed };

      // Pipeline stages light up over the first 1.5 simulated seconds.
      const stage = Math.min(4, Math.floor(elapsed / 0.375) + 1);
      if (stage !== s.stage) next = { ...next, stage };

      // How many escalation beats should have fired by now?
      let due = BEATS.filter((b) => elapsed >= b).length;
      if (elapsed >= BEATS[2]) {
        due = 3 + Math.min(MAX_REPEATS, Math.floor((elapsed - BEATS[2]) / REPEAT_EVERY));
      }
      if (due > s.level) {
        const L = a.labels;
        const names = [L.evPrimary, L.evSecondary, L.evWarRoom];
        for (let n = s.level + 1; n <= due; n++) {
          const text = n <= 3 ? names[n - 1] : L.evRepeat(n - 3);
          next = log(next, text, n <= 3 ? BEATS[n - 1] : BEATS[2] + (n - 3) * REPEAT_EVERY);
        }
        next = { ...next, level: due };
      }
      return next;
    }

    case 'ack':
      if (s.phase !== 'running') return s;
      return { ...log(s, a.labels.evAcked), phase: 'acked' };

    case 'resolve':
      if (s.phase === 'idle') return s;
      return { ...log(s, a.labels.evResolved), phase: 'resolved' };
  }
}

export function clock(t: number): string {
  const m = Math.floor(t / 60);
  const sec = t % 60;
  return `${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
}

