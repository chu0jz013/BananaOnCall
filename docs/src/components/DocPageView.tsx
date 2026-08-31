import type { DocPage } from '../i18n/types';
import { Toc } from './Toc';

interface Props {
  readonly page: DocPage;
  readonly tocLabel: string;
}

/** Section number badge — the wireframe numbers every section down the page. */
function Ord({ n }: { n: number }) {
  return (
    <span className="mt-[6px] inline-flex h-5 w-5 shrink-0 items-center justify-center border border-line font-mono text-[.625rem] text-soft">
      {n}
    </span>
  );
}

export function DocPageView({ page, tocLabel }: Props) {
  const article = (
    <article className="min-w-0">
      <h1 className="font-display text-4xl leading-[1.05] font-bold tracking-[-0.02em] sm:text-5xl">
        {page.title}
      </h1>
      <p className="mt-5 max-w-2xl text-[1.0625rem] leading-relaxed text-soft">{page.lede}</p>

      {page.sections.map((s, i) => (
        <section key={s.id} id={s.id} className="mt-14 scroll-mt-24">
          <div className="mb-4 flex items-start gap-3 border-b border-line pb-2">
            {page.sections.length > 1 && <Ord n={i + 1} />}
            <h2 className="font-display text-2xl font-bold tracking-[-0.01em]">{s.heading}</h2>
          </div>
          <div className="space-y-4 leading-relaxed [&_code]:font-mono [&_code]:text-[.8125rem]">
            {s.body}
          </div>
        </section>
      ))}
    </article>
  );

  return (
    <>
      {page.wide ? (
        article
      ) : (
        <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_13rem]">
          {article}
          <aside className="hidden xl:block">
            <div className="sticky top-24 space-y-8">
              <Toc label={tocLabel} sections={page.sections} />
              {page.rail}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
