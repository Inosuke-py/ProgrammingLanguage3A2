/**
 * useLargeScreen
 * ──────────────
 * Hook that returns whether the viewport is large enough for the
 * Game Mode experience. Game Mode is intentionally desktop/tablet-
 * only — buzzer-style multiplayer with a 3D scene and keyboard input
 * doesn't translate well to phones.
 *
 * Threshold: 1024px wide. Matches our existing tablet+ breakpoint and
 * gives enough room for the lobby grid, online sidebar, and (later)
 * the 3D scene without cramping.
 *
 * Listens to viewport resize and orientation change so a user
 * rotating a tablet from portrait to landscape gets the right gate
 * without a refresh.
 */

import { useEffect, useState } from 'react';

const MIN_WIDTH = 1024;

function isLargeNow() {
  if (typeof window === 'undefined') return true; // SSR-safe default
  return window.innerWidth >= MIN_WIDTH;
}

export default function useLargeScreen() {
  const [isLarge, setIsLarge] = useState(isLargeNow);

  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      // rAF-throttle: resize fires hundreds of times during a drag.
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setIsLarge(isLargeNow());
      });
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return isLarge;
}

export const GAME_MODE_MIN_WIDTH = MIN_WIDTH;
