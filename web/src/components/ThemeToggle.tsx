import { useState } from 'react';
import { applyTheme, initTheme, type Theme } from '../theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => initTheme());

  const flip = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      className="toggle"
      onClick={flip}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  );
}
