import { useEffect, useState } from 'react';
import type { DocSection } from '../i18n/types';

interface Props {
  readonly label: string;
  readonly sections: readonly DocSection[];
}

/**
 * On-page contents with scroll spy.
 *
 * The observer is re-created whenever the section list changes, which includes
 * a language switch — the ids are stable across languages, so the highlight
 * survives it.
 */
export function Toc({ label, sections }: Props) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? '');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );

    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label={label}>
      <div className="eyebrow mb-3 text-soft">{label}</div>
      <ul className="space-y-1">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={`block border-l-2 py-1 pl-3 text-sm transition-colors ${
                active === s.id
                  ? 'border-banana text-text'
                  : 'border-transparent text-soft hover:text-text'
              }`}
            >
              {s.heading}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
