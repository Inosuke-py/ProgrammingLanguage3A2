import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * On every route change, scroll the window to the top.
 *
 * react-router-dom does NOT do this by default — it preserves the scroll
 * position from the previous page, which is jarring when you navigate from a
 * footer link (you land halfway down the new page).
 *
 * Mount this once inside <BrowserRouter> and it handles every route change.
 *
 * Notes:
 * - Uses `instant` rather than `smooth`. Smooth scrolling on route change is
 *   visually noisy and confuses users into thinking the page is still loading.
 * - Respects the `#hash` case: if the URL has a hash, we leave it alone so
 *   anchor navigation (`/about#contact`) still jumps to the right element.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return; // let anchor links scroll naturally
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, hash]);

  return null;
}
