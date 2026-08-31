import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Lang } from './types';

const KEY = 'bananaoncall.lang';

function stored(): Lang | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'vi' || v === 'en' ? v : null;
  } catch {
    // Private windows and blocked site data throw rather than returning null.
    return null;
  }
}

/** Vietnamese for a Vietnamese browser, English for everyone else. */
function preferred(): Lang {
  return navigator.language?.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

interface LangValue {
  readonly lang: Lang;
  readonly setLang: (l: Lang) => void;
}

const LangContext = createContext<LangValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => stored() ?? preferred());

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      // Not being able to remember it is no reason to fail to apply it.
    }
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangContext value={value}>{children}</LangContext>;
}

export function useLang(): LangValue {
  const v = useContext(LangContext);
  if (!v) throw new Error('useLang must be used inside <LangProvider>');
  return v;
}
