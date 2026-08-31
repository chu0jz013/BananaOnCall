import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Sidebar } from './Sidebar';
import { LangToggle } from './LangToggle';
import { ThemeToggle } from './ThemeToggle';
import { useLang } from '../i18n/lang';
import { ui } from '../i18n/ui';

export function Layout({ children, hero }: { children: ReactNode; hero?: ReactNode }) {
  const { lang } = useLang();
  const t = ui[lang];
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-6 py-3 lg:px-10">
          <Link to="/" className="font-display text-lg font-bold tracking-[-0.01em]">
            Banana<span className="text-banana">OnCall</span>
          </Link>
          <span className="eyebrow hidden text-soft md:block">{t.tagline}</span>

          <div className="ml-auto flex items-center gap-2">
            <LangToggle label={t.language} />
            <ThemeToggle toLight={t.toLight} toDark={t.toDark} />
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? t.closeMenu : t.menu}
              className="border border-line px-2 py-1 font-mono text-xs text-soft lg:hidden"
            >
              ☰
            </button>
          </div>
        </div>

        {open && (
          <div className="border-t border-line px-6 py-5 lg:hidden">
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        )}
      </header>

      {hero}

      <div className="mx-auto flex max-w-[1400px] gap-12 px-6 lg:px-10">
        <div className="hidden w-56 shrink-0 py-14 lg:block">
          <div className="sticky top-24">
            <Sidebar />
          </div>
        </div>

        <main className="min-w-0 flex-1 py-14">{children}</main>
      </div>

      <footer className="mt-16 border-t border-line">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-baseline gap-x-8 gap-y-2 px-6 py-8 lg:px-10">
          <span className="font-display text-base font-bold">BananaOnCall</span>
          <span className="font-mono text-xs text-soft">{t.editedFrom}</span>
          <span className="ml-auto font-mono text-xs text-soft">Apache-2.0</span>
        </div>
      </footer>
    </div>
  );
}
