/**
 * Game Mode socket helper.
 * ─────────────────────────
 * Lazy, singleton, lifecycle-aware Socket.IO connection.
 *
 * Usage:
 *   import { gameSocket } from '../services/gameSocket';
 *
 *   useEffect(() => {
 *     const s = gameSocket.connect();
 *     const off = gameSocket.on('lobby:state', (payload) => { ... });
 *     return () => { off(); };
 *   }, []);
 *
 *   gameSocket.emit('lobby:invite', { lobbyId, targetUserId });
 *   gameSocket.disconnect();   // when leaving Game Mode entirely
 *
 * Why a wrapper:
 *   - The same Socket.IO connection is shared across pages
 *     (lobby browser → lobby room → play screen). Re-creating it
 *     per page would cause flicker and lose presence.
 *   - Auto-reconnect is built into socket.io-client; the wrapper
 *     just exposes the few methods our components need.
 *   - Auth is implicit via the access_token cookie on the same
 *     origin. In dev, vite proxies /socket.io/ to :3000 so the
 *     cookie travels.
 *   - Refcounted disconnect: pages call connect() on mount and
 *     disconnect() on unmount. Last unmount truly closes the
 *     socket; intermediate unmounts just decrement.
 */

import { io as createSocket } from 'socket.io-client';

class GameSocket {
  constructor() {
    this.socket = null;
    this.refCount = 0;
    this.listeners = new Map(); // event → Set<callback>
    this._closeTimer = null;    // debounced close timer (see disconnect)
    this._wantsPresence = false;// pages that need the presence room flag this on
  }

  /** Establish (or reuse) the connection. Returns the Socket.IO socket. */
  connect() {
    this.refCount += 1;
    // Cancel any pending tear-down — a new mount wants the socket alive.
    if (this._closeTimer) {
      clearTimeout(this._closeTimer);
      this._closeTimer = null;
    }
    if (this.socket) return this.socket;

    // In dev: vite proxies /socket.io/ → http://localhost:3000.
    // In prod: same-origin, so empty url is fine.
    // The path matches the server's `path: '/socket.io/'` config.
    this.socket = createSocket({
      path: '/socket.io/',
      withCredentials: true,
      autoConnect: true,
      // Reconnect quickly but back off on repeated failures.
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      // Prefer WebSocket for low latency. Polling is a fallback.
      transports: ['websocket', 'polling'],
    });

    // Re-bind any registered listeners to the new socket so callers
    // who registered before connect() still get events.
    for (const [event, callbacks] of this.listeners.entries()) {
      for (const cb of callbacks) this.socket.on(event, cb);
    }

    if (import.meta.env.DEV) {
      this.socket.on('connect', () => console.log('[gameSocket] connected', this.socket.id));
      this.socket.on('disconnect', (reason) => console.log('[gameSocket] disconnected', reason));
      this.socket.on('connect_error', (err) => console.warn('[gameSocket] connect_error', err.message));
    }

    // Re-establish application-level presence on every reconnect.
    // The server tracks presence by socket.id; a reconnect gives us
    // a fresh socket id, so without this the user goes "phantom online"
    // (server still has the old id in their socketIds Set, and the
    // disconnect for the new id is a no-op against that stale set).
    //
    // We only re-emit if the user is currently expected to be in the
    // presence room — tracked via _wantsPresence which pages set when
    // they call setPresence(true).
    this.socket.on('connect', () => {
      if (this._wantsPresence) {
        this.socket.emit('presence:enter');
      }
    });

    return this.socket;
  }

  /** Mark whether this client should be in the presence room. Pages
   *  that emit 'presence:enter' on mount should also call setPresence(true)
   *  so the wrapper can re-emit it after a reconnect. setPresence(false)
   *  on unmount keeps reconnects from dragging the user back into
   *  presence after they intentionally left. */
  setPresence(wants) {
    this._wantsPresence = !!wants;
  }

  /** Decrement refcount; close the socket only when no one is using it.
   *  Debounced 250ms so a route transition (lobby→play, list→lobby)
   *  doesn't briefly tear the connection down only to immediately
   *  reconnect — that race caused a presence flicker in dev. */
  disconnect() {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0 && this.socket) {
      if (this._closeTimer) clearTimeout(this._closeTimer);
      this._closeTimer = setTimeout(() => {
        this._closeTimer = null;
        // Re-check refcount — a new mount may have bumped it back up.
        if (this.refCount === 0 && this.socket) {
          this.socket.disconnect();
          this.socket = null;
        }
      }, 250);
    }
  }

  /** Force-close (e.g. on logout). Bypasses refcounting. */
  forceDisconnect() {
    this.refCount = 0;
    if (this._closeTimer) {
      clearTimeout(this._closeTimer);
      this._closeTimer = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
  }

  /**
   * Subscribe to an event. Returns an unsubscribe function for use as
   * a useEffect cleanup. Listeners survive reconnects.
   */
  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(callback);
    if (this.socket) this.socket.on(event, callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const set = this.listeners.get(event);
    if (set) set.delete(callback);
    if (this.socket) this.socket.off(event, callback);
  }

  /** Emit an event to the server. No-op if not connected. */
  emit(event, payload) {
    if (this.socket?.connected) this.socket.emit(event, payload);
    else if (this.socket) {
      // Queue once connected. socket.io-client buffers automatically
      // when `volatile` is not set, so this is safe.
      this.socket.emit(event, payload);
    }
  }

  /** Whether the socket is currently connected. */
  isConnected() {
    return !!this.socket?.connected;
  }

  /** Direct access for advanced cases (e.g. one-shot acks). */
  raw() {
    return this.socket;
  }
}

export const gameSocket = new GameSocket();
