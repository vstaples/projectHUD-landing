// js/version.js · ProjectHUD deployment version source of truth.
// This file is the ONLY place in the codebase that declares the
// current version literal. All loaders, banners, and cache-bust
// query strings derive from window._PROJECTHUD_VERSION.
//
// To bump the version: change the literal below. Every loader
// and every internal banner picks up the change automatically
// on next deploy.
window._PROJECTHUD_VERSION = "v20260429-CMD100.43";

// CMD100 migration — Compass My Work sub-view vocabulary collapse.
// Legacy tab-keys 'timesheet' and 'concerns' rewritten to canonical
// Tier 2 vocabulary 'time' and 'notes'. Runs before any compass.html
// inline read of compass-user-tab (script load order: this file at
// compass.html:887, first read at compass.html:1044).
// Idempotent + silent. Safe to retire after CMD110 (≈3 month window).
(function _cmd100Migrate() {
  try {
    var LEGACY = { 'timesheet': 'time', 'concerns': 'notes' };

    // 1. compass-user-tab — single string value
    var cur = localStorage.getItem('compass-user-tab');
    if (cur && LEGACY[cur]) {
      localStorage.setItem('compass-user-tab', LEGACY[cur]);
    }

    // 2. hud-tier2-state — JSON map { tier1Id: tier2Id }
    var raw = localStorage.getItem('hud-tier2-state');
    if (raw) {
      var map = JSON.parse(raw);
      var dirty = false;
      for (var k in map) {
        if (map.hasOwnProperty(k) && LEGACY[map[k]]) {
          map[k] = LEGACY[map[k]];
          dirty = true;
        }
      }
      if (dirty) localStorage.setItem('hud-tier2-state', JSON.stringify(map));
    }
  } catch (e) { /* silent — migration is best-effort */ }
})();