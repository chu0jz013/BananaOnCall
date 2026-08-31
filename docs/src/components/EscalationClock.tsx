export interface Beat {
  readonly at: string;
  readonly title: string;
  readonly detail: string;
  /** The repeat step, which is the one that should read as alarming. */
  readonly accent?: boolean;
}

interface Props {
  readonly caption: string;
  readonly hint: string;
  readonly beats: readonly Beat[];
}

/**
 * The signature piece from the v0.1 design doc, kept because it explains the
 * product in one glance. The sweep and the staggered beats are decorative and
 * are disabled under prefers-reduced-motion (see styles.css).
 */
export function EscalationClock({ caption, hint, beats }: Props) {
  return (
    <section aria-label={caption} className="my-8">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <span className="eyebrow text-soft">{caption}</span>
        <span className="eyebrow hidden text-soft sm:block">{hint}</span>
      </div>

      <div className="relative h-[3px] bg-line">
        <div className="sweep absolute inset-y-0 left-0 bg-text" />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4">
        {beats.map((b, i) => (
          <div key={b.at} className="beat" style={{ animationDelay: `${0.05 + i * 0.7}s` }}>
            <div className="mb-1 font-mono text-xs text-soft">{b.at}</div>
            <div
              className={`font-display text-lg leading-tight font-bold ${b.accent ? 'text-fire' : ''}`}
            >
              {b.title}
            </div>
            <div className="mt-1 text-sm text-soft">{b.detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
