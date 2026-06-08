import { useEffect } from 'react';

/**
 * Opts the current page out of the global decorative background
 * (grid + gold radials painted via body::before / body::after).
 *
 * Use it on surfaces that already have their own background composition
 * (the public homepage hero) or that need an undistracting canvas
 * (the module PDF reader).
 *
 * The hook flips a `data-bare="true"` attribute on <body> while the
 * page is mounted, and removes it on unmount, so navigating elsewhere
 * restores the global texture immediately.
 */
export default function useBareCanvas() {
  useEffect(() => {
    const prev = document.body.getAttribute('data-bare');
    document.body.setAttribute('data-bare', 'true');
    return () => {
      if (prev === null) document.body.removeAttribute('data-bare');
      else document.body.setAttribute('data-bare', prev);
    };
  }, []);
}
