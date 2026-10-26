export type Theme = 'auto' | 'light' | 'dark';
export interface Prefs { model?: string; effort?: string; theme?: Theme; project?: string }

const KEY = 'board.prefs';

export function readPrefs(): Prefs {
  try { return (JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}) as Prefs; } catch { return {}; }
}

export function writePrefs(prefs: Prefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* приватный режим: работаем без памяти */ }
}
