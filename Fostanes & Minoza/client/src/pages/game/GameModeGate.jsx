/**
 * GameModeGate
 * ────────────
 * Wraps every Game Mode page. The only check now is the server-side
 * feature flag (config probe) — the previous viewport gate has been
 * removed so Game Mode is available on every device class. The CSS
 * layouts in GameLobbyList / GameLobby / GamePlay / GameStats are
 * responsive down to phone widths (the modes grid, lobby slots,
 * avatar tiles, and online sidebar all collapse cleanly).
 *
 * If the feature is server-disabled (GAME_MODE_ENABLED=false), we
 * render a friendly "taking a nap" panel so the user knows why nothing
 * works rather than seeing a half-broken page.
 */

import { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { Link } from 'react-router-dom';
import { game as gameApi } from '../../services/api';

export default function GameModeGate({ children }) {
  const [enabled, setEnabled] = useState(null);

  useEffect(() => {
    let alive = true;
    gameApi.status()
      .then((r) => { if (alive) setEnabled(r?.data?.enabled !== false); })
      .catch(() => { if (alive) setEnabled(false); });
    return () => { alive = false; };
  }, []);

  if (enabled === null) {
    return <div style={blockStyle}><div className="skeleton" style={{ width: 200, height: 4, borderRadius: 999 }} /></div>;
  }
  if (enabled === false) {
    return (
      <div style={blockStyle}>
        <Lightbulb size={42} strokeWidth={1.4} />
        <h1>Game Mode is taking a nap</h1>
        <p>The feature is currently disabled. Check back soon.</p>
        <Link to="/dashboard" className="btn btn--primary">Back to Dashboard</Link>
      </div>
    );
  }
  return children;
}

const blockStyle = {
  minHeight: '70vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '32px',
  gap: '14px',
  maxWidth: 560,
  margin: '0 auto',
};
