import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from './api';

const AuthContext = createContext(null);
export function useAuth() { return useContext(AuthContext); }

/**
 * Holds the signed-in user (loaded from the server cookie session), the saved-listing ids
 * (so every heart button shows server truth — F-10) and the toast helper.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(0);

  const notify = useCallback((message, tone = 'info') => {
    setToast({ message, tone, key: Date.now() });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const loadSaved = useCallback(async () => {
    try { const d = await api('/saved/ids'); setSavedIds(new Set(d.ids)); } catch { setSavedIds(new Set()); }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const d = await api('/auth/me');
      setUser(d.user);
      loadSaved();
      return d.user;
    } catch {
      setUser(null);
      setSavedIds(new Set());
      return null;
    } finally {
      setReady(true);
    }
  }, [loadSaved]);

  useEffect(() => { refresh(); }, [refresh]);

  // Any 401 from the API means the cookie session is gone: drop authenticated UI immediately.
  const userRef = useRef(null);
  userRef.current = user;
  useEffect(() => {
    const onUnauthorized = e => {
      const path = String(e.detail || '');
      if (path.startsWith('/auth/me') || path.startsWith('/auth/login') || path.startsWith('/auth/register') || path.startsWith('/auth/password/')) return;
      if (userRef.current) notify('Your session has ended. Please log in again.');
      setUser(null);
      setSavedIds(new Set());
    };
    window.addEventListener('sahayog:unauthorized', onUnauthorized);
    return () => window.removeEventListener('sahayog:unauthorized', onUnauthorized);
  }, [notify]);

  const signIn = useCallback(nextUser => {
    setUser(nextUser);
    setReady(true);
    loadSaved();
  }, [loadSaved]);

  // F-07: one logout action that clears the server cookie AND React state.
  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* cookie may already be gone */ }
    setUser(null);
    setSavedIds(new Set());
    notify('You have been logged out.');
  }, [notify]);

  const toggleSave = useCallback(async listingId => {
    if (!user) { notify('Log in to save listings.'); return false; }
    const isSaved = savedIds.has(listingId);
    // optimistic update, rolled back on failure
    setSavedIds(prev => { const s = new Set(prev); isSaved ? s.delete(listingId) : s.add(listingId); return s; });
    try {
      await api(`/saved/${listingId}`, { method: isSaved ? 'DELETE' : 'POST' });
      notify(isSaved ? 'Removed from saved items.' : 'Saved for later.');
      return !isSaved;
    } catch (e) {
      setSavedIds(prev => { const s = new Set(prev); isSaved ? s.add(listingId) : s.delete(listingId); return s; });
      notify(e.message, 'error');
      return isSaved;
    }
  }, [user, savedIds, notify]);

  const value = useMemo(() => ({ user, setUser, ready, refresh, signIn, logout, notify, savedIds, toggleSave }),
    [user, ready, refresh, signIn, logout, notify, savedIds, toggleSave]);

  return <AuthContext.Provider value={value}>
    {children}
    {toast && <div key={toast.key} className={`toast toast-${toast.tone}`} role="status" aria-live="polite">{toast.message}</div>}
  </AuthContext.Provider>;
}

export function FullPageLoader({ label = 'Loading Sahayog…' }) {
  return <div className="page-loader" role="status"><span className="spinner" /> {label}</div>;
}

/** Protects a route: remembers where the user was going and sends them to /login. */
export function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

/** Login / sign-up pages: already signed-in users go straight to the dashboard. */
export function GuestOnly({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <FullPageLoader />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}
