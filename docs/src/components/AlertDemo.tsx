import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { Lang } from '../i18n/types';
import {
  BEATS,
  MAX_REPEATS,
  REPEAT_EVERY,
  clock,
  initial,
  reducer,
  type EventLabels,
  type Payload,
} from '../demo/engine';

/*
 * A client-side simulation of the escalation loop.
 *
 * It runs the same SHAPE as internal/domain — the beat schedule, the repeat cap
 * and the dedupe collapse are the real numbers — but nothing leaves the page:
 * no AWS, no bot token, no network at all. Safe to leave on a public site.
 */

interface Labels extends EventLabels {
  readonly banner: string;
  readonly fire: string;
  readonly reset: string;
  readonly payload: string;
  readonly roster: string;
  readonly pipeline: string;
  readonly pipelineNote: string;
  readonly clockTitle: string;
  readonly eventLog: string;
  readonly phone: string;
  readonly ack: string;
  readonly resolve: string;
  readonly primary: string;
  readonly secondary: string;
  readonly team: string;
  readonly onCall: string;
  readonly beats: readonly string[];
  readonly repeatBeat: string;
  readonly repeatNote: string;
  readonly stages: readonly { readonly name: string; readonly note: string }[];
  readonly stateFiring: string;
  readonly stateAcked: string;
  readonly stateResolved: string;
  readonly idle: string;
  readonly alertTitle: string;
  readonly alertBody: string;
}

const payloads: Record<Payload, string> = {
  firing: `{
  "status": "firing",
  "labels": {
    "severity": "critical",
    "service": "checkout"
  }
}`,
  resolved: `{
  "status": "resolved",
  "labels": {
    "severity": "critical",
    "service": "checkout"
  }
}`,
  flood: `{
  "status": "firing",
  "alerts": [ 10 × same fingerprint ],
  "labels": { "service": "checkout" }
}`,
};

export function AlertDemo({ lang }: { lang: Lang }) {
  const L = labels[lang];
  const [s, dispatch] = useReducer(reducer, initial);
  const labelsRef = useRef(L);
  labelsRef.current = L;

  useEffect(() => {
    if (s.phase !== 'running' || s.paused) return;
    const id = setInterval(
      () => dispatch({ type: 'tick', dt: 0.1 * s.speed, labels: labelsRef.current }),
      100,
    );
    return () => clearInterval(id);
  }, [s.phase, s.paused, s.speed]);

  const fire = useCallback(() => dispatch({ type: 'fire', labels: labelsRef.current }), []);

  const live = s.phase === 'running';
  const beatLabels = [...L.beats, L.repeatBeat];
  const activeBeat = Math.min(3, s.level) - 1;

  return (
    <div className="not-prose">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3 border border-line bg-surface px-4 py-3">
        <span className="eyebrow text-soft">{L.banner}</span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: 'reset' })}
            className="border border-line px-3 py-2 font-mono text-[.6875rem] tracking-[.08em] uppercase hover:bg-wash"
          >
            {L.reset}
          </button>
          <button
            type="button"
            onClick={fire}
            disabled={live}
            className="bg-fire px-4 py-2 font-mono text-[.6875rem] tracking-[.08em] text-paper uppercase disabled:opacity-40"
          >
            ▶ {L.fire}
          </button>
        </div>
      </div>

      <div className="grid gap-px border-x border-b border-line bg-line lg:grid-cols-[15rem_minmax(0,1fr)_14rem]">
        {/* left: payload + roster */}
        <div className="space-y-5 bg-bg p-4">
          <div>
            <div className="eyebrow mb-2 text-soft">{L.payload}</div>
            <div className="mb-2 flex gap-px border border-line bg-line">
              {(['firing', 'resolved', 'flood'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => dispatch({ type: 'payload', payload: p })}
                  disabled={s.phase !== 'idle'}
                  className={`flex-1 px-2 py-2 font-mono text-[.625rem] disabled:opacity-50 ${
                    s.payload === p ? 'bg-text text-bg' : 'bg-bg text-soft'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <pre className="overflow-x-auto border border-line bg-surface p-3 font-mono text-[.6875rem] leading-relaxed">
              <code>{payloads[s.payload]}</code>
            </pre>
          </div>

          <div>
            <div className="eyebrow mb-2 text-soft">{L.roster}</div>
            <ul className="space-y-px border border-line bg-line">
              {[L.primary, L.secondary, L.team].map((who, i) => {
                const on = s.phase !== 'idle' && Math.min(3, s.level) - 1 === i;
                return (
                  <li key={who} className="flex items-center gap-2 bg-surface px-3 py-2">
                    <span
                      className={`h-2 w-2 rounded-full ${on ? 'bg-fire' : 'bg-line'}`}
                      aria-hidden
                    />
                    <span className={`text-[.8125rem] ${on ? '' : 'text-soft'}`}>{who}</span>
                    {i === 0 && <span className="eyebrow ml-auto text-soft">{L.onCall}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* middle: pipeline + clock + log */}
        <div className="space-y-6 bg-bg p-4">
          <div>
            <div className="mb-1 flex flex-wrap items-baseline gap-3">
              <span className="eyebrow text-soft">{L.pipeline}</span>
              <span className="font-mono text-[.6875rem] text-soft">{L.pipelineNote}</span>
            </div>
            <ol className="flex flex-wrap items-stretch gap-2">
              {L.stages.map((st, i) => (
                <li
                  key={st.name}
                  className={`flex-1 border p-3 transition-colors ${
                    s.stage > i ? 'border-banana bg-wash' : 'border-line bg-surface opacity-60'
                  }`}
                >
                  <div className="font-mono text-[.75rem] font-semibold">{st.name}</div>
                  <div className="mt-1 font-mono text-[.625rem] text-soft">{st.note}</div>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <span className="eyebrow text-soft">{L.clockTitle}</span>
              <div className="ml-auto flex gap-px border border-line bg-line">
                {([1, 60] as const).map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => dispatch({ type: 'speed', speed: sp })}
                    className={`px-2 py-1 font-mono text-[.625rem] ${
                      s.speed === sp ? 'bg-text text-bg' : 'bg-bg text-soft'
                    }`}
                  >
                    {sp}×
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'pause' })}
                  disabled={!live}
                  className="bg-bg px-2 py-1 font-mono text-[.625rem] text-soft disabled:opacity-40"
                >
                  {s.paused ? '▶' : '❙❙'}
                </button>
              </div>
            </div>

            <div className="relative mb-3 h-[3px] bg-line">
              <div
                className={`absolute inset-y-0 left-0 ${s.phase === 'acked' ? 'bg-ok' : 'bg-fire'}`}
                style={{ width: `${Math.min(100, (s.elapsed / REPEAT_EVERY) * 100)}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {beatLabels.map((b, i) => {
                const reached = s.phase !== 'idle' && (i < 3 ? s.level > i : s.level > 3);
                return (
                  <div key={b} className={reached ? '' : 'opacity-45'}>
                    <div className="font-mono text-[.625rem] text-soft">
                      {i === 3 ? L.repeatNote : `T+${BEATS[i] / 60}m`}
                    </div>
                    <div
                      className={`font-display text-sm font-bold ${
                        activeBeat === i && live ? 'text-fire' : ''
                      }`}
                    >
                      {b}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="eyebrow mb-2 text-soft">{L.eventLog}</div>
            <ol className="max-h-44 overflow-y-auto border border-line bg-surface font-mono text-[.6875rem]">
              {s.events.length === 0 && <li className="px-3 py-2 text-soft">{L.idle}</li>}
              {s.events.map((e, i) => (
                <li key={i} className="flex gap-3 border-b border-line px-3 py-[6px] last:border-0">
                  <span className="text-soft">{clock(e.t)}</span>
                  <span>{e.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* right: the phone */}
        <div className="bg-bg p-4">
          <div className="eyebrow mb-2 text-soft">{L.phone}</div>
          <div className="border border-strong bg-surface p-3">
            <div className="flex items-baseline gap-2 border-b border-line pb-2">
              <span className="h-2 w-2 rounded-full bg-fire" aria-hidden />
              <span className="font-mono text-[.6875rem] font-semibold">{L.alertTitle}</span>
            </div>
            <p className="py-3 text-[.8125rem] leading-relaxed">{L.alertBody}</p>

            <div className="mb-3 font-mono text-[.625rem] text-soft">
              {s.phase === 'idle' && L.idle}
              {s.phase === 'running' && `${L.stateFiring} · ${clock(s.elapsed)}`}
              {s.phase === 'acked' && L.stateAcked}
              {s.phase === 'resolved' && L.stateResolved}
            </div>

            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => dispatch({ type: 'ack', labels: labelsRef.current })}
                disabled={!live}
                className="bg-banana px-3 py-3 font-mono text-[.6875rem] tracking-[.08em] text-ink uppercase disabled:opacity-40"
              >
                {L.ack}
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: 'resolve', labels: labelsRef.current })}
                disabled={s.phase === 'idle' || s.phase === 'resolved'}
                className="border border-line px-3 py-2 font-mono text-[.6875rem] tracking-[.08em] uppercase disabled:opacity-40"
              >
                {L.resolve}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const labels: Record<Lang, Labels> = {
  vi: {
    banner: '/DEMO · MÔ PHỎNG, KHÔNG GỬI GÌ CẢ',
    fire: 'Bắn alert',
    reset: 'Đặt lại',
    payload: 'Payload',
    roster: 'Lịch trực',
    pipeline: 'Pipeline',
    pipelineNote: 'các chặng sáng dần theo thứ tự',
    clockTitle: 'Đồng hồ escalation',
    eventLog: 'Nhật ký',
    phone: 'Telegram giả lập',
    ack: 'Ack',
    resolve: 'Resolve',
    primary: 'primary',
    secondary: 'secondary',
    team: 'group chat cả team',
    onCall: 'đang trực',
    beats: ['Primary', 'Secondary', 'War room'],
    repeatBeat: 'Mỗi 10m',
    repeatNote: 'Lặp lại',
    stages: [
      { name: 'ingest λ', note: '202 · 41ms' },
      { name: 'SQS FIFO', note: 'group=checkout' },
      { name: 'processor λ', note: 'mô phỏng' },
      { name: 'Telegram', note: 'đã gửi' },
    ],
    evAccepted: 'ingest → 202 accepted',
    evQueued: 'SQS FIFO ← 1 message (group=checkout)',
    evFlood: 'SQS FIFO ← 10 alert gộp còn 1 message (FR-1.6)',
    evClosed: 'alert group đóng — không escalate',
    evPrimary: 'Telegram DM → primary',
    evSecondary: 'chưa ack 5 phút → secondary',
    evWarRoom: 'chưa ack 10 phút → war room',
    evAcked: 'ACK bởi primary — escalation dừng',
    evResolved: 'resolved — alert group đóng',
    evRepeat: (n) => `nhắc lại lần ${n} (tối đa ${MAX_REPEATS})`,
    stateFiring: 'FIRING',
    stateAcked: 'ACKED — đồng hồ đã dừng',
    stateResolved: 'RESOLVED',
    idle: 'chưa có gì — bấm Bắn alert',
    alertTitle: 'CRITICAL · checkout',
    alertBody: 'HighErrorRate — tỉ lệ lỗi 5xx vượt ngưỡng trên service checkout.',
  },
  en: {
    banner: '/DEMO · SIMULATED, NOTHING IS SENT',
    fire: 'Fire alert',
    reset: 'Reset',
    payload: 'Payload',
    roster: 'Roster',
    pipeline: 'Pipeline',
    pipelineNote: 'stages light up in sequence',
    clockTitle: 'Escalation clock',
    eventLog: 'Event log',
    phone: 'Mock Telegram',
    ack: 'Ack',
    resolve: 'Resolve',
    primary: 'primary',
    secondary: 'secondary',
    team: 'team group chat',
    onCall: 'on call',
    beats: ['Primary', 'Secondary', 'War room'],
    repeatBeat: 'Every 10m',
    repeatNote: 'Repeat',
    stages: [
      { name: 'ingest λ', note: '202 · 41ms' },
      { name: 'SQS FIFO', note: 'group=checkout' },
      { name: 'processor λ', note: 'simulated' },
      { name: 'Telegram', note: 'delivered' },
    ],
    evAccepted: 'ingest → 202 accepted',
    evQueued: 'SQS FIFO ← 1 message (group=checkout)',
    evFlood: 'SQS FIFO ← 10 alerts collapsed to 1 message (FR-1.6)',
    evClosed: 'alert group closed — no escalation',
    evPrimary: 'Telegram DM → primary',
    evSecondary: 'no ack after 5m → secondary',
    evWarRoom: 'no ack after 10m → war room',
    evAcked: 'ACK by primary — escalation stopped',
    evResolved: 'resolved — alert group closed',
    evRepeat: (n) => `repeat ${n} of at most ${MAX_REPEATS}`,
    stateFiring: 'FIRING',
    stateAcked: 'ACKED — the clock stopped',
    stateResolved: 'RESOLVED',
    idle: 'nothing yet — press Fire alert',
    alertTitle: 'CRITICAL · checkout',
    alertBody: 'HighErrorRate — 5xx rate above threshold on the checkout service.',
  },
};
