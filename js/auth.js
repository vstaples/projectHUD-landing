// ============================================================
// ProjectHUD — auth.js
// Session management, login redirect, logout
// Depends on: config.js
// ============================================================

const Auth = (() => {

  function getToken() {
    try {
      const s = localStorage.getItem(PHUD.SESSION_KEY);
      if (s) {
        const p = JSON.parse(s);
        if (p?.access_token) return p.access_token;
      }
    } catch(e) {}
    return PHUD.SUPABASE_KEY;
  }

  function getSession() {
    try {
      const s = localStorage.getItem(PHUD.SESSION_KEY);
      return s ? JSON.parse(s) : null;
    } catch(e) { return null; }
  }

  function getCurrentUserId() {
    try {
      const s = localStorage.getItem(PHUD.SESSION_KEY);
      if (!s) return null;
      const p = JSON.parse(s);
      const payload = JSON.parse(atob(p.access_token.split('.')[1]));
      return payload.sub || null;
    } catch(e) { return null; }
  }

  // Redirect to login if no valid session
  function requireAuth() {
    const session = getSession();
    if (!session?.access_token) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  }

  // Logout — clear session and redirect
  function logout() {
    localStorage.removeItem(PHUD.SESSION_KEY);
    window.location.href = '/login.html';
  }

  async function getFreshToken() {
    try {
      const STORAGE_KEY = (() => {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) return k;
        }
        return null;
      })();
      if (!STORAGE_KEY) return getToken();
      const raw = localStorage.getItem(STORAGE_KEY);
      const session = raw ? JSON.parse(raw) : null;
      if (session?.access_token && session.expires_at > (Date.now()/1000) + 30) return session.access_token;
      if (!session?.refresh_token) return getToken();
      const SUPABASE_URL = 'https://dvbetgdzksatcgdfftbs.supabase.co';
      const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2YmV0Z2R6a3NhdGNnZGZmdGJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDc2MTYsImV4cCI6MjA4OTEyMzYxNn0.1geeKhrLL3nhjW08ieKr7YZmE0AVX4xnom7i2j1W358';
      const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      if (!res.ok) return getToken();
      const n = await res.json();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        access_token: n.access_token, refresh_token: n.refresh_token,
        expires_at: Math.floor(Date.now()/1000) + n.expires_in,
        token_type: n.token_type, user: n.user,
      }));
      return n.access_token;
    } catch(e) { return getToken(); }
  }

  return { getToken, getSession, getCurrentUserId, requireAuth, logout, getFreshToken };

})();