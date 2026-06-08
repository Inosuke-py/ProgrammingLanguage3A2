import { useEffect, useState } from 'react';
import useThemeStore from '../../store/useThemeStore';

/**
 * Read a CSS custom property from <html> at runtime.
 * Returns the trimmed value (or '' if undefined).
 */
function readVar(name) {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Build a chart-theme object from the live CSS variables.
 * Re-evaluated whenever the theme store changes.
 */
function buildTheme() {
  return {
    passFrom: readVar('--chart-pass-from') || '#c9a227',
    passTo: readVar('--chart-pass-to') || '#e8d48b',
    failFrom: readVar('--chart-fail-from') || '#b91c1c',
    failTo: readVar('--chart-fail-to') || '#ef4444',
    axis: readVar('--chart-axis') || 'hsl(220 10% 50%)',
    tooltipBg: readVar('--chart-tooltip-bg') || 'hsl(230 20% 10%)',
    tooltipBorder: readVar('--chart-tooltip-border') || 'hsl(230 15% 20%)',
    lineStroke: readVar('--chart-line-stroke') || '#c9a227',
    dotFill: readVar('--chart-dot-fill') || '#c9a227',
    dotStroke: readVar('--chart-dot-stroke') || '#1a1a1a',
  };
}

/**
 * Hook — returns the current chart theme palette and re-renders when
 * the theme store flips (so charts reactively re-color on toggle).
 */
export function useChartTheme() {
  const theme = useThemeStore((s) => s.theme);
  const [palette, setPalette] = useState(() => buildTheme());

  useEffect(() => {
    // Wait one frame so the [data-theme] attribute change has propagated.
    const id = requestAnimationFrame(() => setPalette(buildTheme()));
    return () => cancelAnimationFrame(id);
  }, [theme]);

  return palette;
}

/**
 * Convenience: tooltip style object for Recharts <Tooltip contentStyle={...}>.
 */
export function getTooltipStyle(palette) {
  return {
    background: palette.tooltipBg,
    border: `1px solid ${palette.tooltipBorder}`,
    borderRadius: 8,
    fontSize: 12,
    color: 'inherit',
  };
}
