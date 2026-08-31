import { useLang } from '../i18n/lang';
import { LANGS, type Lang } from '../i18n/types';

const names: Record<Lang, string> = { vi: 'VI', en: 'EN' };

export function LangToggle({ label }: { label: string }) {
  const { lang, setLang } = useLang();

  return (
    <div className="flex border border-line" role="group" aria-label={label}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={l === lang}
          className={`px-2 py-1 font-mono text-xs ${
            l === lang ? 'bg-text text-bg' : 'text-soft hover:text-text'
          }`}
        >
          {names[l]}
        </button>
      ))}
    </div>
  );
}
