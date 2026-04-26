// ============================================================
// ProjectHUD — sidebar.js (CMD94 shim)
// All logic moved to /js/hud-shell.js. This file remains as a
// backward-compatibility loader for any uncatalogued HTML still
// pointing at /js/sidebar.js — it loads hud-shell.js, which
// installs both window.HUDShell and window.Sidebar.
// Safe to delete once every loader has been migrated.
// ============================================================
(function() {
  if (window.HUDShell || window.__HUD_SHELL_LOADING) return;
  window.__HUD_SHELL_LOADING = true;
  var v = window._PROJECTHUD_VERSION || '';
  var s = document.createElement('script');
  s.src = '/js/hud-shell.js' + (v ? ('?v=' + v) : '');
  s.async = false;
  document.head.appendChild(s);
})();
