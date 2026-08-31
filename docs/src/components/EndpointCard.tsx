import { useState } from 'react';
import type { ReactNode } from 'react';

export interface Response {
  readonly code: string;
  readonly meaning: string;
  readonly tone?: 'ok' | 'warn' | 'bad';
}

interface Props {
  readonly method: string;
  readonly path: string;
  readonly badge: string;
  readonly summary: string;
  readonly request: string;
  readonly responses: readonly Response[];
  readonly copy: string;
  readonly labels: {
    readonly request: string;
    readonly responses: string;
    readonly copy: string;
    readonly copied: string;
  };
  readonly note?: ReactNode;
  /** The second endpoint on a page starts collapsed to just its header. */
  readonly defaultOpen?: boolean;
}

const tones = { ok: 'text-ok', warn: 'text-soft', bad: 'text-fire' } as const;

export function EndpointCard(p: Props) {
  const [open, setOpen] = useState(p.defaultOpen ?? true);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(p.copy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked; the command is visible and selectable anyway.
    }
  }

  return (
    <div className="my-5 border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-3 border-b border-line px-4 py-3 text-left"
      >
        <span className="bg-text px-2 py-1 font-mono text-[.625rem] tracking-[.08em] text-bg">
          {p.method}
        </span>
        <code className="min-w-0 font-mono text-sm break-all">{p.path}</code>
        <span className="eyebrow border border-line px-2 py-1 text-soft">{p.badge}</span>
        <span className="ml-auto font-mono text-xs text-soft">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <>
          <p className="px-4 pt-3 text-sm text-soft">{p.summary}</p>
          <div className="grid gap-px bg-line p-px lg:grid-cols-2">
            <div className="bg-surface p-4">
              <div className="eyebrow mb-2 text-soft">{p.labels.request}</div>
              <pre className="overflow-x-auto font-mono text-[.75rem] leading-relaxed">
                <code>{p.request.trim()}</code>
              </pre>
            </div>
            <div className="bg-surface p-4">
              <div className="eyebrow mb-2 text-soft">{p.labels.responses}</div>
              <ul className="space-y-2">
                {p.responses.map((r) => (
                  <li key={r.code} className="flex gap-3 text-sm">
                    <code className={`font-mono ${tones[r.tone ?? 'warn']}`}>{r.code}</code>
                    <span className="text-soft">{r.meaning}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {p.note && <div className="px-4 pt-3 text-sm text-soft">{p.note}</div>}
          <div className="flex items-center gap-3 border-t border-line px-4 py-3">
            <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[.75rem] whitespace-pre text-soft">
              {p.copy}
            </code>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 border border-line px-3 py-1 font-mono text-[.625rem] tracking-[.08em] uppercase hover:bg-wash"
            >
              {copied ? p.labels.copied : p.labels.copy}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
