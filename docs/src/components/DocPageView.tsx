import type { DocPage } from '../i18n/types';
import { Toc } from './Toc';

interface Props {
  readonly page: DocPage;
  readonly tocLabel: string;
}

export function DocPageView({ page, tocLabel }: Props) {
  return (
    <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_13rem]">
      <article className="min-w-0">
        <h1 className="font-display text-4xl leading-[1.05] font-bold tracking-[-0.02em] sm:text-5xl">
          {page.title}
        </h1>
        <p className="mt-5 max-w-2xl text-[1.0625rem] leading-relaxed text-soft">{page.lede}</p>

        {page.sections.map((s) => (
          <section key={s.id} id={s.id} className="mt-14 scroll-mt-24">
            <h2 className="font-display mb-4 border-b border-line pb-2 text-2xl font-bold tracking-[-0.01em]">
              {s.heading}
            </h2>
            <div className="space-y-4 leading-relaxed [&_code]:font-mono [&_code]:text-[.8125rem]">
              {s.body}
            </div>
          </section>
        ))}
      </article>

      <aside className="hidden xl:block">
        <Toc label={tocLabel} sections={page.sections} />
      </aside>
    </div>
  );
}
