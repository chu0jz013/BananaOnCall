import { NavLink } from 'react-router';
import { routes } from '../content';
import { useLang } from '../i18n/lang';
import { ui } from '../i18n/ui';

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
          href="/design-doc-v0.1.html"
          className="block text-soft transition-colors hover:text-text"
        >
          {t.archivedDoc} ↗
        </a>
        <a
          href="https://github.com/chu0jz013/BananaOnCall"
          target="_blank"
          rel="noreferrer"
          className="block text-soft transition-colors hover:text-text"
        >
          {t.repo} ↗
        </a>
      </div>
    </nav>
  );
}
