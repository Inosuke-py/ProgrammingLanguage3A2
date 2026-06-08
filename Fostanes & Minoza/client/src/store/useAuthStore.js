import { create } from 'zustand';
import { auth as authApi } from '../services/api';

const useAuthStore = create((set, get) => ({
  user: null,
  loading: true,
  error: null,

  /**
   * Check current auth state on app load.
   */
  initialize: async () => {
    try {
      const data = await authApi.meSilent();
      if (data?.data?.user) {
        set({ user: data.data.user, loading: false, error: null });
      } else {
        set({ user: null, loading: false, error: null });
      }
    } catch {
      set({ user: null, loading: false, error: null });
    }
  },

  /**
   * Redirect to Google OAuth. If the caller is currently a guest, pass the
   * guest's id so the server can merge their attempts into the new account.
   */
  loginWithGoogle: () => {
    const u = get().user;
    const guestId = u?.role === 'guest' ? u.id : undefined;
    window.location.href = authApi.getGoogleUrl(guestId);
  },

  /**
   * Login as guest.
   */
  loginAsGuest: async (displayName) => {
    try {
      set({ loading: true, error: null });
      const data = await authApi.guest(displayName);
      set({ user: data.data.user, loading: false });
      return true;
    } catch (err) {
      set({ loading: false, error: err.message });
      return false;
    }
  },

  /**
   * Logout and clear state.
   *
   * On shared-device profiles the PWA's PDF cache could otherwise leak the
   * previous user's modules to whoever logs in next. Wipe runtime caches
   * (PDFs, images) on logout. The precache stays — that's just app shell.
   */
  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Continue even if server call fails
    }

    // Best-effort cache cleanup; never block logout on this.
    if (typeof caches !== 'undefined') {
      try {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((n) => n.startsWith('lexara-') || n.includes('pdf') || n.includes('images'))
            .map((n) => caches.delete(n))
        );
      } catch {
        /* ignore — non-critical */
      }
    }

    // Force-close any open Game Mode socket so the next user on this
    // browser doesn't inherit our connection. Lazy import to avoid
    // bundling the socket helper into the auth path on first paint.
    try {
      const mod = await import('../services/gameSocket.js');
      mod.gameSocket?.forceDisconnect?.();
    } catch { /* socket helper not loaded yet — nothing to close */ }

    set({ user: null, error: null });
  },

  /**
   * Check if user is authenticated.
   */
  get isAuthenticated() {
    return get().user !== null;
  },

  /**
   * Check if user has a specific role.
   */
  hasRole: (role) => {
    return get().user?.role === role;
  },
}));

export default useAuthStore;
