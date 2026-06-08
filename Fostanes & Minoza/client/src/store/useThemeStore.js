import { create } from 'zustand';

/**
 * Theme store — toggles light / dark by setting `data-theme` on <html>.
 *
 * Behavior (per user spec):
 *   • Default: dark mode for every visitor on first load.
 *   • If the user toggles, we persist their choice in localStorage.
 *   • On subsequent visits, the persisted choice wins.
 *   • No OS preference detection — explicit choice only.
 */

const STORAGE_KEY = 'lexara-theme';

/** Read persisted choice, defaulting to 'dark' if nothing stored. */
function readPersistedTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Apply the theme by toggling the `data-theme` attribute on <html>. */
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    root.removeAttribute('data-theme');
  }
}

/** Apply the theme as early as possible — before React paints. */
const initialTheme = readPersistedTheme();
applyTheme(initialTheme);

const useThemeStore = create((set, get) => ({
  theme: initialTheme,

  /** Set theme explicitly. Persists + applies. */
  setTheme: (theme) => {
    const next = theme === 'light' ? 'light' : 'dark';
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    applyTheme(next);
    set({ theme: next });
  },

  /** Flip dark <-> light. */
  toggle: () => {
    const next = get().theme === 'light' ? 'dark' : 'light';
    get().setTheme(next);
  },
}));

export default useThemeStore;
