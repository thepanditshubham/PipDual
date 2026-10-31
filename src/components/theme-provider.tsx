'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'dark' | 'light' | 'system';

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: 'dark' | 'light';
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  resolvedTheme: 'light',
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Light is the product default; dark is opt-in from Settings.
  const [theme, setThemeState] = useState<Theme>('light');
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>('light');

  useEffect(() => {
    const stored = localStorage.getItem('pip-duel-theme') as Theme | null;
    if (stored) {
      // The saved preference is an external store; reading it after mount keeps
      // the server and client markup identical.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThemeState(stored);
    }
  }, []);

  useEffect(() => {
    const resolve = () => {
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        return prefersDark ? 'dark' : 'light';
      }
      return theme;
    };

    const resolved = resolve();
    // Mirror the resolved theme into React and onto the document. This is the
    // sync point with the browser (localStorage + media query), not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResolvedTheme(resolved);
    document.documentElement.setAttribute('data-theme', resolved);

    // Listen for system changes
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') {
        const r = mq.matches ? 'dark' : 'light';
        setResolvedTheme(r);
        document.documentElement.setAttribute('data-theme', r);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem('pip-duel-theme', t);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
