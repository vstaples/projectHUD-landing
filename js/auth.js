// ============================================================
// ProjectHUD — auth.js
// Session management — token access, refresh, and logout
// ============================================================

const Auth = (() => {

  // ── Get raw access token from localStorage ────────────────
  function getToken() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
          const s = localStorage.getItem(k);
          const p = JSON.parse(s);
          if (p && p.access_token) return p.access_token;
        }
      }
      return PHUD.SUPABASE_KEY;
    } catch(e) {}
    return PHUD.SUPABASE_KEY;
  }

  // ── Get session object ────────────────────────────────────
  function getSession() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
          const s = localStorage.getItem(k);
          const p = JSON.parse(s);
          if (p && p.access_token) return p;
        }
      }
    } catch(e) {}
    return null;
  }

  // ── Get current user ID from JWT payload ─────────────────
  function getCurrentUserId() {
    try {
      const token = getToken();
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.sub || null;
    } catch(e) {}
    return null;
  }

  // ── Redirect to login if not authenticated ───────────────
  function requireAuth() {
    if (!getToken()) {
      window.location.href = '/login.html';
    }
  }

  // ── Logout — clear session and redirect ──────────────────
  function logout() {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('sb-') || k === PHUD.SESSION_KEY)) {
        localStorage.removeItem(k);
      }
    }
    window.location.href = '/login.html';
  }

  // ── getFreshToken ─────────────────────────────────────────
  // Returns a valid access token, auto-refreshing if expired.
  // Use for Supabase Storage API calls that require a valid JWT.
  async function getFreshToken() {
    try {
      // Find session key dynamically
      const STORAGE_KEY = (() => {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) return k;
        }
        return null;
      })();

      if (!STORAGE_KEY) return getToken();

      const raw     = localStorage.getItem(STORAGE_KEY);
      const session = raw ? JSON.parse(raw) : null;

      // Token still valid with 30s buffer — return it
      if (session?.access_token && session.expires_at > (Date.now() / 1000) + 30) {
        return session.access_token;
      }

      // Expired — use refresh_token
      if (!session?.refresh_token) return getToken();

      const SUPABASE_URL      = 'https://dvbetgdzksatcgdfftbs.supabase.co';
      const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2YmV0Z2R6a3NhdGNnZGZmdGJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDc2MTYsImV4cCI6MjA4OTEyMzYxNn0.1geeKhrLL3nhjW08ieKr7YZmE0AVX4xnom7i2j1W358';

      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body:    JSON.stringify({ refresh_token: session.refresh_token }),
      });

      if (!res.ok) {
        console.warn('[Auth] token refresh failed:', res.status);
        return getToken();
      }

      const n = await res.json();
      // Update localStorage with refreshed session
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        access_token:  n.access_token,
        refresh_token: n.refresh_token,
        expires_at:    Math.floor(Date.now() / 1000) + (n.expires_in || 3600),
        token_type:    n.token_type,
        user:          n.user,
      }));
      return n.access_token;

    } catch(e) {
      console.warn('[Auth] getFreshToken error:', e.message);
      return getToken();
    }
  }

  // ── ensureFirmId ──────────────────────────────────────────
  // CMD-AEGIS-1: populate window.PHUD.FIRM_ID from the
  // authenticated user's users-table row. Cached in localStorage
  // under phud:firm_id:{user_id} so subsequent loads are sync.
  // Resolves to the firm_id string, or null if no auth / no firm
  // could be established. Never throws.
  //
  // The fast (cached) path completes synchronously at module-load
  // for warm sessions; the cold path is a single REST round-trip.
  async function ensureFirmId() {
    try {
      if (typeof window === 'undefined' || !window.PHUD) return null;

      // Already populated by a previous call in this tab.
      if (window.PHUD.FIRM_ID) return window.PHUD.FIRM_ID;

      const sub = getCurrentUserId();
      if (!sub) return null;

      // Cache hit.
      const cacheKey = 'phud:firm_id:' + sub;
      const cached   = localStorage.getItem(cacheKey);
      if (cached && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cached)) {
        window.PHUD.FIRM_ID = cached;
        return cached;
      }

      // Cache miss — fetch from users table. We do not use api.js here
      // because auth.js loads before api.js per the standard loader order.
      const token  = await getFreshToken();
      const url    = `${PHUD.SUPABASE_URL}/rest/v1/users?id=eq.${sub}&select=firm_id`;
      const res    = await fetch(url, {
        headers: {
          apikey:        PHUD.SUPABASE_KEY,
          Authorization: 'Bearer ' + token,
          Accept:        'application/json',
        },
      });
      if (!res.ok) {
        console.warn('[Auth] ensureFirmId: users lookup failed:', res.status);
        return null;
      }
      const rows = await res.json();
      const firmId = rows && rows[0] && rows[0].firm_id;
      if (!firmId) {
        console.warn('[Auth] ensureFirmId: no firm_id for user', sub.slice(0, 8) + '...');
        return null;
      }
      window.PHUD.FIRM_ID = firmId;
      try { localStorage.setItem(cacheKey, firmId); } catch (e) { /* quota — non-fatal */ }
      return firmId;
    } catch (e) {
      console.warn('[Auth] ensureFirmId error:', e && e.message);
      return null;
    }
  }

  // CMD-AEGIS-1: kick off firm_id population immediately at module load.
  // cmd-center.js awaits window._phudFirmIdReady inside _init() before
  // declaring its channel name. The fast (cache) path resolves before
  // the next microtask; the cold path resolves before DOMContentLoaded.
  if (typeof window !== 'undefined') {
    window._phudFirmIdReady = ensureFirmId();
  }

  return { getToken, getSession, getCurrentUserId, requireAuth, logout, getFreshToken, ensureFirmId };

})();