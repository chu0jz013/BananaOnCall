/**
 * Theme handling.
 *
 * Default is the reader's system preference; the toggle only exists to override
 * it, and the choice is remembered per browser. Applied to <html> before React
 * mounts so there is no flash of the wrong palette.
 */
export type Theme = 'light' | 'dark';

const KEY = 'bananaoncall.theme';

export function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    // Private windows and blocked site data throw rather than returning null.
    return null;
  }
}

export function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Not being able to remember it is not a reason to fail to apply it.
  }
}

/** Call before the first render. */
export function initTheme(): Theme {
  const theme = storedTheme() ?? systemTheme();
  document.documentElement.dataset.theme = theme;
  return theme;
}
