import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, tokenStore, refreshAccessToken } from '../lib/api';
import { toastError } from '../lib/toast';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.getMe();
      setUser(data);
      return data;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch {}
    tokenStore.clear();
    setUser(null);
  }, []);

  // G-79: root cause of "refresh logs people out" — the old code called
  // getMe() directly on mount with whatever was in tokenStore. Since G-80
  // moved the access token to in-memory-only, a hard page reload ALWAYS
  // starts with token=null, so getMe() would 401 immediately and bounce the
  // user to logged-out — even though a valid 30-day refresh cookie exists.
  // Fix: try getMe() first (covers the SPA-navigation case where we still
  // have a token in memory), and if that fails, try refreshing via the
  // httpOnly cookie once before giving up and showing logged-out state.
  const loadUser = useCallback(async () => {
    const direct = await refreshUser();
    if (direct) return direct;

    try {
      await refreshAccessToken();
    } catch {
      // G-84: refresh cookie missing/expired/revoked — this is a normal,
      // expected "not logged in" state on first visit, not an error to
      // surface. Just fall through to logged-out.
      return null;
    }
    return refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    loadUser().finally(() => setLoading(false));

    // Proactive top-up when the user returns to the tab. Now routed through
    // the SAME refreshAccessToken() helper used by loadUser() (mount) and
    // the request() 401-interceptor in lib/api.js (G-83), so there is one
    // single source of truth for "how do we get a new access token" instead
    // of three implementations that could silently drift apart.
    const onVisible = async () => {
      const token = tokenStore.get();
      if (!token) return;
      try {
        const { exp } = JSON.parse(atob(token.split('.')[1]));
        // Refresh if less than 5 minutes remaining
        if (Date.now() / 1000 > exp - 300) {
          await refreshAccessToken();
          await refreshUser();
        }
      } catch {
        // G-84: refresh failed here too — give a clear signal rather than a
        // silent redirect, so a volunteer mid-call never wonders whether
        // their last few taps actually saved.
        toastError("Your session ended — please log back in.");
        tokenStore.clear();
        setUser(null);
      }
    };

    const onFocus       = () => onVisible();
    const onVisibility  = () => { if (document.visibilityState === 'visible') onVisible(); };
    const handleLogout  = () => {
      // The request() interceptor already tried a refresh-and-retry before
      // giving up and dispatching this event — if we're hearing it, the
      // session is genuinely over. Let the user know why, don't just vanish.
      toastError("Your session ended — please log back in.");
      setUser(null);
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('reach:logout', handleLogout);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('reach:logout', handleLogout);
    };
  }, [loadUser, refreshUser]);

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
