import { NavLink } from 'react-router';
import { routes } from '../content';
import { useLang } from '../i18n/lang';
import { ui } from '../i18n/ui';
import { DESIGN_DOC_URL, FEEDBACK_URL, REPO_URL } from '../links';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { lang } = useLang();
  const t = ui[lang];

  return (
    <nav aria-label={t.contents}>
      <div className="eyebrow mb-4 text-soft">{t.contents}</div>
      <ul className="space-y-px">
        {routes.map((r) => (
          <li key={r.path}>
            <NavLink
              to={r.path}
              end={r.path === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                `block border-l-2 py-[6px] pl-3 text-sm transition-colors ${
                  isActive
                    ? 'border-banana font-medium text-text'
                    : 'border-transparent text-soft hover:text-text'
                }`
              }
            >
              {r.content[lang].title}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="mt-6 space-y-2 border-t border-line pt-6 text-sm">
        <a
          href={DESIGN_DOC_URL}
          className="block text-soft transition-colors hover:text-text"
        >
          {t.archivedDoc} ↗
        </a>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="block text-soft transition-colors hover:text-text"
        >
          {t.repo} ↗
        </a>
      </div>

      <div className="mt-6 border-t border-line pt-6">
        <p className="mb-2 text-[.8125rem] leading-relaxed text-soft">{t.feedbackNote}</p>
        <a
          href={FEEDBACK_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-block border border-strong px-3 py-2 font-mono text-[.6875rem] tracking-[.08em] uppercase transition-colors hover:bg-wash"
        >
          {t.feedback} ↗
        </a>
      </div>
    </nav>
  );
}
