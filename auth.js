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

  return { getToken, getSession, getCurrentUserId, requireAuth, logout };

})();