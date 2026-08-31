import type { ReactNode } from 'react';

export interface Step {
  readonly title: string;
  readonly body: ReactNode;
  /** What success looks like — the line that turns a guide into something debuggable. */
  readonly expected?: string;
}

export function Steps({ steps, expectedLabel }: { steps: readonly Step[]; expectedLabel: string }) {
  return (
    <ol className="my-5 space-y-8">
      {steps.map((s, i) => (
        <li key={s.title} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-4">
          <span className="mt-1 flex h-7 w-7 items-center justify-center bg-text font-mono text-xs text-bg">
            {i + 1}
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-lg font-bold">{s.title}</h3>
            <div className="mt-2">{s.body}</div>
            {s.expected && (
              <p className="mt-2 border-l-2 border-banana pl-3 font-mono text-[.75rem] text-soft">
                <span className="eyebrow mr-2">{expectedLabel}</span>
                {s.expected}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
