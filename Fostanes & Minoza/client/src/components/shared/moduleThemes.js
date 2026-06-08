/**
 * Module Viewer Theme Registry
 * --------------------------------------------------------------
 * Each entry describes a visual treatment that can be applied to the
 * reader's CHROME (frame, toolbar, arrows, decorations, page-turn
 * animation). The PDF content itself is never themed — we only paint
 * the surrounding canvas. Switching themes is instant and reversible.
 *
 * To add a new theme:
 *   1. Add an entry here with a unique `id`.
 *   2. Write a `[data-module-theme="<id>"] ...` block in ModuleViewer.css.
 *   3. The picker UI shows it automatically.
 */

export const MODULE_THEMES = [
  {
    id: 'none',
    label: 'Default',
    description: 'The original Lexara reader — clean obsidian frame.',
    accent: 'hsl(42 78% 52%)',
  },
  {
    id: 'novel',
    label: 'Novel',
    description: 'Cream paper, walnut frame, italic serif chrome.',
    accent: 'hsl(35 65% 45%)',
  },
  {
    id: 'scifi',
    label: 'Sci-Fi',
    description: 'Neon HUD on a void. Cyan scan-lines and CRT flicker.',
    accent: 'hsl(190 95% 55%)',
  },
  {
    id: 'kids',
    label: 'Kids',
    description: 'Chunky pastels, bouncing pages, sticker decorations.',
    accent: 'hsl(330 70% 65%)',
  },
  {
    id: 'pixel',
    label: 'Pixel Art',
    description: 'Chunky 8-bit borders, retro fonts, snap page turns.',
    accent: 'hsl(120 70% 55%)',
  },
  {
    id: 'slingshot',
    label: 'Slingshot',
    description: 'Cartoon physics — wood crates, blue sky, flying birds.',
    accent: 'hsl(15 85% 55%)',
  },
];

/** Storage key for per-module theme preference. */
export function themeStorageKey(moduleId) {
  return `lexara-module-theme-${moduleId}`;
}

/** Read the saved theme id for a module. Returns 'none' if nothing saved. */
export function readModuleTheme(moduleId) {
  if (!moduleId) return 'none';
  try {
    const v = localStorage.getItem(themeStorageKey(moduleId));
    if (!v) return 'none';
    return MODULE_THEMES.some((t) => t.id === v) ? v : 'none';
  } catch {
    return 'none';
  }
}

/** Persist the chosen theme. Uses localStorage so it survives reloads. */
export function writeModuleTheme(moduleId, themeId) {
  if (!moduleId) return;
  try {
    if (!themeId || themeId === 'none') {
      localStorage.removeItem(themeStorageKey(moduleId));
    } else {
      localStorage.setItem(themeStorageKey(moduleId), themeId);
    }
  } catch {}
}
