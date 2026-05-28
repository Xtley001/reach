import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, tokenStore } from '../lib/api';

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

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));

    // P1-3.2: Silently refresh access token when user returns to tab
    // Prevents mid-session logout when token expires in background.
    const onVisible = async () => {
      const token = tokenStore.get();
      if (!token) return;
      try {
        const { exp } = JSON.parse(atob(token.split('.')[1]));
        // Refresh if less than 5 minutes remaining
        if (Date.now() / 1000 > exp - 300) {
          await api.refresh();
          await refreshUser();
        }
      } catch {
        // Refresh failed — log out cleanly rather than hitting 401 on next action
        logout();
      }
    };

    const onFocus       = () => onVisible();
    const onVisibility  = () => { if (document.visibilityState === 'visible') onVisible(); };
    const handleLogout  = () => setUser(null);

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('reach:logout', handleLogout);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('reach:logout', handleLogout);
    };
  }, [refreshUser, logout]);

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
