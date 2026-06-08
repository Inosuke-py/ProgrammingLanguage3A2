/**
 * Avatar
 * ────────
 * Renders a user's avatar with a graceful fallback when the image
 * URL is missing or fails to load. Centralizes a pattern that was
 * previously duplicated in 5+ places (Navbar, AdminUsers, AdminOverview,
 * AdminActivity, AdminLayout).
 *
 * Why this matters:
 *   - Google profile photos sometimes fail to load due to CORS, ORB,
 *     COEP, or rate-limit issues. A bare `<img src=...>` shows the
 *     browser's broken-image icon, which looks terrible.
 *   - Guest users have no avatar at all (avatar_url = null).
 *
 * Behavior:
 *   - If `src` is null/empty, renders the fallback (icon or initial).
 *   - If `src` is set, renders <img>. On error, swaps to the fallback.
 *   - When both fail, the fallback is what the user sees.
 *
 * Props:
 *   - src           string|null   — image URL, may be null
 *   - name          string        — display name (used to derive an initial)
 *   - size          number        — pixel diameter, default 32
 *   - className     string        — applied to wrapper for layout
 *   - icon          ReactNode     — icon JSX shown when there's no name AND no src
 */

import { useState, useEffect } from 'react';

export default function Avatar({ src, name, size = 32, className = '', icon = null }) {
  const [errored, setErrored] = useState(false);

  // If src changes (e.g. user updates their photo), reset the errored
  // flag so we attempt to load the new URL.
  useEffect(() => { setErrored(false); }, [src]);

  const showImg = src && !errored;
  const initial = (name || '').trim().charAt(0).toUpperCase() || '?';

  return (
    <span
      className={`avatar ${className}`}
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {showImg ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setErrored(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : icon || (
        <span
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.max(11, Math.round(size * 0.42)),
            fontWeight: 600,
            color: 'var(--color-accent)',
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
          }}
        >
          {initial}
        </span>
      )}
    </span>
  );
}
