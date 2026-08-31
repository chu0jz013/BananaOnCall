import { useEffect } from 'react';
import { BrowserRouter, Link, useLocation } from 'react-router';
import { Layout } from './components/Layout';
import { DocPageView } from './components/DocPageView';
import { routes } from './content';
import { EnvProvider } from './env';
import { LangProvider, useLang } from './i18n/lang';
import { ui } from './i18n/ui';

/** `/reference/` and `/reference` are the same page. */
function normalize(pathname: string): string {
  return pathname !== '/' && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

/** A deep link lands mid-document otherwise, because the shell never unmounts. */
function useScrollReset(pathname: string) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
}

function NotFound() {
  const { lang } = useLang();
  const t = ui[lang];
  return (
    <div className="py-10">
      <h1 className="font-display text-4xl font-bold tracking-[-0.02em]">{t.notFound}</h1>
      <p className="mt-4 text-soft">{t.notFoundBody}</p>
      <Link
        to="/"
        className="mt-6 inline-block underline decoration-banana decoration-2 underline-offset-2"
      >
        {t.backToOverview}
      </Link>
    </div>
  );
}

/**
 * Routing is a flat static table, so it is resolved directly rather than
 * through <Routes> — which also lets the Layout render the page's hero
 * full-bleed above the sidebar, where the wireframe puts it.
 */
function Shell() {
  const { pathname } = useLocation();
  const { lang } = useLang();
  useScrollReset(pathname);

  const route = routes.find((r) => r.path === normalize(pathname));
  const page = route?.content[lang];

  return (
    <Layout hero={page?.hero}>
      {page ? <DocPageView page={page} tocLabel={ui[lang].onThisPage} /> : <NotFound />}
    </Layout>
  );
}

export function App() {
  return (
    <LangProvider>
      <EnvProvider>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </EnvProvider>
    </LangProvider>
  );
}
