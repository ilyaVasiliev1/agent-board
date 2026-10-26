import { useEffect } from 'react';
import type { Theme } from '@/lib/prefs';

/** Применяет тему к странице: «как в системе» следует за настройкой macOS и меняется на лету. */
export function useTheme(theme: Theme): void {
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'auto' && query.matches));
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [theme]);
}
