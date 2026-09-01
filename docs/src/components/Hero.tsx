import { Link } from 'react-router';
import { REPO_URL } from '../links';

export interface HeroLabels {
  readonly headline: string;
  readonly quickstart: string;
  readonly source: string;
  readonly stats: readonly { readonly value: string; readonly label: string }[];
}

/**
 * The full-bleed band above the docs grid (wireframe 1b).
 *
 * It costs one scroll before the first sentence of documentation and buys the
 * evaluator glance — the three numbers are what the audience came for.
 */
export function Hero({ l }: { l: HeroLabels }) {
  return (
    <section className="border-b border-line bg-surface">
      <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10 lg:py-20">
        <div className="flex items-center gap-10">
          <div className="min-w-0 flex-1">
            <h1 className="font-display max-w-3xl text-4xl leading-[1.03] font-bold tracking-[-0.03em] text-balance sm:text-5xl lg:text-6xl">
              {l.headline}
            </h1>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                to="/quickstart"
                className="bg-text px-5 py-3 font-mono text-xs tracking-[.08em] text-bg uppercase"
              >
                {l.quickstart} →
              </Link>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="border border-strong px-5 py-3 font-mono text-xs tracking-[.08em] uppercase transition-colors hover:bg-wash"
              >
                {l.source} ↗
              </a>
            </div>
          </div>

          {/* Desktop only: on a phone this would push the first sentence of the
              documentation another screen down, which is what the band already costs. */}
          <img
            src="/picture/logo-lockup-480.png"
            alt=""
            width={240}
            height={240}
            className="hidden h-60 w-60 shrink-0 lg:block"
          />
        </div>

        <dl className="mt-14 grid gap-px border border-line bg-line sm:grid-cols-3">
          {l.stats.map((s) => (
            <div key={s.label} className="bg-bg px-5 py-6">
              <dt className="eyebrow text-soft">{s.label}</dt>
              <dd className="font-display mt-2 text-3xl font-bold tracking-[-0.02em]">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
