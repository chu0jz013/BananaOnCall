import { useEffect } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router';
import { Layout } from './components/Layout';
import { DocPageView } from './components/DocPageView';
import { routes } from './content';
import { LangProvider, useLang } from './i18n/lang';
import { ui } from './i18n/ui';
import type { DocPage, Translated } from './i18n/types';

/** A deep link lands mid-document otherwise, because the shell never unmounts. */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function Page({ content }: { content: Translated<DocPage> }) {
  const { lang } = useLang();
  return <DocPageView page={content[lang]} tocLabel={ui[lang].onThisPage} />;
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

export function App() {
  return (
    <LangProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Layout>
          <Routes>
            {routes.map((r) => (
              <Route key={r.path} path={r.path} element={<Page content={r.content} />} />
            ))}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </LangProvider>
  );
}
