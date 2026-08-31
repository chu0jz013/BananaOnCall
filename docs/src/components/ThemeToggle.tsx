import { useState } from 'react';
import { applyTheme, initTheme, type Theme } from '../theme';

export function ThemeToggle({ toLight, toDark }: { toLight: string; toDark: string }) {
  const [theme, setTheme] = useState<Theme>(() => initTheme());
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? toDark : toLight;

  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      aria-label={label}
      title={label}
      className="border border-line px-2 py-1 font-mono text-xs text-soft hover:text-text"
    >
      {theme === 'dark' ? '◐' : '◑'}
    </button>
  );
}
