// ════════════════════════════════════════════════════════════════════════════
// cmd-center.js · ProjectHUD operator console (version from window._PROJECTHUD_VERSION)
// ProjectHUD Script Runner — multi-client orchestrator
//
// Architecture:
//   - Each browser session loads this file and connects to Supabase Realtime
//   - Sessions publish presence (who, where, what tab)
//   - Runner panel dispatches commands to target sessions via Realtime
//   - Target sessions execute commands and publish results back
//   - Scripts are stored in localStorage under 'phud:scripts:{name}'
//
// Realtime channels:
//   phud:presence    — heartbeat presence (all sessions)
//   phud:cmd:{uid}   — commands addressed to a specific user
//   phud:result      — results/events published by any session
//
// Usage (bookmarklet or script tag):
//   <script src="/js/cmd-center.js"></script>
// ════════════════════════════════════════════════════════════════════════════

(function() {
'use strict';
if (window._cmdCenterLoaded) return;
window._cmdCenterLoaded = true;

// B1 (CMD54): flip to false before production release once policy consumers
// are quiet. When true, both emit and receive paths log one line per event.
var DEBUG_EVENTS = true;

// CMD62: off by default. When true, adds per-channel source tagging to
// dedup-dropped app_event logs for cutover diagnosis. Leave false in
// normal operation; flip true briefly during the B1.5 → B1.6 window
// if a double-fire is suspected. See Brief B1.5 §7.
var DEBUG_CHANNEL_SOURCE = false;

// Version banner — fires on every page load/refresh so you can confirm what's running
// CMD100.21: _safeSendOn now routes via httpSend() when channel not joined, silencing the Realtime fallback deprecation warning.
(function() {
  var V = (typeof window._PROJECTHUD_VERSION === 'string' && window._PROJECTHUD_VERSION) || '—';
  var versions = {
    'cmd-center':  V,
    'mw-core':     typeof window._mwCoreVersion !== 'undefined' ? window._mwCoreVersion : '—',
    'mw-tabs':     typeof window._mwTabsVersion !== 'undefined' ? window._mwTabsVersion : '—',
    'mw-events':   typeof window._mwEventsVersion !== 'undefined' ? window._mwEventsVersion : '—',
    'mw-team':     typeof window._mwTeamVersion !== 'undefined' ? window._mwTeamVersion : '—',
  };
  if (window._aegisMode) {
  console.group('%c AEGIS v20260416-AE1 ','background:#00c9c9;color:#003333;font-weight:700;padding:2px 8px;border-radius:3px');
  console.log('%cM1 Command · M2 Mission Control · M3 Forge','color:#00c9c9');
  console.groupEnd();
}
console.group('%c CMD Center ' + V + ' ', 'background:#00c9c9;color:#003333;font-weight:700;padding:2px 8px;border-radius:3px');
  console.log('%cHotkey: Ctrl+Shift+` to toggle panel', 'color:#00c9c9');
  Object.entries(versions).forEach(function([mod, ver]) {
    console.log('%c' + mod.padEnd(16) + '%c' + ver,
      'color:#EF9F27;font-family:monospace',
      'color:#EF9F27;font-family:monospace;font-weight:700');
  });
  console.groupEnd();
})();

// ── Config ────────────────────────────────────────────────────────────────────
var SUPA_URL = (typeof PHUD !== 'undefined' && PHUD.SUPABASE_URL) ||
               'https://dvbetgdzksatcgdfftbs.supabase.co';
var SUPA_KEY = (typeof PHUD !== 'undefined' && PHUD.SUPABASE_KEY) ||
               'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2YmV0Z2R6a3NhdGNnZGZmdGJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDc2MTYsImV4cCI6MjA4OTEyMzYxNn0.1geeKhrLL3nhjW08ieKr7YZmE0AVX4xnom7i2j1W358';
var FIRM_ID  = (typeof PHUD !== 'undefined' && PHUD.FIRM_ID) || null;
// CMD-AEGIS-1: hardcoded firm A fallback removed. Was previously:
//   var FIRM_ID = (PHUD.FIRM_ID) || 'aaaaaaaa-0001-0001-0001-000000000001';
// That fallback caused every session — regardless of authenticated
// firm — to subscribe to firm A's hud: channel, leaking presence
// across firms (CMD-A3 §10.5). _init() now awaits
// window._phudFirmIdReady (populated by auth.js) and fails fast if
// FIRM_ID still cannot be established. See brief CMD-AEGIS-1 §3.

// ── State ─────────────────────────────────────────────────────────────────────
var _supabase    = null;   // Supabase JS client
var _channel     = null;   // target channel (hud:{firm_id}) — Contract 1 compliant
var _channelLegacy = null; // legacy channel (cmd-center-{firm_id}) — CMD62 dual-subscribe
// CMD62: dual-subscribe readiness. Both flags must be true before _cmdConnected
// flips true and the outbound queue drains. See Brief B1.5 §4.
var _channelReady       = false;
var _channelLegacyReady = false;
var _mySession   = null;   // this browser's session identity
var _myAlias     = null;   // short alias set by operator, e.g. "VS" or "AK" — persisted in localStorage
var _sessions    = {};     // { userId: { name, initials, alias, location, online, ts } }
var _aliasMap    = {};     // { alias: userId } — built from presence, enables "VS:" routing by alias
var _transcript  = [];     // { ts, who, type, text }
var _scripts     = {};     // { name: scriptText } — lookup for Run verb backward compat
var _playbooks   = {};     // CMD-AEGIS-PLAYBOOK-FOUNDATION: { playbook_id: row } — substrate-backed
var _playbookByName = {};  // CMD-AEGIS-PLAYBOOK-FOUNDATION: { name: playbook_id } — name → current id
var _playbookRunsByPb = {}; // CMD-AEGIS-PLAYBOOK-FOUNDATION: { playbook_id: [run_row, ...] } — recent runs
var _activePlaybookId = null; // CMD-AEGIS-PLAYBOOK-FOUNDATION: currently-loaded playbook in editor
var _libraryFilters = {     // CMD-AEGIS-PLAYBOOK-FOUNDATION: Library UI filter state
  search: '',
  kinds:  [],               // empty = all kinds
  state:  'active',         // 'active' (draft+published) | 'draft' | 'all'
  sort:   'recent',         // 'recent' | 'name' | 'last-run'
};
var _panelEl     = null;   // the floating panel DOM element
var _panelOpen   = false;
var _cmdTarget   = 'ALL';  // current command target userId or 'ALL'
var _execQueue   = [];     // pending async commands
var _eventListeners = {};  // { eventName: [resolvers] }
var _storeVars   = {};     // script variable storage { name: value }
var _recordArmed = {};     // CMD100.50: per-session recorder arm map { userId: bool } — ephemeral
var _pageReadyTs = {};     // CMD100.63: per-session ts of latest page_ready broadcast — used by script-runner nav settle
var _scriptRunning = false; // suppress hook double-logging during script execution
var _scriptAborted = false; // set when panel closes mid-script
var _pauseResolve  = null;  // set by Pause command, cleared by Enter in command bar
var _leaveTimers   = {};    // { userId: timeoutId } — pending leave debounces; read by _renderSessionList
// CMD89 / Brief CMD89 spotlight presentation layer: Narrate + DOFile state.
// Replaces the CMD87/CMD88 banner state. Visual surface is a dim+hole
// spotlight overlay plus a caption card (compass.html). Aegis is operator-
// facing only — no visible overlay; Enter advances -pause for script flow.
var _narrateAdvance = null; // set by Narrate -pause (Aegis-local), resolved on Enter
var _narrateKeyHandler = null; // installed-while-pause-pending keydown listener (capture phase)
var _narrateVisible = false;   // true while a -pause is awaiting Enter on Aegis
var _doFileChain    = [];   // current DOFile call stack — names only, for depth guard + error reporting
// CMD87b / Brief Aegis Remote Narration: cross-session narrate state
// _narrateTarget: 'Aegis' = render local (operator-only Enter advance); else
// alias of remote session whose Compass tab will render the spotlight + caption.
// Reset to 'Aegis' on each _runScript entry per §7 ("do not persist across script runs").
var _narrateTarget = 'Aegis';
// On Aegis: latest narrate_id awaiting remote advance, so a subsequent Narrate
// can auto-advance the prior remote -pause (§3-q6 cross-session stacking).
// Holds the resolver fn (truthy) while pending; null otherwise.
var _narrateRemoteAdvance = null;
// On Compass: the active narrate_id currently displayed, so the triangle click
// emits narrate.advance with the correct id, and narrate.cleared (§3-q7) can
// report on advance/replace/clear.
var _compassActiveNarrateId = null;
// On Compass: keydown listener for local Enter-to-advance (mirror of the
// Aegis _narrateKeyHandler; same Enter advance semantics §3-q3).
var _compassNarrateKeyHandler = null;
// On Compass: timeout id for -timeout auto-advance, so a replace can clear it.
var _compassTimeoutId = null;

// ── UUID helper (B1/CMD54) ────────────────────────────────────────────────────
// Used by _cmdEmit to stamp a protocol-compliant event_id on every envelope.
// Prefers native crypto.randomUUID; falls back to a v4-shaped pseudo-UUID for
// any environment without it (old Safari, some iframe sandboxes).
function _uuid() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}

// ── Load Supabase JS client ───────────────────────────────────────────────────
function _loadSupabase() {
  return new Promise(function(resolve) {
    if (window.supabase) { resolve(); return; }
    var s = document.createElement('script');
    s.src = '/js/supabase.js';
    s.onload = function() {
      _supabase = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
        realtime: { params: { eventsPerSecond: 10 } }
      });
      resolve();
    };
    s.onerror = function() { console.error('[CMD Center] Failed to load Supabase JS'); resolve(); };
    document.head.appendChild(s);
  });
}

// ── Session identity ──────────────────────────────────────────────────────────
function _resolveSession() {
  var res = window._myResource || {};
  var user = window.CURRENT_USER || {};
  var name = res.name || user.name || 'Unknown';
  var parts = name.split(' ');
  var initials = ((parts[0]||'')[0]||'') + ((parts[parts.length-1]||'')[0]||'');
  _mySession = {
    userId:   res.user_id || user.id || user.sub || ('anon-' + Math.random().toString(36).slice(2,8)),
    name:     name,
    initials: initials.toUpperCase(),
    firmId:   FIRM_ID,
  };
  // Load persisted alias for this userId, or fall back to initials.
  // Only load from localStorage once we have a real (non-anon) userId.
  // CMD-AEGIS-VERIFICATION-PATTERN: alias is surface-scoped — Aegis-mode
  // and user-facing surfaces (Compass/Accord/etc.) persist alias under
  // distinct keys so the operator can run Aegis as e.g. "OP" while
  // their Compass tab keeps "VS". Without this, both surfaces share
  // the same alias and `VS:` dispatch becomes ambiguous.
  // Aegis-mode also defaults to "OP" (operator) instead of initials so
  // the alias namespace doesn't collide with the operator's own initials
  // on first visit.
  if (!_myAlias && !_mySession.userId.startsWith('anon-')) {
    var _aliasKeyPrefix = window._aegisMode ? 'phud:cmd:alias:aegis:' : 'phud:cmd:alias:';
    var _stored = localStorage.getItem(_aliasKeyPrefix + _mySession.userId);
    var _default = window._aegisMode ? 'OP' : _mySession.initials;
    _myAlias = _stored || _default;
  }
  // CMD100.66: expose resolved session as a global so hud-shell's recorder
  // has a reliable identity source even on pages where CURRENT_USER fails
  // to populate (api.js path differences, RLS-blocked user table, etc.).
  window._aegisSelf = {
    user_id:  _mySession.userId,
    alias:    _myAlias || _mySession.initials,
    initials: _mySession.initials,
    name:     _mySession.name
  };
}

// ── Location tracking ─────────────────────────────────────────────────────────
function _currentLocation() {
  var hash = window.location.pathname.replace(/\//g, '') || 'compass';
  var tab = '';
  var active = document.querySelector('.ust.on, [data-tab].active');
  if (active) tab = (active.textContent || '').trim().toUpperCase();
  return (hash.toUpperCase() || 'COMPASS') + (tab ? ' · ' + tab : '');
}

// ── Connect to Realtime ───────────────────────────────────────────────────────
function _startLiveClock() {
  if (window._liveClockInterval) return; // already running
  window._liveClockInterval = setInterval(function() {
    if (!_panelEl) return;
    var banner = _panelEl.querySelector('#phr-live-banner');
    var timeEl = _panelEl.querySelector('#phr-live-time');
    var dot    = _panelEl.querySelector('#phr-live-dot');
    if (!banner) return;
    banner.style.display = 'flex';
    var now = new Date();
    var ts = now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
    var ds = now.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    if (timeEl) timeEl.textContent = 'LIVE  ' + ds + '  ' + ts;
    // Pulse the dot
    if (dot) dot.style.opacity = dot.style.opacity === '0.3' ? '1' : '0.3';
  }, 1000);
}

function _updateStatusEl() {
  if (!_panelEl) return;
  var statusEl = _panelEl.querySelector('#phr-status');
  if (!statusEl) return;
  if (window._cmdConnected) {
    statusEl.textContent = '● ' + (window._cmdSessionName || 'connected');
    statusEl.style.color = '#1D9E75';
  } else {
    statusEl.textContent = 'connecting…';
    statusEl.style.color = '#EF9F27';
  }
}

function _channelSend(payload) {
  // CMD60: no readyState short-circuit. Let supabase-js route via WS
  // when OPEN or REST when not. CMD59 put a user JWT on realtime via
  // setAuth(), which is what makes the REST /realtime/v1/api/broadcast
  // fallback succeed instead of 401-ing. The pre-existing short-circuit
  // was written before setAuth was wired and has been silently dropping
  // broadcasts during every Phoenix heartbeat reconnect on Compass.
  //
  // CMD62: dual-write to both target and legacy channels during the
  // cutover window. Stale (pre-CMD62) tabs subscribe only to the legacy
  // channel; CMD62+ tabs subscribe to both. Emitting on both ensures
  // both populations receive every broadcast. Removed in B1.6 after
  // operator-confirmed full tab refresh. See Brief B1.5 §3.
  if (!_channel && !_channelLegacy) return;
  _safeSendOn(_channel,       payload);
  _safeSendOn(_channelLegacy, payload);
}

// CMD100.50: Recorder bridge. Expose _channelSend so hud-shell.js's
// global click-recorder can broadcast `recorder_event` payloads on the
// shared Compass channel without needing internal access.
window._cmdCenterChannelSend = _channelSend;

function _safeSendOn(ch, payload) {
  if (!ch) return;
  try {
    // CMD100.21: Supabase deprecation warning — when the channel is not yet
    // joined, send() falls back to REST internally and warns. Pick the
    // explicit method based on connection state to silence the warning.
    // CMD101.5z: httpSend returns a promise; swallow rejections so 401s
    // (transient auth) and "Payload is required" don't become Uncaught
    // promise rejections in the console.
    var result;
    if (ch.state === 'joined') {
      result = ch.send(payload);
    } else if (typeof ch.httpSend === 'function') {
      result = ch.httpSend(payload);
    } else {
      // Older SDKs without httpSend — fall through to send() and accept the warning.
      result = ch.send(payload);
    }
    if (result && typeof result.catch === 'function') {
      result.catch(function(err) {
        if (DEBUG_EVENTS) console.warn('[cmd-center] send rejected:', err && err.message || err);
      });
    }
  } catch(e) {
    if (DEBUG_EVENTS) console.warn('[cmd-center] send threw:', e && e.message || e);
  }
}

function _connect() {
  if (!_supabase || !_mySession) return;
  if (_channel) return; // already connected — don't re-subscribe

  // CMD59: attach the user's JWT to realtime before creating the channel.
  // Without this, realtime uses only the anon apikey; on Compass the
  // WebSocket handshake is accepted briefly, then closed by the server,
  // leaving readyState at CLOSED and every broadcast stranded on REST
  // fallback with 401. Aegis got lucky because it has fewer concurrent
  // REST calls so the initial WS stayed alive longer; the race could
  // bite it too. Fetch fresh (auto-refreshes expired tokens); fall back
  // to anon key if Auth module is unavailable.
  try {
    var token = (typeof Auth !== 'undefined' && Auth.getToken && Auth.getToken()) || SUPA_KEY;
    if (_supabase.realtime && typeof _supabase.realtime.setAuth === 'function') {
      _supabase.realtime.setAuth(token);
    }
  } catch(e) { console.warn('[cmd-center] realtime.setAuth failed:', e); }

  // CMD62: dual-subscribe cutover. Protocol Contract 1 specifies
  // `hud:{firm_id}` as the canonical channel. During transition, we
  // subscribe to BOTH the target and legacy channels so CMD62+ tabs
  // and pre-CMD62 (legacy-only) tabs remain mutually addressable.
  // Hard cutover would create a window where old and new tabs cannot
  // see each other — dispatched cmds time out, app_events go
  // undelivered. Removed in B1.6 after operator-confirmed full refresh.
  // See Brief B1.5 §1.
  var TARGET_CHANNEL_NAME = 'hud:' + FIRM_ID;
  var LEGACY_CHANNEL_NAME = 'cmd-center-' + FIRM_ID;
  var _presenceSuffix     = window._aegisMode ? 'aegis' : Math.random().toString(36).slice(2,7);
  var _channelConfig = {
    config: {
      presence:  { key: _mySession.userId + ':' + _presenceSuffix },
      broadcast: { self: true, ack: false },
    }
  };

  _channel       = _supabase.channel(TARGET_CHANNEL_NAME, _channelConfig);
  _channelLegacy = _supabase.channel(LEGACY_CHANNEL_NAME, _channelConfig);

  // ── Inbound handlers (named so we can register the SAME function on
  //    both channels; Rule 15 self-echo exemption, Rule 20 envelope
  //    unwrap, Rule 22 retention replay all live inside these bodies,
  //    so registering on both channels preserves every invariant
  //    mechanically). See Brief B1.5 §2.

  function _handlePresenceSync() {
    // With dual-subscribe, presence is published on both channels
    // independently. We merge presenceState() across both so the
    // _sessions map is channel-agnostic: a legacy-only tab appears via
    // the legacy channel's state, a CMD62+ tab appears in both. Last
    // presence wins per userId; exec presence beats aegisObserver when
    // both are visible for the same userId.
    var merged = {};
    [_channel, _channelLegacy].forEach(function(ch) {
      if (!ch) return;
      var state;
      try { state = ch.presenceState(); } catch(e) { return; }
      if (!state) return;
      Object.entries(state).forEach(function(kv) {
        var presences = kv[1];
        var p = presences && presences[0];
        if (!p || !p.userId) return;
        var existing = merged[p.userId];
        if (existing && existing.aegisObserver && !p.aegisObserver) {
          merged[p.userId] = p;
        } else if (!existing) {
          merged[p.userId] = p;
        }
      });
    });
    // CMD-PRESENCE-1 / CMD82: stale-ts filter. Supabase server-side
    // presence is unreliable when a client's WebSocket close frame
    // doesn't reach the server (X-button close, browser crash, network
    // yank). presenceState() can hold dead entries for many minutes.
    // The CMD80 heartbeat refreshes ts every 25s on every live session,
    // so any entry with ts older than 3 missed heartbeats (75s) is dead.
    // Filter here at rebuild so the next sync can't undo the decision.
    // Note: ts is the sender's clock, compared against our now — clock
    // skew between machines is a real concern but in practice tiny
    // (NTP-synced wall clocks), and 75s of slack absorbs it.
    var _now = Date.now();
    var STALE_PRESENCE_MS = 75000;
    var _live = {};
    Object.entries(merged).forEach(function(kv) {
      var p = kv[1];
      // Always keep self — Aegis is present to itself by definition.
      if (_mySession && p.userId === _mySession.userId) { _live[kv[0]] = p; return; }
      if (!p.ts || (_now - p.ts) > STALE_PRESENCE_MS) {
        if (DEBUG_EVENTS) console.log((window._aegisMode ? '[Aegis]' : '[cmd-center]') + ' presence sync · dropping stale:',
          (p.alias || p.initials || '?'), p.name || '?',
          '· last ts ' + Math.round((_now - (p.ts||0))/1000) + 's ago');
        return;
      }
      _live[kv[0]] = p;
    });
    merged = _live;
    var execP = Object.values(merged).filter(function(p){return p&&!p.aegisObserver;});
    // CMD83 instrumentation: log peer ts deltas to surface propagation drift.
    // For each peer (excluding self), how stale does their last-known ts look
    // from this session's perspective? If a peer's delta keeps climbing in
    // real time, their track() updates aren't reaching us.
    var nowMs = Date.now();
    var deltas = execP
      .filter(function(p) { return p.userId !== _mySession.userId; })
      .map(function(p) {
        var deltaMs = nowMs - (p.ts || 0);
        return (p.alias || p.initials || '?') + '=' + Math.round(deltaMs / 1000) + 's';
      });
    if (deltas.length > 0) {
      console.log('[presence-deltas] ' + (window._aegisMode ? 'AEGIS' : (_myAlias || '?')) + ' sees: ' + deltas.join(', '));
    }
    console.log((window._aegisMode ? '[Aegis]' : '[cmd-center]') + ' presence sync — '+execP.length+' exec session(s): '+execP.map(function(p){return p.name||'?';}).join(', '));
    // CMD-PRESENCE-5 (CMD86): non-destructive merge. Do NOT wipe _sessions.
    // The session map is co-owned with _handlePresenceHeartbeat (CMD85).
    // Wiping here drops heartbeat-only peers on every Phoenix Presence sync
    // event (which fires on connectivity changes), causing collateral drops
    // in Mission Control. The stale-sweep in _handlePresenceHeartbeat handles
    // eviction using the 75s threshold; this handler only adds/refreshes.
    // Applies to _aliasMap as well (co-owned with _sessions).
    Object.values(merged).forEach(function(p) {
      if (p.aegisObserver && _mySession && p.userId !== _mySession.userId) return;
      _sessions[p.userId] = {name:p.name,initials:p.initials,alias:p.alias||p.initials,location:p.location,online:true,ts:p.ts,aegisObserver:p.aegisObserver||false};
      _aliasMap[p.alias||p.initials] = p.userId;
      if (_mySession && _mySession.userId && !String(_mySession.userId).startsWith('anon-')) {
        try{localStorage.setItem('phud:cmd:session:'+p.userId,JSON.stringify(_sessions[p.userId]));}catch(e){}
      } else if (DEBUG_EVENTS) {
        console.log('[cmd-center] persistence skipped: pre-auth state, userId='+(_mySession&&_mySession.userId));
      }
    });
    _renderSessionList();
  }

  // CMD-PRESENCE-4 (CMD85): receive presence_heartbeat broadcasts from peers
  // and update the session map. This replaces Phoenix Presence's role of
  // being the keepalive source of truth — _handlePresenceSync still runs on
  // initial join and clean leaves, but the every-25s liveness signal now
  // arrives here via Broadcast.
  //
  // The peer's row is overwritten on every heartbeat, refreshing its ts.
  // The 75s stale-ts threshold (CMD82) in _handlePresenceSync still applies
  // to entries in _sessions — when a peer goes silent and stops sending
  // heartbeats, its ts grows stale and the next sync (or a future iteration
  // of staleness sweeping) will drop it. As a belt-and-braces measure we
  // also do a per-arrival stale sweep below.
  function _handlePresenceHeartbeat(payload) {
    if (!payload || !payload.userId) return;
    if (_mySession && payload.userId === _mySession.userId) return; // ignore own echoes (broadcast.self=true)

    var who = window._aegisMode ? 'AEGIS' : (_myAlias || _mySession.initials || '?');
    var peerInitials = payload.initials
      || (payload.name ? payload.name.split(' ').map(function(n){return n[0]||'';}).join('') : '?');

    // Cancel any pending leave debounce for this user — they're alive.
    // Mirrors what _handlePresenceJoin does on a fresh Phoenix Presence join.
    if (_leaveTimers[payload.userId]) {
      clearTimeout(_leaveTimers[payload.userId]);
      delete _leaveTimers[payload.userId];
    }

    var wasNew = !_sessions[payload.userId] || !_sessions[payload.userId].online;

    _sessions[payload.userId] = {
      name:          payload.name,
      initials:      peerInitials,
      alias:         payload.alias || peerInitials,
      location:      payload.location,
      online:        true,
      ts:            payload.ts || Date.now(),
      aegisObserver: !!payload.aegisObserver,
    };
    _aliasMap[payload.alias || peerInitials] = payload.userId;
    if (_mySession && _mySession.userId && !String(_mySession.userId).startsWith('anon-')) {
      try { localStorage.setItem('phud:cmd:session:' + payload.userId, JSON.stringify(_sessions[payload.userId])); } catch(e) {}
    } else if (DEBUG_EVENTS) {
      console.log('[cmd-center] persistence skipped: pre-auth state, userId='+(_mySession&&_mySession.userId));
    }

    if (DEBUG_EVENTS) {
      console.log('[presence-heartbeat] ' + who + ' recv from ' + (payload.alias || peerInitials)
        + ' · ts=' + payload.ts
        + (wasNew ? ' · NEW' : ''));
    }

    // Sweep stale peers from _sessions on every heartbeat arrival. Without
    // this, a peer that goes silent stays in the map until the next Phoenix
    // Presence sync rebuild (which is now rare with Approach B). We use the
    // same 75s threshold as _handlePresenceSync.
    var _nowSweep = Date.now();
    var STALE_PRESENCE_MS = 75000;
    Object.keys(_sessions).forEach(function(uid) {
      if (_mySession && uid === _mySession.userId) return; // never sweep self
      var s = _sessions[uid];
      if (!s) return;
      if (!s.ts || (_nowSweep - s.ts) > STALE_PRESENCE_MS) {
        if (DEBUG_EVENTS) console.log((window._aegisMode ? '[Aegis]' : '[cmd-center]')
          + ' presence heartbeat · dropping stale: '
          + (s.alias || s.initials || '?') + ' ' + (s.name || '?')
          + ' · last ts ' + Math.round((_nowSweep - (s.ts||0))/1000) + 's ago');
        delete _sessions[uid];
        if (s.alias) delete _aliasMap[s.alias];
        if (s.initials) delete _aliasMap[s.initials];
      }
    });

    _renderSessionList();
  }

  function _handlePresenceJoin(data) {
    var p = data.newPresences && data.newPresences[0];
    if (!p) return;
    // Cancel any pending leave timer for this user
    if (_leaveTimers[p.userId]) {
      clearTimeout(_leaveTimers[p.userId]);
      delete _leaveTimers[p.userId];
    }
    var isNew = !_sessions[p.userId];
    var _exJ = _sessions[p.userId];
    if (!_exJ || !_exJ.online || _exJ.aegisObserver || !p.aegisObserver) {
      _sessions[p.userId] = {
        name: p.name, initials: p.initials, alias: p.alias || p.initials, location: p.location,
        online: true, ts: Date.now(), lastSeen: Date.now(), aegisObserver: p.aegisObserver || false,
      };
      _aliasMap[p.alias || p.initials] = p.userId;
      if (_mySession && _mySession.userId && !String(_mySession.userId).startsWith('anon-')) {
        try { localStorage.setItem('phud:cmd:session:' + p.userId, JSON.stringify(_sessions[p.userId])); } catch(e) {}
      } else if (DEBUG_EVENTS) {
        console.log('[cmd-center] persistence skipped: pre-auth state, userId='+(_mySession&&_mySession.userId));
      }
    }
    _renderSessionList();
    if (isNew && _mySession && p.userId !== _mySession.userId) {
      _appendMonitor(p.name + ' joined');
    }
  }

  function _handlePresenceLeave(data) {
    var p = data.leftPresences && data.leftPresences[0];
    if (!p) return;
    var uid = p.userId;
    // Debounce 30s — Supabase fires leave on every track() update.
    // If they re-join within 30s it was just a presence update, not a true disconnect.
    // CMD62: with dual-channel, a single logical "leave" may fire once per
    // channel; the debounce absorbs that exactly as it absorbs track-update churn.
    if (_leaveTimers[uid]) clearTimeout(_leaveTimers[uid]);
    _leaveTimers[uid] = setTimeout(function() {
      delete _leaveTimers[uid];
      var sess = _sessions[uid];
      if (!sess) return;
      sess.online = false;
      _renderSessionList();
      if (_mySession && uid !== _mySession.userId) {
        _appendMonitor(sess.name + ' left');
      }
    }, 30000);
  }

  // Commands: receive commands addressed to this session
  function _handleCmd(payload) {
    var d = payload.payload;
    if (!d) return;
    var isMine = (d.target === _mySession.userId);
    var isAll  = (d.target === 'ALL');
    console.log('[recv-cmd]', {
      target: d.target,
      mine: isMine,
      all: isAll,
      myUid: _mySession && _mySession.userId,
      aegisMode: !!window._aegisMode,
      cmd: d.cmd,
      cmdId: d.cmdId,
      from: d.from
    });
    if (!isMine && !isAll) return;
    if (window._aegisMode) return; // Aegis dispatches but never executes
    if (d.cmdId && _seenCmdIds[d.cmdId]) {
      console.log('[recv-cmd] dedup drop', d.cmdId);
      return;
    }
    if (d.cmdId) { _seenCmdIds[d.cmdId] = Date.now(); _purgeSeenCmdIds(); }
    _appendLine(d.from || 'SYS', 'cmd', d.cmd);
    console.log('[recv-cmd] executing', d.cmd);
    _executeCommand(d.cmd, d.from).then(function(result) {
      console.log('[recv-cmd] completed', { cmd: d.cmd, result: result });
      _channelSend({
        type: 'broadcast', event: 'result',
        payload: {
          from: _mySession.userId, name: _mySession.name,
          result: result === undefined ? true : result,
          cmdId: d.cmdId,
        }
      });
    }).catch(function(err) {
      console.warn('[recv-cmd] threw', { cmd: d.cmd, err: err && err.message });
      _appendLine('SYS', 'err', 'Cmd failed: ' + (err && err.message ? err.message : err));
      _channelSend({
        type: 'broadcast', event: 'result',
        payload: {
          from: _mySession.userId, name: _mySession.name,
          result: { error: (err && err.message) ? err.message : String(err) },
          cmdId: d.cmdId,
        }
      });
    });
  }

  // Location updates — keep session location current without track() churn
  function _handleLocationUpdate(payload) {
    var d = payload.payload;
    if (!d || !d.userId) return;
    if (_sessions[d.userId]) {
      var prevLoc = _sessions[d.userId].location;
      _sessions[d.userId].location = d.location;
      _sessions[d.userId].online   = true;
      _sessions[d.userId].lastSeen = Date.now();
      _renderSessionList();
      if (prevLoc !== d.location) {
        _appendMonitor(d.name + ' → ' + d.location);
      }
    }
  }

  // Results: receive results from other sessions
  function _handleResult(payload) {
    var d = payload.payload;
    if (!d) return;
    // Self-echo skip: a session should ignore its own acks coming back via
    // broadcast.self=true. EXCEPT when we are Aegis — Aegis never acks (it
    // never executes cmds, see cmd handler above), so any 'result' arriving
    // here is from a target exec session. If that target shares Aegis's
    // userId (the operator ran Aegis + an exec tab in the same browser with
    // the same auth), the userId-match check would incorrectly swallow the
    // ack and cause 30s dispatch timeouts. Aegis is exempt. (Rule 15.)
    if (!window._aegisMode && d.from === _mySession.userId) return;
    // CMD62: cmdId dedup — dual-channel delivery otherwise shows the
    // dispatcher two ack lines per command.
    if (d.cmdId && _seenResultIds[d.cmdId]) return;
    if (d.cmdId) { _seenResultIds[d.cmdId] = Date.now(); _purgeSeenResultIds(); }
    var sess = _sessions[d.from];
    var who  = sess ? sess.initials : d.name || '??';
    // B-UI-3.3 (CMD68): unwrap structured error acks so remote throws
    // surface as diagnostic err lines instead of '[object Object]'.
    // Receive-side _handleCmd packages throws as {error:"..."} (line ~365).
    if (d.result && typeof d.result === 'object' && d.result.error) {
      _appendLine(who, 'err', '✗ ' + d.result.error);
    } else {
      _appendLine(who, 'result', '→ ' + d.result);
    }
    // Resolve any waiting ForEvent listeners
    _resolveEventListeners('result:' + d.from, d);
  }

  // App events: other sessions broadcast what they're doing
  // B1 (CMD54): envelope unwrap. Resolve with INNER payload so local and
  // remote listeners see identical data. Self-echo check accepts canonical
  // source_session with back-compat fallback to `from`. See Iron Rule 20.
  // CMD55: also push to retention buffer (post-self-echo) so a late
  // Wait ForEvent can match a past emit within the retention window.
  // CMD57 (Iron Rule 15 restated): Aegis is exempt from the self-echo skip.
  // One human running Aegis + Compass tabs under the same auth has
  // `d.source_session === _mySession.userId` on every Compass emit, which
  // the naive filter would discard as a self-echo. Aegis never emits
  // app_events (guarded by _aegisMode in mw-* modules), so any app_event
  // reaching Aegis is by definition from a different tab.
  // CMD62 (Iron Rule 25): event_id dedup. With dual-subscribe and
  // broadcast.self=true on both channels, every app_event arrives
  // twice at every listener. The retention buffer keys on event_type
  // only — it does NOT dedup by event_id — so a second receipt would
  // double-fire _resolveEventListeners and _fanoutAppEventListeners
  // (M2 feed would show duplicates, Wait ForEvent would get a second
  // resolve it ignores, retention buffer would carry two entries for
  // the same logical event). Dedup at handler entry, post-self-echo,
  // pre-buffer. 30s TTL matches retention window.
  // CMD64c (Iron Rule 15 amended — third revision): self-echo filter
  // REMOVED from _handleAppEvent entirely. `_mySession.userId` matches every
  // tab authenticated as the same user — not just the emitter's own tab.
  // Two Compass tabs open for the same operator (legitimate: monitoring,
  // multi-device, duplicate tab, incognito + normal) would both drop each
  // other's app_events as self-echo, breaking B-UI-1 Work Queue reactivity
  // on any non-emitting tab. Rule 25's event_id dedup already correctly
  // suppresses the emitter's own wire self-receive (the emitter registers
  // the event_id in _seenEventIds before the local fan-out, so the round-
  // trip drops at the dedup gate). The userId-based filter was always a
  // coarse proxy for "same tab" that happened to work only because the
  // second tab case wasn't exercised. Now it is.
  // History retained: CMD47 added the Aegis exemption to _handleResult;
  // CMD57 added the same exemption to _handleAppEvent; this (CMD64c)
  // removes the app_event filter entirely in favor of the event_id
  // mechanism that supersedes it. _handleCmd and _handleResult are
  // intentionally unchanged — they key on cmdId dedup (Rule 25) plus
  // target-match (cmd) / from-match (result), both of which handle the
  // twin-tab case correctly without the _aegisMode guard.
  // ── CMD100.50 — Recorder pipe ──────────────────────────────
  // Per-session arm map declared at module scope above; this handler
  // just consumes it.
  // CMD100.63 — _pageReadyTs declared at module scope above so the
  // script-runner (also at module scope) can read it. This handler
  // just consumes it.
  // var _pageReadyTs (declared at module scope)

  function _handlePageReady(payload) {
    var d = payload.payload;
    if (!d || !d.userId) return;
    _pageReadyTs[d.userId] = d.ts || Date.now();
    console.log('[recv-page_ready]', { userId: d.userId.slice(0,8), location: d.location, ts: _pageReadyTs[d.userId] });
  }

  function _handleRecorderEvent(payload) {
    var d = payload.payload;
    if (!d || !d.user_id || !d.command) return;
    // CMD100.50: dedup across dual-channel receipts (channel + legacy).
    if (d.event_id && _seenEventIds[d.event_id]) return;
    if (d.event_id) { _seenEventIds[d.event_id] = Date.now(); _purgeSeenEventIds(); }
    if (!_recordArmed[d.user_id]) return;
    var alias = d.alias || (_sessions[d.user_id] && (_sessions[d.user_id].alias || _sessions[d.user_id].initials)) || '??';
    // CMD100.57: recorder lines must always carry the session alias prefix
    // regardless of whether the armed session is the operator's own. This
    // ensures recorded transcripts are directly replayable as scripts.
    // Pass 'SYS' as `who` so _appendLine's self-prefix-skip path doesn't fire.
    _appendLine('SYS', 'cmd', alias + ': ' + d.command);
  }

  function _handleAppEvent(payload) {
    var d = payload.payload;
    if (!d) return;
    // CMD62 / Iron Rule 25: event_id dedup across dual-channel receipts
    // AND across the emitter's own wire self-receive (Rule 15 successor).
    if (d.event_id && _seenEventIds[d.event_id]) {
      if (DEBUG_CHANNEL_SOURCE) console.log('[cmd-center] dup app_event dropped ·', d.event_type || d.event, '·', d.event_id);
      return;
    }
    if (d.event_id) { _seenEventIds[d.event_id] = Date.now(); _purgeSeenEventIds(); }
    var eventName = d.event_type || d.event;
    var inner     = d.payload || d;  // unwrap envelope; fall back for legacy emits
    if (DEBUG_EVENTS) {
      // Prefix log line with sender's alias/initials so operator can tell
      // which Compass session emitted what. Sender identity comes from the
      // envelope's source_session (canonical) or `from` (back-compat shim);
      // we look it up in _sessions which is populated from presence. When
      // the sender isn't in _sessions yet (pre-sync, or already left), fall
      // back to '??' so the prefix slot stays consistent.
      var _src = d.source_session || d.from;
      var _sess = _src && _sessions[_src];
      var _tag  = (_sess && (_sess.alias || _sess.initials)) || '??';
      console.log('[' + _tag + ':cmd-center] recv', eventName, inner);
    }
    _pushEventBuffer(eventName, inner);
    _resolveEventListeners(eventName, inner);
    _fanoutAppEventListeners(eventName, inner);
  }

  // Register handlers on BOTH channels. See Brief B1.5 §2.
  _channel.on(      'presence',  { event: 'sync'  },            _handlePresenceSync);
  _channelLegacy.on('presence',  { event: 'sync'  },            _handlePresenceSync);
  _channel.on(      'presence',  { event: 'join'  },            _handlePresenceJoin);
  _channelLegacy.on('presence',  { event: 'join'  },            _handlePresenceJoin);
  _channel.on(      'presence',  { event: 'leave' },            _handlePresenceLeave);
  _channelLegacy.on('presence',  { event: 'leave' },            _handlePresenceLeave);
  _channel.on(      'broadcast', { event: 'cmd'             }, _handleCmd);
  _channelLegacy.on('broadcast', { event: 'cmd'             }, _handleCmd);
  _channel.on(      'broadcast', { event: 'location_update' }, _handleLocationUpdate);
  _channelLegacy.on('broadcast', { event: 'location_update' }, _handleLocationUpdate);
  _channel.on(      'broadcast', { event: 'result'          }, _handleResult);
  _channelLegacy.on('broadcast', { event: 'result'          }, _handleResult);
  _channel.on(      'broadcast', { event: 'app_event'       }, _handleAppEvent);
  _channelLegacy.on('broadcast', { event: 'app_event'       }, _handleAppEvent);
  // CMD100.50: Recorder events from any module's hud-shell click handler.
  _channel.on(      'broadcast', { event: 'recorder_event'  }, _handleRecorderEvent);
  _channelLegacy.on('broadcast', { event: 'recorder_event'  }, _handleRecorderEvent);
  // CMD100.63: page_ready signal — destination page broadcasts after
  // bootstrapping channels, so the dispatcher can confirm post-nav settle.
  _channel.on(      'broadcast', { event: 'page_ready'      }, _handlePageReady);
  _channelLegacy.on('broadcast', { event: 'page_ready'      }, _handlePageReady);

  // CMD-PRESENCE-4 (CMD85): Broadcast-based presence liveness.
  // Phoenix Presence's metadata update path doesn't reliably propagate ts
  // changes to peers (confirmed CMD83/CMD84). Heartbeats go through the
  // Broadcast layer instead, which already works for cmd:* events.
  // Per brief §3 Step 3, registered on _channel only (the modern hud
  // channel). Sender mirrors this — see _sendPresenceHeartbeat.
  _channel.on('broadcast', { event: 'presence_heartbeat' }, function(msg) {
    _handlePresenceHeartbeat(msg && msg.payload);
  });

  // Shared SUBSCRIBED finalizer — runs once, when the SECOND of the two
  // channels reports SUBSCRIBED. This is the both-channels-ready gate
  // from Brief B1.5 §4–5: operator-visible "Connected" banner, LIVE
  // clock, outbound queue drain, and location heartbeat must not fire
  // until dual-subscribe is complete, otherwise stale (legacy-only)
  // tabs are dark for anything emitted in the gap.
  var _bothReadyFired = false;
  function _onBothChannelsReady() {
    if (_bothReadyFired) return;
    if (!(_channelReady && _channelLegacyReady)) return;
    _bothReadyFired = true;
    if (DEBUG_EVENTS) console.log('[cmd-center] both channels ready · flushing', _outboundQueue.length, 'queued outbound');
    // Flip the connected flag BEFORE draining so _flushOutboundQueue's
    // guard (`if (!window._cmdConnected) return;`) passes.
    window._cmdConnected    = true;
    window._cmdSessionName  = _mySession ? _mySession.name : 'connected';
    _flushOutboundQueue();
    _appendLine('SYS', 'sys', 'Connected · session: ' + _mySession.name);
    _updateStatusEl();
    _renderSessionList();
    _startLiveClock();

    // CMD100.63 — emit page_ready so any Aegis-side script-runner
    // waiting for this session's post-nav settle can proceed. Sent only
    // from non-Aegis pages; Aegis itself doesn't drive scripts via nav.
    if (!window._aegisMode) {
      _channelSend({
        type: 'broadcast', event: 'page_ready',
        payload: {
          userId:   _mySession.userId,
          name:     _mySession.name,
          initials: _mySession.initials,
          location: _currentLocation(),
          ts:       Date.now()
        }
      });
      if (DEBUG_EVENTS) console.log('[cmd-center] page_ready emitted', _currentLocation());
    }
    // Location heartbeat — send on both channels via _channelSend.
    // Only from main window (not pop-out), and never from Aegis.
    if (!window._cmdCenterFullscreen && !window._aegisMode) {
      setInterval(function() {
        if (!_channel && !_channelLegacy) return;
        _channelSend({
          type: 'broadcast', event: 'location_update',
          payload: {
            userId:   _mySession.userId,
            name:     _mySession.name,
            initials: _mySession.initials,
            location: _currentLocation(),
          }
        });
      }, 10000);
    }
    // Presence heartbeat — Broadcast-based liveness signal.
    //
    // Phoenix Presence's metadata-update path is unreliable: track() with
    // only-ts-changed metadata succeeds locally (status=ok) but does NOT
    // broadcast a presence_diff to peers. CMD83 instrumentation confirmed
    // peers' ts values stay frozen at initial-join time. CMD84 attempted
    // an untrack-then-retrack cycle to force a leave/join broadcast; logs
    // proved the cycle ran every 25s, but peers' ts values still didn't
    // update. Phoenix Presence is designed for join/leave registration,
    // not heartbeating, and we've been fighting the design.
    //
    // Approach B (this code, CMD-PRESENCE-4 / CMD85): use Broadcast
    // instead. Broadcast is the same Realtime mechanism that ferries
    // cmd:* and app_event traffic — verified working daily. Each session
    // emits a presence_heartbeat broadcast every 25s; peers consume it
    // via _handlePresenceHeartbeat, which maintains _sessions. Phoenix
    // Presence keeps doing initial-join detection via _handlePresenceSync
    // (it works for that, since the initial sync IS reliable).
    //
    // 25s interval keeps peer ts deltas under the 75s stale-ts threshold
    // by 3x — generous slack for transient lag. The 30s leave debounce
    // in _handlePresenceLeave is now mostly irrelevant (Phoenix Presence
    // leave events are rare), but harmless; left in place per brief §2.
    setInterval(function() {
      if (window._cmdCenterFullscreen) return; // pop-out suppresses presence
      _sendPresenceHeartbeat();
    }, 25000);

    // Send one immediately so peers don't wait 25s for the first liveness
    // signal beyond the Phoenix Presence initial join.
    _sendPresenceHeartbeat();
  }

  function _trackPresenceOn(ch) {
    if (window._cmdCenterFullscreen) return; // pop-out suppresses presence
    var who = window._aegisMode ? 'AEGIS' : (_myAlias || _mySession.initials || '?');
    var startTs = Date.now();
    try {
      var result = ch.track({
        userId:   _mySession.userId,
        name:     _mySession.name,
        initials: _mySession.initials,
        alias:    _myAlias || _mySession.initials,
        location: _currentLocation(),
        ts:       startTs,
        aegisObserver: window._aegisMode ? true : undefined,
      });
      // CMD83 instrumentation: log track() outcome.
      // Newer @supabase/supabase-js versions return a Promise; older
      // versions return a sync status string. Handle both shapes.
      if (result && typeof result.then === 'function') {
        result.then(function(status) {
          console.log('[track] ' + who + ' → async ok · status=' + status + ' · ts=' + startTs);
        }).catch(function(err) {
          console.error('[track] ' + who + ' → async REJECTED · ts=' + startTs, err);
        });
      } else {
        console.log('[track] ' + who + ' → sync · status=' + result + ' · ts=' + startTs);
      }
    } catch(e) {
      console.error('[track] ' + who + ' → THREW · ts=' + startTs, e);
    }
  }

  // CMD-PRESENCE-3 (CMD84): untrack-then-retrack to force a presence_diff
  // broadcast. Used by the 25s heartbeat in CMD84.
  //
  // CMD-PRESENCE-4 (CMD85): UNUSED. Approach A (this function and its
  // _refreshPresenceOn caller) was abandoned after CMD84 verification
  // failed: log lines confirmed the untrack/retrack cycle ran every 25s,
  // but peers' ts values still didn't update. Server-side coalescing or
  // some other Phoenix internal defeated the explicit churn pattern.
  // See CMD-PRESENCE-4 §1 for full rationale. Kept as dead code per
  // brief §3 Step 6 — small diff, minor fallback option, no harm.
  function _refreshPresenceOn(ch, ready) {
    if (!ch || !ready) return;
    if (window._cmdCenterFullscreen) return;
    var who = window._aegisMode ? 'AEGIS' : (_myAlias || _mySession.initials || '?');
    try {
      var untrackResult = ch.untrack();
      // Newer @supabase/supabase-js: untrack returns Promise.
      // Older: returns sync status.
      if (untrackResult && typeof untrackResult.then === 'function') {
        untrackResult
          .then(function(status) {
            console.log('[presence-refresh] ' + who + ' untrack ok · status=' + status);
            _trackPresenceOn(ch); // _trackPresenceOn already logs its own outcome
          })
          .catch(function(err) {
            console.error('[presence-refresh] ' + who + ' untrack REJECTED — calling track() anyway', err);
            _trackPresenceOn(ch); // Try track even if untrack failed; worst case it's a no-op.
          });
      } else {
        console.log('[presence-refresh] ' + who + ' untrack sync · status=' + untrackResult);
        _trackPresenceOn(ch);
      }
    } catch(e) {
      console.error('[presence-refresh] ' + who + ' untrack THREW — calling track() anyway', e);
      _trackPresenceOn(ch); // Defense in depth.
    }
  }

  // CMD-PRESENCE-4 (CMD85): send periodic liveness signal via Broadcast.
  // Replaces the Phoenix Presence track()/untrack-retrack heartbeating
  // attempted in CMD80-CMD84. Payload schema matches what
  // _handlePresenceHeartbeat expects, which in turn populates _sessions
  // using the same field shape _handlePresenceSync (Phoenix Presence
  // path) does — so the renderer (_renderSessionList) consumes both
  // sources interchangeably.
  //
  // Sends on _channel only per brief §3 Step 1 / Step 3 (the modern
  // hud:{firm_id} channel). Receivers are subscribed there. Note: this
  // diverges from the file's broader dual-write pattern (_channelSend
  // hits both _channel and _channelLegacy via _safeSendOn) — see the
  // CMD85 hand-off note for rationale.
  function _sendPresenceHeartbeat() {
    if (window._cmdCenterFullscreen) return;
    if (!_channel || !_channelReady) return;
    if (!_mySession) return;

    var who = window._aegisMode ? 'AEGIS' : (_myAlias || _mySession.initials || '?');
    var payload = {
      userId:        _mySession.userId,
      name:          _mySession.name,
      initials:      _mySession.initials,
      alias:         _myAlias || _mySession.initials,
      location:      _currentLocation(),
      aegisObserver: window._aegisMode ? true : false,
      ts:            Date.now(),
    };

    try {
      // CMD101.5z: route through _safeSendOn so the joined/not-joined branch
      // picks send() vs httpSend() correctly. Calling _channel.send() directly
      // hits the new SDK's deprecated auto-REST-fallback path, which throws
      // "Payload is required for httpSend()" + 401 when the channel isn't
      // yet joined. _safeSendOn handles both states without warnings.
      _safeSendOn(_channel, {
        type:    'broadcast',
        event:   'presence_heartbeat',
        payload: payload,
      });
      if (DEBUG_EVENTS) console.log('[presence-heartbeat] ' + who + ' sent · ts=' + payload.ts);
    } catch(e) {
      console.error('[presence-heartbeat] ' + who + ' send THREW', e);
    }
  }

  _channel.subscribe(function(status) {
    if (status === 'SUBSCRIBED') {
      if (DEBUG_EVENTS) console.log('[cmd-center] subscribed to ' + TARGET_CHANNEL_NAME);
      _channelReady = true;
      // Presence is published on each channel independently (Brief B1.5 §4).
      _trackPresenceOn(_channel);
      _onBothChannelsReady();
    }
  });

  _channelLegacy.subscribe(function(status) {
    if (status === 'SUBSCRIBED') {
      if (DEBUG_EVENTS) console.log('[cmd-center] subscribed to ' + LEGACY_CHANNEL_NAME + ' (legacy)');
      _channelLegacyReady = true;
      _trackPresenceOn(_channelLegacy);
      _onBothChannelsReady();
    }
  });
}

// ── Event listener system for Wait ForEvent ───────────────────────────────────
// CMD55: scan retention buffer before queueing forward, so a Wait registered
// after the emit fired still resolves within the 30s window.
function _waitForEvent(eventName, timeoutMs) {
  return new Promise(function(resolve, reject) {
    // Replay: any buffered entry for this event_type matches unconditionally.
    var hit = _scanEventBuffer(eventName, function() { return true; });
    if (hit) { resolve(hit.data); return; }

    if (!_eventListeners[eventName]) _eventListeners[eventName] = [];
    var timer = setTimeout(function() {
      _eventListeners[eventName] = (_eventListeners[eventName]||[]).filter(function(r){ return r !== resolver; });
      reject(new Error('Timeout waiting for event: ' + eventName));
    }, timeoutMs || 30000);
    var resolver = function(data) {
      clearTimeout(timer);
      resolve(data);
    };
    _eventListeners[eventName].push(resolver);
  });
}

function _resolveEventListeners(eventName, data) {
  var listeners = _eventListeners[eventName] || [];
  if (!listeners.length) return;
  _eventListeners[eventName] = [];
  listeners.forEach(function(r) { r(data); });
}

// ── Dual-channel dedup stores (CMD62 / Iron Rule 25) ──────────────────────────
// With dual-subscribe + broadcast.self=true on both channels, every
// outbound broadcast arrives TWICE at every listener (once per channel).
// Dedup by the broadcast's natural id: app_event→event_id,
// cmd→cmdId, result→cmdId. Separate stores so we don't collide across
// broadcast types. 30s TTL matches the retention buffer window; a
// duplicate arrival beyond that is (a) vanishingly unlikely given both
// channels share the same WS, and (b) less harmful than memory growth.
// Dedup is applied at handler entry, AFTER self-echo filtering and
// BEFORE the retention buffer push (so replay machinery never sees a
// duplicate). location_update has no natural id and is idempotent
// (last-write-wins on _sessions[uid].location), so it is exempt.
var _DEDUP_TTL_MS   = 30000;
var _seenEventIds   = {}; // { event_id: ts }
var _seenCmdIds     = {}; // { cmdId:   ts }  — cmd path
var _seenResultIds  = {}; // { cmdId:   ts }  — result path (different store: a cmd and its ack can share id)
function _purgeSeenIds(store) {
  var cutoff = Date.now() - _DEDUP_TTL_MS;
  for (var k in store) { if (store[k] < cutoff) delete store[k]; }
}
function _purgeSeenEventIds()  { _purgeSeenIds(_seenEventIds);  }
function _purgeSeenCmdIds()    { _purgeSeenIds(_seenCmdIds);    }
function _purgeSeenResultIds() { _purgeSeenIds(_seenResultIds); }

// ── Event retention buffer (B1 follow-up / CMD55) ─────────────────────────────
// Wait ForEvent only listens going forward. An emit that fires before the
// Wait is registered was lost. The probe script exposed this: location.ready
// fires during the Compass-load Pause, well before the user hits Enter.
//
// Retention: 30 seconds per event_type, keyed on event_type. Both local
// emits (from _cmdEmit) and remote receives (from the app_event handler)
// push. _waitForEvent and _waitForEventFiltered scan the buffer for the
// newest matching entry within the retention window before queueing forward.
// Self-echo filtering is already applied upstream (line-310 handler drops
// own-session broadcasts before _pushEventBuffer is called on the receive
// path), so replay respects self-echo without any extra check here.
var _EVENT_BUFFER_MS = 30000;
var _eventBuffer = {}; // { eventName: [ {ts, data}, ... ] } — newest at end

// ── M2 feed listeners (CMD61 / Brief M2-FEED-1) ───────────────────────────────
// Long-lived subscribers registered via window.CMDCenter.onAppEvent. Invoked
// after self-echo filter + envelope unwrap + buffer push on the receive path,
// and after buffer push on the local-emit path, so listeners see identical
// (eventName, innerPayload) shape regardless of origin. See Iron Rule 20.
var _m2FeedListeners = [];
function _fanoutAppEventListeners(eventName, data) {
  if (!_m2FeedListeners.length) return;
  for (var i = 0; i < _m2FeedListeners.length; i++) {
    try { _m2FeedListeners[i](eventName, data); }
    catch (e) { if (DEBUG_EVENTS) console.warn('[cmd-center] M2 listener threw:', e); }
  }
}

// ── Outbound emit queue (B1 follow-up / CMD56) ────────────────────────────────
// When _cmdEmit fires before the realtime socket is OPEN (readyState 1), the
// broadcast is silently dropped by _channelSend. This stranded the probe's
// location.ready on Compass — the emit ran mid-subscribe. Queue unsent
// envelopes in-memory, FIFO, cap at 50; drain on SUBSCRIBED.
var _OUTBOUND_QUEUE_CAP = 50;
var _outboundQueue = []; // [ envelope, ... ]

function _socketReady() {
  if (!_channel) return false;
  var state = _channel.socket && _channel.socket.conn && _channel.socket.conn.readyState;
  return state === 1;
}

function _flushOutboundQueue() {
  if (!_outboundQueue.length) return;
  if (!window._cmdConnected) return;
  var drained = 0;
  while (_outboundQueue.length) {
    var env = _outboundQueue.shift();
    // CMD62: route through _channelSend so flushed envelopes go to both
    // target and legacy channels, same as live emits. A direct
    // _channel.send() here would strand stale (legacy-only) tabs for
    // every envelope queued pre-SUBSCRIBED.
    _channelSend({ type: 'broadcast', event: 'app_event', payload: env });
    drained++;
  }
  if (DEBUG_EVENTS) console.log('[cmd-center] flushed outbound queue ·', drained, 'envelope(s)');
}

// CMD58: expose for diagnostics + allow external manual flush.
window._cmdOutboundQueue = _outboundQueue;
window._cmdFlushOutbound = _flushOutboundQueue;
window._cmdSocketReady   = _socketReady;

// CMD58/60: safety-net interval drain. Flushes whenever we've seen
// SUBSCRIBED and the queue is non-empty. Let the Supabase client handle
// WebSocket vs REST transport.
setInterval(function() {
  if (_outboundQueue.length && window._cmdConnected) _flushOutboundQueue();
}, 500);

function _pushEventBuffer(eventName, data) {
  if (!eventName) return;
  var now = Date.now();
  var arr = _eventBuffer[eventName] || (_eventBuffer[eventName] = []);
  arr.push({ ts: now, data: data });
  // Purge entries older than retention window. Array is time-ordered so a
  // single loop from the front is sufficient.
  var cutoff = now - _EVENT_BUFFER_MS;
  var i = 0;
  while (i < arr.length && arr[i].ts < cutoff) i++;
  if (i > 0) arr.splice(0, i);
}

// Scan the retention buffer for the newest entry matching `predicate`.
// Returns {ts, data} or null. Expired entries are purged in-line.
function _scanEventBuffer(eventName, predicate) {
  var arr = _eventBuffer[eventName];
  if (!arr || !arr.length) return null;
  var cutoff = Date.now() - _EVENT_BUFFER_MS;
  // Walk newest to oldest so we return the freshest match.
  for (var i = arr.length - 1; i >= 0; i--) {
    var entry = arr[i];
    if (entry.ts < cutoff) break; // everything before is also expired
    if (predicate(entry.data)) return entry;
  }
  return null;
}

// ── Filtered event wait ───────────────────────────────────────────────────────
// Like _waitForEvent but only resolves when the event data matches a filter.
// filterKey: field to check (e.g. 'assignee', 'userId', 'resource_id')
// filterVal: expected value — compared against common data fields
// Non-matching events re-queue the listener so it keeps waiting.
// CMD55: scan retention buffer before queueing forward. Predicate logic is
// shared between buffer scan and live match to guarantee identical semantics.
function _waitForEventFiltered(eventName, filterKey, filterVal, timeoutMs) {
  return new Promise(function(resolve, reject) {
    var deadline = Date.now() + (timeoutMs || 60000);

    // Build the predicate once. Captures filterKey/filterVal and the
    // session alias resolution at the moment the Wait was registered.
    var acceptableVals = [filterVal];
    if (filterKey === 'assignee' && filterVal) {
      var resolvedUid = _resolveTargetAlias(filterVal.toUpperCase());
      if (resolvedUid) {
        acceptableVals.push(resolvedUid);
        var resolvedSess = _sessions[resolvedUid];
        if (resolvedSess && resolvedSess.resourceId) acceptableVals.push(resolvedSess.resourceId);
      }
      if (_mySession && (filterVal === _myAlias || filterVal === _mySession.initials)) {
        acceptableVals.push(_mySession.userId);
      }
    }
    function matchesFilter(data) {
      if (!filterKey || !filterVal) return true;
      var fields = [
        data[filterKey],
        data.userId, data.user_id,
        data.resource_id, data.assigneeId,
        data.from, data.assignee,
      ].filter(Boolean).map(String);
      return fields.some(function(f) {
        return acceptableVals.some(function(v) { return f === String(v); });
      });
    }

    // Replay: scan buffer for the newest matching entry within retention.
    var hit = _scanEventBuffer(eventName, matchesFilter);
    if (hit) { resolve(hit.data); return; }

    function attempt() {
      if (!_eventListeners[eventName]) _eventListeners[eventName] = [];

      var timer = setTimeout(function() {
        _eventListeners[eventName] = (_eventListeners[eventName]||[]).filter(function(r){ return r !== resolver; });
        reject(new Error('Timeout waiting for event: ' + eventName
          + (filterKey ? ' [' + filterKey + '=' + filterVal + ']' : '')));
      }, Math.max(0, deadline - Date.now()));

      var resolver = function(data) {
        clearTimeout(timer);
        if (matchesFilter(data)) {
          resolve(data);
        } else {
          // Event didn't match filter — re-queue and keep waiting
          _eventListeners[eventName] = _eventListeners[eventName] || [];
          _eventListeners[eventName].push(resolver);
        }
      };
      _eventListeners[eventName].push(resolver);
    }
    attempt();
  });
}

// ── resource_id lookup cache (B2 / CMD63a) ────────────────────────────────────
// Session objects published via presence carry initials/alias/name/location but
// NOT resource_id (confirmed empirically on live probe). Commands that need
// resource_id (Wait ForRoute, and latently Get Request id for <alias>) must
// resolve userId → resource_id via a DB lookup. Cache by userId indefinitely;
// resource_id is immutable per protocol Contract 3.
var _resourceIdByUserId = {}; // { userId: resource_id }

async function _resolveResourceIdForUserId(userId) {
  if (!userId) return null;
  if (_resourceIdByUserId[userId]) return _resourceIdByUserId[userId];
  try {
    var resp = await fetch(
      SUPA_URL + '/rest/v1/resources?user_id=eq.' + encodeURIComponent(userId) + '&select=id&limit=1',
      { headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY } }
    );
    var rows = await resp.json();
    var rid = rows && rows[0] && rows[0].id;
    if (rid) { _resourceIdByUserId[userId] = rid; return rid; }
  } catch (e) {
    if (DEBUG_EVENTS) console.warn('[cmd-center] _resolveResourceIdForUserId failed:', e);
  }
  return null;
}

// ── Compound-filter wait primitive (B2 / CMD63b; DRY'd in CMD65) ─────────────
// Shared core for any Wait command that must match on TWO payload fields.
// _waitForEventFiltered supports only a single filterKey/filterVal, so naive
// re-queue against it is broken under buffer replay: each recursion re-scans
// the retention buffer and returns the same stale entry, so if the buffer
// contains a non-matching emit the recursion loops on the stale entry until
// timeout. Observed 2026-04-19 on dual_session_test v1.2: seq-2 (VS=submitter)
// sat in buffer when Wait ForRoute to AK registered, _waitForEventFiltered
// returned it, compound check failed, next recursion returned it again.
//
// Pattern (Iron Rule 27): single initial compound-aware buffer scan (newest
// match with BOTH fields), then if no hit, register a forward-only listener
// with compound predicate applied inside the resolver. Non-matching forward
// emits re-queue the listener, but there is no buffer re-scan on re-queue,
// so stale entries don't reappear.
//
// Callers: _waitForRoute (workflow_request.created; CMD63b), _waitForQueueRow
// (work_queue.rendered; CMD65 / B-UI-2). If a third caller lands, keep DRY'ing.
function _waitForCompoundEvent(eventName, primaryKey, primaryVal, secondaryKey, secondaryVal, timeoutMs, errLabel) {
  return new Promise(function(resolve, reject) {
    timeoutMs = timeoutMs || 30000;
    function compoundMatch(data) {
      if (!data) return false;
      if (data[primaryKey] !== primaryVal) return false;
      // Tolerate the same resource_id aliases _waitForRoute originally accepted.
      var actual = data[secondaryKey];
      if (actual == null && secondaryKey === 'assignee_resource_id') {
        actual = data.resource_id || data.assigneeId;
      }
      return actual === secondaryVal;
    }
    // Initial buffer scan — newest compound match within retention (Rule 22).
    var hit = _scanEventBuffer(eventName, compoundMatch);
    if (hit) { resolve(hit.data); return; }
    // No buffer hit — register forward listener with compound re-queue (Rule 27).
    if (!_eventListeners[eventName]) _eventListeners[eventName] = [];
    var timer = setTimeout(function() {
      _eventListeners[eventName] = (_eventListeners[eventName]||[]).filter(function(r){ return r !== resolver; });
      reject(new Error('Timeout waiting for ' + (errLabel || eventName)
        + ' [' + primaryKey + '=' + primaryVal + ', ' + secondaryKey + '=' + secondaryVal + ']'));
    }, timeoutMs);
    var resolver = function(data) {
      if (compoundMatch(data)) {
        clearTimeout(timer);
        resolve(data);
      } else {
        _eventListeners[eventName] = _eventListeners[eventName] || [];
        _eventListeners[eventName].push(resolver);
      }
    };
    _eventListeners[eventName].push(resolver);
  });
}

// ── Wait ForRoute (B2 / CMD63b) ──────────────────────────────────────────────
// Thin wrapper over _waitForCompoundEvent for workflow_request.created.
function _waitForRoute(instanceId, assigneeResourceId, timeoutMs) {
  return _waitForCompoundEvent(
    'workflow_request.created',
    'instance_id', instanceId,
    'assignee_resource_id', assigneeResourceId,
    timeoutMs,
    'route of ' + instanceId + ' to ' + assigneeResourceId
  );
}

// ── Wait ForQueueRow (B-UI-2 / CMD65) ────────────────────────────────────────
// Consumes the B-UI-1 work_queue.rendered emit. Single-field mode matches on
// instance_id only (any operator's queue); compound mode additionally matches
// assignee_resource_id so the wait resolves only when the specified alias's
// Compass tab has rendered the row. Default timeout 15s — queue renders are
// fast once the emit fires; shorter than ForInstance's 60s.
function _waitForQueueRow(instanceId, assigneeResourceId, timeoutMs) {
  if (assigneeResourceId == null) {
    // Single-field — existing buffer-replay + forward-queue path (Rule 22).
    return _waitForEventFiltered(
      'work_queue.rendered', 'instance_id', instanceId, timeoutMs || 15000
    );
  }
  // Compound — shared helper, same Rule 27 pattern as _waitForRoute.
  return _waitForCompoundEvent(
    'work_queue.rendered',
    'instance_id', instanceId,
    'assignee_resource_id', assigneeResourceId,
    timeoutMs || 15000,
    'queue row for ' + instanceId + ' on ' + assigneeResourceId
  );
}


// ── Wait ForModal (B-UI-4 / CMD74) ───────────────────────────────────────────
// Consumes the B-UI-4 modal.opened emit (mw-events.js Site 1 / Site 2).
// Single-field mode matches on modal_name only; compound mode additionally
// matches role ('reviewer' | 'approver' | 'submitter_resubmit') so the wait
// resolves only when the specified flow's modal mounts. Default timeout 10s
// — modal renders are fast once appendChild fires; no DB-gated content path.
// Same Rule 22 / Rule 27 discipline as _waitForQueueRow via shared helpers.
function _waitForModal(modalName, role, timeoutMs) {
  if (role == null) {
    return _waitForEventFiltered(
      'modal.opened', 'modal_name', modalName, timeoutMs || 10000
    );
  }
  return _waitForCompoundEvent(
    'modal.opened',
    'modal_name', modalName,
    'role', role,
    timeoutMs || 10000,
    'modal "' + modalName + '" for ' + role
  );
}


// B1 (CMD54): protocol-compliant envelope per HUD Ecosystem Protocol v0.1.
// Canonical fields: protocol_version, event_type, event_id, source_product,
// source_session, ts, firm_id, payload. Back-compat shims (event, from, name)
// are kept at top level so the line-310 handler and any legacy consumer keep
// working during the transition; remove in a future major bump.
// Local listeners receive the INNER payload (same as remote after line-310
// unwrap). See handoff Iron Rule 20.
window._cmdEmit = function(eventName, data) {
  if (!_channel || !_mySession) return;
  var envelope = {
    protocol_version: 1,
    event_type:       eventName,
    event_id:         _uuid(),
    source_product:   'projecthud',
    source_session:   _mySession.userId,
    ts:               Date.now(),
    firm_id:          FIRM_ID,
    payload:          data || {},
    // Back-compat shims
    event:            eventName,
    from:             _mySession.userId,
    name:             _mySession.name,
  };
  if (DEBUG_EVENTS) console.log('[cmd-center] emit', eventName, data || {});

  // CMD62 / Iron Rule 25: register our own event_id in the dedup store
  // BEFORE the local fan-out below. The broadcast round-trips via
  // Supabase (broadcast.self=true on both channels) and re-enters via
  // _handleAppEvent; on Aegis that self-receive passes the Rule 15
  // Aegis exemption (not skipped), and without this registration the
  // dedup check would also pass (event_id not yet seen), causing
  // _fanoutAppEventListeners to fire a second time and the M2 feed
  // to render the event twice (CoC stream double-render observed in
  // CMD62 post-deploy smoke test on manual _cmdEmit calls). Applies
  // to any tab that both emits and listens; Aegis is the primary
  // surface today but any future same-tab emit+listen is latent for
  // this same bug. _pushEventBuffer is not affected because the wire
  // receipt's buffer push is skipped alongside the fan-out (both
  // live after the dedup gate in _handleAppEvent).
  if (envelope.event_id) {
    _seenEventIds[envelope.event_id] = Date.now();
    _purgeSeenEventIds();
  }

  // CMD60: gate on the SUBSCRIBED-derived flag, not raw WebSocket
  // readyState. The Supabase client's own `.send()` handles transport
  // selection (WebSocket primary, REST fallback with auto-retry).
  // Short-circuiting on readyState !== 1 blocks emits during normal
  // Phoenix heartbeat reconnects — presence still works through the
  // same reconnect path because the client handles it transparently.
  // Queue only while we haven't seen SUBSCRIBED at all (pre-bootstrap).
  if (window._cmdConnected) {
    _channelSend({ type: 'broadcast', event: 'app_event', payload: envelope });
  } else {
    if (_outboundQueue.length >= _OUTBOUND_QUEUE_CAP) {
      var evicted = _outboundQueue.shift();
      if (DEBUG_EVENTS) console.log('[cmd-center] outbound queue full · evicting oldest ·', evicted && evicted.event_type);
    }
    _outboundQueue.push(envelope);
    if (DEBUG_EVENTS) console.log('[cmd-center] queued outbound ·', eventName, '· depth=' + _outboundQueue.length);
  }

  _pushEventBuffer(eventName, data || {});
  _resolveEventListeners(eventName, data);
  _fanoutAppEventListeners(eventName, data || {});
};

// ── Aegis Registry-backed tab activator (CMD91) ─────────────────────────────
// Shared implementation for `Set Tab` and `Set SubTab` command verbs. Looks
// up the label via window.AegisRegistry, clicks the clickable ancestor of the
// registered element, and waits briefly for an activation-class change. On
// miss, returns a diagnostic listing the labels currently visible on the page.
// CMD100.57 — DOM-fallback for Set Tab / Set SubTab when the AegisRegistry
// has no entry for the supplied label. Walks elements with tab-like classes
// (matches the recorder's actionable-class signature) and finds one whose
// visible text equals the label (case-insensitive, badge-stripped).
function _findTabInDOM(label, level) {
  // CMD-AEGIS-VERIFICATION-PATTERN: original CMD100.57 selector list
  // (.tab, .tab-btn, [role="tab"], etc.) misses bare <button> elements
  // used by surfaces like accord.html where tab markup is class-free.
  // Two-tier scan: try the canonical class/role selectors first; if
  // nothing matches, fall back to bare <button>/<a> with exact text
  // match. The exact-match guard at line `if (txt === want)` keeps
  // the broader scan safe from false positives.
  var TAB_SELECTORS = [
    '[role="tab"]',
    '.tab', '.tab-btn', '.tab-strip-item',
    '.subnav-item', '.sub-nav-item',
    '.nav-item', '.menu-item'
  ];
  var FALLBACK_SELECTORS = [
    'button:not([type="submit"])',
    'a[href]',
    '[role="button"]'
  ];
  var BADGE_RX = /\b(badge|count|pill|chip|notif|tag-count|num)\b/i;
  function cleanText(el) {
    var out = '';
    var nodes = el.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      var c = nodes[i];
      if (c.nodeType === 3) { out += c.nodeValue; continue; }
      if (c.nodeType !== 1) continue;
      var cls = (c.className && typeof c.className === 'string') ? c.className : '';
      if (BADGE_RX.test(cls)) continue;
      var t = (c.textContent || '').trim();
      if (/^\d+$/.test(t)) continue;
      out += c.textContent || '';
    }
    return out.replace(/\s+/g, ' ').trim();
  }
  var want = label.replace(/\s+/g, ' ').trim().toLowerCase();
  for (var s = 0; s < TAB_SELECTORS.length; s++) {
    var els = document.querySelectorAll(TAB_SELECTORS[s]);
    for (var i = 0; i < els.length; i++) {
      var txt = cleanText(els[i]).toLowerCase();
      if (txt === want) return els[i];
    }
  }
  // Fallback: bare buttons / anchors with exact-text match.
  for (var s2 = 0; s2 < FALLBACK_SELECTORS.length; s2++) {
    var els2 = document.querySelectorAll(FALLBACK_SELECTORS[s2]);
    for (var j = 0; j < els2.length; j++) {
      var txt2 = cleanText(els2[j]).toLowerCase();
      if (txt2 === want) return els2[j];
    }
  }
  return null;
}

async function _aegisActivateTab(level, rawLabel) {
  var label = (rawLabel == null ? '' : String(rawLabel)).trim();
  var noun  = (level === 'tab') ? 'tab' : 'subtab';
  if (!label) return noun + ' not found: (empty label)';

  // CMD100.57: DOM-first fallback. Recorded transcripts emit `Set Tab` /
  // `Set SubTab` for any element that classified as one — including pages
  // whose tabs the AegisRegistry hasn't been told about. Try the registry
  // first; if no match, walk the DOM for any element whose visible text
  // matches the label and which has an actionable shape.
  var reg = window.AegisRegistry;
  var entry = null;
  if (reg) {
    entry = (level === 'tab') ? reg.findTab(label) : reg.findSubTab(label);
  }

  if (!entry) {
    var domHit = _findTabInDOM(label, level);
    if (domHit) {
      entry = { el: domHit };
    } else {
      var diag = '(none registered)';
      if (reg) {
        var visible = (level === 'tab') ? reg.listTabs() : reg.listSubTabs();
        var labels = [];
        for (var i = 0; i < visible.length && labels.length < 20; i++) {
          if (labels.indexOf(visible[i].label) === -1) labels.push(visible[i].label);
        }
        if (labels.length) diag = labels.join(', ');
      }
      return noun + ' not found: ' + label + ' · registered: ' + diag;
    }
  }

  var ACTIVE_CLASSES = ['active', 'is-active', 'selected', 'is-selected', 'tab-active', 'on'];
  function clickableAncestor(el) {
    var cur = el;
    for (var i = 0; cur && i < 5; i++) {
      var tag = (cur.tagName || '').toLowerCase();
      if (tag === 'button' || tag === 'a') return cur;
      if (cur.getAttribute) {
        var role = cur.getAttribute('role');
        if (role === 'tab' || role === 'button') return cur;
        if (cur.hasAttribute('onclick') || cur.hasAttribute('data-tab')) return cur;
      }
      if (cur.onclick) return cur;
      cur = cur.parentElement;
    }
    return el;
  }
  function hasActiveClass(el) {
    if (!el || !el.classList) return false;
    for (var i = 0; i < ACTIVE_CLASSES.length; i++) {
      if (el.classList.contains(ACTIVE_CLASSES[i])) return true;
    }
    if (el.getAttribute && el.getAttribute('aria-selected') === 'true') return true;
    return false;
  }

  var target = clickableAncestor(entry.el);
  try { target.click(); }
  catch (e) { return noun + ' click failed: ' + label + ' · ' + (e && e.message || e); }

  var deadline = Date.now() + 500;
  while (Date.now() < deadline) {
    if (hasActiveClass(target) || hasActiveClass(entry.el)) {
      return noun + ' activated: ' + label;
    }
    await new Promise(function(r){ setTimeout(r, 40); });
  }
  return noun + ' clicked: ' + label + ' (no active-class observed)';
}

// ── Command registry ──────────────────────────────────────────────────────────
// CMD100.76 — DOM helpers for inline-form replay (Pipeline drawer etc.).
// These look up live form fields by their visible label text rather than
// the iframe-postMessage path the Compass forms use.
function _findFormFieldByLabel(labelText, allowedTags) {
  var want = String(labelText || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!want) return null;
  // Walk every .field wrapper; match its <label> text against the request.
  var fields = document.querySelectorAll('.field');
  for (var i = 0; i < fields.length; i++) {
    var lbl = fields[i].querySelector('label');
    var lblText = '';
    if (lbl) {
      // Extract label text minus required-marker spans (asterisks).
      for (var j = 0; j < lbl.childNodes.length; j++) {
        var n = lbl.childNodes[j];
        if (n.nodeType === 3) lblText += n.nodeValue;
        else if (n.nodeType === 1 && (n.textContent || '').trim() !== '*') lblText += n.textContent;
      }
      lblText = lblText.replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
    if (!lblText) {
      // Fall back to nearest preceding .sec-label sibling (textarea pattern).
      var sib = fields[i].previousElementSibling;
      while (sib) {
        if (sib.classList && sib.classList.contains('sec-label')) {
          lblText = (sib.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
          break;
        }
        sib = sib.previousElementSibling;
      }
    }
    if (lblText !== want) continue;
    // Find a child of allowed tag.
    var children = fields[i].querySelectorAll(allowedTags.join(','));
    if (children.length) return children[0];
  }
  return null;
}

function _findPillGroupBySectionLabel(sectionText) {
  var want = String(sectionText || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!want) return null;
  var groups = document.querySelectorAll('.pill-group');
  for (var i = 0; i < groups.length; i++) {
    // Walk preceding siblings for a .sec-label.
    var sib = groups[i].previousElementSibling;
    while (sib) {
      if (sib.classList && sib.classList.contains('sec-label')) {
        var txt = (sib.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (txt === want) return groups[i];
        break;
      }
      sib = sib.previousElementSibling;
    }
  }
  return null;
}

var COMMANDS = {

  // ── Navigation ──────────────────────────────────────────────────────────────
  // `Set Tab` and `Set SubTab` are thin facades over window.AegisRegistry
  // (CMD91). Pages annotate tab elements with data-cmd-tab / data-cmd-subtab;
  // the registry indexes them and exposes findTab / findSubTab. The verbs
  // here just resolve the entry, click its clickable ancestor, and wait
  // briefly for an activation class change.
  'Set Tab': async function(args) {
    return _aegisActivateTab('tab', args[0]);
  },

  // ── Set SubTab (CMD91 — registry-driven) ────────────────────────────────────
  // Replaces CMD90's heuristic DOM-walking implementation. Looks up the label
  // via window.AegisRegistry.findSubTab; falls back to a diagnostic listing
  // currently-registered subtabs when nothing matches.
  'Set SubTab': async function(args) {
    return _aegisActivateTab('subtab', args[0]);
  },
  'Set View': async function(args){var v=(args[0]||'').toLowerCase().replace(/\.html$/,'');var m={'compass':'/compass.html','cadence':'/cadence.html','dashboard':'/dashboard.html','accord':'/accord.html','aegis':'/aegis.html','pipeline':'/pipeline.html','requests':'/resource-requests.html','resources':'/resources.html','users':'/users.html'};var h=m[v];if(!h)return 'Unknown view: '+args[0];window.location.href=h;return 'navigating to '+h;},

  // ── Register <Module> (CMD100.57) ──────────────────────────────────────────
  // Canonical script-start primitive. Auto-routes the executing session to
  // the named module's main page. Must be the first runnable command in any
  // demo script. Rationale: every recorded transcript needs a deterministic
  // entry point; without one, a script that begins with `Set Tab "..."` fails
  // because no module is loaded yet.
  //
  // Default target is "Dashboard" if no argument supplied. Module names are
  // matched case-insensitively against the same map Set Page uses.
  'Register': async function(args) {
    var name = (args[0] || 'Dashboard').toString();
    var key = name.toLowerCase();
    var pageMap = {
      'dashboard':  '/dashboard.html',
      'compass':    '/compass.html',
      'cadence':    '/cadence.html',
      'pipeline':   '/pipeline.html',
      'aegis':      '/aegis.html',
      'accord':     '/accord.html',
      'requests':   '/resource-requests.html',
      'resources':  '/resources.html',
      'user mgmt':  '/users.html',
      'users':      '/users.html'
    };
    var href = pageMap[key];
    console.log('[cmd:Register]', { args: args, name: name, key: key, href: href, currentLoc: window.location.pathname, aegisMode: !!window._aegisMode });
    if (!href) return 'Register: unknown module "' + name + '"';
    window.location.href = href;
    return 'registered to ' + name + ' (' + href + ')';
  },

  // ── Set Page <Module> (CMD100.57) ──────────────────────────────────────────
  // Human-label alias for `Set View`. The recorder emits Set Page (matches
  // user mental model — "I navigated to Cadence", not "/cadence.html").
  // Same module-name matching as Register; also accepts URL-style
  // identifiers for back-compat.
  'Set Page': async function(args) {
    var name = (args[0] || '').toString();
    var key = name.toLowerCase().replace(/\.html$/, '');
    var pageMap = {
      'dashboard':  '/dashboard.html',
      'compass':    '/compass.html',
      'cadence':    '/cadence.html',
      'pipeline':   '/pipeline.html',
      'aegis':      '/aegis.html',
      'accord':     '/accord.html',
      'requests':   '/resource-requests.html',
      'resources':  '/resources.html',
      'user mgmt':  '/users.html',
      'users':      '/users.html',
      'resource-requests': '/resource-requests.html'
    };
    var href = pageMap[key];
    console.log('[cmd:Set Page]', { args: args, name: name, key: key, href: href, currentLoc: window.location.pathname, aegisMode: !!window._aegisMode });
    if (!href) return 'Set Page: unknown module "' + name + '"';
    window.location.href = href;
    return 'navigating to ' + name + ' (' + href + ')';
  },

  // ── Open Prospect <name> (CMD100.57) ───────────────────────────────────────
  // Pipeline-specific: descend into the prospect detail view by name match.
  // Requires the Pipeline page to be loaded first (use Register Pipeline or
  // Set Page Pipeline). Walks the rendered .p-card elements, matches the
  // .p-card-name text against the supplied argument (case-insensitive,
  // whitespace-collapsed), and clicks the matching card.
  'Open Prospect': async function(args) {
    var target = (args[0] || '').toString().trim().toLowerCase();
    if (!target) return 'Open Prospect: missing prospect name';
    var cards = document.querySelectorAll('.p-card');
    console.log('[cmd:Open Prospect]', { args: args, target: target, cardCount: cards.length, currentLoc: window.location.pathname, aegisMode: !!window._aegisMode });
    if (!cards.length) return 'Open Prospect: no .p-card elements on this page (is Pipeline loaded?)';
    var match = null;
    cards.forEach(function(c) {
      var nameEl = c.querySelector('.p-card-name');
      if (!nameEl) return;
      var name = (nameEl.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (name === target) match = c;
    });
    if (!match) return 'Open Prospect: no card with name "' + args[0] + '"';
    console.log('[cmd:Open Prospect] clicking matched card', match);
    match.click();
    return 'opened prospect "' + args[0] + '"';
  },

  // ── Close Prospect (CMD100.65) ─────────────────────────────────────────────
  // Pipeline-specific: ascend back to the pipeline kanban view from a
  // prospect detail page. Counterpart to Open Prospect.
  'Close Prospect': async function() {
    console.log('[cmd:Close Prospect]', { currentLoc: window.location.pathname, aegisMode: !!window._aegisMode });
    if (typeof window.closeProspect === 'function') {
      window.closeProspect();
    } else {
      window.location.href = '/pipeline.html';
    }
    return 'closed prospect (returned to pipeline)';
  },

  // ── Edit Prospect (CMD100.78) ──────────────────────────────────────────────
  // Pipeline-specific: navigate to /pipeline.html?edit=<id> which auto-opens
  // the drawer in edit mode. The id is resolved from the supplied prospect
  // name by querying the local prospects cache; if not found, falls back to
  // re-resolving via /v_pipeline_summary on the destination page.
  'Edit Prospect': async function(args) {
    var target = (args[0] || '').toString().trim().toLowerCase();
    console.log('[cmd:Edit Prospect]', { args: args, target: target, currentLoc: window.location.pathname });
    if (!target) return 'Edit Prospect: missing prospect name';
    // If on a page that exposes allProspects (Pipeline list), match by name.
    var ap = window.allProspects || [];
    var match = ap.find(function(p){
      return ((p.title || '') + '').replace(/\s+/g,' ').trim().toLowerCase() === target;
    });
    if (match && match.id) {
      window.location.href = '/pipeline.html?edit=' + encodeURIComponent(match.id);
      return 'navigating to edit "' + args[0] + '"';
    }
    // If on prospect-detail itself, just call the local editProspect helper.
    if (typeof window.editProspect === 'function') {
      window.editProspect();
      return 'editing current prospect';
    }
    // Fallback: navigate to pipeline; user picks card again.
    window.location.href = '/pipeline.html';
    return 'Edit Prospect: name not in cache; routed to pipeline';
  },

  // ── Move Prospect (CMD100.80) ──────────────────────────────────────────────
  // Pipeline-specific: change a prospect's stage. Two-arg form:
  //   Move Prospect "<name>" "<stage>"
  // Stage values: prospect | qualifying | discovery | proposal | review | approved
  // Looks up the prospect in window.allProspects, dispatches to the card's
  // drop handler logic by directly PATCHing and re-rendering. Requires the
  // Pipeline page to be loaded (not prospect-detail).
  'Move Prospect': async function(args) {
    var target = (args[0] || '').toString().trim().toLowerCase();
    var newStage = (args[1] || '').toString().trim().toLowerCase();
    console.log('[cmd:Move Prospect]', { target: target, newStage: newStage, currentLoc: window.location.pathname });
    if (!target)   return 'Move Prospect: missing prospect name';
    if (!newStage) return 'Move Prospect: missing destination stage';
    var ap = window.allProspects || [];
    var p = ap.find(function(pp){
      return ((pp.title || '') + '').replace(/\s+/g,' ').trim().toLowerCase() === target;
    });
    if (!p) return 'Move Prospect: no card with name "' + args[0] + '"';
    if (p.stage === newStage) return 'Move Prospect: already in stage "' + newStage + '"';

    var prevStage = p.stage;
    p.stage = newStage;
    if (typeof window.renderBoard === 'function') {
      window.renderBoard(ap);
      if (typeof window.updateStats === 'function') window.updateStats(ap);
    }

    try {
      var payload = { stage: newStage };
      if (typeof window.API?.patch === 'function') {
        await window.API.patch('prospects?id=eq.' + encodeURIComponent(p.id), payload);
      } else if (typeof window.API?.update === 'function') {
        await window.API.update('prospects', p.id, payload);
      } else {
        throw new Error('No PATCH method available on API');
      }
      return 'moved "' + args[0] + '" to ' + newStage;
    } catch (err) {
      // Rollback.
      p.stage = prevStage;
      if (typeof window.renderBoard === 'function') {
        window.renderBoard(ap);
        if (typeof window.updateStats === 'function') window.updateStats(ap);
      }
      return 'Move Prospect failed: ' + (err.message || String(err));
    }
  },

  // ── Switch View (CMD101 / CMD101.5) ────────────────────────────────────────
  // Pipeline-specific: toggle between List and Board sub-views inside
  // pipeline.html. Pure DOM swap (hidden attribute) — no route change, no
  // re-fetch. Re-broadcasts page_ready after the swap settles so any
  // Aegis-side script-runner waiting on settle can proceed.
  //   Switch View "List" | Switch View "Board"
  // Note: Existing scripts using `Switch View "Dashboard"` will no-op after
  // CMD101.5. Re-record affected scripts.
  'Switch View': async function(args) {
    var name = (args[0] || '').toString().trim();
    var key  = name.toLowerCase();
    if (key !== 'list' && key !== 'board') {
      return 'Switch View: unknown view "' + args[0] + '" (expected List|Board)';
    }
    if (typeof window.switchView !== 'function') {
      return 'Switch View: pipeline.html not loaded (window.switchView missing)';
    }
    window.switchView(key);
    // Re-broadcast page_ready so script-runner settle paths advance.
    try {
      if (_mySession && !window._aegisMode) {
        _channelSend({
          type: 'broadcast', event: 'page_ready',
          payload: {
            userId:   _mySession.userId,
            name:     _mySession.name,
            initials: _mySession.initials,
            location: _currentLocation(),
            ts:       Date.now()
          }
        });
      }
    } catch(e) {}
    return 'switched to ' + key;
  },

  // ── Delete Prospect (CMD101) ───────────────────────────────────────────────
  // Script-only verb (no capture rule). Resolves by exact title match against
  // the in-page prospect cache (window.allProspects). Multi-match deletes all;
  // no-match logs a warning and continues without halting the script.
  //   Delete Prospect "<title>"
  'Delete Prospect': async function(args) {
    var title = (args[0] || '').toString();
    console.log('[cmd:Delete Prospect]', { title: title, currentLoc: window.location.pathname });
    if (!title) return 'Delete Prospect: missing prospect title';
    var ap = window.allProspects || [];
    var matches = ap.filter(function(p){ return (p.title || '') === title; });
    if (!matches.length) {
      console.warn('[recorder] Delete Prospect: no match for "' + title + '"');
      return 'Delete Prospect: no match for "' + title + '"';
    }
    var failed = [];
    for (var i = 0; i < matches.length; i++) {
      var p = matches[i];
      try {
        if (typeof window.API?.deleteProspect === 'function') {
          await window.API.deleteProspect(p.id);
        } else if (typeof window.API?.del === 'function') {
          await window.API.del('prospects?id=eq.' + encodeURIComponent(p.id));
        } else {
          failed.push(p.id + ' (no DELETE method on API)');
        }
      } catch (err) {
        failed.push(p.id + ': ' + (err.message || String(err)));
      }
    }
    // Refresh + page_ready broadcast.
    try {
      if (typeof window.loadData === 'function')   await window.loadData();
      if (typeof window.renderAll === 'function')  window.renderAll();
    } catch(e) { console.warn('[cmd:Delete Prospect] refresh failed:', e); }
    try {
      if (_mySession && !window._aegisMode) {
        _channelSend({
          type: 'broadcast', event: 'page_ready',
          payload: {
            userId:   _mySession.userId,
            name:     _mySession.name,
            initials: _mySession.initials,
            location: _currentLocation(),
            ts:       Date.now()
          }
        });
      }
    } catch(e) {}
    if (failed.length) return 'Delete Prospect partial: ' + failed.join('; ');
    return 'deleted ' + matches.length + ' prospect' + (matches.length > 1 ? 's' : '') + ' titled "' + title + '"';
  },

  // ── Toggle Active (CMD101) ─────────────────────────────────────────────────
  // Pipeline-specific: flip a prospect's is_active boolean. Resolution mirrors
  // Delete Prospect — exact title match against window.allProspects. Refresh
  // and re-broadcast page_ready after the PATCH settles.
  //   Toggle Active "<title>"
  'Toggle Active': async function(args) {
    var title = (args[0] || '').toString();
    console.log('[cmd:Toggle Active]', { title: title, currentLoc: window.location.pathname });
    if (!title) return 'Toggle Active: missing prospect title';
    var ap = window.allProspects || [];
    var matches = ap.filter(function(p){ return (p.title || '') === title; });
    if (!matches.length) {
      // Active list filters out inactive rows; for the Mark Active flip we
      // need to find the row directly. Try a one-off lookup by title.
      try {
        if (typeof window.API?.get === 'function') {
          var rows = await window.API.get('prospects?select=id,is_active,title&title=eq.' + encodeURIComponent(title));
          if (rows && rows.length) matches = rows;
        }
      } catch(e) { /* fall through */ }
    }
    if (!matches.length) {
      console.warn('[recorder] Toggle Active: no match for "' + title + '"');
      return 'Toggle Active: no match for "' + title + '"';
    }
    var failed = [];
    for (var i = 0; i < matches.length; i++) {
      var p = matches[i];
      var next = (p.is_active === false);   // flip
      try {
        if (typeof window.API?.setProspectActive === 'function') {
          await window.API.setProspectActive(p.id, next);
        } else if (typeof window.API?.patch === 'function') {
          await window.API.patch('prospects?id=eq.' + encodeURIComponent(p.id), { is_active: next });
        } else {
          failed.push(p.id + ' (no PATCH method on API)');
        }
      } catch (err) {
        failed.push(p.id + ': ' + (err.message || String(err)));
      }
    }
    try {
      if (typeof window.loadData === 'function')   await window.loadData();
      if (typeof window.renderAll === 'function')  window.renderAll();
      // CMD101.5e: prospect-detail page exposes loadAll() instead.
      if (typeof window.loadAll === 'function')    await window.loadAll();
    } catch(e) { console.warn('[cmd:Toggle Active] refresh failed:', e); }
    try {
      if (_mySession && !window._aegisMode) {
        _channelSend({
          type: 'broadcast', event: 'page_ready',
          payload: {
            userId:   _mySession.userId,
            name:     _mySession.name,
            initials: _mySession.initials,
            location: _currentLocation(),
            ts:       Date.now()
          }
        });
      }
    } catch(e) {}
    if (failed.length) return 'Toggle Active partial: ' + failed.join('; ');
    return 'toggled active for "' + title + '"';
  },

  // ── Set NarrateTarget (CMD87b / Brief Aegis Remote Narration) ────────────────
  // Redirects subsequent `Narrate` calls to render on a target Compass session.
  //   Set NarrateTarget               — read current value
  //   Set NarrateTarget Aegis         — clear redirect; render locally (CMD87 default)
  //   Set NarrateTarget <alias>       — render on that session's Compass tab
  // §3-q1 (LOCKED): targeting via this dedicated command, NOT via the `VS:`
  //   prefix. Narrate is a verb that reads naturally as authored; per-line
  //   prefixes would noise up demo scripts. Selector is set once, persists.
  // §3-q2: 'Aegis' is the literal default and the symmetric "go local" value.
  // §3-q9: alias must resolve via _resolveTargetAlias at set time. If the
  //   target isn't online, the set still succeeds — Narrate's runtime path
  //   re-resolves and falls back to local with a warning if offline.
  // §7: not persisted across script runs — _runScript resets to 'Aegis'.
  // Aegis-local (Rule 29): runs unprefixed; registered in _lv and _rl.
  // CMD101.5v: Remove Stakeholder "<name>" — resolves the link by walking
  // the rendered cards on prospect-detail (looking for matching .sh-name
  // text), DELETEs the prospect_contact_links row, refreshes via loadAll().
  // Bypasses the manual confirm() dialog — script runs are non-interactive.
  // CMD101.5x — also cleans up the contact row if no other prospects link
  // to it, keeping the contacts table free of orphans.
  'Remove Stakeholder': async function(args) {
    var name = (args[0] || '').trim();
    if (!name) return 'Remove Stakeholder: missing name argument';
    var want = name.toLowerCase();
    // Find matching .sh-card by visible name.
    var cards = document.querySelectorAll('.sh-card');
    var match = null;
    for (var i = 0; i < cards.length; i++) {
      var n = cards[i].querySelector('.sh-name');
      var txt = (n ? n.textContent : '').trim().toLowerCase();
      if (txt === want) { match = cards[i]; break; }
    }
    if (!match) return 'Remove Stakeholder: no card found for "' + name + '"';
    // The edit ✎ button on the card carries data-sh-id (the link id).
    var editBtn = match.querySelector('[data-sh-id]');
    var linkId  = editBtn && editBtn.dataset ? editBtn.dataset.shId : null;
    if (!linkId) return 'Remove Stakeholder: no link id resolvable for "' + name + '"';
    // Resolve the contact_id by looking up the link row before deleting it.
    var contactId = null;
    try {
      var linkRow = await API.get('prospect_contact_links?select=contact_id&id=eq.' + encodeURIComponent(linkId));
      if (Array.isArray(linkRow) && linkRow[0]) contactId = linkRow[0].contact_id;
    } catch (e) {
      // Non-fatal — proceed without orphan cleanup.
      console.warn('[cmd:Remove Stakeholder] could not resolve contact_id:', e);
    }
    try {
      await API.del('prospect_contact_links?id=eq.' + encodeURIComponent(linkId));
      // Orphan-contact cleanup, same logic as the UI removeStakeholder().
      if (contactId) {
        try {
          var remaining = await API.get(
            'prospect_contact_links?select=id&contact_id=eq.' + encodeURIComponent(contactId)
          );
          if (Array.isArray(remaining) && remaining.length === 0) {
            await API.del('contacts?id=eq.' + encodeURIComponent(contactId));
          }
        } catch (cleanupErr) {
          console.warn('[cmd:Remove Stakeholder] orphan cleanup failed:', cleanupErr);
        }
      }
      if (typeof window.loadAll === 'function') await window.loadAll();
      return 'Removed stakeholder: ' + name;
    } catch (e) {
      return 'Remove Stakeholder: API error — ' + (e.message || String(e));
    }
  },

  'Set NarrateTarget': async function(args) {
    var alias = args[0];
    if (!alias) return 'NarrateTarget = ' + _narrateTarget;
    // §3-q6: if a remote -pause is pending and the target changes, auto-resolve
    // the prior wait so Aegis doesn't strand the script. The synthetic advance
    // matches the prior narrate_id; the target's banner remains visible until
    // its own next narrate.show or until the operator clicks. Acceptable —
    // the remote target's UX is the audience's anyway, not the script's.
    if (_narrateRemoteAdvance) {
      var prev = _narrateRemoteAdvance; _narrateRemoteAdvance = null; prev();
    }
    if (alias === 'Aegis') {
      _narrateTarget = 'Aegis';
      return 'NarrateTarget cleared (local)';
    }
    // Validate alias resolves — fail fast if the script set a wrong name.
    var uid = _resolveTargetAlias(alias);
    if (!uid) return 'NarrateTarget: unknown alias ' + alias;
    _narrateTarget = alias;
    return 'NarrateTarget = ' + alias;
  },

  // ── Forms ───────────────────────────────────────────────────────────────────
  'Form Open': async function(args) {
    var name = args[0];

    // CMD101.5s: page-level form registry. Pages register their drawer
    // open functions on window._pageFormRegistry so script-side `Form Open
    // "<name>"` can dispatch directly without hunting the DOM.
    //   window._pageFormRegistry["Edit Brief"] = function(){ openBriefEditor(); };
    // CMD101.5t: additional args (Form Open "Edit Stakeholder" "Claire Voss")
    // are forwarded to the registered fn as positional arguments.
    var pageReg = window._pageFormRegistry || {};
    var lcWant = String(name || '').toLowerCase();
    var hit = Object.keys(pageReg).find(function(k){ return k.toLowerCase() === lcWant; });
    if (hit && typeof pageReg[hit] === 'function') {
      var extraArgs = args.slice(1);   // drop form-name, pass the rest
      pageReg[hit].apply(null, extraArgs);
      // Brief settle so the drawer's elements are in the DOM before the
      // next Form Insert lands.
      await new Promise(function(r){ setTimeout(r, 80); });
      return 'form opened (page registry): ' + hit;
    }

    // _myrFormDefs may not be populated yet if mw-core.js is still loading.
    // Poll for up to 5s before giving up.
    var defs = window._myrFormDefs || [];
    if (!defs.length) {
      for (var wi = 0; wi < 50; wi++) {
        await new Promise(function(r){ setTimeout(r, 100); });
        defs = window._myrFormDefs || [];
        if (defs.length) break;
      }
    }

    var def = defs.find(function(f){
      return (f.source_name||'').toLowerCase() === name.toLowerCase() ||
             (f.source_name||'').toLowerCase().includes(name.toLowerCase());
    });
    if (def && typeof myrLaunchRequest === 'function') {
      await myrLaunchRequest('form', def.id);
      return 'form opened: ' + def.source_name;
    }

    // CMD100.76: DOM fallback for inline drawer triggers (Pipeline etc.).
    // The Pipeline `+ Add` buttons all open the same Add Prospect drawer;
    // any one will do. For other pages, look for a button matching the form
    // name (e.g. "Add Prospect" → button with text containing "Add").
    var lcName = name.toLowerCase();
    if (lcName.indexOf('add prospect') !== -1 || lcName.indexOf('prospect') !== -1) {
      var addBtn = document.querySelector('.add-card-btn');
      if (addBtn) { addBtn.click(); return 'form opened (inline): ' + name; }
    }
    // Generic fallback: find a button whose text matches the form name.
    var btns = document.querySelectorAll('button');
    for (var bi = 0; bi < btns.length; bi++) {
      var bt = (btns[bi].textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (bt === lcName || bt === '+ ' + lcName || bt === '+' + lcName) {
        btns[bi].click();
        return 'form opened (inline): ' + name;
      }
    }
    return 'Form not found: ' + name + ' (no registered form def, no matching DOM button)';
  },

  'Form Submit': async function(args) {
    var iframe = document.querySelector('#myr-html-form-overlay iframe, #myr-html-form-modal iframe');
    if (iframe) {
      // Existing Compass iframe path.
      var prevInstanceId = window._lastSubmittedInstanceId;
      iframe.contentWindow.postMessage({ source: 'cmd-center', cmd: 'Form Submit' }, '*');
      for (var si = 0; si < 150; si++) {
        await new Promise(function(r){ setTimeout(r, 100); });
        if (window._lastSubmittedInstanceId && window._lastSubmittedInstanceId !== prevInstanceId) break;
        if (_scriptAborted) return 'aborted';
      }
      var newId = window._lastSubmittedInstanceId;
      if (newId && newId !== prevInstanceId) {
        _storeVars['instance_id'] = newId;
        return 'submitted · instance ' + newId;
      }
      return 'submit triggered (instance id not yet available)';
    }
    // CMD101.5x: inline drawer fallback. Require the button to be inside an
    // OPEN overlay/dialog — same scoping fix applied to Form Save.
    var btn = document.querySelector('.overlay.open .btn-primary, [role="dialog"][open] .btn-primary');
    if (!btn) return 'Form Submit: no primary action button found in any open drawer/dialog';
    btn.click();
    return 'submitted (clicked primary action)';
  },

  'Form Insert': async function(args) {
    var field = args[0];
    var value = args[1] !== undefined ? args[1] : '';
    // CMD100.76: try iframe path first (Compass-style forms), then fall
    // through to DOM-find for inline drawer forms (Pipeline etc.).
    var iframe = document.querySelector('#myr-html-form-overlay iframe, #myr-html-form-modal iframe');
    if (iframe) {
      iframe.contentWindow.postMessage({
        source: 'cmd-center', cmd: 'Form Insert', field: field, value: value
      }, '*');
      return 'inserted ' + field + ' = ' + value;
    }
    // DOM fallback.
    var el = _findFormFieldByLabel(field, ['INPUT','TEXTAREA']);
    if (!el) return 'Form Insert: field not found "' + field + '"';
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    return 'inserted "' + field + '" = "' + value + '"';
  },

  // Form Select "field" "value" — for <select> dropdowns.
  // Sets the value AND dispatches a real change event so onchange handlers fire.
  'Form Select': async function(args) {
    var field = args[0];
    var value = args[1] !== undefined ? args[1] : '';
    var iframe = document.querySelector('#myr-html-form-overlay iframe, #myr-html-form-modal iframe');
    if (iframe) {
      iframe.contentWindow.postMessage({
        source: 'cmd-center', cmd: 'Form Select', field: field, value: value
      }, '*');
      return 'selected ' + field + ' = ' + value;
    }
    // CMD100.76: DOM fallback. Two paths:
    // 1. <select> field: find the option whose visible text matches
    //    the value, set selectedIndex, dispatch change.
    // 2. Pill-group field: find the .pill inside the matching .pill-group
    //    whose text matches value, click it.
    var sel = _findFormFieldByLabel(field, ['SELECT']);
    if (sel) {
      var matchIdx = -1;
      for (var i = 0; i < sel.options.length; i++) {
        var optText = (sel.options[i].textContent || '').replace(/\s+/g, ' ').trim();
        if (optText.toLowerCase() === String(value).toLowerCase()) { matchIdx = i; break; }
      }
      if (matchIdx === -1) return 'Form Select: no option "' + value + '" in "' + field + '"';
      sel.selectedIndex = matchIdx;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return 'selected "' + field + '" = "' + value + '"';
    }
    // Try pill-group.
    var pillGroup = _findPillGroupBySectionLabel(field);
    if (pillGroup) {
      var pills = pillGroup.querySelectorAll('.pill');
      for (var pi = 0; pi < pills.length; pi++) {
        var pillText = (pills[pi].textContent || '').replace(/\s+/g, ' ').trim();
        if (pillText.toLowerCase() === String(value).toLowerCase()) {
          pills[pi].click();
          return 'selected pill "' + field + '" = "' + value + '"';
        }
      }
      return 'Form Select: no pill "' + value + '" in "' + field + '"';
    }
    // CMD100.82: hidden-input + trigger pattern (Pipeline assignee picker).
    // If the field resolves to a hidden input AND the page exposes a
    // setAssignee() helper, look up the resource by name in window.pipelineResources.
    var hidden = _findFormFieldByLabel(field, ['INPUT']);
    if (hidden && (hidden.type || '').toLowerCase() === 'hidden' && typeof window.setAssignee === 'function') {
      var roster = window.pipelineResources || [];
      var match = roster.find(function(r){
        var nm = ((r.first_name||'') + ' ' + (r.last_name||'')).trim().toLowerCase();
        return nm === String(value).toLowerCase();
      });
      if (!match) return 'Form Select: no person "' + value + '" in "' + field + '"';
      var fullName = ((match.first_name||'') + ' ' + (match.last_name||'')).trim();
      window.setAssignee(match.id, fullName);
      return 'selected person "' + field + '" = "' + fullName + '"';
    }
    return 'Form Select: field not found "' + field + '"';
  },

  // ── Form Add (CMD100.76) ──────────────────────────────────────────────────
  // Inline-add a new option to a <select> field via the field's "+ Add new …"
  // sentinel option, then select the freshly-inserted value. Used when the
  // recorder consolidated a sentinel-pick + prompt + value-set into a single
  // line (see hud-shell.js _handleFieldCommit sentinel handling).
  //
  // Replay strategy:
  //   1. Find the select by field label.
  //   2. Locate its sentinel option (value matches /^__add_new_.+__$/).
  //   3. Stub window.prompt so the page's existing change-handler picks up
  //      the supplied value as if the user typed it.
  //   4. Set selectedIndex to sentinel and dispatch change — the page does
  //      the API insert and adds the new option.
  //   5. Wait for the new option to appear, then select it.
  // CMD101.5t: Form Slide "<label>" "<value>" — for <input type="range">.
  // Sets the value AND fires real input+change events so any oninput
  // handlers (e.g. value display labels) update.
  // CMD101.5z: Form Attach "<filename>" — recorder-only verb. The OS file
  // picker cannot be driven from script (browser security), so on replay
  // we acknowledge the original attach was authored and move on. The
  // transcript line preserves intent for human review of the script.
  'Form Attach': async function(args) {
    var fname = args[0] || '(unnamed)';
    return 'attach noted (replay cannot re-supply file): ' + fname;
  },

  'Form Slide': async function(args) {
    var field = args[0];
    var value = args[1] !== undefined ? args[1] : '';
    var iframe = document.querySelector('#myr-html-form-overlay iframe, #myr-html-form-modal iframe');
    if (iframe) {
      iframe.contentWindow.postMessage({
        source: 'cmd-center', cmd: 'Form Slide', field: field, value: value
      }, '*');
      return 'slid ' + field + ' = ' + value;
    }
    var el = _findFormFieldByLabel(field, ['INPUT']);
    if (!el) return 'Form Slide: field not found "' + field + '"';
    if (el.type !== 'range') return 'Form Slide: field "' + field + '" is type=' + el.type + ' (expected range)';
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    return 'slid "' + field + '" = "' + value + '"';
  },

  'Form Add': async function(args) {
    var field = args[0];
    var value = args[1] !== undefined ? args[1] : '';
    if (!value) return 'Form Add: missing value for "' + field + '"';

    var sel = _findFormFieldByLabel(field, ['SELECT']);
    if (!sel) return 'Form Add: field not found "' + field + '"';

    // Locate sentinel option.
    var sentinelIdx = -1;
    for (var i = 0; i < sel.options.length; i++) {
      if (/^__add_new_[^_]+__$/.test(sel.options[i].value || '')) {
        sentinelIdx = i; break;
      }
    }
    if (sentinelIdx === -1) return 'Form Add: no sentinel option in "' + field + '"';

    // Stub window.prompt for the duration of the change handler.
    var origPrompt = window.prompt;
    window.prompt = function() { return value; };

    sel.selectedIndex = sentinelIdx;
    sel.dispatchEvent(new Event('change', { bubbles: true }));

    // Restore prompt after a microtask so any synchronous prompt() call
    // inside the change handler has already returned. The async API.post
    // inside the handler runs without prompt access (which is fine).
    Promise.resolve().then(function(){ window.prompt = origPrompt; });

    // Poll up to 5s for the new option to appear and be selected.
    for (var t = 0; t < 50; t++) {
      await new Promise(function(r){ setTimeout(r, 100); });
      // Page handler typically sets sel.value to the new id after insert.
      var current = sel.options[sel.selectedIndex];
      var currentText = current ? (current.textContent || '').replace(/\s+/g, ' ').trim() : '';
      if (currentText.toLowerCase() === String(value).toLowerCase()) {
        return 'added + selected "' + field + '" = "' + value + '"';
      }
    }
    // Restore prompt unconditionally in case the microtask path missed.
    window.prompt = origPrompt;
    return 'Form Add: timed out waiting for "' + value + '" to appear in "' + field + '"';
  },

  'Form AddRow': async function(args) {
    var table = args[0]; // "misc" or "ent"
    var iframe = document.querySelector('#myr-html-form-overlay iframe, #myr-html-form-modal iframe');
    if (!iframe) return 'No form overlay open';
    iframe.contentWindow.postMessage({
      source: 'cmd-center', cmd: 'Form AddRow', field: table
    }, '*');
    return 'added row to ' + table;
  },

  'Form Save': async function(args) {
    var iframe = document.querySelector('#myr-html-form-overlay iframe, #myr-html-form-modal iframe');
    if (iframe) {
      iframe.contentWindow.postMessage({ source: 'cmd-center', cmd: 'Form Save' }, '*');
      return 'draft saved';
    }
    // CMD101.5x: inline drawer fallback. Require the button to be inside an
    // OPEN overlay/dialog — never use an unscoped `.drawer .btn-primary`
    // selector, which matches every drawer's primary button in document
    // order (including ones not currently visible to the user).
    var btn = document.querySelector('.overlay.open .btn-primary, [role="dialog"][open] .btn-primary');
    if (!btn) return 'No form overlay open';
    btn.click();
    // Brief settle so any subsequent script step (or a final dedup-drop log
    // line) doesn't race the save's own DOM mutations.
    await new Promise(function(r){ setTimeout(r, 120); });
    return 'saved (clicked primary action)';
  },

  'Form Close': async function(args) {
    // Remove all possible overlay variants
    ['myr-html-form-modal','myr-html-form-overlay'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });
    // Also remove any lingering backdrop overlays (z-index 9000+)
    document.querySelectorAll('[style*="backdrop-filter"]').forEach(function(el) {
      if (el.style.zIndex >= 9000) el.remove();
    });
    // CMD101.5s: inline drawer fallback — click the open drawer's ✕ button.
    // Covers prospect-detail edit drawers and pipeline.html add/edit drawer.
    var openOverlay = document.querySelector('.overlay.open');
    if (openOverlay) {
      var closeBtn = openOverlay.querySelector('.drawer-close');
      if (closeBtn) { closeBtn.click(); return 'form closed (inline)'; }
      openOverlay.classList.remove('open');
      return 'form closed (inline class)';
    }
    return 'form closed';
  },

  'Continue Draft': async function(args) {
    var drafts = window._myrDrafts || [];
    if (!drafts.length) return 'No drafts found';
    var draft;
    if (args[0]) {
      // Specific id or $variable
      var targetId = args[0].startsWith('$') ? (_storeVars[args[0].slice(1)] || '') : args[0];
      draft = drafts.find(function(d){ return d.id === targetId || d.id.startsWith(targetId); });
      if (!draft) draft = drafts[0]; // fallback to most recent
    } else {
      draft = drafts[0]; // most recent
    }
    if (typeof myrContinueDraft === 'function') {
      // Switch to ACTIVE subtab first so draft is visible
      if (typeof myrSwitchView === 'function') myrSwitchView('active');
      await new Promise(function(r){ setTimeout(r, 500); });
      await myrContinueDraft(draft.form_def_id, draft.id);
      return 'opened draft: ' + draft.id.slice(0,8);
    }
    return 'myrContinueDraft not available';
  },

  'Form Scroll': async function(args) {
    var target = args[0];
    var iframe = document.querySelector('#myr-html-form-overlay iframe, #myr-html-form-modal iframe');
    if (!iframe) return 'No form overlay open';
    iframe.contentWindow.postMessage({
      source: 'cmd-center', cmd: 'Form Scroll', target: target
    }, '*');
    return 'scrolled to ' + target;
  },

  // ── Work queue actions ───────────────────────────────────────────────────────
  'Open Review': async function(args) {
    var title      = args[0];
    var instanceId = args[1] ? (args[1].startsWith('$') ? (_storeVars[args[1].slice(1)] || '') : args[1]) : null;

    var allBtns = Array.from(document.querySelectorAll('.wi-action-btn'));

    // Strategy 1a: match by workflow_request id stored in $wr_id — most precise
    var wrId = _storeVars['wr_id'];
    if (wrId) {
      var wrBtn = document.querySelector('.wi-action-btn[data-wi-id="' + wrId + '"]');
      if (wrBtn) { wrBtn.click(); return 'review opened: wr ' + wrId.slice(0,8); }
    }

    // Strategy 1b: match by instance_id on data-wi-id
    if (instanceId) {
      var btn = document.querySelector('.wi-action-btn[data-wi-id="' + instanceId + '"]') ||
                Array.from(allBtns).find(function(b){
                  return b.dataset.wiId && b.dataset.wiId.startsWith(instanceId.slice(0,8));
                });
      if (btn) { btn.click(); return 'review opened: ' + instanceId.slice(0,8); }
    }

    // Strategy 2: find an Approve button in a row containing the title text
    var approveBtn = allBtns.find(function(b) {
      if (b.textContent.trim() !== 'Approve') return false;
      if (!title) return true;
      var row = b.closest('[data-wi-id], .wi-row, .cmp-row, li, tr');
      return !row || (row.textContent || '').toLowerCase().includes((title||'').toLowerCase());
    });
    if (approveBtn) { approveBtn.click(); return 'review opened: ' + title + ' (Approve btn)'; }

    // Strategy 3: title text match on any button
    var titleBtn = allBtns.find(function(b) {
      var row = b.closest('[data-wi-id], .wi-row, .cmp-row, li, tr');
      return row && (row.textContent || '').toLowerCase().includes((title||'').toLowerCase());
    });
    if (titleBtn) { titleBtn.click(); return 'review opened: ' + title; }

    // Strategy 4: first Approve button — last resort
    var firstApprove = allBtns.find(function(b){ return b.textContent.trim() === 'Approve'; });
    if (firstApprove) { firstApprove.click(); return 'review opened: first Approve'; }

    return 'Review panel not found for: ' + (title || 'request');
  },

  'Click': async function(args) {
    var target = args[0];
    var scope  = args[1];

    if (target === 'Approve') {
      // First try the review panel approve button (already open)
      var rrpBtn = document.getElementById('rrp-approve-btn');
      if (rrpBtn) { rrpBtn.click(); return 'approve clicked'; }
      // Try _myActiveRequestId — precise button targeting without DOM scanning
      var instanceId = _storeVars['instance_id'];
      var activeReqId = instanceId && window._myActiveRequestId
        ? window._myActiveRequestId[instanceId] : null;
      if (activeReqId) {
        var preciseBtn = document.querySelector('.wi-action-btn[data-wi-id="' + activeReqId + '"]');
        if (preciseBtn) { preciseBtn.click(); return 'approve clicked (precise: ' + activeReqId.slice(0,8) + ')'; }
      }
      // Fall back: find Approve button by text
      var queueBtn = Array.from(document.querySelectorAll('.wi-action-btn, button'))
        .find(function(b){ return b.textContent.trim() === 'Approve'; });
      if (queueBtn) { queueBtn.click(); return 'approve clicked (queue)'; }
      return 'Approve button not found — is review panel open?';
    }

    if (target === 'Review') {
      // Try _myActiveRequestId first — set by mw-tabs.js when request is for current user
      var instanceId = _storeVars['instance_id'];
      var activeReqId = instanceId && window._myActiveRequestId
        ? window._myActiveRequestId[instanceId] : null;
      if (activeReqId) {
        var preciseBtn = document.querySelector('.wi-action-btn[data-wi-id="' + activeReqId + '"]');
        if (preciseBtn) { preciseBtn.click(); return 'review clicked (precise: ' + activeReqId.slice(0,8) + ')'; }
      }
      // Fall back: scope arg as explicit wi-id
      if (scope) {
        var scopeBtn = document.querySelector('.wi-action-btn[data-wi-id="' + scope + '"]');
        if (scopeBtn) { scopeBtn.click(); return 'review clicked (scoped)'; }
      }
      // Fall back: find Review button by text
      var wiBtn = Array.from(document.querySelectorAll('button'))
        .find(function(b){ return b.textContent.trim() === 'Review'; });
      if (wiBtn) { wiBtn.click(); return 'review clicked'; }
      return 'Review button not found';
    }

    if (target === 'Request Changes') {
      var rejBtn = document.getElementById('rrp-reject-btn');
      if (rejBtn) { rejBtn.click(); return 'request changes clicked'; }
      return 'Request Changes button not found';
    }

    if (target === 'Resume') {
      var resumeBtn = document.querySelector('[onclick*="myrResumeInstance"]');
      if (resumeBtn) { resumeBtn.click(); return 'resume clicked'; }
      return 'Resume button not found';
    }

    // Generic button search by text
    var genericBtn = Array.from(document.querySelectorAll('button'))
      .find(function(b){ return b.textContent.trim() === target; });
    if (genericBtn) { genericBtn.click(); return 'clicked: ' + target; }

    return 'Unknown click target: ' + target;
  },

  // ── Click ForInstance (B-UI-3 / CMD66) ───────────────────────────────────────
  // Click ForInstance <$var|uuid> "<button_label>" [timeout=<ms>]
  //
  // Instance-scoped click. Resolves the queue row for the given instance_id
  // via window._myActiveRequestId (instance_id → workflow_request_id), then
  // scopes to the row containing [data-wi-id="<wrid>"] and clicks the button
  // whose textContent matches <button_label>. Remedies Rule 30 — DOM-first
  // action commands on lists are unsafe without explicit addressability.
  //
  // Default timeout: 0 (no polling). Typical caller precedes with
  // Wait ForQueueRow $instance_id to <alias>, so the row is already present.
  'Click ForInstance': async function(args) {
    if (!args[0] || !args[1]) {
      throw new Error('Click ForInstance: usage: Click ForInstance <$var|uuid> "<button_label>" [timeout=<ms>]');
    }
    var raw = args[0];
    var instanceId = raw.startsWith('$') ? (_storeVars[raw.slice(1)] || '') : raw;
    if (!instanceId) {
      throw new Error('Click ForInstance: no instance id (variable ' + raw + ' is empty)');
    }
    var label = args[1];
    var timeoutMs = 0;
    for (var i = 2; i < args.length; i++) {
      var tm = String(args[i]).match(/^timeout=(\d+)$/);
      if (tm) { timeoutMs = parseInt(tm[1], 10); continue; }
    }
    var idShown = String(instanceId).slice(0, 8);

    // Resolve instance → workflow_request_id → row. _myActiveRequestId is
    // populated by mw-tabs.js when a request routes to the current user
    // (the same mapping the existing Click "Review" uses for precise
    // targeting). Poll for up to timeoutMs if not yet present.
    var started = Date.now();
    var row = null;
    var wrid = null;
    while (true) {
      wrid = (window._myActiveRequestId && window._myActiveRequestId[instanceId]) || null;
      if (wrid) {
        var anchor = document.querySelector('[data-wi-id="' + wrid + '"]');
        if (anchor) {
          // Ascend to nearest row container for scoping. Covers <tr>, ARIA
          // rows, and common list-row class names. Falls back to anchor
          // element itself if no container found.
          row = anchor.closest('tr, [role="row"], .wi-row, .queue-row, li') || anchor.parentElement || anchor;
          if (row) break;
        }
      }
      if (timeoutMs <= 0 || (Date.now() - started) >= timeoutMs) break;
      await new Promise(function(r){ setTimeout(r, 100); });
      if (_scriptAborted) return 'aborted';
    }

    if (!row) {
      throw new Error('Click ForInstance: no row for instance ' + idShown +
        ' (check Wait ForQueueRow resolved before click, or queue was cleared between wait and click)');
    }

    // Find button in row by text (case-insensitive trim match)
    var wanted = String(label).trim().toLowerCase();
    var candidates = Array.from(row.querySelectorAll('button, [role="button"]'));
    var btn = candidates.find(function(b){
      return (b.textContent || '').trim().toLowerCase() === wanted;
    });

    if (!btn) {
      var available = candidates
        .map(function(b){ return (b.textContent || '').trim(); })
        .filter(function(t){ return t.length > 0; });
      var avail = available.length ? ' (available: ' + available.join(', ') + ')' : '';
      throw new Error('Click ForInstance: found row for instance ' + idShown +
        ' but no "' + label + '" button' + avail);
    }

    btn.click();
    return 'Click ForInstance: ' + label + ' · ' + idShown;
  },

  // ── Wait ─────────────────────────────────────────────────────────────────────
  'Wait': async function(args) {
    var val = args[0];
    if (String(val).match(/^\d+$/)) {
      // Break wait into 100ms chunks so abort is responsive
      var total = parseInt(val);
      var elapsed = 0;
      while (elapsed < total) {
        if (_scriptAborted) return 'aborted';
        var chunk = Math.min(100, total - elapsed);
        await new Promise(function(r){ setTimeout(r, chunk); });
        elapsed += chunk;
      }
      return 'waited ' + val + 'ms';
    }
    if (val === 'ForEvent') {
      // Syntax variants:
      //   Wait ForEvent "workflow_request.created"
      //   Wait ForEvent "workflow_request.created" → $instance_id
      //   Wait ForEvent "workflow_request.resolved" where assignee=AK
      var eventName = args[1];
      var filterKey = null, filterVal = null, storeAs = null;

      // Parse remaining tokens for "where key=val" and "→ $varname"
      for (var wi = 2; wi < args.length; wi++) {
        var tok = args[wi];
        if (tok === 'where' && args[wi+1]) {
          var wm = args[wi+1].match(/^(\w+)=(.+)$/);
          if (wm) { filterKey = wm[1]; filterVal = wm[2]; wi++; }
        } else if ((tok === '→' || tok === '->') && args[wi+1]) {
          storeAs = args[wi+1].replace(/^\$/, ''); wi++;
        }
      }

      // If filtering by assignee alias, resolve to userId so we can match
      var filterUserId = null;
      if (filterKey === 'assignee' && filterVal) {
        filterUserId = _resolveTargetAlias(filterVal.toUpperCase()) || filterVal;
      }

      // Wait for a matching event, retrying non-matching ones
      var data = await _waitForEventFiltered(eventName, filterKey, filterUserId || filterVal, 60000);

      // Store captured value if requested (e.g. → $instance_id)
      if (storeAs && data) {
        var captured = data.instanceId || data.instance_id || data.id || '';
        if (captured) {
          _storeVars[storeAs] = captured;
          _appendLine('SYS', 'result', '→ stored $' + storeAs + ' = ' + captured);
        }
      }

      return 'event received: ' + eventName
        + (filterKey ? ' [' + filterKey + '=' + filterVal + ']' : '')
        + (data && data.instanceId ? ' · instance ' + data.instanceId : '');
    }
    return 'unknown Wait argument: ' + val;
  },

  // ── Typed Wait commands (B2 / CMD63) ────────────────────────────────────────
  // Thin typed wrappers over _waitForEventFiltered. They exist for script
  // readability; filter/buffer/timeout semantics are inherited unchanged.
  // Rules honored: 15 (Aegis self-echo exempt, via _waitForEventFiltered),
  // 20 (listeners receive inner payload), 22 (buffer scan precedes forward
  // queue), 23 (outbound emit queue — N/A here; these are receive-side),
  // 25 (event_id dedup — N/A; dedup fires before fan-out, we see the single
  // already-deduped inner payload). These commands never dispatch remotely;
  // they always run locally on the tab authoring the script (typically Aegis).

  // Wait ForLocation <alias> "<location>" [timeout=<ms>]
  'Wait ForLocation': async function(args) {
    var alias = args[0];
    var location = args[1];
    if (!alias || !location) throw new Error('Wait ForLocation: usage: Wait ForLocation <alias> "<location>" [timeout=<ms>]');
    var timeoutMs = 30000;
    for (var i = 2; i < args.length; i++) {
      var tm = String(args[i]).match(/^timeout=(\d+)$/);
      if (tm) timeoutMs = parseInt(tm[1], 10);
    }
    var uid = _resolveTargetAlias(String(alias).toUpperCase());
    if (!uid) throw new Error("Wait ForLocation: unknown alias '" + alias + "'");
    var sess = _sessions[uid];
    var resourceId = sess && sess.resourceId;
    // location.ready payload carries resource_id; fall back to userId for legacy emits.
    var filterVal = resourceId || uid;
    var filterKey = resourceId ? 'resource_id' : 'userId';
    var data = await _waitForEventFiltered('location.ready', filterKey, filterVal, timeoutMs);
    var loc = (data && (data.location || data.page)) || location;
    return 'location.ready received: ' + alias + ' @ ' + loc;
  },

  // Wait ForInstance <$var|uuid> [for <state>] [timeout=<ms>]
  // Accepted states: launched, completed, blocked. Default: launched.
  'Wait ForInstance': async function(args) {
    if (!args[0]) throw new Error('Wait ForInstance: usage: Wait ForInstance <$var|uuid> [for <state>] [timeout=<ms>]');
    var raw = args[0];
    var instanceId = raw.startsWith('$') ? (_storeVars[raw.slice(1)] || '') : raw;
    if (!instanceId) throw new Error('Wait ForInstance: no instance id (variable ' + raw + ' is empty)');
    var state = 'launched';
    var timeoutMs = 60000;
    for (var i = 1; i < args.length; i++) {
      if (args[i] === 'for' && args[i+1]) { state = String(args[i+1]).toLowerCase(); i++; continue; }
      var tm = String(args[i]).match(/^timeout=(\d+)$/);
      if (tm) { timeoutMs = parseInt(tm[1], 10); continue; }
    }
    var stateMap = { launched: 'instance.launched', completed: 'instance.completed', blocked: 'instance.blocked' };
    var eventName = stateMap[state];
    if (!eventName) throw new Error("Wait ForInstance: unknown state '" + state + "' (expected launched|completed|blocked)");
    var data = await _waitForEventFiltered(eventName, 'instance_id', instanceId, timeoutMs);
    var idShown = String(instanceId).slice(0, 8);
    return 'instance.' + state + ': ' + idShown;
  },

  // Wait ForRoute <$var|uuid> to <alias> [timeout=<ms>]
  'Wait ForRoute': async function(args) {
    if (!args[0]) throw new Error('Wait ForRoute: usage: Wait ForRoute <$var|uuid> to <alias> [timeout=<ms>]');
    var raw = args[0];
    var instanceId = raw.startsWith('$') ? (_storeVars[raw.slice(1)] || '') : raw;
    if (!instanceId) throw new Error('Wait ForRoute: no instance id (variable ' + raw + ' is empty)');
    // Expect: "to" <alias>
    var toIdx = args.indexOf('to');
    if (toIdx < 0 || !args[toIdx+1]) throw new Error('Wait ForRoute: missing "to <alias>"');
    var alias = args[toIdx+1];
    var timeoutMs = 30000;
    for (var i = toIdx+2; i < args.length; i++) {
      var tm = String(args[i]).match(/^timeout=(\d+)$/);
      if (tm) timeoutMs = parseInt(tm[1], 10);
    }
    var uid = _resolveTargetAlias(String(alias).toUpperCase());
    if (!uid) throw new Error("Wait ForRoute: unknown alias '" + alias + "'");
    var sess = _sessions[uid];
    // Presence payloads don't carry resource_id; resolve via DB on first use,
    // cache thereafter. Falls through cleanly if the alias is live but the
    // resource row hasn't been provisioned yet.
    var resourceId = (sess && sess.resourceId) || await _resolveResourceIdForUserId(uid);
    if (!resourceId) throw new Error("Wait ForRoute: could not resolve resource_id for alias '" + alias + "' (userId " + uid.slice(0,8) + ")");
    var data = await _waitForRoute(instanceId, resourceId, timeoutMs);
    var seq = (data && (data.step_seq || data.sequence_order));
    return 'workflow_request.created → ' + alias + (seq ? ' (step ' + seq + ')' : '');
  },

  // Wait ForForm "<form_name>" [timeout=<ms>]
  'Wait ForForm': async function(args) {
    var formName = args[0];
    if (!formName) throw new Error('Wait ForForm: usage: Wait ForForm "<form_name>" [timeout=<ms>]');
    var timeoutMs = 10000;
    for (var i = 1; i < args.length; i++) {
      var tm = String(args[i]).match(/^timeout=(\d+)$/);
      if (tm) timeoutMs = parseInt(tm[1], 10);
    }
    await _waitForEventFiltered('form.opened', 'form_name', formName, timeoutMs);
    return 'form.opened: ' + formName;
  },

  // Wait ForQueueRow <$var|uuid> [to <alias>] [timeout=<ms>]
  // Consumes work_queue.rendered (B-UI-1). Structurally identical to
  // Wait ForRoute: single-field match on instance_id, or compound match
  // with assignee_resource_id when "to <alias>" is supplied.
  'Wait ForQueueRow': async function(args) {
    if (!args[0]) throw new Error('Wait ForQueueRow: usage: Wait ForQueueRow <$var|uuid> [to <alias>] [timeout=<ms>]');
    var raw = args[0];
    var instanceId = raw.startsWith('$') ? (_storeVars[raw.slice(1)] || '') : raw;
    if (!instanceId) throw new Error('Wait ForQueueRow: no instance id (variable ' + raw + ' is empty)');
    var toIdx = args.indexOf('to');
    var alias = null;
    var resourceId = null;
    var tailStart = 1;
    if (toIdx >= 0) {
      if (!args[toIdx+1]) throw new Error('Wait ForQueueRow: missing alias after "to"');
      alias = args[toIdx+1];
      tailStart = toIdx + 2;
    }
    var timeoutMs = 15000;
    for (var i = tailStart; i < args.length; i++) {
      var tm = String(args[i]).match(/^timeout=(\d+)$/);
      if (tm) timeoutMs = parseInt(tm[1], 10);
    }
    if (alias) {
      var uid = _resolveTargetAlias(String(alias).toUpperCase());
      if (!uid) throw new Error("Wait ForQueueRow: unknown alias '" + alias + "'");
      var sess = _sessions[uid];
      resourceId = (sess && sess.resourceId) || await _resolveResourceIdForUserId(uid);
      if (!resourceId) throw new Error("Wait ForQueueRow: could not resolve resource_id for alias '" + alias + "' (userId " + uid.slice(0,8) + ")");
    }
    var data = await _waitForQueueRow(instanceId, resourceId, timeoutMs);
    var seq = (data && data.seq);
    if (alias) {
      return 'work_queue.rendered → ' + alias + (seq != null ? ' (step ' + seq + ')' : '');
    }
    return 'work_queue.rendered: ' + instanceId.slice(0,8) + (seq != null ? ' (step ' + seq + ')' : '');
  },

  // Wait ForModal "<modal_name>" [for <role>] [timeout=<ms>]
  // Consumes modal.opened (B-UI-4). Single-field match on modal_name, or
  // compound match with role when "for <role>" is supplied. Role values:
  // reviewer | approver | submitter_resubmit. Mirrors Wait ForQueueRow's
  // optional-modifier shape.
  'Wait ForModal': async function(args) {
    var modalName = args[0];
    if (!modalName) throw new Error('Wait ForModal: usage: Wait ForModal "<modal_name>" [for <role>] [timeout=<ms>]');
    var forIdx = args.indexOf('for');
    var role = null;
    var tailStart = 1;
    if (forIdx >= 0) {
      if (!args[forIdx+1]) throw new Error('Wait ForModal: missing role after "for"');
      role = String(args[forIdx+1]);
      var validRoles = ['reviewer','approver','submitter_resubmit'];
      if (validRoles.indexOf(role) < 0) throw new Error("Wait ForModal: unknown role '" + role + "' (expected reviewer|approver|submitter_resubmit)");
      tailStart = forIdx + 2;
    }
    var timeoutMs = 10000;
    for (var i = tailStart; i < args.length; i++) {
      var tm = String(args[i]).match(/^timeout=(\d+)$/);
      if (tm) timeoutMs = parseInt(tm[1], 10);
    }
    await _waitForModal(modalName, role, timeoutMs);
    if (role) {
      return 'modal.opened: ' + modalName + ' (' + role + ')';
    }
    return 'modal.opened: ' + modalName;
  },

  // ── Wait ForConsole (CMD-AEGIS-VERIFICATION-PATTERN) ─────────────────────────
  // Hooks console.log; captures the second argument from the first call whose
  // first string argument starts with <prefix>. Stores the captured value
  // (JSON-serialized when object) into $varname, then restores console.log.
  // Intended companion to surface modules that emit structured-prefix telemetry
  // (e.g., '[Accord-minutes] meeting selected:' from CMD-MINUTES-TEST-INFRA-1).
  // Only one Wait ForConsole runs at a time per script; concurrent invocation
  // throws (per Iron Rule 60 first-caller hazard awareness — re-entrancy on
  // the global console hook would corrupt capture state).
  //
  // Usage: Wait ForConsole "<prefix>" → $varname [timeout=<ms>]
  'Wait ForConsole': async function(args) {
    var prefix = args[0];
    if (!prefix) throw new Error('Wait ForConsole: usage: Wait ForConsole "<prefix>" → $varname [timeout=<ms>]');
    var storeAs = null;
    var timeoutMs = 30000;
    for (var pi = 1; pi < args.length; pi++) {
      if ((args[pi] === '→' || args[pi] === '->') && args[pi+1]) {
        storeAs = args[pi+1].replace(/^\$/, ''); pi++;
      } else {
        var tm = String(args[pi]).match(/^timeout=(\d+)$/);
        if (tm) timeoutMs = parseInt(tm[1], 10);
      }
    }
    if (!storeAs) throw new Error('Wait ForConsole: missing → $varname');
    if (window.__aegisConsoleHookActive) {
      throw new Error('Wait ForConsole: another capture already active in this script run');
    }
    var originalLog = console.log;
    var captured = null;
    var capturedSentinel = false;
    window.__aegisConsoleHookActive = true;
    console.log = function() {
      var a = arguments;
      if (!capturedSentinel && a.length >= 1 && typeof a[0] === 'string' && a[0].indexOf(prefix) === 0) {
        captured = a.length >= 2 ? a[1] : null;
        capturedSentinel = true;
      }
      return originalLog.apply(console, a);
    };
    var deadline = Date.now() + timeoutMs;
    try {
      while (Date.now() < deadline) {
        if (_scriptAborted) return 'aborted';
        if (capturedSentinel) break;
        await new Promise(function(r){ setTimeout(r, 100); });
      }
    } finally {
      console.log = originalLog;
      window.__aegisConsoleHookActive = false;
    }
    if (!capturedSentinel) {
      throw new Error('Wait ForConsole timeout: no console.log starting with "' + prefix + '" within ' + (timeoutMs/1000) + 's');
    }
    var storedValue = (captured !== null && typeof captured === 'object')
      ? JSON.stringify(captured)
      : (captured === null ? '' : String(captured));
    _storeVars[storeAs] = storedValue;
    var preview = storedValue.length > 80 ? storedValue.substring(0, 80) + '…' : storedValue;
    _appendLine('SYS', 'result', '→ stored $' + storeAs + ' = ' + preview);
    return preview;
  },

  // ── Storage ──────────────────────────────────────────────────────────────────
  'Store': async function(args) {
    var key = args[0];
    // Special value: "now" stores current ISO timestamp
    if (args[1] === 'now' || (!args[1] && key === 'now')) {
      var ts = new Date().toISOString();
      _storeVars[key] = ts;
      return 'stored ' + key + ' = ' + ts;
    }
    var val = args[1] !== undefined ? args[1] : (_storeVars['_lastResult'] || '');
    _storeVars[key] = val;
    return 'stored ' + key + ' = ' + val;
  },

  'Get': async function(args) {
    var key = args.join(' '); // support multi-word keys like "Draft id"
    // Draft id — most recently saved draft
    if (key === 'Draft id' || key === 'draft_id') {
      var drafts = window._myrDrafts || [];
      var id = drafts.length ? drafts[0].id : null;
      _storeVars['draft_id'] = id;
      return id || 'no draft found';
    }
    // Active instance id
    if (key === 'Active instance_id' || key === 'instance_id') {
      var inst = (window._myrInstances||[]).find(function(i){ return i.status === 'in_progress'; });
      var id = inst ? inst.id : null;
      _storeVars['instance_id'] = id;
      return id || 'no active instance found';
    }
    // Latest submitted instance — set locally by mw-tabs.js at submit time
    // OR captured from a remote target's Form Submit ack (see dispatch loop).
    // Prefer the local window global if set (freshest), then fall back to
    // whatever was already stashed in _storeVars (remote ack), then null.
    if (key === 'Latest instance_id' || key === 'submitted instance_id') {
      var id = window._lastSubmittedInstanceId || _storeVars['instance_id'] || null;
      if (id) _storeVars['instance_id'] = id;
      return id || 'no submitted instance found';
    }
    // Get Request id — fetch the open workflow_request id for $instance_id assigned to an alias
    // Usage: Get Request id for AK → $wr_id
    // Stores result in $wr_id (or specified variable)
    if (key.startsWith('Request id')) {
      var forAlias = null, storeAs = 'wr_id';
      // Parse "Request id for AK → $wr_id"
      var forMatch = key.match(/for\s+(\S+)/i);
      if (forMatch) forAlias = forMatch[1].toUpperCase();
      var arrowMatch = key.match(/→\s*\$?(\w+)/);
      if (arrowMatch) storeAs = arrowMatch[1];

      var instanceId = _storeVars['instance_id'] || '';
      if (!instanceId) return 'no $instance_id stored — run DB Poll first';

      // Resolve alias to userId
      var targetUid = forAlias ? _resolveTargetAlias(forAlias) : null;
      var targetSess = targetUid ? _sessions[targetUid] : null;

      // Query workflow_requests for this instance — open, approver or reviewer role
      var url = SUPA_URL + '/rest/v1/workflow_requests'
        + '?select=id,role,status,resource_id'
        + '&instance_id=eq.' + instanceId
        + '&status=eq.open'
        + '&limit=10';

      try {
        var resp = await fetch(url, {
          headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }
        });
        var rows = await resp.json();
        if (!rows || !rows.length) return 'no open workflow_requests for instance ' + instanceId.slice(0,8);

        // If we have a target alias, find the row assigned to their resource
        var match = rows[0]; // default to first
        if (targetSess && targetSess.resourceId) {
          var byResource = rows.find(function(r){ return r.resource_id === targetSess.resourceId; });
          if (byResource) match = byResource;
        }

        _storeVars[storeAs] = match.id;
        _appendLine('SYS', 'result', '→ stored $' + storeAs + ' = ' + match.id + ' (role: ' + match.role + ')');
        return match.id;
      } catch(e) {
        return 'DB error: ' + e.message;
      }
    }
    return 'variable not found: ' + key;
  },

  // ── Assertions ───────────────────────────────────────────────────────────────
  'Assert': async function(args) {
    var key   = args[0];
    var value = args[1];

    // Assert session VS is connected
    if (key === 'session') {
      var alias     = args[1];
      // args[2] should be "is", args[3] should be "connected"
      var uid = _resolveTargetAlias(alias);
      var sess = uid ? _sessions[uid] : null;
      var live = sess && sess.online;
      if (live) return '✓ PASS: session ' + alias + ' connected (' + sess.name + ')';
      throw new Error('✗ FAIL: session ' + alias + ' not connected — open a Compass window logged in as ' + alias + ' and try again');
    }

    // Assert instance_status "in_progress"
    if (key === 'instance_status') {
      var inst = (window._myrInstances||[]).find(function(i){
        return i.id === _storeVars['instance_id'];
      });
      var actual = inst ? inst.status : 'not found';
      if (actual === value) return '✓ PASS: instance status = ' + value;
      throw new Error('✗ FAIL: expected status = ' + value + ' but got ' + actual);
    }

    var actual = await COMMANDS['Get']([key]);
    if (actual === value) return '✓ PASS: ' + key + ' = ' + value;
    throw new Error('✗ FAIL: expected ' + key + ' = ' + value + ' but got ' + actual);
  },

  // ── Script composition ───────────────────────────────────────────────────────
  'Run': async function(args) {
    var scriptName = args[0];
    var script = _scripts[scriptName];
    if (!script) return 'Script not found: ' + scriptName;
    // CMD-AEGIS-PLAYBOOK-FOUNDATION: resolve playbook_id (if any) for run-history capture.
    var pbId = _playbookByName[scriptName] || null;
    await _runScript(script, scriptName, pbId);
    return 'script complete: ' + scriptName;
  },

  // ── DB queries ───────────────────────────────────────────────────────────────
  'DB Get': async function(args) {
    var table  = args[0];
    var filter = args[1]; // e.g. "status=in_progress"
    var url    = SUPA_URL + '/rest/v1/' + table + '?select=*&limit=5';
    if (filter) url += '&' + filter.replace(/=/g, '.eq.').replace(/ /g, '_');
    var resp = await fetch(url, {
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }
    });
    var data = await resp.json();
    return JSON.stringify(data).slice(0, 200);
  },

  // DB Poll table filter=field.eq.value → $varname  [timeout=30000]
  // Polls Supabase every 2s until a matching row appears, then stores its id.
  // Example: DB Poll workflow_instances submitted_by_resource_id=eq.$myResId → $instance_id
  // Example: DB Poll workflow_instances status=eq.in_progress → $instance_id
  'DB Poll': async function(args) {
    var table    = args[0];
    var filter   = args[1] || '';
    var storeAs  = null;
    var timeoutMs = 30000;

    // Parse → $varname and optional timeout= from remaining args
    for (var pi = 2; pi < args.length; pi++) {
      if ((args[pi] === '→' || args[pi] === '->') && args[pi+1]) {
        storeAs = args[pi+1].replace(/^\$/, ''); pi++;
      } else if (args[pi].startsWith('timeout=')) {
        timeoutMs = parseInt(args[pi].split('=')[1]) || timeoutMs;
      }
    }

    // Resolve $variables in filter, URL-encoding values that contain special chars
    filter = filter.replace(/\$(\w+)/g, function(_, k) {
      var val = _storeVars[k] || '';
      // URL-encode values containing colons, plus, spaces (timestamps etc.)
      return val.match(/[: +]/) ? encodeURIComponent(val) : val;
    });

    var url = SUPA_URL + '/rest/v1/' + table + '?select=id,status,title,created_at&order=created_at.desc&limit=1';
    if (filter) url += '&' + filter;
    _appendLine('SYS', 'sys', 'DB Poll: ' + url.replace(SUPA_URL, ''));

    var deadline = Date.now() + timeoutMs;
    var found = null;
    while (Date.now() < deadline) {
      if (_scriptAborted) return 'aborted';
      try {
        var resp = await fetch(url, {
          headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }
        });
        var rows = await resp.json();
        if (rows && rows.length && rows[0].id) {
          found = rows[0];
          break;
        }
      } catch(e) {}
      await new Promise(function(r){ setTimeout(r, 2000); });
    }

    if (!found) throw new Error('DB Poll timeout: no matching row in ' + table + ' after ' + (timeoutMs/1000) + 's');

    if (storeAs) {
      _storeVars[storeAs] = found.id;
      _appendLine('SYS', 'result', '→ stored $' + storeAs + ' = ' + found.id);
    }
    return 'found: ' + found.id + (found.title ? ' · ' + found.title : '') + (found.status ? ' · ' + found.status : '');
  },

  // ── UI helpers ───────────────────────────────────────────────────────────────
  'Reload': async function(args) {
    if (typeof loadUserRequests === 'function') { await loadUserRequests(); return 'requests reloaded'; }
    return 'loadUserRequests not available';
  },

  'Log': async function(args) {
    return args.join(' ');
  },

  // ── Pause ─────────────────────────────────────────────────────────────────────
  // Suspends script execution until operator hits Enter in the command bar.
  // Puts the input into "resume mode" with a visual prompt.
  'Pause': async function(args) {
    var msg = args.join(' ') || 'paused — press Enter to continue';
    _appendLine('SYS', 'warn', '⏸  ' + msg);
    var _pauseStart = Date.now();
    // Put command input into resume mode
    var p = _panelEl;
    var input = p && p.querySelector('#phr-cmd');
    var pill  = p && p.querySelector('#phr-target-pill');
    if (input) {
      input.placeholder = 'Press Enter to resume ▶';
      input.style.color = '#EF9F27';
      if (pill) { pill.textContent = '⏸'; pill.style.color = '#EF9F27'; }
      input.focus();
    }
    // Block until _pauseResolve is called (by Enter in the command bar)
    await new Promise(function(resolve) {
      _pauseResolve = resolve;
    });
    // Restore input
    if (input) {
      input.placeholder = 'Enter command…';
      input.style.color = '#fff';
      if (pill) {
        var label = _cmdTarget === 'ALL' ? 'ALL' : (_sessions[_cmdTarget] ? (_sessions[_cmdTarget].alias || _sessions[_cmdTarget].initials) : 'ALL');
        pill.textContent = label + ' ▾';
        pill.style.color = _cmdTarget === 'ALL' ? '#00c9c9' : _sessionColor(_cmdTarget);
      }
    }
    var _elapsedMs = Date.now() - _pauseStart;
    var _elapsedStr = _elapsedMs >= 1000
      ? (_elapsedMs / 1000).toFixed(1) + 's'
      : _elapsedMs + 'ms';
    _appendLine('SYS', 'result', '▶ resumed after ' + _elapsedStr);
    return 'resumed after ' + _elapsedStr;
  },

  // ── Narrate (CMD89 / Brief CMD89 spotlight presentation layer) ───────────────
  // Replaces the CMD87/CMD88 yellow banner with a cinematic spotlight + caption
  // surface. Aegis is operator-facing only (no overlay). Compass renders the
  // dim+hole spotlight and the caption card per §2 spec.
  //   Narrate "<msg>"                              — caption only, bottom-center
  //   Narrate "<msg>" -pause                       — caption + advance affordance, blocks
  //   Narrate "<msg>" -spotlight "<selector>"      — spotlight + caption, blocks
  //   Narrate "<msg>" -spotlight "<sel>" -timeout N — spotlight + caption, auto-advances after N ms
  // §3 precedence: -timeout wins over default-pause. -pause is preserved for
  //   backward compatibility but redundant when -spotlight is present.
  // §3 selector match-none: caption appears at bottom-center, no dim/spotlight.
  // §3 selector matches multiple: spotlight the FIRST (querySelector).
  // §5 preservation: emits 'narration.shown' on local path; 'narrate.show' /
  //   'narrate.advance' / 'narrate.cleared' on remote path. Replace-on-new-show
  //   auto-advances the prior pending -pause.
  // Aegis-local (Rule 29): runs unprefixed; registered in _lv and _rl.
  'Narrate': async function(args) {
    // Parse flags. Args may contain: -pause, -spotlight "<sel>", -timeout <n>.
    // Strip flags from args; remainder is the message.
    var paused = false;
    var spotlight = null;
    var timeout = null;
    var msgTokens = [];
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a === '-pause') { paused = true; continue; }
      if (a === '-spotlight') {
        spotlight = (i + 1 < args.length) ? args[++i] : null;
        continue;
      }
      if (a === '-timeout') {
        timeout = (i + 1 < args.length) ? parseInt(args[++i], 10) : null;
        if (isNaN(timeout)) timeout = null;
        continue;
      }
      msgTokens.push(a);
    }
    var msg = msgTokens.join(' ');

    // Spotlight implies pause unless -timeout overrides (-timeout always wins).
    if (spotlight) paused = true;
    var hasTimeout = (timeout !== null && timeout > 0);

    // Empty message + no -pause/-spotlight = explicit clear.
    if (!msg && !paused && !spotlight) {
      _hideSpotlight();
      return 'narrate cleared';
    }
    if (!msg) return 'Narrate: -pause/-spotlight requires a message';

    // ── Local path (Aegis) ───────────────────────────────────────────────────
    // Aegis is operator-facing only — no visible overlay. Emit the legacy
    // narration.shown event, console-log, and (if blocking) wait for Enter.
    if (_narrateTarget === 'Aegis') {
      if (window._cmdEmit) {
        window._cmdEmit('narration.shown', {
          message: msg, paused: paused, spotlight: spotlight || null,
          timeout: hasTimeout ? timeout : null, ts: Date.now()
        });
      }
      if (paused || hasTimeout) {
        // Auto-advance any prior pending Aegis-local -pause so a new one is reachable.
        if (_narrateAdvance) {
          var prev = _narrateAdvance; _narrateAdvance = null; prev();
        }
        var advanceMode = hasTimeout
          ? '(auto-advance ' + timeout + 'ms)'
          : '— press Enter to advance';
        _appendLine('SYS', 'warn', '⏸  ' + msg + ' ' + advanceMode);
        var _narratePauseStart = Date.now();
        // Command input pill swap — parity with Pause. Captured at entry so
        // restoration in `finally` is guaranteed even if advance throws.
        var _np = _panelEl;
        var _ninput = _np && _np.querySelector('#phr-cmd');
        var _npill  = _np && _np.querySelector('#phr-target-pill');
        if (_ninput) {
          _ninput.placeholder = 'Press Enter to resume ▶';
          _ninput.style.color = '#EF9F27';
          if (_npill) { _npill.textContent = '⏸'; _npill.style.color = '#EF9F27'; }
          _ninput.focus();
        }
        try {
          if (hasTimeout) {
            await new Promise(function(r){ setTimeout(r, timeout); });
          } else {
            await _waitForSpotlightAdvance();
          }
        } finally {
          if (_ninput) {
            _ninput.placeholder = 'Enter command…';
            _ninput.style.color = '#fff';
            if (_npill) {
              var _nlabel = _cmdTarget === 'ALL' ? 'ALL' : (_sessions[_cmdTarget] ? (_sessions[_cmdTarget].alias || _sessions[_cmdTarget].initials) : 'ALL');
              _npill.textContent = _nlabel + ' ▾';
              _npill.style.color = _cmdTarget === 'ALL' ? '#00c9c9' : _sessionColor(_cmdTarget);
            }
          }
        }
        var _nElapsedMs = Date.now() - _narratePauseStart;
        var _nElapsedStr = _nElapsedMs >= 1000
          ? (_nElapsedMs / 1000).toFixed(1) + 's'
          : _nElapsedMs + 'ms';
        _appendLine('SYS', 'result', '▶ resumed after ' + _nElapsedStr);
        return hasTimeout ? 'narrate advanced (timeout)' : 'narrate advanced';
      }
      _appendLine('SYS', 'info', '· ' + msg);
      return 'narrate: ' + (msg.length > 40 ? msg.slice(0, 40) + '…' : msg);
    }

    // ── Remote path (Compass via _narrateTarget alias) ───────────────────────
    var targetUid = _resolveTargetAlias(_narrateTarget);
    if (!targetUid) {
      _appendLine('SYS', 'warn', 'NarrateTarget ' + _narrateTarget +
        ' not online; falling back to Aegis-local (silent)');
      if (window._cmdEmit) {
        window._cmdEmit('narration.shown', {
          message: msg, paused: paused, spotlight: spotlight || null,
          timeout: hasTimeout ? timeout : null, ts: Date.now()
        });
      }
      if (paused || hasTimeout) {
        if (_narrateAdvance) { var p2 = _narrateAdvance; _narrateAdvance = null; p2(); }
        console.log('[narrate-fallback] "' + msg + '"' +
          (hasTimeout ? ' (auto-advance ' + timeout + 'ms)' : ' — press Enter'));
        if (hasTimeout) {
          await new Promise(function(r){ setTimeout(r, timeout); });
          return 'narrate advanced (local fallback, timeout)';
        }
        await _waitForSpotlightAdvance();
        return 'narrate advanced (local fallback)';
      }
      return 'narrate (local fallback): ' + (msg.length > 40 ? msg.slice(0, 40) + '…' : msg);
    }

    // §3-q6: auto-advance any pending remote -pause before showing the new one.
    if (_narrateRemoteAdvance) {
      var prev2 = _narrateRemoteAdvance; _narrateRemoteAdvance = null; prev2();
    }

    var nid = _uuid();
    window._cmdEmit('narrate.show', {
      target:     targetUid,
      narrate_id: nid,
      message:    msg,
      paused:     paused,
      spotlight:  spotlight || null,
      timeout:    hasTimeout ? timeout : null
    });

    if (paused || hasTimeout) {
      // For -timeout: wait locally; the Compass side also auto-advances on its
      // own timer. Whichever fires first resolves the pending await.
      if (hasTimeout) {
        var timeoutPromise = new Promise(function(r){ setTimeout(r, timeout); });
        var racePromise = _waitForEventFiltered('narrate.advance', 'narrate_id', nid, timeout + 5000);
        _narrateRemoteAdvance = function() {
          _resolveEventListeners('narrate.advance', { narrate_id: nid, ts: Date.now(), synthetic: true });
        };
        try { await Promise.race([timeoutPromise, racePromise]); } catch (e) {}
        _narrateRemoteAdvance = null;
        return 'narrate sent: ' + _narrateTarget + ' (timeout-advanced)';
      }
      var racePromise2 = _waitForEventFiltered('narrate.advance', 'narrate_id', nid, 120000);
      _narrateRemoteAdvance = function() {
        _resolveEventListeners('narrate.advance', { narrate_id: nid, ts: Date.now(), synthetic: true });
      };
      try {
        await racePromise2;
      } catch (e) {
        _appendLine('SYS', 'warn', 'Narrate advance timed out (' +
          nid.slice(0, 8) + '); continuing');
      }
      _narrateRemoteAdvance = null;
      return 'narrate sent: ' + _narrateTarget + ' (advanced)';
    }
    return 'narrate sent: ' + _narrateTarget;
  },

  // ── Spotlight (CMD89 §3 bonus verb) ──────────────────────────────────────────
  // Pure visual focus — no caption text. Operator narrates verbally. Same
  // dim+hole rendering as `Narrate -spotlight`, same advance behavior.
  //   Spotlight "<selector>"                — blocks until advance
  //   Spotlight "<selector>" -timeout 4000  — auto-advances after N ms
  // Aegis-local (Rule 29): runs unprefixed; registered in _lv and _rl.
  'Spotlight': async function(args) {
    var timeout = null;
    var selTokens = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-timeout') {
        timeout = (i + 1 < args.length) ? parseInt(args[++i], 10) : null;
        if (isNaN(timeout)) timeout = null;
        continue;
      }
      selTokens.push(args[i]);
    }
    var selector = selTokens.join(' ');
    if (!selector) return 'Spotlight: missing selector';
    var hasTimeout = (timeout !== null && timeout > 0);

    if (_narrateTarget === 'Aegis') {
      // Aegis-side: silent, but block on Enter (or timeout) for script flow.
      console.log('[spotlight] "' + selector + '" ' +
        (hasTimeout ? '(auto-advance ' + timeout + 'ms)' : '— press Enter to advance'));
      if (hasTimeout) {
        await new Promise(function(r){ setTimeout(r, timeout); });
        return 'spotlight advanced (timeout)';
      }
      if (_narrateAdvance) { var prev = _narrateAdvance; _narrateAdvance = null; prev(); }
      await _waitForSpotlightAdvance();
      return 'spotlight advanced';
    }

    var targetUid = _resolveTargetAlias(_narrateTarget);
    if (!targetUid) {
      _appendLine('SYS', 'warn', 'NarrateTarget ' + _narrateTarget +
        ' not online; spotlight skipped');
      return 'spotlight skipped (offline target)';
    }

    if (_narrateRemoteAdvance) {
      var prev2 = _narrateRemoteAdvance; _narrateRemoteAdvance = null; prev2();
    }
    var nid = _uuid();
    // Send as narrate.show with empty message + spotlight selector. The Compass
    // renderer treats empty-message as caption-suppressed (pure visual).
    window._cmdEmit('narrate.show', {
      target:     targetUid,
      narrate_id: nid,
      message:    '',
      paused:     true,
      spotlight:  selector,
      timeout:    hasTimeout ? timeout : null,
      caption_suppressed: true
    });

    if (hasTimeout) {
      var timeoutPromise = new Promise(function(r){ setTimeout(r, timeout); });
      var racePromise = _waitForEventFiltered('narrate.advance', 'narrate_id', nid, timeout + 5000);
      _narrateRemoteAdvance = function() {
        _resolveEventListeners('narrate.advance', { narrate_id: nid, ts: Date.now(), synthetic: true });
      };
      try { await Promise.race([timeoutPromise, racePromise]); } catch (e) {}
      _narrateRemoteAdvance = null;
      return 'spotlight sent: ' + _narrateTarget + ' (timeout-advanced)';
    }
    var racePromise2 = _waitForEventFiltered('narrate.advance', 'narrate_id', nid, 120000);
    _narrateRemoteAdvance = function() {
      _resolveEventListeners('narrate.advance', { narrate_id: nid, ts: Date.now(), synthetic: true });
    };
    try { await racePromise2; } catch (e) {
      _appendLine('SYS', 'warn', 'Spotlight advance timed out (' + nid.slice(0,8) + '); continuing');
    }
    _narrateRemoteAdvance = null;
    return 'spotlight sent: ' + _narrateTarget + ' (advanced)';
  },

  // ── DOFile (CMD87 / Brief Aegis Demo Primitives) ─────────────────────────────
  // Execute another Aegis script inline as if its lines were embedded at the
  // call site.
  //   DOFile "<script_name>"
  // §3-q5 (LOCKED): max recursion depth 4. Overflow error names the call chain.
  // §3-q6: shared _storeVars namespace — variables propagate between caller
  //        and callee (matches existing script composition behavior).
  // §3-q7: error wrapper "in DOFile <name> at line N: <message>" — surfacing
  //        is implemented inside _runScriptLines via the sourceTag parameter.
  // Aegis-local (Rule 29): runs unprefixed; registered in _lv and _rl.
  'DOFile': async function(args) {
    var scriptName = args[0];
    if (!scriptName) throw new Error('DOFile: missing script name');
    if (_doFileChain.length >= 4) {
      throw new Error('DOFile depth exceeded at depth ' + _doFileChain.length +
        ': ' + _doFileChain.join(' → ') + ' → ' + scriptName);
    }
    var script = _scripts[scriptName];
    if (!script) throw new Error('DOFile: script not found: ' + scriptName);
    _doFileChain.push(scriptName);
    try {
      var lines = script.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);
      var aborted = await _runScriptLines(lines, scriptName, scriptName);
      if (aborted === 'aborted') {
        // Inner _runScriptLines already logged the abort with sourceTag context.
        // Surface as a thrown error so the outer script's halt path triggers.
        throw new Error('aborted in DOFile ' + scriptName);
      }
      return 'DOFile complete: ' + scriptName;
    } finally {
      _doFileChain.pop();
    }
  },
};

// ── Parse a command line into [verb, ...args] ─────────────────────────────────
// Handles: VS: Set Tab "MY REQUESTS"
//          AK: Click "Approve"
//          Wait ForEvent "workflow_request.created"
// Target prefix is matched against _aliasMap (alias → userId) first,
// then falls back to initials match for backward compatibility.
function _parseLine(line) {
  line = line.trim();
  if (!line || line.startsWith('#') || line.startsWith('//')) return null;

  var target = null;
  var initials = line.match(/^([A-Z]{1,4}):\s*/);
  if (initials) {
    target = initials[1];
    line   = line.slice(initials[0].length);
  }

  // Extract quoted args and unquoted tokens
  var tokens = [];
  var re = /"([^"]*)"|\S+\[\d+\](?:\.\S+)?|\S+/g;
  var m;
  while ((m = re.exec(line)) !== null) {
    tokens.push(m[1] !== undefined ? m[1] : m[0]);
  }

  if (!tokens.length) return null;

  // Match command verb (may be two words: "Set Tab", "Form Open", "Wait ForEvent", "DB Get")
  var twoWord = tokens.slice(0,2).join(' ');
  var oneWord = tokens[0];
  var verb, args;

  if (COMMANDS[twoWord]) {
    verb = twoWord; args = tokens.slice(2);
  } else if (COMMANDS[oneWord]) {
    verb = oneWord; args = tokens.slice(1);
  } else {
    return { target, verb: null, args: tokens, raw: line };
  }

  return { target, verb, args, raw: line };
}

// ── Resolve a target alias/initials string to a userId ───────────────────────
// Checks _aliasMap first (operator-set aliases like "VS", "AK"),
// then falls back to scanning _sessions by initials for backward compat.
function _resolveTargetAlias(targetStr) {
  if (!targetStr) return null;
  // Direct alias map hit
  if (_aliasMap[targetStr]) return _aliasMap[targetStr];
  // Fallback: match by initials (handles sessions that haven't set an alias)
  var match = Object.entries(_sessions).find(function([uid, s]) {
    return s.initials === targetStr || s.alias === targetStr;
  });
  return match ? match[0] : null;
}

// ── Variable substitution on a whole command string (B-UI-5 / CMD71) ──────────
// Replaces $varname tokens against the module-scoped _storeVars table.
// Used by _executeCommand's per-arg substitution AND by the three dispatch
// sites that send commands cross-session (script path ~L2012, runLine path
// ~L2743, window._sendToSession ~L3419). Variables must resolve on the
// SENDER (Aegis) before transmission — the receiver's _storeVars is empty
// for sender-captured values. If a var is unset, the literal '$varname' is
// preserved verbatim, matching _executeCommand's existing fallback so the
// receiver's error surfaces clearly rather than silently collapsing.
function _resolveVarsInCmd(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\$(\w+)/g, function(whole, k) {
    return (_storeVars[k] !== undefined && _storeVars[k] !== null && _storeVars[k] !== '')
      ? _storeVars[k]
      : whole;
  });
}

// ── Execute a single command ──────────────────────────────────────────────────
async function _executeCommand(cmdLine, fromWho) {
  var parsed = _parseLine(cmdLine);
  if (!parsed) return;

  // Variable substitution — replace $varname with stored value. If the var
  // is unset, leave the literal '$varname' in place (previously this fell
  // back to the entire argument string, causing duplication like
  // 'Package live · Package live · $instance_id').
  var args = (parsed.args||[]).map(function(a) {
    return a.replace(/\$(\w+)/g, function(whole, k) {
      return (_storeVars[k] !== undefined && _storeVars[k] !== null && _storeVars[k] !== '')
        ? _storeVars[k]
        : whole;
    });
  });

  if (!parsed.verb) {
    _appendLine('SYS', 'warn', 'Unknown command: ' + parsed.raw);
    return 'Unknown command: ' + parsed.raw;
  }

  try {
    var result = await COMMANDS[parsed.verb](args);
    if (result !== undefined) {
      _storeVars['_lastResult'] = result;
      _appendLine('SYS', 'result', '→ ' + result);
    }
    return result;
  } catch(e) {
    _appendLine('SYS', 'err', e.message);
    throw e;
  }
}

// ── Parse script header for Version: directive ────────────────────────────────
// Scans comment lines at top of script for:  # Version: 1.0   /   # Ver: 1.3-beta
// Returns the version string as-is (trimmed), or null if not found.
// Accepted keys: Version, Ver, v (case-insensitive). The whole rest of the line
// is captured so freeform version strings like "1.0 · 2026-04-17" are preserved.
function _parseScriptVersion(scriptText) {
  var lines = scriptText.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    if (!line.startsWith('#') && !line.startsWith('//')) break; // past header
    // Strip leading comment markers and stray punctuation (e.g. "# .... Version 1.0")
    var body = line.replace(/^[#\/\s.·—\-]+/, '');
    var m = body.match(/^(?:version|ver|v)\s*[:=]?\s*(.+)$/i);
    if (m) return m[1].trim();
  }
  return null;
}

// ── Parse script header for Requires: directive ───────────────────────────────
// Scans comment lines at top of script for:  # Requires: VS, AK, DN
// Returns array of alias strings, or [] if not found.
//
// Parses comma/whitespace-separated tokens left-to-right and stops at the first
// token that doesn't match alias-shape (1–4 uppercase letters/digits, leading
// letter). This prevents freeform trailing prose from leaking in — English words
// that happen to match alias shape (IN, TO, OR, etc.) still terminate parsing
// as soon as the first non-alias word appears, so e.g.
//   # Requires: VS, AK connected (anywhere in ProjectHUD)
// stops at "CONNECTED" and yields ['VS', 'AK'].
function _parseScriptRequires(scriptText) {
  var lines = scriptText.split('\n');
  var ALIAS_RE = /^[A-Z][A-Z0-9]{0,3}$/;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    if (!line.startsWith('#') && !line.startsWith('//')) break; // past header
    var m = line.match(/requires:\s*(.+)/i);
    if (m) {
      var tokens = m[1].split(/[\s,]+/)
        .map(function(s){ return s.trim().toUpperCase(); })
        .filter(Boolean);
      var out = [];
      for (var j = 0; j < tokens.length; j++) {
        if (!ALIAS_RE.test(tokens[j])) break; // first non-alias ends the list
        out.push(tokens[j]);
      }
      return out;
    }
  }
  return [];
}

// ── Spotlight helpers — Aegis side (CMD89) ────────────────────────────────────
// Aegis is operator-facing only; no overlay is rendered. The only Aegis-side
// surface is an Enter-key listener for -pause flow control. _waitForSpotlightAdvance
// returns a Promise that resolves on Enter (capture phase, preempts the command
// bar's Pause Enter handler, identical semantics to CMD88 _waitForBannerAdvance).
function _hideSpotlight() {
  _narrateVisible = false;
  if (_narrateKeyHandler) {
    document.removeEventListener('keydown', _narrateKeyHandler, true);
    _narrateKeyHandler = null;
  }
  if (_narrateAdvance) {
    var r = _narrateAdvance; _narrateAdvance = null; r();
  }
}
function _waitForSpotlightAdvance() {
  return new Promise(function(resolve) {
    _narrateAdvance = resolve;
    _narrateVisible = true;
    _narrateKeyHandler = function(ev) {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      ev.stopPropagation();
      if (!_narrateAdvance) return;
      var r = _narrateAdvance; _narrateAdvance = null;
      _narrateVisible = false;
      if (_narrateKeyHandler) {
        document.removeEventListener('keydown', _narrateKeyHandler, true);
        _narrateKeyHandler = null;
      }
      r();
    };
    document.addEventListener('keydown', _narrateKeyHandler, true);
  });
}

// ── Spotlight helpers — Compass side (CMD89) ──────────────────────────────────
// Renders the dim+hole overlay and the caption card per §2 spec.
// Lazy-creates the DOM on first use; CSS lives in compass.html.
//
// Surface structure:
//   #phr-spotlight-overlay        — fixed-position container, full viewport
//     SVG mask defines the dim with a "hole" cut out around the target rect
//     #phr-spotlight-caption      — caption card (positioned adjacent to hole)
//       #phr-spotlight-caption-msg
//       #phr-spotlight-caption-advance  (triangle)
//
// §2 hole feathering: implemented via SVG <feGaussianBlur> on the mask, which
// renders cleanly across Chrome/Firefox/Edge. Radial-gradient mask was
// considered but produces banding on some GPUs.
//
// §2 positioning: target's getBoundingClientRect() drives both the mask cutout
// and the caption placement (above if midpoint-Y in upper half of viewport,
// else below). When target fills >75% of viewport or selector matches nothing,
// falls back to bottom-center caption with no spotlight (full dim if message
// present + spotlight requested with no-match; pure caption if no spotlight).

function _ensureSpotlightDom() {
  var ov = document.getElementById('phr-spotlight-overlay');
  if (ov) return ov;
  ov = document.createElement('div');
  ov.id = 'phr-spotlight-overlay';
  ov.innerHTML =
    '<svg id="phr-spotlight-svg" width="100%" height="100%" preserveAspectRatio="none">' +
      '<defs>' +
        '<filter id="phr-spotlight-feather" x="-10%" y="-10%" width="120%" height="120%">' +
          '<feGaussianBlur stdDeviation="6"/>' +
        '</filter>' +
        '<mask id="phr-spotlight-mask">' +
          '<rect id="phr-spotlight-mask-bg" x="0" y="0" width="100%" height="100%" fill="white"/>' +
          '<rect id="phr-spotlight-mask-hole" x="0" y="0" width="0" height="0" rx="12" ry="12" fill="black" filter="url(#phr-spotlight-feather)"/>' +
        '</mask>' +
      '</defs>' +
      '<rect id="phr-spotlight-dim" x="0" y="0" width="100%" height="100%" fill="rgba(10,12,20,0.78)" mask="url(#phr-spotlight-mask)"/>' +
    '</svg>' +
    '<div id="phr-spotlight-caption">' +
      '<span id="phr-spotlight-caption-msg"></span>' +
      '<span id="phr-spotlight-caption-advance" title="Advance (Enter)" role="button" tabindex="0"></span>' +
    '</div>';
  document.body.appendChild(ov);
  return ov;
}

// Position the caption card relative to the spotlit element's bounding rect.
// Returns { left, top } in viewport coords. §2 positioning spec.
function _positionCaption(rect, captionEl) {
  var vw = window.innerWidth;
  var vh = window.innerHeight;
  var capRect = captionEl.getBoundingClientRect();
  var capW = capRect.width;
  var capH = capRect.height;
  var GAP = 16;
  var EDGE = 24;

  // Horizontal: center on target, clamp to viewport with EDGE margin.
  var targetCenterX = rect.left + rect.width / 2;
  var left = targetCenterX - capW / 2;
  if (left < EDGE) left = EDGE;
  if (left + capW > vw - EDGE) left = vw - EDGE - capW;

  // Vertical: target midpoint in upper half → caption below; else above.
  var targetMidY = rect.top + rect.height / 2;
  var top;
  if (targetMidY < vh / 2) {
    top = rect.bottom + GAP;
    // Clamp if it would fall off the bottom.
    if (top + capH > vh - EDGE) top = vh - EDGE - capH;
  } else {
    top = rect.top - GAP - capH;
    if (top < EDGE) top = EDGE;
  }
  return { left: Math.round(left), top: Math.round(top) };
}

function _compassShowSpotlight(msg, paused, narrateId, selector, timeout, captionSuppressed) {
  var ov = _ensureSpotlightDom();
  var caption = document.getElementById('phr-spotlight-caption');
  var msgEl = document.getElementById('phr-spotlight-caption-msg');
  var advEl = document.getElementById('phr-spotlight-caption-advance');
  var hole = document.getElementById('phr-spotlight-mask-hole');
  var svg = document.getElementById('phr-spotlight-svg');

  // §3-q4 + §3-q7 replace-immediately audit.
  if (_compassActiveNarrateId && _compassActiveNarrateId !== narrateId) {
    if (window._cmdEmit) {
      window._cmdEmit('narrate.cleared', {
        narrate_id: _compassActiveNarrateId, reason: 'replace'
      });
    }
  }
  if (_compassTimeoutId) {
    clearTimeout(_compassTimeoutId);
    _compassTimeoutId = null;
  }

  // Resolve selector → element; if no match, fall back to centered caption.
  var target = null;
  if (selector) {
    try { target = document.querySelector(selector); } catch (e) { target = null; }
  }
  var rect = null;
  if (target) {
    rect = target.getBoundingClientRect();
    // §2 fallback: if target fills >75% of viewport, also fall back to centered.
    var areaPct = (rect.width * rect.height) / (window.innerWidth * window.innerHeight);
    if (areaPct > 0.75) { target = null; rect = null; }
  }

  // Caption text.
  if (captionSuppressed) {
    caption.style.display = 'none';
  } else {
    msgEl.textContent = msg;
    advEl.style.display = paused ? 'flex' : 'none';
    caption.style.display = 'flex';
  }

  // Spotlight rendering: hole only if a valid target rect exists.
  if (rect) {
    svg.style.display = 'block';
    var PAD = 14;
    hole.setAttribute('x', Math.max(0, rect.left - PAD));
    hole.setAttribute('y', Math.max(0, rect.top - PAD));
    hole.setAttribute('width', rect.width + PAD * 2);
    hole.setAttribute('height', rect.height + PAD * 2);
  } else {
    // No target: pure dim only if there's something to show; otherwise hide SVG.
    if (selector) {
      // Spotlight requested but no match: dim full screen, caption bottom-center.
      svg.style.display = 'block';
      hole.setAttribute('x', 0); hole.setAttribute('y', 0);
      hole.setAttribute('width', 0); hole.setAttribute('height', 0);
    } else {
      // No spotlight requested: caption-only mode, no dim.
      svg.style.display = 'none';
    }
  }

  ov.classList.add('visible');
  ov.style.display = 'block';

  // Position caption. If we have a target rect, position adjacent. Otherwise
  // bottom-center (or 64px-from-bottom for no-spotlight transitional caption).
  if (!captionSuppressed) {
    // Force layout so getBoundingClientRect on caption is accurate.
    caption.style.left = '0px';
    caption.style.top = '0px';
    caption.style.visibility = 'hidden';
    caption.offsetHeight; // reflow
    if (rect) {
      var pos = _positionCaption(rect, caption);
      caption.style.left = pos.left + 'px';
      caption.style.top = pos.top + 'px';
    } else {
      // Bottom-center: 64px from bottom for transitional, 32px when full-dim.
      var capRect2 = caption.getBoundingClientRect();
      var bottomMargin = selector ? 32 : 64;
      caption.style.left = Math.round((window.innerWidth - capRect2.width) / 2) + 'px';
      caption.style.top = Math.round(window.innerHeight - capRect2.height - bottomMargin) + 'px';
    }
    caption.style.visibility = 'visible';
  }

  _compassActiveNarrateId = narrateId;

  // Wire advance affordance.
  advEl.onclick = function() { _compassAdvanceSpotlight('advance'); };

  // Local Enter advance.
  if (paused && !captionSuppressed === false /* always wire for paused */) {
    if (_compassNarrateKeyHandler) {
      document.removeEventListener('keydown', _compassNarrateKeyHandler, true);
    }
    _compassNarrateKeyHandler = function(ev) {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      ev.stopPropagation();
      _compassAdvanceSpotlight('advance');
    };
    document.addEventListener('keydown', _compassNarrateKeyHandler, true);
  }

  // -timeout auto-advance (Compass-side mirror of Aegis-side timer).
  if (timeout && timeout > 0) {
    _compassTimeoutId = setTimeout(function() {
      _compassTimeoutId = null;
      _compassAdvanceSpotlight('advance');
    }, timeout);
  }
}

function _compassHideSpotlight() {
  var ov = document.getElementById('phr-spotlight-overlay');
  if (ov) {
    ov.classList.remove('visible');
    // Brief fade-out before display:none so CSS transition can run.
    setTimeout(function() {
      if (!ov.classList.contains('visible')) ov.style.display = 'none';
    }, 200);
  }
  if (_compassNarrateKeyHandler) {
    document.removeEventListener('keydown', _compassNarrateKeyHandler, true);
    _compassNarrateKeyHandler = null;
  }
  if (_compassTimeoutId) {
    clearTimeout(_compassTimeoutId);
    _compassTimeoutId = null;
  }
  _compassActiveNarrateId = null;
}

function _compassAdvanceSpotlight(reason) {
  var nid = _compassActiveNarrateId;
  if (!nid) return;
  if (window._cmdEmit) {
    window._cmdEmit('narrate.advance', { narrate_id: nid, ts: Date.now() });
    window._cmdEmit('narrate.cleared', { narrate_id: nid, reason: reason || 'advance' });
  }
  _compassHideSpotlight();
}

// ── Run a list of script lines (factored CMD87) ──────────────────────────────
// Inner loop body for both _runScript (top-level) and DOFile (inline).
// Returns 'aborted' if the loop broke out due to abort/error, undefined on
// normal completion. sourceTag is used in error messages for §3-q7
// ("in DOFile <name> at line N: <message>").
async function _runScriptLines(lines, scriptName, sourceTag) {
  for (var i = 0; i < lines.length; i++) {
    // Check abort flag — set by Stop button or form closure
    if (_scriptAborted) {
      _appendLine('SYS', 'warn', 'Script aborted at line ' + (i+1) +
        (sourceTag && sourceTag !== scriptName ? ' (in ' + sourceTag + ')' : ''));
      return 'aborted';
    }

    var line = lines[i];
    if (!line || line.startsWith('#')) continue;

    // CMD89: pre-exec auto-hide remains absent (CMD87 reasoning preserved).
    // Dismissal is now via §3-q4 replace-immediately in _compassShowSpotlight,
    // or by an explicit `Narrate ""` clear. Paused spotlights self-dismiss
    // when the operator advances (Enter / triangle click / -timeout fire).

    // Abort if panel was closed
    if (_scriptAborted) {
      _scriptAborted = false;
      _appendLine('SYS', 'warn', 'Script aborted — panel closed');
      return 'aborted';
    }

    var parsed = _parseLine(line);
    if (!parsed) continue;

    // If this is a Form command, verify the overlay is still open.
    // Give it a short grace period — the overlay may still be animating in
    // immediately after Form Open returns.
    // AEGIS-EXEMPT: on Aegis, the form overlay lives on the target session's
    // DOM (Compass), not on Aegis's. Aegis is dispatching, not executing, so
    // the local-DOM overlay check is meaningless and would falsely abort.
    if (!window._aegisMode && parsed.verb && parsed.verb.startsWith('Form ') && parsed.verb !== 'Form Open') {
      var overlay = document.getElementById('myr-html-form-overlay') ||
                    document.getElementById('myr-html-form-modal');
      if (!overlay) {
        // Grace period: wait up to 1s for overlay to appear
        for (var gi = 0; gi < 10; gi++) {
          await new Promise(function(r){ setTimeout(r, 100); });
          overlay = document.getElementById('myr-html-form-overlay') ||
                    document.getElementById('myr-html-form-modal');
          if (overlay) break;
        }
      }
      if (!overlay) {
        _appendLine('SYS', 'warn', 'Form closed — script aborted at: ' + line);
        return 'aborted';
      }
    }

    // Determine target session via alias map
    var targetUserId = null;
    if (parsed.target) {
      targetUserId = _resolveTargetAlias(parsed.target);
    }

    // CMD87: Narrate, DOFile added to local-verb list (Rule 29 — Aegis-local).
    // CMD87b: Set NarrateTarget added (Rule 29 — Aegis-local; targeting state
    //   is module-scoped on Aegis only). Brief §3-q1.
    var _lv=['Assert','Log','Wait','Store','Get','DB Poll','DB Get','Run','Pause',
             'Narrate','Spotlight','DOFile','Set NarrateTarget',
             'Wait ForLocation','Wait ForInstance','Wait ForRoute','Wait ForForm','Wait ForQueueRow','Wait ForModal'];
    if (targetUserId && (_lv.indexOf(parsed.verb)===-1)) {
      // Dispatch via Realtime (non-local commands)
      // B-UI-5 / CMD71: resolve $variables against Aegis's _storeVars
      // BEFORE transmission. Receiver has no access to sender-captured
      // vars; the wire must carry resolved literals.
      var _bareLine = line.replace(/^[A-Z]+:\s*/, '');
      var _resolvedLine = _resolveVarsInCmd(_bareLine);
      _appendLine(parsed.target || 'SYS', 'cmd', _resolvedLine);

      // CMD100.59 — pre-nav heartbeat capture. Navigation commands
      // (Register / Set Page / Set View / Open Prospect) tear down the
      // target's WebSocket; the ack may not arrive before the page
      // reloads.
      var _NAV_VERBS = ['Register','Set Page','Set View','Open Prospect','Close Prospect','Edit Prospect'];
      var _isNavCmd = _NAV_VERBS.indexOf(parsed.verb) !== -1;
      var _preNavLastSeen = _sessions[targetUserId]
        ? (_sessions[targetUserId].lastSeen || 0)
        : 0;

      console.log('[script-nav]', {
        line: i+1,
        verb: parsed.verb,
        isNav: _isNavCmd,
        target: parsed.target,
        targetUserId: targetUserId,
        preNavLastSeen: _preNavLastSeen,
        sessionsKnown: Object.keys(_sessions),
        targetSessionEntry: _sessions[targetUserId] ? {
          online: _sessions[targetUserId].online,
          lastSeen: _sessions[targetUserId].lastSeen,
          location: _sessions[targetUserId].location,
          initials: _sessions[targetUserId].initials,
          alias: _sessions[targetUserId].alias
        } : null,
        channelOpen: !!_channel
      });

      if (_channel) {
        var _cmdId = Date.now() + '-' + i;
        console.log('[script-nav] dispatching cmd', { cmdId: _cmdId, target: targetUserId, cmd: _resolvedLine });
        _channelSend({
          type: 'broadcast', event: 'cmd',
          payload: {
            target: targetUserId,
            from:   _myAlias || _mySession.initials,
            cmd:    _resolvedLine,
            cmdId:  _cmdId,
          }
        });
      } else {
        console.warn('[script-nav] no channel — cmd not dispatched', _resolvedLine);
      }

      try {
        // Nav commands use a short timeout — the page tears down quickly
        // and an ack may never arrive.
        var _waitTimeout = _isNavCmd ? 1500 : 30000;
        console.log('[script-nav] awaiting ack', { eventName: 'result:' + targetUserId, timeoutMs: _waitTimeout });
        var _ackData = await _waitForEvent('result:' + targetUserId, _waitTimeout);
        console.log('[script-nav] ack received', _ackData);
        if (_ackData && typeof _ackData.result === 'string') {
          var _m = _ackData.result.match(/^submitted · instance ([a-f0-9-]+)/i);
          if (_m) {
            _storeVars['instance_id'] = _m[1];
            _appendLine('SYS', 'sys', 'captured $instance_id = ' + _m[1]);
          }
        }
      } catch(e) {
        console.log('[script-nav] ack timed out', { isNav: _isNavCmd, message: e && e.message });
        if (!_isNavCmd) {
          _appendLine('SYS', 'warn', 'Timeout waiting for ' + parsed.target);
        }
      }

      // CMD100.63 — post-nav settle. Wait for a `page_ready` broadcast
      // from the target session that is NEWER than the pre-dispatch
      // timestamp. That's the only reliable signal that the new page's
      // cmd-center has subscribed and is ready to receive cmds.
      if (_isNavCmd) {
        var _settleStart = Date.now();
        var _preReadyTs  = _pageReadyTs[targetUserId] || 0;
        var _navDeadline = _settleStart + 8000;
        var _polls = 0;
        console.log('[script-nav] awaiting page_ready', { preReadyTs: _preReadyTs, deadlineMs: 8000 });
        while (Date.now() < _navDeadline) {
          _polls++;
          var _readyTs = _pageReadyTs[targetUserId] || 0;
          if (_readyTs > _preReadyTs) {
            console.log('[script-nav] settled via page_ready', {
              polls: _polls,
              elapsedMs: Date.now() - _settleStart,
              readyTs: _readyTs
            });
            // Tiny settle margin — page_ready fires the moment channels
            // subscribe; give 200ms for the cmd subscription to propagate
            // server-side before the next dispatch.
            await new Promise(function(r){ setTimeout(r, 200); });
            break;
          }
          await new Promise(function(r){ setTimeout(r, 100); });
        }
        var _finalTs = _pageReadyTs[targetUserId] || 0;
        if (_finalTs <= _preReadyTs) {
          console.warn('[script-nav] page_ready timeout', { preReadyTs: _preReadyTs, currentTs: _finalTs });
          _appendLine('SYS', 'warn', 'Nav settle timeout for ' + parsed.target + ' (page_ready not received)');
        }
      }
    } else {
      // Execute locally
      _appendLine(_myAlias || _mySession.initials, 'cmd', line.replace(/^[A-Z]+:\s*/, ''));
      try {
        await _executeCommand(line.replace(/^[A-Z]+:\s*/, ''), _myAlias || _mySession.initials);
      } catch(e) {
        // §3-q7: surface both call site and inner line for DOFile errors.
        var _ctx = (sourceTag && sourceTag !== scriptName)
          ? 'in DOFile ' + sourceTag + ' at line ' + (i+1) + ': '
          : '';
        _appendLine('SYS', 'err', 'Script halted: ' + _ctx + e.message);
        return 'aborted';
      }
    }

    // Small yield between commands
    await new Promise(function(r){ setTimeout(r, 200); });
  }
  return undefined;
}

// ── Run a multi-line script ───────────────────────────────────────────────────
async function _runScript(scriptText, scriptName, playbookId) {
  var lines = scriptText.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);

  // Preflight: check required sessions from script header
  var required = _parseScriptRequires(scriptText);
  if (required.length) {
    var missing = required.filter(function(alias) {
      // Own session is always connected — check by alias or userId
      if (_mySession) {
        if (alias === _myAlias) return false;
        if (alias === _mySession.initials) return false;
      }
      var uid = _resolveTargetAlias(alias);
      if (!uid) return true;                           // not in aliasMap at all
      if (_mySession && uid === _mySession.userId) return false; // own session
      var sess = _sessions[uid];
      return !sess || !sess.online;                    // offline
    });
    if (missing.length) {
      var ok = _showPreflightPanel(scriptName || 'script', required, missing, scriptText);
      if (!ok) return; // user cancelled
    }
  }

  // CMD-AEGIS-PLAYBOOK-FOUNDATION: resolve playbook for run-history capture.
  // If playbookId not provided, try resolving by name; null is acceptable
  // (e.g., inline scripts have no playbook). When null, run-history is not
  // captured — preserves backward compat with non-playbook callers.
  var resolvedPbId = playbookId || (scriptName ? _playbookByName[scriptName] : null) || null;
  var resolvedPb = resolvedPbId ? _playbooks[resolvedPbId] : null;
  var runId = null;
  var runStartTs = Date.now();
  var runCommandCount = lines.filter(function(l){ return !l.startsWith('#'); }).length;
  if (resolvedPb) {
    runId = await _insertRunStart(resolvedPb);
  }

  _scriptRunning = true;
  _scriptAborted = false;
  // CMD87b §7: do not persist NarrateTarget across script runs. Reset to local
  // on entry — script must re-issue `Set NarrateTarget` if it wants remote.
  _narrateTarget = 'Aegis';
  _appendLine('SYS', 'sys', 'Script: ' + (scriptName||'inline') + ' · ' + runCommandCount + ' commands');
  var _scriptVersion = _parseScriptVersion(scriptText);
  if (_scriptVersion) {
    _appendLine('SYS', 'sys', 'Version: ' + _scriptVersion);
  } else {
    _appendLine('SYS', 'sys', 'Version: (no # Version: header found)');
  }
  // Show RUNNING label in bottom bar
  if (_panelEl) {
    var rl = _panelEl.querySelector('#phr-running-label');
    var rn = _panelEl.querySelector('#phr-running-name');
    if (rl) rl.style.display = 'inline';
    if (rn) rn.textContent = scriptName || 'inline';
  }

  var terminalStatus = 'pass';
  try {
    var _aborted = await _runScriptLines(lines, scriptName, scriptName || 'inline');
    if (_aborted === 'aborted') {
      terminalStatus = 'aborted';
    }
  } catch (e) {
    terminalStatus = 'error';
    throw e;
  } finally {
    _scriptRunning = false;
    _scriptAborted = false;
    if (_pauseResolve) { var r = _pauseResolve; _pauseResolve = null; r(); }
    // Hide RUNNING label
    if (_panelEl) {
      var rl = _panelEl.querySelector('#phr-running-label');
      var rn = _panelEl.querySelector('#phr-running-name');
      if (rl) rl.style.display = 'none';
      if (rn) rn.textContent = '';
    }
  }

  _appendLine('SYS', 'result', _scriptAborted ? '■ Script stopped' : '✓ Script complete · ' + (scriptName||'inline'));

  // CMD-AEGIS-PLAYBOOK-FOUNDATION: capture run completion in substrate.
  if (runId && resolvedPb) {
    var finalStatus = (terminalStatus === 'aborted') ? 'aborted' :
                      (terminalStatus === 'error')   ? 'error'   :
                      _scriptAborted                  ? 'aborted' :
                      'pass';
    var summary = _transcript.slice(-30).map(function(t){ return (t.who||'') + ' ' + (t.text||''); }).join('\n');
    // Fire-and-forget; failure here is non-fatal.
    _completeRun(runId, finalStatus, summary, runCommandCount, Date.now() - runStartTs, resolvedPb)
      .then(function(){ if (_panelEl) _renderLibrary && _renderLibrary(); });
  }
}

// ── Script preflight panel ────────────────────────────────────────────────────
// Shown when a script requires sessions that aren't live.
// Returns true if the operator clicks Run Anyway, false if they cancel.
// Non-blocking modal injected into the CMD Center panel.
function _showPreflightPanel(scriptName, required, missing, scriptText) {
  return new Promise(function(resolve) {
    var existing = document.getElementById('phr-preflight');
    if (existing) existing.remove();

    // Rebuild rows + status each tick against current _sessions state.
    function _buildRowsHTML() {
      return required.map(function(alias) {
        var isOwn = _mySession && (alias === _myAlias || alias === _mySession.initials);
        var uid = _resolveTargetAlias(alias);
        var isLive = isOwn || (uid && _sessions[uid] && _sessions[uid].online);
        var sess = uid ? _sessions[uid] : null;
        var nameStr = isOwn ? _mySession.name : (sess ? sess.name : '—');
        var dot = isLive
          ? '<span style="color:#1D9E75">●</span>'
          : '<span style="color:#E24B4A">○</span>';
        var loc = isLive && sess ? ('<span style="color:#EF9F27;font-size:9px"> · ' + (sess.location||'') + '</span>') : '';
        var tag = isLive
          ? '<span style="font-size:9px;color:#1D9E75;border:1px solid rgba(29,158,117,.3);border-radius:2px;padding:0 4px">LIVE</span>'
          : '<span style="font-size:9px;color:#E24B4A;border:1px solid rgba(226,75,74,.3);border-radius:2px;padding:0 4px">MISSING</span>';
        return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(0,201,201,0.18)">'
          + '<span style="font-size:10px;font-family:monospace;color:#EF9F27;min-width:32px">' + alias + '</span>'
          + dot + ' '
          + '<span style="font-size:10px;color:#cfe9e9;flex:1">' + nameStr + loc + '</span>'
          + tag
          + '</div>';
      }).join('');
    }
    function _currentMissing() {
      return required.filter(function(alias) {
        var isOwn = _mySession && (alias === _myAlias || alias === _mySession.initials);
        if (isOwn) return false;
        var uid = _resolveTargetAlias(alias);
        return !(uid && _sessions[uid] && _sessions[uid].online);
      });
    }

    var overlay = document.createElement('div');
    overlay.id = 'phr-preflight';
    overlay.style.cssText = [
      'position:absolute;inset:0;background:rgba(4,7,16,.88)',
      'display:flex;align-items:center;justify-content:center',
      'z-index:10;border-radius:8px',
    ].join(';');
    overlay.innerHTML = [
      '<div style="background:#0a1220;border:1px solid rgba(0,201,201,.25);border-radius:6px;padding:16px 18px;width:320px;max-width:90%">',
      '  <div style="font-size:10px;letter-spacing:.1em;color:#EF9F27;margin-bottom:8px">SESSION PREFLIGHT</div>',
      '  <div style="font-size:12px;color:#EF9F27;font-weight:700;margin-bottom:10px;font-family:monospace">' + scriptName + '</div>',
      '  <div id="phr-pre-rows" style="margin-bottom:12px">' + _buildRowsHTML() + '</div>',
      '  <div id="phr-pre-status" style="font-size:10px;color:#E24B4A;margin-bottom:12px">',
      '    ' + missing.length + ' required session' + (missing.length !== 1 ? 's' : '') + ' not connected: ' + missing.join(', '),
      '  </div>',
      '  <div style="font-size:10px;color:#EF9F27;margin-bottom:14px">',
      '    Open a Compass window for each missing session and log in. Script will block when it reaches those steps.',
      '  </div>',
      '  <div style="display:flex;gap:8px;justify-content:flex-end">',
      '    <button id="phr-pre-cancel" style="font-size:10px;padding:4px 12px;border:1px solid rgba(0,201,201,0.35);border-radius:3px;background:transparent;color:#EF9F27;cursor:pointer;font-family:monospace">Cancel</button>',
      '    <button id="phr-pre-run" style="font-size:10px;padding:4px 12px;border:1px solid rgba(239,159,39,.4);border-radius:3px;background:rgba(239,159,39,.1);color:#EF9F27;cursor:pointer;font-family:monospace;font-weight:700">Run anyway ▶</button>',
      '  </div>',
      '</div>',
    ].join('');

    var panel = document.getElementById('cmd-center-panel');
    if (panel) {
      // Use fixed positioning matching the panel's bounding rect.
      // Do NOT mutate panel.style.position — it's position:fixed and changing
      // it collapses layout and breaks the toggle hotkey.
      var r = panel.getBoundingClientRect();
      overlay.style.cssText = [
        'position:fixed',
        'left:'   + r.left   + 'px',
        'top:'    + r.top    + 'px',
        'width:'  + r.width  + 'px',
        'height:' + r.height + 'px',
        'background:rgba(4,7,16,.88)',
        'display:flex;align-items:center;justify-content:center',
        'z-index:100000',
        'border-radius:8px',
      ].join(';');
      document.body.appendChild(overlay);
    } else {
      document.body.appendChild(overlay);
    }

    // Live refresh: every 1s, rebuild rows and status from current _sessions.
    // If all required aliases come online, auto-resolve and proceed.
    var _pollId = setInterval(function() {
      if (!document.getElementById('phr-preflight')) { clearInterval(_pollId); return; }
      var rowsEl   = overlay.querySelector('#phr-pre-rows');
      var statusEl = overlay.querySelector('#phr-pre-status');
      if (rowsEl) rowsEl.innerHTML = _buildRowsHTML();
      var nowMissing = _currentMissing();
      if (statusEl) {
        if (nowMissing.length === 0) {
          statusEl.style.color = '#1D9E75';
          statusEl.textContent = '✓ All required sessions connected — proceeding…';
        } else {
          statusEl.style.color = '#E24B4A';
          statusEl.textContent = nowMissing.length + ' required session' + (nowMissing.length !== 1 ? 's' : '') + ' not connected: ' + nowMissing.join(', ');
        }
      }
      if (nowMissing.length === 0) {
        clearInterval(_pollId);
        setTimeout(function() {
          if (overlay.parentNode) overlay.remove();
          resolve(true);
        }, 600);
      }
    }, 1000);

    overlay.querySelector('#phr-pre-cancel').onclick = function() {
      clearInterval(_pollId);
      overlay.remove();
      resolve(false);
    };
    overlay.querySelector('#phr-pre-run').onclick = function() {
      clearInterval(_pollId);
      overlay.remove();
      resolve(true);
    };
  });
}

// ── Script storage ────────────────────────────────────────────────────────────
function _loadScripts() {
  // Load from localStorage (synchronous; fast initial paint).
  // Substrate playbooks are loaded asynchronously by _loadPlaybooks()
  // which runs after auth/firm_id is resolved. Any localStorage entry
  // not yet migrated to substrate is still runnable via _scripts[name].
  var keys = Object.keys(localStorage).filter(function(k){ return k.startsWith('phud:script:'); });
  keys.forEach(function(k) {
    var name = k.replace('phud:script:', '');
    _scripts[name] = localStorage.getItem(k);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// CMD-AEGIS-PLAYBOOK-FOUNDATION — substrate-backed playbook loading
// ════════════════════════════════════════════════════════════════════════════

// Load all draft + published playbooks for this firm. Populates _playbooks
// (keyed by playbook_id), _playbookByName (name → id of best representative
// preferring published > draft > most-recent version), and _scripts (name →
// body for Run verb backward compat).
async function _loadPlaybooks() {
  if (!FIRM_ID) {
    console.warn('[Aegis Playbooks] _loadPlaybooks: FIRM_ID unresolved; skipping load');
    return 0;
  }
  try {
    var token = (typeof Auth !== 'undefined' && Auth.getFreshToken)
      ? await Auth.getFreshToken().catch(function(){ return SUPA_KEY; })
      : SUPA_KEY;
    var url = SUPA_URL + '/rest/v1/aegis_playbooks?select=*&firm_id=eq.' + FIRM_ID +
              '&state=in.(draft,published,superseded,archived)' +
              '&order=name.asc,version.desc';
    var resp = await fetch(url, {
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + token, Accept: 'application/json' },
    });
    if (!resp.ok) {
      console.warn('[Aegis Playbooks] _loadPlaybooks: query failed', resp.status);
      return 0;
    }
    var rows = await resp.json();
    _playbooks = {};
    _playbookByName = {};
    rows.forEach(function(r) {
      _playbooks[r.playbook_id] = r;
      // Resolution preference: published > draft > superseded > archived;
      // within same state, higher version wins. Rows are pre-sorted by
      // (name asc, version desc), so we walk in reverse to find best.
    });
    // Build name → playbook_id (best representative per name)
    var byName = {};
    rows.forEach(function(r) {
      var prev = byName[r.name];
      if (!prev) { byName[r.name] = r; return; }
      var rank = function(row) {
        if (row.state === 'published')  return 4;
        if (row.state === 'draft')      return 3;
        if (row.state === 'superseded') return 2;
        return 1; // archived
      };
      if (rank(r) > rank(prev) || (rank(r) === rank(prev) && r.version > prev.version)) {
        byName[r.name] = r;
      }
    });
    Object.keys(byName).forEach(function(name) {
      _playbookByName[name] = byName[name].playbook_id;
      // Hydrate _scripts so Run "name" continues to work.
      _scripts[name] = byName[name].body;
    });
    return rows.length;
  } catch (e) {
    console.warn('[Aegis Playbooks] _loadPlaybooks error:', e && e.message);
    return 0;
  }
}

// Load run history for a single playbook (last 10 runs).
async function _loadPlaybookRuns(playbookId) {
  if (!FIRM_ID || !playbookId) return [];
  try {
    var token = (typeof Auth !== 'undefined' && Auth.getFreshToken)
      ? await Auth.getFreshToken().catch(function(){ return SUPA_KEY; })
      : SUPA_KEY;
    var url = SUPA_URL + '/rest/v1/aegis_playbook_runs?select=*' +
              '&firm_id=eq.' + FIRM_ID +
              '&playbook_id=eq.' + playbookId +
              '&order=started_at.desc&limit=10';
    var resp = await fetch(url, {
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + token, Accept: 'application/json' },
    });
    if (!resp.ok) return [];
    var runs = await resp.json();
    _playbookRunsByPb[playbookId] = runs;
    return runs;
  } catch (e) { return []; }
}

// One-time migration of localStorage scripts → substrate drafts.
// Idempotent: skips entries whose name already exists in substrate.
// Lossless: localStorage entries are NOT deleted in v1.
async function _migrateLocalStorageToPlaybooks() {
  if (!FIRM_ID) return; // need auth
  if (localStorage.getItem('phud:playbooks-migrated') === 'true') return;
  // Wait for substrate load to complete so we can dedupe by name.
  var existingNames = new Set(Object.keys(_playbookByName));
  var lsKeys = Object.keys(localStorage).filter(function(k){ return k.startsWith('phud:script:'); });
  if (!lsKeys.length) {
    // Nothing to migrate; mark complete.
    try { localStorage.setItem('phud:playbooks-migrated', 'true'); } catch(_) {}
    return;
  }
  var token;
  try {
    token = (typeof Auth !== 'undefined' && Auth.getFreshToken)
      ? await Auth.getFreshToken()
      : SUPA_KEY;
  } catch (e) { return; /* retry next load */ }
  var userId = (typeof Auth !== 'undefined' && Auth.getCurrentUserId)
    ? Auth.getCurrentUserId() : null;
  if (!userId) return;
  var migrated = 0, skipped = 0, failed = 0;
  for (var i = 0; i < lsKeys.length; i++) {
    var k = lsKeys[i];
    var name = k.replace('phud:script:', '');
    var body = localStorage.getItem(k);
    if (!body || !name) { skipped++; continue; }
    if (existingNames.has(name)) { skipped++; continue; }
    var row = {
      firm_id:     FIRM_ID,
      name:        name,
      body:        body,
      description: 'Migrated from localStorage; original purpose to be classified.',
      kind:        'exploration',
      tags:        ['migrated-from-localstorage'],
      state:       'draft',
      created_by:  userId,
    };
    try {
      var resp = await fetch(SUPA_URL + '/rest/v1/aegis_playbooks', {
        method: 'POST',
        headers: {
          apikey: SUPA_KEY,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(row),
      });
      if (!resp.ok) { failed++; continue; }
      migrated++;
    } catch (e) { failed++; }
  }
  if (failed === 0) {
    try { localStorage.setItem('phud:playbooks-migrated', 'true'); } catch(_) {}
  }
  console.log('[Aegis] Migrated ' + migrated + ' playbooks from localStorage to substrate' +
              (skipped ? ' (' + skipped + ' skipped)' : '') +
              (failed ? ' (' + failed + ' failed; will retry on next load)' : ''));
  // Refresh substrate-backed maps after migration.
  if (migrated > 0) await _loadPlaybooks();
}

// SHA-256 of a string → hex (Web Crypto). Used at publish time per §3.5.
async function _sha256Hex(str) {
  try {
    var enc = new TextEncoder().encode(str);
    var hashBuf = await crypto.subtle.digest('SHA-256', enc);
    var bytes = new Uint8Array(hashBuf);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return hex;
  } catch (e) { return null; }
}

// Compute canonical playbook hash per §3.1 critical invariant 4.
async function _computePlaybookHash(row) {
  var canonical = (row.body || '') + '||' + (row.description || '') + '||' +
                  (row.kind || '') + '||' +
                  (Array.isArray(row.tags) ? row.tags.slice().sort().join(',') : '') + '||' +
                  String(row.version || 1) + '||' + (row.created_by || '');
  return await _sha256Hex(canonical);
}

// Insert a run row at run start (status='running'); return run_id.
async function _insertRunStart(playbookRow) {
  if (!FIRM_ID || !playbookRow) return null;
  try {
    var token = (typeof Auth !== 'undefined' && Auth.getFreshToken)
      ? await Auth.getFreshToken().catch(function(){ return SUPA_KEY; })
      : SUPA_KEY;
    var userId = (typeof Auth !== 'undefined' && Auth.getCurrentUserId)
      ? Auth.getCurrentUserId() : null;
    if (!userId) return null;
    var row = {
      firm_id:          FIRM_ID,
      playbook_id:      playbookRow.playbook_id,
      started_by:       userId,
      status:           'running',
      playbook_version: playbookRow.version,
      playbook_hash:    playbookRow.playbook_hash || null,
    };
    var resp = await fetch(SUPA_URL + '/rest/v1/aegis_playbook_runs', {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY, Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json', Prefer: 'return=representation',
      },
      body: JSON.stringify(row),
    });
    if (!resp.ok) return null;
    var rows = await resp.json();
    var runId = rows && rows[0] && rows[0].run_id;
    // Fire CoC event (best-effort; guard for CoC unavailability)
    if (runId && window.CoC && window.CoC.write && playbookRow) {
      var actorResId = (window._myResource && window._myResource.id) || null;
      if (!actorResId) {
        console.warn('[Aegis Playbooks] CoC run_started skipped: no _myResource.id');
      } else {
        try {
          await window.CoC.write('aegis.playbook.run_started', playbookRow.playbook_id, {
            entityType: 'aegis_playbook',
            actorResourceId: actorResId,
            notes: 'Run started: ' + playbookRow.name,
            meta: {
              run_id:           runId,
              playbook_id:      playbookRow.playbook_id,
              playbook_name:    playbookRow.name,
              playbook_version: playbookRow.version,
              playbook_kind:    playbookRow.kind,
            },
          });
          console.log('[Aegis Playbooks] CoC run_started written for', playbookRow.name);
        } catch(e) { console.warn('[Aegis Playbooks] CoC run_started failed:', e && e.message); }
      }
    }
    return runId;
  } catch (e) { return null; }
}

// Update a run row at completion (terminal status).
async function _completeRun(runId, terminalStatus, summary, commandCount, durationMs, playbookRow) {
  if (!runId) return;
  try {
    var token = (typeof Auth !== 'undefined' && Auth.getFreshToken)
      ? await Auth.getFreshToken().catch(function(){ return SUPA_KEY; })
      : SUPA_KEY;
    var patch = {
      status:             terminalStatus,
      completed_at:       new Date().toISOString(),
      transcript_summary: (summary || '').slice(0, 4000),
      command_count:      commandCount,
      duration_ms:        durationMs,
    };
    var resp1 = await fetch(SUPA_URL + '/rest/v1/aegis_playbook_runs?run_id=eq.' + runId, {
      method: 'PATCH',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!resp1.ok) {
      console.warn('[Aegis Playbooks] run PATCH failed:', resp1.status, await resp1.text().catch(function(){ return '?'; }));
    }
    // Mirror to playbook row's last_run_at / last_run_status
    if (playbookRow && playbookRow.playbook_id) {
      var pbPatch = {
        last_run_at:     new Date().toISOString(),
        last_run_status: terminalStatus === 'pass' ? 'pass' :
                         terminalStatus === 'fail' ? 'fail' :
                         terminalStatus === 'aborted' ? 'aborted' : 'error',
      };
      var resp2 = await fetch(SUPA_URL + '/rest/v1/aegis_playbooks?playbook_id=eq.' + playbookRow.playbook_id, {
        method: 'PATCH',
        headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(pbPatch),
      });
      if (!resp2.ok) {
        console.warn('[Aegis Playbooks] playbook last_run PATCH failed:', resp2.status, await resp2.text().catch(function(){ return '?'; }));
      } else {
        console.log('[Aegis Playbooks] last_run_at updated for', playbookRow.name);
      }
      // Update local cache so UI reflects immediately
      if (_playbooks[playbookRow.playbook_id]) {
        _playbooks[playbookRow.playbook_id].last_run_at     = pbPatch.last_run_at;
        _playbooks[playbookRow.playbook_id].last_run_status = pbPatch.last_run_status;
      }
    }
    // Fire CoC event
    if (window.CoC && window.CoC.write && playbookRow) {
      var actorResId = (window._myResource && window._myResource.id) || null;
      if (!actorResId) {
        console.warn('[Aegis Playbooks] CoC run_completed skipped: no _myResource.id (identity not yet resolved)');
      } else {
        try {
          await window.CoC.write('aegis.playbook.run_completed', playbookRow.playbook_id, {
            entityType: 'aegis_playbook',
            actorResourceId: actorResId,
            notes: 'Run ' + terminalStatus + ': ' + playbookRow.name,
            meta: {
              run_id:           runId,
              playbook_id:      playbookRow.playbook_id,
              playbook_name:    playbookRow.name,
              playbook_version: playbookRow.version,
              playbook_kind:    playbookRow.kind,
              status:           terminalStatus,
              duration_ms:      durationMs,
            },
          });
          console.log('[Aegis Playbooks] CoC run_completed written for', playbookRow.name);
        } catch(e) { console.warn('[Aegis Playbooks] CoC run_completed failed:', e && e.message); }
      }
    }
  } catch (e) { /* swallow — non-fatal */ }
}

// Lifecycle: publish a draft.
async function _publishPlaybook(playbookId) {
  var pb = _playbooks[playbookId];
  if (!pb || pb.state !== 'draft') return { ok: false, error: 'not a draft' };
  if (!FIRM_ID) return { ok: false, error: 'firm_id unresolved' };
  try {
    var token = (typeof Auth !== 'undefined' && Auth.getFreshToken)
      ? await Auth.getFreshToken() : SUPA_KEY;
    // Resolve prior published version of same name (if any).
    var priorUrl = SUPA_URL + '/rest/v1/aegis_playbooks?select=playbook_id,version,playbook_hash' +
                   '&firm_id=eq.' + FIRM_ID + '&name=eq.' + encodeURIComponent(pb.name) +
                   '&state=eq.published&order=version.desc&limit=1';
    var priorResp = await fetch(priorUrl, {
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + token, Accept: 'application/json' },
    });
    var priors = priorResp.ok ? await priorResp.json() : [];
    var prior = priors[0] || null;
    var newVersion = prior ? (prior.version + 1) : 1;
    var supersedesId = prior ? prior.playbook_id : null;
    var prevHash = prior ? prior.playbook_hash : null;
    // Compute hash with the updated version.
    var hashRow = Object.assign({}, pb, { version: newVersion });
    var newHash = await _computePlaybookHash(hashRow);
    // 1) Update prior published row to 'superseded' (if any).
    if (prior) {
      await fetch(SUPA_URL + '/rest/v1/aegis_playbooks?playbook_id=eq.' + prior.playbook_id, {
        method: 'PATCH',
        headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'superseded' }),
      });
    }
    // 2) Update this row: state→published, version, supersedes_id, hashes.
    var nowIso = new Date().toISOString();
    var resp = await fetch(SUPA_URL + '/rest/v1/aegis_playbooks?playbook_id=eq.' + playbookId, {
      method: 'PATCH',
      headers: {
        apikey: SUPA_KEY, Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json', Prefer: 'return=representation',
      },
      body: JSON.stringify({
        state:         'published',
        version:       newVersion,
        supersedes_id: supersedesId,
        playbook_hash: newHash,
        prev_hash:     prevHash,
        published_at:  nowIso,
      }),
    });
    if (!resp.ok) {
      var errText = await resp.text().catch(function(){ return '?'; });
      return { ok: false, error: 'publish failed: ' + resp.status + ' ' + errText };
    }
    // CoC event
    if (window.CoC && window.CoC.write && window._myResource) {
      try {
        await window.CoC.write('aegis.playbook.published', playbookId, {
          entityType: 'aegis_playbook',
          actorResourceId: window._myResource.id,
          notes: 'Playbook published: ' + pb.name + ' v' + newVersion,
          meta: {
            playbook_id:      playbookId,
            playbook_name:    pb.name,
            playbook_version: newVersion,
            playbook_kind:    pb.kind,
            playbook_hash:    newHash,
            supersedes_id:    supersedesId,
          },
        });
      } catch(_) {}
    }
    await _loadPlaybooks();
    return { ok: true, version: newVersion, hash: newHash };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'publish error' };
  }
}

// Lifecycle: archive a published or superseded playbook.
async function _archivePlaybook(playbookId) {
  var pb = _playbooks[playbookId];
  if (!pb) return { ok: false, error: 'not found' };
  if (pb.state !== 'published' && pb.state !== 'superseded') {
    return { ok: false, error: 'archive only valid from published or superseded' };
  }
  try {
    var token = (typeof Auth !== 'undefined' && Auth.getFreshToken)
      ? await Auth.getFreshToken() : SUPA_KEY;
    var resp = await fetch(SUPA_URL + '/rest/v1/aegis_playbooks?playbook_id=eq.' + playbookId, {
      method: 'PATCH',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'archived', archived_at: new Date().toISOString() }),
    });
    if (!resp.ok) return { ok: false, error: 'archive failed: ' + resp.status };
    await _loadPlaybooks();
    return { ok: true };
  } catch (e) { return { ok: false, error: (e && e.message) }; }
}

// Lifecycle: restore an archived playbook back to 'draft'.
// Architect decision per §11 hand-off finding: restore→'draft' rather than
// →'published'. Rationale: restoring to published bypasses the
// publish-confirmation step, which is the only place IR42 hash anchoring
// is enforced. Drafts are mutable; if the operator wants it live again,
// they re-publish through the normal flow (which produces a new version,
// preserving the supersedes chain integrity).
async function _restorePlaybook(playbookId) {
  var pb = _playbooks[playbookId];
  if (!pb || pb.state !== 'archived') return { ok: false, error: 'not archived' };
  try {
    var token = (typeof Auth !== 'undefined' && Auth.getFreshToken)
      ? await Auth.getFreshToken() : SUPA_KEY;
    // Restore to draft. Since this row was previously published, the
    // immutability trigger would block a body change while state remains
    // 'published' — restoring to 'draft' is the supported path.
    // Note: state transition published→archived was already taken, so
    // archived→draft is a fresh transition and the trigger allows it
    // (current state is 'archived', not 'published').
    var resp = await fetch(SUPA_URL + '/rest/v1/aegis_playbooks?playbook_id=eq.' + playbookId, {
      method: 'PATCH',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'draft', archived_at: null, playbook_hash: null, prev_hash: null }),
    });
    if (!resp.ok) return { ok: false, error: 'restore failed: ' + resp.status };
    await _loadPlaybooks();
    return { ok: true };
  } catch (e) { return { ok: false, error: (e && e.message) }; }
}

// Save (insert or update) a draft from the editor. Creates a new draft if
// no playbookId provided; updates existing draft (same row) if it provided.
async function _saveDraftPlaybook(playbookId, fields) {
  if (!FIRM_ID) return { ok: false, error: 'firm_id unresolved' };
  try {
    var token = (typeof Auth !== 'undefined' && Auth.getFreshToken)
      ? await Auth.getFreshToken() : SUPA_KEY;
    var userId = (typeof Auth !== 'undefined' && Auth.getCurrentUserId)
      ? Auth.getCurrentUserId() : null;
    if (!userId) return { ok: false, error: 'not authenticated' };
    if (playbookId) {
      // UPDATE existing draft. Reject if not draft (immutability trigger
      // would also reject server-side; check client-side for friendlier UX).
      var existing = _playbooks[playbookId];
      if (existing && existing.state !== 'draft') {
        return { ok: false, error: 'cannot edit non-draft directly; use Edit→new draft flow' };
      }
      var resp = await fetch(SUPA_URL + '/rest/v1/aegis_playbooks?playbook_id=eq.' + playbookId, {
        method: 'PATCH',
        headers: {
          apikey: SUPA_KEY, Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json', Prefer: 'return=representation',
        },
        body: JSON.stringify(fields),
      });
      if (!resp.ok) {
        var errText = await resp.text().catch(function(){ return '?'; });
        return { ok: false, error: resp.status + ' ' + errText };
      }
      var rows = await resp.json();
      await _loadPlaybooks();
      return { ok: true, playbook: rows && rows[0] };
    } else {
      // INSERT new draft.
      var insertRow = Object.assign({
        firm_id:    FIRM_ID,
        state:      'draft',
        kind:       'exploration',
        tags:       [],
        created_by: userId,
      }, fields);
      var resp2 = await fetch(SUPA_URL + '/rest/v1/aegis_playbooks', {
        method: 'POST',
        headers: {
          apikey: SUPA_KEY, Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json', Prefer: 'return=representation',
        },
        body: JSON.stringify(insertRow),
      });
      if (!resp2.ok) {
        var errText2 = await resp2.text().catch(function(){ return '?'; });
        return { ok: false, error: resp2.status + ' ' + errText2 };
      }
      var rows2 = await resp2.json();
      await _loadPlaybooks();
      return { ok: true, playbook: rows2 && rows2[0] };
    }
  } catch (e) { return { ok: false, error: (e && e.message) }; }
}

// "Edit a published playbook" → creates a new draft row with same name.
// The old published row stays as-is until the new draft is published,
// at which point the supersedes mechanism activates.
async function _createDraftFromPublished(publishedPbId) {
  var pub = _playbooks[publishedPbId];
  if (!pub) return { ok: false, error: 'not found' };
  return await _saveDraftPlaybook(null, {
    name:        pub.name,
    body:        pub.body,
    description: pub.description,
    kind:        pub.kind,
    tags:        pub.tags || [],
    origin_cmd:  pub.origin_cmd,
  });
}

// Auto-load scripts from /scripts/*.txt on the server
// Fetches a manifest at /scripts/index.json or falls back to known filenames
async function _loadServerScripts() {
  try {
    // Try Vercel API route first (auto-enumerates /scripts/ directory)
    // Falls back to /scripts/index.json manifest if API not available
    var filenames = [];
    var apiResp = await fetch('/api/scripts', { cache: 'no-store' }).catch(function(){ return null; });
    if (apiResp && apiResp.ok) {
      filenames = await apiResp.json();
    } else {
      var manifestResp = await fetch('/scripts/index.json', { cache: 'no-store' }).catch(function(){ return null; });
      if (manifestResp && manifestResp.ok) {
        var manifest = await manifestResp.json();
        filenames = Array.isArray(manifest) ? manifest : (manifest.scripts || []);
      } else {
        return; // nothing to load
      }
    }

    // Fetch and store each script file
    var loaded = 0;
    for (var j = 0; j < filenames.length; j++) {
      var fname = filenames[j];
      var name  = fname.replace(/\.txt$/i, '');
      try {
        var resp = await fetch('/scripts/' + fname, { cache: 'no-store' });
        if (resp.ok) {
          var text = await resp.text();
          // Server scripts take precedence over localStorage versions
          _scripts[name] = text;
          localStorage.setItem('phud:script:' + name, text);
          loaded++;
        }
      } catch(e) {}
    }

    if (loaded > 0) {
      console.log('[CMD Center] loaded ' + loaded + ' script(s) from /scripts/');
      if (_panelEl) { _renderScriptList(); _renderLibrary && _renderLibrary(); }
    }
  } catch(e) {
    console.warn('[CMD Center] script auto-load failed:', e);
  }
}

function _saveScript(name, text) {
  _scripts[name] = text;
  localStorage.setItem('phud:script:' + name, text);
}

function _deleteScript(name) {
  delete _scripts[name];
  localStorage.removeItem('phud:script:' + name);
}

// ── Panel UI ──────────────────────────────────────────────────────────────────
var _activeTab     = 'transcript';
var _activeScript  = null;
var _editorText    = '';
var _cmdHistory    = [];
var _cmdHistoryIdx = -1;

function _buildPanel() {
  if (_panelEl) return;
  if (window._aegisMode) {
    _panelEl = document.getElementById('aegis-cmd-panel');
    if (!_panelEl) { console.warn('[CMD] aegis-cmd-panel not found'); return; }
    _wirePanel(); _renderSessionList(); _renderScriptList(); _renderTranscript(); _updateStatusEl();
    if (window._cmdConnected) _startLiveClock();
    return;
  }
  var el = document.createElement('div');
  el.id = 'cmd-center-panel';
  // In pop-out mode (flagged by window._cmdCenterFullscreen), fill the entire window
  if (window._cmdCenterFullscreen) {
    el.style.cssText = [
      'position:fixed;inset:0;width:100vw;height:100vh',
      'background:#060a10;border:none;border-radius:0',
      'display:flex;flex-direction:column;z-index:99999',
      'font-family:monospace;overflow:hidden',
    ].join(';');
  } else {
    el.style.cssText = [
      'position:fixed;bottom:20px;right:20px;width:840px;height:520px',
      'background:#060a10;border:1px solid #00c9c9;border-radius:8px',
      'display:flex;flex-direction:column;z-index:99999;box-shadow:0 20px 60px rgba(0,0,0,.8)',
      'font-family:monospace;overflow:hidden',
      'resize:both',
    ].join(';');
  }

  el.innerHTML = _panelHTML();
  document.body.appendChild(el);
  _panelEl = el;
  _wirePanel();
  _renderSessionList();
  _renderScriptList();
  _renderTranscript();
  _updateStatusEl();
  if (window._cmdConnected) _startLiveClock();
}

function _panelHTML() {
  return `
<style>
#phr-pane-transcript::-webkit-scrollbar,
#phr-pane-monitor::-webkit-scrollbar,
#phr-pane-library::-webkit-scrollbar,
#phr-pane-editor::-webkit-scrollbar,
#phr-sessions::-webkit-scrollbar,
#phr-scripts::-webkit-scrollbar {
  width:16px;height:16px;
}
#phr-pane-transcript::-webkit-scrollbar-track,
#phr-pane-monitor::-webkit-scrollbar-track,
#phr-pane-library::-webkit-scrollbar-track,
#phr-sessions::-webkit-scrollbar-track,
#phr-scripts::-webkit-scrollbar-track {
  background:#d4d0c8;border:1px solid #a0a0a0;
  box-shadow:inset 1px 1px 0 #fff,inset -1px -1px 0 #808080;
}
#phr-pane-transcript::-webkit-scrollbar-thumb,
#phr-pane-monitor::-webkit-scrollbar-thumb,
#phr-pane-library::-webkit-scrollbar-thumb,
#phr-sessions::-webkit-scrollbar-thumb,
#phr-scripts::-webkit-scrollbar-thumb {
  background:#c0c0c0;border:1px solid #808080;
  box-shadow:inset 1px 1px 0 #fff,inset -1px -1px 0 #404040;
  min-height:20px;
}
#phr-pane-transcript::-webkit-scrollbar-thumb:hover,
#phr-pane-monitor::-webkit-scrollbar-thumb:hover {
  background:#a8a8a8;
}
#phr-pane-transcript::-webkit-scrollbar-button,
#phr-pane-monitor::-webkit-scrollbar-button,
#phr-pane-library::-webkit-scrollbar-button {
  background:#c0c0c0;border:1px solid #808080;
  box-shadow:inset 1px 1px 0 #fff,inset -1px -1px 0 #404040;
  width:16px;height:16px;display:block;
}
#phr-pane-transcript::-webkit-scrollbar-corner,
#phr-pane-monitor::-webkit-scrollbar-corner {
  background:#d4d0c8;
}
#phr-pane-transcript,#phr-pane-monitor,#phr-pane-library {
  scrollbar-width:auto;scrollbar-color:#c0c0c0 #d4d0c8;
}
</style>
<div id="phr-titlebar" style="background:#040710;border-bottom:1px solid #0d1f2e;padding:6px 10px;display:flex;align-items:center;gap:8px;flex-shrink:0;cursor:move">
  <span style="font-size:11px;font-weight:700;color:#00c9c9;letter-spacing:.1em;flex-shrink:0">COMMAND CENTER</span>
  <span id="phr-status" style="font-size:10px;color:#EF9F27;flex-shrink:0">connecting…</span>
  <div id="phr-live-banner" style="display:none;align-items:center;gap:5px;margin-left:4px">
    <div id="phr-live-dot" style="width:7px;height:7px;border-radius:50%;background:#1D9E75;flex-shrink:0"></div>
    <span id="phr-live-time" style="font-size:10px;font-family:monospace;color:#1D9E75;letter-spacing:.04em">LIVE</span>
  </div>
  <div style="flex:1"></div>
  <button class="phr-tab-btn phr-tab-active" data-tab="transcript" style="font-size:10px;padding:2px 8px;border:1px solid rgba(0,201,201,.3);border-radius:3px;background:rgba(0,201,201,.1);color:#00c9c9;cursor:pointer;font-family:monospace;letter-spacing:.05em">Transcript</button>
  <button class="phr-tab-btn" data-tab="monitor" style="font-size:10px;padding:2px 8px;border:1px solid rgba(0,201,201,0.28);border-radius:3px;background:transparent;color:#ffffff;cursor:pointer;font-family:monospace;letter-spacing:.05em">Monitor</button>
  <button class="phr-tab-btn" data-tab="editor" style="font-size:10px;padding:2px 8px;border:1px solid rgba(0,201,201,0.28);border-radius:3px;background:transparent;color:#ffffff;cursor:pointer;font-family:monospace;letter-spacing:.05em">Editor</button>
  <button class="phr-tab-btn" data-tab="library" style="font-size:10px;padding:2px 8px;border:1px solid rgba(0,201,201,0.28);border-radius:3px;background:transparent;color:#ffffff;cursor:pointer;font-family:monospace;letter-spacing:.05em">Library</button>
  <div style="width:1px;height:16px;background:rgba(0,201,201,0.22);margin:0 2px;flex-shrink:0"></div>
  <button id="phr-pop-dot" title="Pop out to new window" style="font-size:11px;padding:2px 7px;border:1px solid rgba(29,158,117,.4);border-radius:3px;background:rgba(29,158,117,.1);color:#1D9E75;cursor:pointer;font-family:monospace;flex-shrink:0">⤢ Pop Out</button>
  <button id="phr-min-dot" title="Minimize" style="font-size:11px;padding:2px 7px;border:1px solid rgba(0,201,201,0.28);border-radius:3px;background:transparent;color:#EF9F27;cursor:pointer;font-family:monospace;flex-shrink:0">—</button>
  <button id="phr-close-dot" title="Close" style="font-size:11px;padding:2px 7px;border:1px solid rgba(226,75,74,.4);border-radius:3px;background:rgba(226,75,74,.1);color:#E24B4A;cursor:pointer;font-family:monospace;flex-shrink:0">✕</button>
</div>

<div style="display:flex;flex:1;min-height:0">

  <!-- Sidebar -->
  <div style="width:180px;border-right:1px solid #0d1f2e;display:flex;flex-direction:column;flex-shrink:0">

    <div style="border-bottom:1px solid #0d1f2e">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px 3px">
        <div style="font-size:9px;font-weight:700;letter-spacing:.14em;color:#EF9F27;text-transform:uppercase">Sessions</div>
        <div style="display:flex;align-items:center;gap:4px" title="Your alias — used in scripts as VS:, AK:, etc.">
          <span style="font-size:9px;color:#EF9F27">alias</span>
          <input id="phr-alias-input" maxlength="4"
            style="width:34px;font-family:monospace;font-size:10px;font-weight:700;background:rgba(239,159,39,.08);border:1px solid rgba(239,159,39,.25);border-radius:2px;color:#EF9F27;text-align:center;outline:none;padding:1px 3px;text-transform:uppercase"
            placeholder="VS">
        </div>
      </div>
      <div id="phr-sessions" style="padding-bottom:4px"></div>
    </div>

    <div style="font-size:9px;font-weight:700;letter-spacing:.14em;color:#EF9F27;padding:7px 10px 3px;text-transform:uppercase">Playbooks</div>
    <div id="phr-scripts" style="flex:1;overflow-y:auto;padding-bottom:4px"></div>

    <div style="border-top:1px solid #0d1f2e;padding:6px 8px">
      <button id="phr-new-script" style="width:100%;font-size:10px;font-weight:700;padding:4px;border:1px solid rgba(0,201,201,.3);border-radius:3px;background:transparent;color:#00c9c9;cursor:pointer;font-family:monospace;letter-spacing:.05em">+ New Playbook</button>
    </div>
  </div>

  <!-- Main area -->
  <div style="flex:1;display:flex;flex-direction:column;min-width:0">

    <!-- Transcript tab — no header row, buttons moved to bottom -->
    <div id="phr-pane-transcript" style="flex:1;overflow-y:auto;padding:8px 12px;display:block" class="phr-pane"></div>
    <div id="phr-pane-monitor" style="display:none;flex:1;overflow-y:auto;padding:8px 12px;flex-direction:column;gap:1px" class="phr-pane">
      <div style="font-size:10px;color:#EF9F27;padding:4px 0 8px;font-family:monospace">Session presence events — join / leave / location updates</div>
    </div>

    <!-- Editor tab -->
    <div id="phr-pane-editor" style="display:none;flex:1;flex-direction:column" class="phr-pane">
      <div style="padding:6px 12px;border-bottom:1px solid #0d1f2e;flex-shrink:0">
        <input id="phr-script-name" placeholder="script-name" style="font-family:monospace;font-size:11px;background:transparent;border:none;outline:none;color:#EF9F27;width:100%">
      </div>
      <textarea id="phr-editor" placeholder="# Script commands — one per line
# Example:
VS: Set Tab &quot;MY REQUESTS&quot;
VS: Set SubTab &quot;BROWSE&quot;
VS: Form Open &quot;Expense Report&quot;
VS: Form Insert employee_name &quot;Vaughn Staples&quot;
VS: Form Submit
VS: Get instance_id
Wait 2000
VS: Set SubTab &quot;ACTIVE&quot;
VS: Click &quot;Review&quot; $instance_id
VS: Click &quot;Approve&quot;"
        style="flex:1;width:100%;background:#040710;border:none;outline:none;color:#ffffff;font-family:monospace;font-size:11px;padding:10px 12px;resize:none;line-height:1.7"></textarea>
    </div>

    <!-- Library tab (CMD-AEGIS-PLAYBOOK-FOUNDATION) -->
    <div id="phr-pane-library" style="display:none;flex:1;overflow-y:auto;padding:10px 12px" class="phr-pane">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <input id="phr-library-search" type="text" placeholder="search playbooks…" autocomplete="off"
          style="flex:1;background:#040710;border:1px solid #0d1f2e;border-radius:3px;outline:none;color:#EF9F27;font-family:monospace;font-size:11px;padding:4px 8px"/>
        <button id="phr-refresh-scripts" title="Reload from substrate"
          style="font-size:10px;padding:2px 8px;border:1px solid rgba(0,201,201,.3);border-radius:3px;
                 background:transparent;color:#00c9c9;cursor:pointer;font-family:monospace;
                 white-space:nowrap;flex-shrink:0">↻ Refresh</button>
      </div>
      <div id="phr-library-filter-row" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:8px;font-family:monospace;font-size:10px;color:#8b8273">
        <span style="margin-right:4px">Kind:</span>
        <button class="phr-kind-chip" data-kind="" style="font-size:9px;padding:2px 6px;border:1px solid #EF9F2744;border-radius:2px;background:rgba(239,159,39,0.08);color:#EF9F27;cursor:pointer;font-family:monospace">ALL</button>
        <button class="phr-kind-chip" data-kind="verification" style="font-size:9px;padding:2px 6px;border:1px solid #1D9E7544;border-radius:2px;background:transparent;color:#1D9E75;cursor:pointer;font-family:monospace">verification</button>
        <button class="phr-kind-chip" data-kind="runbook" style="font-size:9px;padding:2px 6px;border:1px solid #5B7FFF44;border-radius:2px;background:transparent;color:#5B7FFF;cursor:pointer;font-family:monospace">runbook</button>
        <button class="phr-kind-chip" data-kind="demonstration" style="font-size:9px;padding:2px 6px;border:1px solid #EF9F2744;border-radius:2px;background:transparent;color:#EF9F27;cursor:pointer;font-family:monospace">demo</button>
        <button class="phr-kind-chip" data-kind="fixture" style="font-size:9px;padding:2px 6px;border:1px solid #a07cd944;border-radius:2px;background:transparent;color:#a07cd9;cursor:pointer;font-family:monospace">fixture</button>
        <button class="phr-kind-chip" data-kind="exploration" style="font-size:9px;padding:2px 6px;border:1px solid #8b827344;border-radius:2px;background:transparent;color:#8b8273;cursor:pointer;font-family:monospace">exploration</button>
        <span style="margin-left:8px">State:</span>
        <select id="phr-library-state" style="font-size:10px;background:#040710;border:1px solid #0d1f2e;border-radius:2px;color:#EF9F27;font-family:monospace;padding:2px 4px">
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="all">All</option>
        </select>
        <span style="margin-left:6px">Sort:</span>
        <select id="phr-library-sort" style="font-size:10px;background:#040710;border:1px solid #0d1f2e;border-radius:2px;color:#EF9F27;font-family:monospace;padding:2px 4px">
          <option value="recent">Recent</option>
          <option value="name">Name</option>
          <option value="last-run">Last-run</option>
        </select>
      </div>
      <div id="phr-library-list"></div>
    </div>

    <!-- Bottom bar — single row: status + actions + stop -->
    <div style="border-top:1px solid #0d1f2e;flex-shrink:0;background:#040710">

      <!-- Single unified action/status bar -->
      <div id="phr-script-bar" style="padding:5px 10px;display:flex;align-items:center;gap:6px;border-bottom:1px solid #0d1f2e">
        <span id="phr-running-label" style="font-size:10px;color:#EF9F27;display:none">RUNNING</span>
        <span id="phr-running-name" style="font-size:10px;color:#EF9F27;font-weight:700;flex:1"></span>
        <button id="phr-clear-transcript" style="font-size:10px;padding:2px 8px;border:1px solid rgba(0,201,201,0.28);border-radius:3px;background:transparent;color:#EF9F27;cursor:pointer;font-family:monospace">✕ Clear</button>
        <button id="phr-copy-transcript" style="font-size:10px;padding:2px 8px;border:1px solid rgba(0,201,201,0.28);border-radius:3px;background:transparent;color:#EF9F27;cursor:pointer;font-family:monospace">⎘ Copy</button>
        <div style="width:1px;height:14px;background:rgba(0,201,201,0.22)"></div>
        <button id="phr-save-script" style="font-size:10px;padding:2px 8px;border:1px solid rgba(0,201,201,0.35);border-radius:3px;background:transparent;color:#cfe9e9;cursor:pointer;font-family:monospace">Save</button>
        <button id="phr-publish-pb" style="font-size:10px;padding:2px 8px;border:1px solid rgba(29,158,117,.5);border-radius:3px;background:rgba(29,158,117,.1);color:#1D9E75;cursor:pointer;font-family:monospace;display:none">▶ Publish</button>
        <button id="phr-edit-pb" style="font-size:10px;padding:2px 8px;border:1px solid rgba(91,127,255,.5);border-radius:3px;background:transparent;color:#5B7FFF;cursor:pointer;font-family:monospace;display:none">Edit (new draft)</button>
        <button id="phr-archive-pb" style="font-size:10px;padding:2px 8px;border:1px solid rgba(139,130,115,.4);border-radius:3px;background:transparent;color:#8b8273;cursor:pointer;font-family:monospace;display:none">Archive</button>
        <button id="phr-restore-pb" style="font-size:10px;padding:2px 8px;border:1px solid rgba(91,127,255,.4);border-radius:3px;background:transparent;color:#5B7FFF;cursor:pointer;font-family:monospace;display:none">Restore (→draft)</button>
        <button id="phr-del-script" style="font-size:10px;padding:2px 8px;border:1px solid rgba(226,75,74,.3);border-radius:3px;background:transparent;color:rgba(226,75,74,.6);cursor:pointer;font-family:monospace">Delete</button>
        <div style="width:1px;height:14px;background:rgba(0,201,201,0.22)"></div>
        <button id="phr-run-script" style="font-size:10px;padding:2px 8px;border:1px solid #1D9E75;border-radius:3px;background:rgba(29,158,117,.1);color:#1D9E75;cursor:pointer;font-family:monospace;font-weight:700">▶ Run</button>
        <button id="phr-stop-btn" style="font-size:10px;padding:2px 8px;border:1px solid rgba(226,75,74,.4);border-radius:3px;background:transparent;color:#E24B4A;cursor:pointer;font-family:monospace">■ Stop</button>
      </div>

      <!-- Command input row -->
      <div style="padding:7px 10px;display:flex;gap:7px;align-items:center">
        <div id="phr-target-pill" style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:3px;border:1px solid rgba(0,201,201,.3);background:rgba(0,201,201,.1);color:#00c9c9;cursor:pointer;flex-shrink:0;white-space:nowrap">ALL ▾</div>
        <input id="phr-cmd" placeholder="Enter command…" style="flex:1;background:transparent;border:none;outline:none;font-family:monospace;font-size:12px;color:#fff;caret-color:#00c9c9">
      </div>
    </div>
  </div>
</div>`;
}

function _wirePanel() {
  var p = _panelEl;

  // Close/minimize dots — guarded because Aegis removed the pop-out; null.onclick
  // throws and aborts the rest of _wirePanel (tab switching, script clicks, etc.)
  var closeDot = p.querySelector('#phr-close-dot');
  if (closeDot) closeDot.onclick = function() {
    if (_scriptRunning) {
      _scriptAborted = true;
      _scriptRunning = false;
    }
    _togglePanel();
  };
  var minDot = p.querySelector('#phr-min-dot');
  if (minDot) minDot.onclick = function() { p.style.height = p.style.height === '36px' ? '520px' : '36px'; };
  var popDot = p.querySelector('#phr-pop-dot');
  if (popDot) popDot.onclick = function() { _popOut(); };

  // Alias input — lets operator set their session alias (VS, AK, etc.)
  var aliasInput = p.querySelector('#phr-alias-input');
  if (aliasInput) {
    aliasInput.value = _myAlias || (_mySession ? _mySession.initials : '');
    aliasInput.addEventListener('keydown', function(e) {
      // Force uppercase as typed
      setTimeout(function() { aliasInput.value = aliasInput.value.toUpperCase(); }, 0);
      if (e.key === 'Enter') { aliasInput.blur(); }
    });
    aliasInput.addEventListener('blur', function() {
      var newAlias = aliasInput.value.trim().toUpperCase();
      if (!newAlias) { aliasInput.value = _myAlias || _mySession.initials; return; }
      if (newAlias === _myAlias) return;
      _myAlias = newAlias;
      // Persist for this userId (surface-scoped — see load site)
      if (_mySession) {
        var _aliasKey = (window._aegisMode ? 'phud:cmd:alias:aegis:' : 'phud:cmd:alias:') + _mySession.userId;
        localStorage.setItem(_aliasKey, _myAlias);
      }
      // Re-track presence with new alias so other sessions pick it up.
      // CMD62: re-track on both channels so stale (legacy-only) tabs
      // see the alias update too.
      if (_mySession && !window._cmdCenterFullscreen) {
        var _trackPayload = {
          userId:   _mySession.userId,
          name:     _mySession.name,
          initials: _mySession.initials,
          alias:    _myAlias,
          location: _currentLocation(),
          ts:       Date.now(),
        };
        if (_channel)       { try { _channel.track(_trackPayload);       } catch(e) {} }
        if (_channelLegacy) { try { _channelLegacy.track(_trackPayload); } catch(e) {} }
      }
      // Update aliasMap locally so scripts can target immediately
      _aliasMap[_myAlias] = _mySession ? _mySession.userId : null;
      _appendLine('SYS', 'sys', 'Alias set: ' + _myAlias + ' · other sessions will see this within ~5s');
      _renderSessionList();
    });
  }

  // Tab switching
  p.querySelectorAll('.phr-tab-btn').forEach(function(btn) {
    btn.onclick = function() {
      _activeTab = btn.dataset.tab;
      p.querySelectorAll('.phr-tab-btn').forEach(function(b) {
        b.style.background  = b === btn ? 'rgba(0,201,201,.1)' : 'transparent';
        b.style.color       = b === btn ? '#00c9c9' : '#ffffff';
        b.style.borderColor = b === btn ? 'rgba(0,201,201,.3)' : 'rgba(0,201,201,0.28)';
      });
      p.querySelectorAll('.phr-pane').forEach(function(pane) {
        var isActive = pane.id === 'phr-pane-' + _activeTab;
        if (!isActive) {
          pane.style.display = 'none';
        } else if (pane.id === 'phr-pane-transcript') {
          pane.style.display = 'block'; // must stay block — flex causes line collapsing
        } else {
          pane.style.display = 'flex';
          pane.style.flexDirection = 'column';
        }
      });
      if (_activeTab === 'library') {
        _renderLibrary();
        // Wire library controls each time library tab opens
        var refreshBtn = p.querySelector('#phr-refresh-scripts');
        if (refreshBtn && !refreshBtn._wired) {
          refreshBtn._wired = true;
          refreshBtn.onclick = async function() {
            var btn = this;
            btn.textContent = '↻ …';
            btn.disabled = true;
            await _loadServerScripts();
            await _loadPlaybooks();
            _renderLibrary();
            btn.textContent = '↻ Refresh';
            btn.disabled = false;
          };
        }
        // CMD-AEGIS-PLAYBOOK-FOUNDATION: search box
        var searchEl = p.querySelector('#phr-library-search');
        if (searchEl && !searchEl._wired) {
          searchEl._wired = true;
          searchEl.addEventListener('input', function() {
            _libraryFilters.search = (searchEl.value || '').trim();
            _renderLibrary();
          });
        }
        // Kind chips (multi-select; empty = all)
        p.querySelectorAll('.phr-kind-chip').forEach(function(chip) {
          if (chip._wired) return;
          chip._wired = true;
          chip.addEventListener('click', function() {
            var k = chip.dataset.kind;
            if (!k) {
              _libraryFilters.kinds = []; // ALL
              p.querySelectorAll('.phr-kind-chip').forEach(function(c) {
                c.style.background = c.dataset.kind === '' ? 'rgba(239,159,39,0.08)' : 'transparent';
              });
            } else {
              var ix = _libraryFilters.kinds.indexOf(k);
              if (ix === -1) _libraryFilters.kinds.push(k);
              else            _libraryFilters.kinds.splice(ix, 1);
              // Update visual: ALL chip dims, k toggles
              var allChip = p.querySelector('.phr-kind-chip[data-kind=""]');
              if (allChip) allChip.style.background = _libraryFilters.kinds.length === 0 ? 'rgba(239,159,39,0.08)' : 'transparent';
              chip.style.background = (ix === -1) ? 'rgba(239,159,39,0.08)' : 'transparent';
            }
            _renderLibrary();
          });
        });
        // State dropdown
        var stateEl = p.querySelector('#phr-library-state');
        if (stateEl && !stateEl._wired) {
          stateEl._wired = true;
          stateEl.addEventListener('change', function() {
            _libraryFilters.state = stateEl.value;
            console.log('[Aegis Playbooks] state filter →', stateEl.value);
            _renderLibrary();
          });
        }
        // Sort dropdown
        var sortEl = p.querySelector('#phr-library-sort');
        if (sortEl && !sortEl._wired) {
          sortEl._wired = true;
          sortEl.addEventListener('change', function() {
            _libraryFilters.sort = sortEl.value;
            _renderLibrary();
          });
        }
      }
      if (_activeTab === 'transcript') {
        var tp = p.querySelector('#phr-pane-transcript');
        if (tp) tp.scrollTop = tp.scrollHeight;
      }
    };
  });

  // New script
  p.querySelector('#phr-new-script').onclick = function() {
    _activeScript = null;
    p.querySelector('#phr-script-name').value = 'new-script';
    p.querySelector('#phr-editor').value = '# New script\n';
    // Switch to editor
    p.querySelector('[data-tab="editor"]').click();
  };

  // Save script (CMD-AEGIS-PLAYBOOK-FOUNDATION: also persists to substrate as draft).
  p.querySelector('#phr-save-script').onclick = async function() {
    var saveBtn = this;
    var origText = saveBtn.textContent;
    var name = p.querySelector('#phr-script-name').value.trim().replace(/\s+/g, '-');
    var text = p.querySelector('#phr-editor').value;
    if (!name) { alert('Enter a playbook name'); return; }
    saveBtn.textContent = 'Saving…'; saveBtn.disabled = true;
    // localStorage parity (backward compat; non-blocking).
    _saveScript(name, text);
    _activeScript = name;
    // Substrate save: insert/update draft.
    if (FIRM_ID) {
      var existingId = _activePlaybookId;
      // If the active playbook is not a draft, save creates a new draft.
      var existing = existingId ? _playbooks[existingId] : null;
      if (existing && existing.state !== 'draft') existingId = null;
      var fields = { name: name, body: text };
      if (!existingId) {
        // Initialize a new draft with default kind/desc/tags
        fields.kind = 'exploration';
        fields.tags = [];
        fields.description = '';
      }
      var result = await _saveDraftPlaybook(existingId, fields);
      if (result.ok && result.playbook) {
        _activePlaybookId = result.playbook.playbook_id;
        _appendLine('SYS', 'sys', 'Playbook saved (draft): ' + name);
      } else {
        _appendLine('SYS', 'error', 'Playbook save error: ' + (result.error || 'unknown'));
      }
    } else {
      _appendLine('SYS', 'sys', 'Script saved (localStorage): ' + name);
    }
    _renderScriptList();
    if (_renderLibrary) _renderLibrary();
    if (p._updateLifecycleButtons) p._updateLifecycleButtons();
    saveBtn.textContent = '✓ Saved';
    setTimeout(function(){ saveBtn.textContent = origText; saveBtn.disabled = false; }, 1200);
  };

  // Run script from editor (CMD-AEGIS-PLAYBOOK-FOUNDATION: passes playbook_id).
  p.querySelector('#phr-run-script').onclick = function() {
    var name = p.querySelector('#phr-script-name').value.trim().replace(/\s+/g, '-');
    var text = p.querySelector('#phr-editor').value;
    p.querySelector('[data-tab="transcript"]').click();
    var pbId = _activePlaybookId || _playbookByName[name] || null;
    _runScript(text, name, pbId);
  };

  // CMD-AEGIS-PLAYBOOK-FOUNDATION: lifecycle buttons.
  // Null-guarded: aegis.html's #aegis-cmd-panel markup may not include
  // these buttons (they're in cmd-center's inline floating-panel markup
  // only). Aegis-mode panels can wire them after operator opens Editor
  // — for v1, lifecycle is editor-tab-only in floating mode.
  var publishBtn = p.querySelector('#phr-publish-pb');
  if (publishBtn) publishBtn.onclick = async function() {
    if (!_activePlaybookId) { alert('No playbook loaded'); return; }
    var pb = _playbooks[_activePlaybookId];
    if (!pb) { alert('Playbook row not found locally'); return; }
    if (pb.state !== 'draft') { alert('Only drafts can be published'); return; }
    var nextV = (function(){
      var maxV = 0;
      Object.values(_playbooks).forEach(function(r){ if (r.name === pb.name && r.state === 'published') maxV = Math.max(maxV, r.version || 1); });
      return maxV + 1;
    })();
    var go = await _confirmDialog({
      title: 'Publish playbook',
      body: 'Publish "<b>' + _escHtml(pb.name) + '</b>" as version <b>v' + nextV + '</b>?<br><br>' +
            '<span style="color:#EF9F27">Once published, the body of this playbook can no longer be edited.</span> ' +
            'To make changes later, click "Edit (new draft)" — that creates a new version you can modify and re-publish.',
      okLabel: 'Publish v' + nextV,
      okColor: '#1D9E75',
    });
    if (!go) return;
    var btn = this;
    btn.textContent = '▶ …'; btn.disabled = true;
    var result = await _publishPlaybook(_activePlaybookId);
    btn.textContent = '▶ Publish'; btn.disabled = false;
    if (result.ok) {
      _appendLine('SYS', 'sys', 'Playbook published: ' + pb.name + ' v' + result.version);
      _activePlaybookId = _playbookByName[pb.name] || null;
      _renderLibrary();
      _updateLifecycleButtons();
    } else {
      _appendLine('SYS', 'error', 'Publish failed: ' + result.error);
    }
  };

  var editBtn = p.querySelector('#phr-edit-pb');
  if (editBtn) editBtn.onclick = async function() {
    if (!_activePlaybookId) return;
    var pb = _playbooks[_activePlaybookId];
    if (!pb || pb.state !== 'published') { alert('Edit only valid on published rows'); return; }
    var result = await _createDraftFromPublished(_activePlaybookId);
    if (result.ok && result.playbook) {
      _activePlaybookId = result.playbook.playbook_id;
      p.querySelector('#phr-script-name').value = result.playbook.name;
      p.querySelector('#phr-editor').value = result.playbook.body;
      _appendLine('SYS', 'sys', 'New draft created from published: ' + result.playbook.name);
      _renderLibrary();
      _updateLifecycleButtons();
    } else {
      _appendLine('SYS', 'error', 'Edit failed: ' + (result.error || 'unknown'));
    }
  };

  var archiveBtn = p.querySelector('#phr-archive-pb');
  if (archiveBtn) archiveBtn.onclick = async function() {
    if (!_activePlaybookId) return;
    var pb = _playbooks[_activePlaybookId];
    if (!pb) return;
    var go = await _confirmDialog({
      title: 'Archive playbook',
      body: 'Archive "<b>' + _escHtml(pb.name) + '</b>" v' + (pb.version||1) + '?<br><br>' +
            'Archived playbooks stay in the library (filter by State → All to see them) and can still be run, but are hidden from the default Active view. You can restore an archived playbook back to a draft at any time.',
      okLabel: 'Archive',
      okColor: '#8b8273',
    });
    if (!go) return;
    var result = await _archivePlaybook(_activePlaybookId);
    if (result.ok) {
      _appendLine('SYS', 'sys', 'Playbook archived: ' + pb.name);
      _renderLibrary();
      _updateLifecycleButtons();
    } else {
      _appendLine('SYS', 'error', 'Archive failed: ' + result.error);
    }
  };

  var restoreBtn = p.querySelector('#phr-restore-pb');
  if (restoreBtn) restoreBtn.onclick = async function() {
    if (!_activePlaybookId) return;
    var pb = _playbooks[_activePlaybookId];
    if (!pb || pb.state !== 'archived') { alert('Restore only valid on archived rows'); return; }
    var go = await _confirmDialog({
      title: 'Restore playbook',
      body: 'Restore "<b>' + _escHtml(pb.name) + '</b>" to a draft?<br><br>' +
            'The playbook becomes editable again. To use it across the firm as the live version, click "Publish" after any edits — that will produce a new version (e.g. v' + ((pb.version||1)+1) + ') and supersede the previous published one.',
      okLabel: 'Restore as draft',
      okColor: '#5B7FFF',
    });
    if (!go) return;
    var result = await _restorePlaybook(_activePlaybookId);
    if (result.ok) {
      _appendLine('SYS', 'sys', 'Playbook restored to draft: ' + pb.name);
      _renderLibrary();
      _updateLifecycleButtons();
    } else {
      _appendLine('SYS', 'error', 'Restore failed: ' + result.error);
    }
  };

  // Delete script (drafts only via RLS; for non-substrate localStorage entries
  // also clears localStorage)
  p.querySelector('#phr-del-script').onclick = async function() {
    var name = p.querySelector('#phr-script-name').value.trim();
    if (!name) return;
    var go = await _confirmDialog({
      title: 'Delete playbook',
      body: 'Delete "<b>' + _escHtml(name) + '</b>"?<br><br>This cannot be undone. Only drafts can be deleted; if you want to remove a published playbook, archive it instead.',
      okLabel: 'Delete',
      okColor: '#E24B4A',
    });
    if (!go) return;
    // Substrate delete (drafts only).
    if (_activePlaybookId && _playbooks[_activePlaybookId]) {
      var pb = _playbooks[_activePlaybookId];
      if (pb.state !== 'draft') {
        await _confirmDialog({
          title: 'Cannot delete',
          body: 'This playbook is published (or has been previously published). To remove it from the active library, click <b>Archive</b> instead.',
          okLabel: 'OK',
          cancelLabel: '',
          okColor: '#8b8273',
        });
        return;
      }
      try {
        var token = (typeof Auth !== 'undefined' && Auth.getFreshToken)
          ? await Auth.getFreshToken() : SUPA_KEY;
        await fetch(SUPA_URL + '/rest/v1/aegis_playbooks?playbook_id=eq.' + _activePlaybookId, {
          method: 'DELETE',
          headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + token },
        });
      } catch (e) { /* swallow */ }
      _activePlaybookId = null;
      await _loadPlaybooks();
    }
    _deleteScript(name);
    _renderScriptList();
    _renderLibrary();
    p.querySelector('#phr-editor').value = '';
    p.querySelector('#phr-script-name').value = '';
    _updateLifecycleButtons();
  };

  // Update lifecycle button visibility based on _activePlaybookId state.
  function _updateLifecycleButtons() {
    var pubBtn = p.querySelector('#phr-publish-pb');
    if (!pubBtn) return; // markup not present in this surface
    var editBtn = p.querySelector('#phr-edit-pb');
    var arcBtn = p.querySelector('#phr-archive-pb');
    var resBtn = p.querySelector('#phr-restore-pb');
    var pb = _activePlaybookId ? _playbooks[_activePlaybookId] : null;
    var state = pb ? pb.state : null;
    pubBtn.style.display  = (state === 'draft')                                 ? '' : 'none';
    if (editBtn) editBtn.style.display = (state === 'published')                ? '' : 'none';
    if (arcBtn)  arcBtn.style.display  = (state === 'published' || state === 'superseded') ? '' : 'none';
    if (resBtn)  resBtn.style.display  = (state === 'archived')                 ? '' : 'none';
  }
  // Expose for re-use after script-name input changes
  p._updateLifecycleButtons = _updateLifecycleButtons;
  // Trigger initial state
  _updateLifecycleButtons();

  // Command input
  var cmdInput = p.querySelector('#phr-cmd');
  cmdInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      _runCmd();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (_cmdHistoryIdx < _cmdHistory.length - 1) {
        _cmdHistoryIdx++;
        cmdInput.value = _cmdHistory[_cmdHistory.length - 1 - _cmdHistoryIdx] || '';
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (_cmdHistoryIdx > 0) {
        _cmdHistoryIdx--;
        cmdInput.value = _cmdHistory[_cmdHistory.length - 1 - _cmdHistoryIdx] || '';
      } else {
        _cmdHistoryIdx = -1;
        cmdInput.value = '';
      }
    }
  });
  // Command input — Enter key runs the command (RUN button removed)

  // Stop button aborts running script
  var stopBtn = p.querySelector('#phr-stop-btn');
  if (stopBtn) {
    stopBtn.onclick = function() {
      if (_scriptRunning) {
        _scriptAborted = true;
        _appendLine('SYS', 'warn', '■ Stop requested');
      }
    };
  }

  // Clear transcript button
  var clearBtn = p.querySelector('#phr-clear-transcript');
  if (clearBtn) {
    clearBtn.onclick = function() {
      _transcript = [];
      var pane = p.querySelector('#phr-pane-transcript');
      if (pane) pane.innerHTML = '';
      _appendLine('SYS', 'sys', 'Transcript cleared');
    };
  }

  // Copy transcript button
  var copyBtn = p.querySelector('#phr-copy-transcript');
  if (copyBtn) {
    copyBtn.onclick = function() {
      var lines = _transcript
        .filter(function(l){ return l.type === 'cmd'; })
        .map(function(l){ return l.text; })
        .join('\n');
      navigator.clipboard.writeText(lines).then(function() {
        copyBtn.textContent = '✓ Copied';
        setTimeout(function(){ copyBtn.textContent = '⎘ Copy'; }, 2000);
      }).catch(function() {
        var ta = document.createElement('textarea');
        ta.value = lines; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy'); ta.remove();
        copyBtn.textContent = '✓ Copied';
        setTimeout(function(){ copyBtn.textContent = '⎘ Copy'; }, 2000);
      });
    };
  }

  // Target pill cycling
  p.querySelector('#phr-target-pill').onclick = function() {
    var sessionIds = ['ALL'].concat(Object.keys(_sessions));
    var idx = sessionIds.indexOf(_cmdTarget);
    _cmdTarget = sessionIds[(idx + 1) % sessionIds.length];
    var sess = _sessions[_cmdTarget];
    var label = _cmdTarget === 'ALL' ? 'ALL' : (sess ? sess.initials : _cmdTarget);
    this.textContent = label + ' ▾';
    this.style.color = _cmdTarget === 'ALL' ? '#00c9c9' : _sessionColor(_cmdTarget);
    this.style.borderColor = _cmdTarget === 'ALL' ? 'rgba(0,201,201,.3)' : 'rgba(0,201,201,0.45)';
  };

  // Drag to move — only applies to floating panel; Aegis embeds into host DOM without a titlebar
  var tb = p.querySelector('#phr-titlebar');
  if (tb) {
    var dragging = false, ox = 0, oy = 0;
    tb.addEventListener('mousedown', function(e) {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      ox = e.clientX - p.getBoundingClientRect().left;
      oy = e.clientY - p.getBoundingClientRect().top;
    });
    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      p.style.right = 'auto';
      p.style.bottom = 'auto';
      p.style.left = Math.max(0, e.clientX - ox) + 'px';
      p.style.top  = Math.max(0, e.clientY - oy) + 'px';
    });
    document.addEventListener('mouseup', function() { dragging = false; });
  }
}

function _runCmd() {
  var p = _panelEl;
  if (!p) return;
  var input = p.querySelector('#phr-cmd');
  var cmd   = input.value.trim();

  // If script is paused, Enter resumes regardless of input content
  if (_pauseResolve) {
    input.value = '';
    var resume = _pauseResolve;
    _pauseResolve = null;
    resume();
    return;
  }

  if (!cmd) return;
  _cmdHistory.push(cmd);
  _cmdHistoryIdx = -1;
  input.value = '';

  // Prefix with target if not already addressed
  var fullCmd = cmd;
  if (_cmdTarget !== 'ALL' && !cmd.match(/^[A-Z]{1,4}:\s*/)) {
    var sess = _sessions[_cmdTarget];
    if (sess) fullCmd = (sess.alias || sess.initials) + ': ' + cmd;
  }

  _appendLine(_myAlias || (_mySession ? _mySession.initials : 'ME'), 'cmd', cmd);

  // Determine if dispatching to remote session
  var parsed = _parseLine(fullCmd);
  if (parsed && parsed.target) {
    var targetUserId = _resolveTargetAlias(parsed.target);
    // CMD87: Narrate, DOFile added to local-verb list (Rule 29 — Aegis-local).
    // CMD87b: Set NarrateTarget added (Rule 29 — Aegis-local). Brief §3-q1.
    var _rl=['Assert','Log','Wait','Store','Get','DB Poll','DB Get','Run','Pause',
             'Narrate','Spotlight','DOFile','Set NarrateTarget',
             'Wait ForLocation','Wait ForInstance','Wait ForRoute','Wait ForForm','Wait ForQueueRow','Wait ForModal'];
    if (targetUserId && _channel && _rl.indexOf(parsed.verb)===-1) {
      // B-UI-5 / CMD71: resolve $variables against Aegis's _storeVars
      // before transmission. See _resolveVarsInCmd and script-path dispatch.
      var _resolvedCmd = _resolveVarsInCmd(cmd);
      _channelSend({
        type: 'broadcast', event: 'cmd',
        payload: { target: targetUserId, from: _myAlias || _mySession.initials, cmd: _resolvedCmd, cmdId: Date.now() }
      });
      return;
    }
  }

  // Catch rejections from Assert and other throwing commands so they
  // surface as transcript error lines rather than unhandled promise rejections.
  _executeCommand(fullCmd, _myAlias || (_mySession ? _mySession.initials : 'ME'))
    .catch(function() { /* already logged to transcript in _executeCommand */ });
}

// ── Render helpers ────────────────────────────────────────────────────────────
var SESSION_COLORS = ['#00c9c9','#1D9E75','#EF9F27','#7F77DD','#E24B4A','#85B7EB'];
var _colorMap = {};

function _sessionColor(userId) {
  if (!_colorMap[userId]) {
    var keys = Object.keys(_colorMap);
    _colorMap[userId] = SESSION_COLORS[keys.length % SESSION_COLORS.length];
  }
  return _colorMap[userId];
}

function _renderSessionList() {
  var p = _panelEl;
  if (!p) return;
  var container = p.querySelector('#phr-sessions');
  if (!container) return;

  var html = '';
  Object.entries(_sessions).forEach(function([uid, s]) {
    if (s.aegisObserver && !(_mySession && uid === _mySession.userId)) return;
    var color   = _sessionColor(uid);
    var isMine  = _mySession && uid === _mySession.userId;
    var isTarget = uid === _cmdTarget;
    var bg = isTarget ? 'rgba(0,201,201,.06)' : 'transparent';
    var border = isTarget ? '2px solid #00c9c9' : '2px solid transparent';
    var aliasDisplay = s.alias && s.alias !== s.initials
      ? '<span style="font-size:9px;color:#EF9F27;font-family:monospace;margin-left:3px">[' + s.alias + ']</span>'
      : '';
    var onlineIndicator = s.online
      ? '<div style="width:6px;height:6px;border-radius:50%;background:#1D9E75;flex-shrink:0"></div>'
      : (_leaveTimers&&_leaveTimers[uid])
        ? '<div style="width:6px;height:6px;border-radius:50%;background:#EF9F27;flex-shrink:0"></div>'
        : '<div style="width:6px;height:6px;border-radius:50%;background:rgba(0,201,201,0.35);flex-shrink:0"></div>';
    // CMD100.50: per-session record button. Idle = hollow circle, armed = filled red.
    var armed = !!_recordArmed[uid];
    var recBtn = '<div class="phr-rec-btn" data-rec-uid="' + uid + '" title="' + (armed?'Stop recording':'Record this session') + '" '
      + 'style="width:14px;height:14px;border-radius:50%;border:1.5px solid ' + (armed?'#E24B4A':'rgba(226,75,74,0.55)') + ';background:' + (armed?'#E24B4A':'transparent') + ';flex-shrink:0;cursor:pointer;margin-right:4px"></div>';
    html += '<div data-uid="' + uid + '" style="display:flex;align-items:center;gap:7px;padding:5px 10px;cursor:pointer;background:' + bg + ';border-left:' + border + '">'
      + '<div style="width:22px;height:22px;border-radius:50%;background:' + color + '22;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:' + color + ';flex-shrink:0">' + s.initials + '</div>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-size:11px;color:#ffffff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
      + s.name + aliasDisplay
      + (isMine ? ' <span style="font-size:9px;color:#EF9F27">(me)</span>' : '')
      + '</div>'
      + '<div style="font-size:9px;color:#EF9F27;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px">' + (s.location||'—') + '</div>'
      + '</div>'
      + recBtn
      + onlineIndicator
      + '</div>';
  });

  if (!Object.keys(_sessions).length) {
    html = '<div style="font-size:10px;color:#EF9F27;padding:8px 10px">No sessions yet</div>';
  }

  container.innerHTML = html;

  // Wire click to set target
  container.querySelectorAll('[data-uid]').forEach(function(el) {
    el.onclick = function() {
      _cmdTarget = el.dataset.uid;
      _renderSessionList();
      var pill = p.querySelector('#phr-target-pill');
      var sess = _sessions[_cmdTarget];
      if (pill && sess) {
        var label = sess.alias || sess.initials;
        pill.textContent = label + ' ▾';
        pill.style.color = _sessionColor(_cmdTarget);
        pill.style.borderColor = 'rgba(0,201,201,0.45)';
      }
    };
  });

  // CMD100.50: wire record-button toggles. Stop propagation so the
  // click doesn't bubble to the row-select handler above.
  container.querySelectorAll('.phr-rec-btn').forEach(function(btn) {
    btn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var uid = btn.dataset.recUid;
      if (!uid) return;
      _recordArmed[uid] = !_recordArmed[uid];
      var sess = _sessions[uid];
      var alias = (sess && (sess.alias || sess.initials)) || uid.slice(0, 4);
      _appendLine('SYS', 'sys', _recordArmed[uid]
        ? 'Recording armed for ' + alias
        : 'Recording stopped for ' + alias);
      _renderSessionList();
    });
  });
}

function _renderScriptList() {
  var p = _panelEl;
  if (!p) return;
  var container = p.querySelector('#phr-scripts');
  if (!container) return;

  var names = Object.keys(_scripts).sort();
  var html = names.map(function(name) {
    var isActive = name === _activeScript;
    // CMD-AEGIS-PLAYBOOK-FOUNDATION: state-aware tint + dot.
    var pbId = _playbookByName[name];
    var pb = pbId ? _playbooks[pbId] : null;
    var state = pb ? pb.state : 'legacy';
    var dotColor = state === 'published'  ? '#1D9E75' :
                   state === 'draft'      ? '#EF9F27' :
                   state === 'superseded' ? '#8b8273' :
                   state === 'archived'   ? '#5b5347' :
                                            '#a07cd9';   // legacy / unmigrated
    var dotChar = isActive ? '▶' : '●';
    var nameColor = isActive ? '#00c9c9'
                  : state === 'published' ? '#cfe9e9'
                  : '#ffffff';
    return `<div data-script="${name}" title="${state}" style="display:flex;align-items:center;gap:5px;padding:4px 10px;cursor:pointer;color:${nameColor}">
      <span style="font-size:13px;color:${dotColor}">${dotChar}</span>
      <span style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</span>
    </div>`;
  }).join('');

  if (!names.length) {
    html = '<div style="font-size:13px;color:#EF9F27;padding:6px 10px">No playbooks saved</div>';
  }

  container.innerHTML = html;

  container.querySelectorAll('[data-script]').forEach(function(el) {
    el.onclick = function() {
      var name = el.dataset.script;
      _activeScript = name;
      _activePlaybookId = _playbookByName[name] || null;
      var scriptEl = p.querySelector('#phr-script-name');
      var editorEl = p.querySelector('#phr-editor');
      if (scriptEl) scriptEl.value = name;
      if (editorEl) editorEl.value = _scripts[name] || '';
      _renderScriptList();
      p.querySelector('[data-tab="editor"]').click();
      if (p._updateLifecycleButtons) p._updateLifecycleButtons();
    };
  });
}

// CMD-AEGIS-PLAYBOOK-FOUNDATION: kind → color + label
var _PLAYBOOK_KIND_META = {
  'verification':  { color: '#1D9E75', label: 'verification' },
  'runbook':       { color: '#5B7FFF', label: 'runbook'      },
  'demonstration': { color: '#EF9F27', label: 'demonstration'},
  'fixture':       { color: '#a07cd9', label: 'fixture'      },
  'exploration':  { color: '#8b8273',  label: 'exploration' },
};

function _humanRelativeTime(iso) {
  if (!iso) return 'never run';
  var diff = Date.now() - new Date(iso).getTime();
  var sec = Math.floor(diff / 1000);
  if (sec < 60)         return 'just now';
  if (sec < 3600)       return Math.floor(sec/60) + 'm ago';
  if (sec < 86400)      return Math.floor(sec/3600) + 'h ago';
  if (sec < 86400 * 30) return Math.floor(sec/86400) + 'd ago';
  return new Date(iso).toLocaleDateString();
}

function _isStale(pb) {
  if (!pb || pb.state !== 'published') return false;
  if (!pb.last_run_at) return true;
  return (Date.now() - new Date(pb.last_run_at).getTime()) > (14 * 24 * 60 * 60 * 1000);
}

function _renderLibrary() {
  var p = _panelEl;
  if (!p) return;
  var container = p.querySelector('#phr-library-list');
  if (!container) return;

  // Composite source list: prefer substrate playbooks; fall back to
  // localStorage-only entries for backward compat (entries that have not
  // yet been migrated). For each name, pick the best representative row.
  var rows = [];
  var seen = new Set();
  Object.keys(_playbookByName).forEach(function(name) {
    var pbId = _playbookByName[name];
    var pb = _playbooks[pbId];
    if (pb) { rows.push(pb); seen.add(name); }
  });
  // Surface localStorage-only entries (not yet migrated) as pseudo-rows
  // so users see a complete library even mid-migration.
  Object.keys(_scripts).forEach(function(name) {
    if (seen.has(name)) return;
    rows.push({
      playbook_id: '_legacy_' + name,
      name: name,
      body: _scripts[name],
      kind: 'exploration',
      tags: ['localStorage-only'],
      state: 'draft',
      version: 1,
      last_run_at: null,
      last_run_status: null,
      _legacy: true,
    });
  });

  // Apply filters
  var f = _libraryFilters;
  var filtered = rows.filter(function(r) {
    if (f.search) {
      var s = f.search.toLowerCase();
      var hay = (r.name + ' ' + (r.description || '') + ' ' + (r.tags || []).join(' ')).toLowerCase();
      if (hay.indexOf(s) === -1) return false;
    }
    if (f.kinds && f.kinds.length && f.kinds.indexOf(r.kind) === -1) return false;
    if (f.state === 'active') {
      if (r.state !== 'draft' && r.state !== 'published') return false;
    } else if (f.state === 'draft') {
      if (r.state !== 'draft') return false;
    } // 'all' — no filter
    return true;
  });

  // Apply sort
  filtered.sort(function(a, b) {
    if (f.sort === 'name') return a.name.localeCompare(b.name);
    if (f.sort === 'last-run') {
      var ar = a.last_run_at ? new Date(a.last_run_at).getTime() : 0;
      var br = b.last_run_at ? new Date(b.last_run_at).getTime() : 0;
      return br - ar;
    }
    // 'recent' default: last_run_at DESC nulls last; tie-break on name
    var ar2 = a.last_run_at ? new Date(a.last_run_at).getTime() : -1;
    var br2 = b.last_run_at ? new Date(b.last_run_at).getTime() : -1;
    if (ar2 !== br2) return br2 - ar2;
    return a.name.localeCompare(b.name);
  });

  if (!filtered.length) {
    container.innerHTML = '<div style="font-size:13px;color:#EF9F27;padding:8px">No playbooks match.</div>';
    return;
  }

  container.innerHTML = filtered.map(function(r) {
    var kindMeta = _PLAYBOOK_KIND_META[r.kind] || { color: '#8b8273', label: r.kind };
    var stateBadge = r.state === 'published' ? '<span style="font-size:13px;color:#1D9E75;border:1px solid #1D9E7544;border-radius:3px;padding:2px 7px;font-family:monospace">PUB v' + (r.version||1) + '</span>'
                    : r.state === 'draft' ? '<span style="font-size:13px;color:#EF9F27;border:1px solid #EF9F2744;border-radius:3px;padding:2px 7px;font-family:monospace">DRAFT</span>'
                    : r.state === 'superseded' ? '<span style="font-size:13px;color:#8b8273;border:1px solid #8b827344;border-radius:3px;padding:2px 7px;font-family:monospace">SUPER v' + (r.version||1) + '</span>'
                    : '<span style="font-size:13px;color:#8b8273;border:1px solid #8b827344;border-radius:3px;padding:2px 7px;font-family:monospace">ARCHIVED</span>';
    var kindBadge = '<span style="font-size:13px;color:' + kindMeta.color + ';border:1px solid ' + kindMeta.color + '44;border-radius:3px;padding:2px 7px;font-family:monospace;text-transform:uppercase">' + kindMeta.label + '</span>';
    var stale = _isStale(r);
    var staleBadge = stale ? '<span style="font-size:13px;color:#EF9F27;font-family:monospace;letter-spacing:0.06em;font-weight:700;margin-left:4px">STALE</span>' : '';
    var lastRun = r.last_run_at
      ? _humanRelativeTime(r.last_run_at) + (r.last_run_status ? ' · ' + r.last_run_status : '')
      : 'never run';
    var legacyTag = r._legacy ? ' <span style="font-size:13px;color:#a07cd9;font-family:monospace">[unmigrated]</span>' : '';
    var isActive = r.playbook_id === _activePlaybookId;
    var border = isActive ? '#EF9F27' : '#0d1f2e';
    return '<div style="display:grid;grid-template-columns:minmax(0,1fr) 130px 110px 160px;gap:10px;align-items:center;border:1px solid ' + border + ';border-radius:4px;padding:6px 10px;margin-bottom:4px;cursor:pointer" data-pb-id="' + r.playbook_id + '" onmouseover="this.style.borderColor=\'#1a3a5a\'" onmouseout="this.style.borderColor=\'' + border + '\'">'
      + '<span style="font-size:13px;color:#EF9F27;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:monospace">' + _escHtml(r.name) + legacyTag + '</span>'
      + '<span style="font-family:monospace">' + kindBadge + '</span>'
      + '<span style="font-family:monospace">' + stateBadge + '</span>'
      + '<span style="font-size:13px;color:#8b8273;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _escHtml(lastRun) + staleBadge + '</span>'
      + '</div>';
  }).join('');

  // Prepend header row
  if (filtered.length) {
    container.innerHTML =
      '<div style="display:grid;grid-template-columns:minmax(0,1fr) 130px 110px 160px;gap:10px;padding:4px 10px 6px 10px;border-bottom:1px solid #0d1f2e;margin-bottom:6px;font-size:11px;color:#8b8273;font-family:monospace;letter-spacing:.08em;text-transform:uppercase">'
      + '<span>Name</span><span>Kind</span><span>State</span><span>Last run</span>'
      + '</div>' + container.innerHTML;
  }

  container.querySelectorAll('[data-pb-id]').forEach(function(el) {
    el.onclick = function() {
      var pbId = el.dataset.pbId;
      var r = _playbooks[pbId];
      if (!r) {
        // Legacy localStorage entry
        if (pbId.indexOf('_legacy_') === 0) {
          var name = pbId.substring(8);
          _activeScript = name;
          _activePlaybookId = null;
          p.querySelector('#phr-script-name').value = name;
          p.querySelector('#phr-editor').value = _scripts[name] || '';
        }
      } else {
        _activeScript = r.name;
        _activePlaybookId = r.playbook_id;
        p.querySelector('#phr-script-name').value = r.name;
        p.querySelector('#phr-editor').value = r.body || '';
      }
      _renderScriptList();
      _renderLibrary();
      p.querySelector('[data-tab="editor"]').click();
      if (p._updateLifecycleButtons) p._updateLifecycleButtons();
    };
  });
}

function _appendMonitor(text) {
  // Append to Monitor pane only — keeps Transcript clean
  var ts = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  var p  = _panelEl;
  if (!p) return;
  var pane = p.querySelector('#phr-pane-monitor');
  if (!pane) return;
  var div = document.createElement('div');
  div.style.cssText = 'display:table;width:100%;font-size:11px;line-height:1.7;margin-bottom:1px';
  div.innerHTML = '<span style="display:table-cell;color:#EF9F27;font-size:10px;white-space:nowrap;width:58px;vertical-align:top">' + ts + '</span>'
    + '<span style="display:table-cell;color:rgba(125,211,252,.7);vertical-align:top">' + _escHtml(text) + '</span>';
  pane.appendChild(div);
  pane.scrollTop = pane.scrollHeight;
}

// CMD-AEGIS-PLAYBOOK-FOUNDATION: Promise-based confirm modal —
// replaces native confirm()/alert() with a styled dialog that
// matches Aegis visual register. Returns a Promise<boolean>.
function _confirmDialog(opts) {
  opts = opts || {};
  var title = opts.title || 'Confirm';
  var body = opts.body || '';
  var okLabel = opts.okLabel || 'Confirm';
  var cancelLabel = opts.cancelLabel || 'Cancel';
  var okColor = opts.okColor || '#1D9E75';
  return new Promise(function(resolve) {
    var backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:monospace';
    var dialog = document.createElement('div');
    dialog.style.cssText = 'background:#0a1322;border:1px solid #1a3a5a;border-radius:6px;padding:20px 24px;max-width:480px;color:#cfe9e9;box-shadow:0 8px 32px rgba(0,0,0,.5)';
    dialog.innerHTML =
      '<div style="font-size:13px;font-weight:700;color:#EF9F27;letter-spacing:.06em;margin-bottom:10px;text-transform:uppercase">' + title + '</div>' +
      '<div style="font-size:13px;line-height:1.55;color:#cfe9e9;margin-bottom:16px">' + body + '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button id="_cd-cancel" style="font-size:13px;padding:5px 12px;border:1px solid rgba(139,130,115,.4);border-radius:3px;background:transparent;color:#8b8273;cursor:pointer;font-family:monospace">' + cancelLabel + '</button>' +
        '<button id="_cd-ok" style="font-size:13px;padding:5px 12px;border:1px solid ' + okColor + ';border-radius:3px;background:' + okColor + '22;color:' + okColor + ';cursor:pointer;font-family:monospace;font-weight:700">' + okLabel + '</button>' +
      '</div>';
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    function cleanup(result) {
      document.body.removeChild(backdrop);
      resolve(result);
    }
    dialog.querySelector('#_cd-ok').onclick = function(){ cleanup(true); };
    dialog.querySelector('#_cd-cancel').onclick = function(){ cleanup(false); };
    backdrop.addEventListener('click', function(ev){ if (ev.target === backdrop) cleanup(false); });
    document.addEventListener('keydown', function escHandler(ev){
      if (ev.key === 'Escape') { document.removeEventListener('keydown', escHandler); cleanup(false); }
      if (ev.key === 'Enter')  { document.removeEventListener('keydown', escHandler); cleanup(true); }
    });
    setTimeout(function(){ dialog.querySelector('#_cd-ok').focus(); }, 0);
  });
}

function _appendLine(who, type, text) {
  var ts = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  _transcript.push({ ts, who, type, text });
  if (_transcript.length > 500) _transcript.shift();

  var p = _panelEl;
  if (!p) return;
  var pane = p.querySelector('#phr-pane-transcript');
  if (!pane) return;

  // Transcript shows command text only — clean, copy-paste ready for scripts
  // SYS result/error lines shown as comments; cmd lines shown bare
  var colors = {
    cmd:    '#00c9c9', result: '#1D9E75', warn: '#EF9F27',
    err:    '#E24B4A', sys:    '#EF9F27', event: '#7dd3fc'
  };

  // For SYS lines prefix with # so they read as comments in scripts
  var isComment = (type === 'sys' || type === 'result' || type === 'event');
  var displayText = isComment
    ? '# ' + text
    : (who !== 'SYS' && who !== (_mySession && _mySession.initials) ? who + ': ' : '') + text;

  // Any line rendered as a '#' comment is beige for readability;
  // warn/err keep their semantic colors (amber/red) since they don't get '#' prefix.
  var color = isComment ? '#E8DCC4' : (colors[type] || '#cfe9e9');

  var div = document.createElement('div');
  div.style.cssText = 'display:block;width:100%;font-family:monospace;font-size:11px;line-height:1.7;color:' + color
    + ';white-space:pre-wrap;word-break:break-word;padding:0 2px;box-sizing:border-box';
  div.textContent = displayText;

  pane.appendChild(div);
  pane.scrollTop = pane.scrollHeight;
}

function _renderTranscript() {
  var p = _panelEl;
  if (!p) return;
  var pane = p.querySelector('#phr-pane-transcript');
  if (!pane) return;
  pane.innerHTML = '';
  _transcript.forEach(function(line) {
    _appendLine(line.who, line.type, line.text);
  });
}

function _escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Toggle panel ──────────────────────────────────────────────────────────────
// ── Pop out into a detached window ───────────────────────────────────────────
// Opens CMD Center in a new browser window — can be moved to a second monitor.
// The pop-out window shares the same Realtime channel so transcript stays live.
function _popOut() {
  var w = 720, h = 580;
  var left = window.screen.width  - w - 40;
  var top  = window.screen.height - h - 60;
  var win  = window.open('', 'phud-cmd-center',
    'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top +
    ',resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no'
  );
  if (!win) {
    // Popup blocked — fall back to expand
    if (_panelEl) {
      _panelEl.style.width  = '95vw';
      _panelEl.style.height = '85vh';
    }
    console.warn('[CMD Center] Pop-out blocked by browser. Allow popups for this site.');
    if (_panelEl) _appendLine('SYS', 'warn', 'Pop-out blocked — allow popups for this site, then try again.');
    return;
  }

  // Pass state via sessionStorage key (survives same-origin navigation)
  var stateKey = 'cmd-center:popout:' + Date.now();
  try {
    sessionStorage.setItem(stateKey, JSON.stringify({
      session:    _mySession,
      scripts:    _scripts,
      transcript: _transcript.slice(-100),
    }));
  } catch(e) {}
  win.location.href = window.location.origin + '/cmd-center.html?state=' + stateKey;

  // Hide the inline panel now that it's popped out
  if (_panelEl) {
    _panelEl.style.display = 'none';
    _panelOpen = false;
  }
  _appendLine('SYS', 'sys', 'Popped out to new window');

  // Reopen inline panel if pop-out is closed
  var checkInterval = setInterval(function() {
    if (win.closed) {
      clearInterval(checkInterval);
      _appendLine('SYS', 'sys', 'Pop-out closed — panel restored');
      if (_panelEl) { _panelEl.style.display = 'flex'; _panelOpen = true; }
    }
  }, 1000);
}

function _togglePanel() {
  if (!_panelEl) { _buildPanel(); _panelOpen = true; return; }
  if (!window._aegisMode) { _panelEl.style.display = _panelOpen ? 'none' : 'flex'; _panelOpen = !_panelOpen; }
}

// ── Keyboard shortcut: Ctrl+Shift+R ──────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  // Ctrl+Shift+` (backtick/tilde) — toggle CMD Center panel
  // Avoids Ctrl+Shift+R which is Chrome hard-refresh
  if (e.ctrlKey && e.shiftKey && (e.key === '`' || e.key === '~')) {
    e.preventDefault();
    _togglePanel();
  }
});

// ── Intercept app events for transcript ──────────────────────────────────────
// Hook into existing app functions to emit events
function _hookAppEvents() {
  // Use defineProperty to intercept assignments to window.uSwitchTab
  // This fires whenever ANY script does window.uSwitchTab = function(...) { ... }
  // So it doesn't matter when mw-tabs.js loads — we always get the final version
  _interceptProperty(window, 'uSwitchTab', function(tab, btn) {
    if (_panelEl) _appendLine(_mySession ? _mySession.initials : 'ME', 'cmd',
      'Set Tab "' + (tab||'').toUpperCase() + '"');
    window._cmdEmit('tab_switch', { tab: tab });
  });
  _interceptProperty(window, 'myrSwitchView', function(view) {
    if (_panelEl) _appendLine(_mySession ? _mySession.initials : 'ME', 'cmd',
      'Set SubTab "' + (view||'').toUpperCase() + '"');
  });
  _interceptProperty(window, 'myrOpenInstance', function(instanceId) {
    var inst = (window._myrInstances||[]).find(function(i){ return i.id === instanceId; });
    if (_panelEl) _appendLine(_mySession ? _mySession.initials : 'ME', 'cmd',
      'Open "' + (inst ? inst.title : instanceId.slice(0,8)) + '"');
  });
  _interceptProperty(window, 'myrLaunchRequest', function(type, templateId) {
    // Look up the actual form name from _myrFormDefs or _myrTemplates
    var name = '';
    if (templateId) {
      var fd = (window._myrFormDefs||[]).find(function(f){ return f.id === templateId; });
      var tm = (window._myrTemplates||[]).find(function(t){ return t.id === templateId; });
      name = (fd && fd.source_name) || (tm && tm.name) || templateId.slice(0,8);
    }
    if (_panelEl) _appendLine(_mySession ? _mySession.initials : 'ME', 'cmd',
      'Form Open "' + (name || type || 'form') + '"');
  });

  // ── MY REQUESTS actions ──────────────────────────────────────────────────
  _interceptProperty(window, 'myrWithdrawInstance', function(instanceId, title) {
    if (_panelEl) _appendLine(_mySession ? _mySession.initials : 'ME', 'cmd',
      'Withdraw "' + (title||instanceId.slice(0,8)) + '"');
  });
  _interceptProperty(window, 'myrRecallToDraft_row', function(instanceId) {
    var inst = (window._myrInstances||[]).find(function(i){ return i.id === instanceId; });
    if (_panelEl) _appendLine(_mySession ? _mySession.initials : 'ME', 'cmd',
      'Recall "' + (inst ? inst.title : instanceId.slice(0,8)) + '"');
  });
  _interceptProperty(window, 'myrResumeInstance', function(instanceId, title) {
    if (_panelEl) _appendLine(_mySession ? _mySession.initials : 'ME', 'cmd',
      'Resume "' + (title||instanceId.slice(0,8)) + '"');
  });
  _interceptProperty(window, 'myrContinueDraft', function(formDefId, draftId) {
    if (_panelEl) _appendLine(_mySession ? _mySession.initials : 'ME', 'cmd',
      'Continue Draft id=' + (draftId||'').slice(0,8));
  });
  _interceptProperty(window, 'myrDiscardDraft', function(draftId, name) {
    if (_panelEl) _appendLine(_mySession ? _mySession.initials : 'ME', 'cmd',
      'Discard Draft "' + (name||draftId.slice(0,8)) + '"');
  });
  _interceptProperty(window, 'myrCloseInstance', function() {
    if (_panelEl) _appendLine(_mySession ? _mySession.initials : 'ME', 'cmd',
      'Form Close');
  });

  // ── Review / approval panel ───────────────────────────────────────────────
  _interceptProperty(window, 'openRequestReviewPanel', function(item) {
    // item.title is like "Expense Report — Vaughn Staples — Manager Approval"
    // Strip the step suffix to show just the document name
    var rawTitle = item && item.title ? item.title : 'request';
    var docTitle = rawTitle.replace(/\s+[—\-]+\s+[^—\-]+$/, '').trim() || rawTitle;
    if (_panelEl) _appendLine(_mySession ? _mySession.initials : 'ME', 'cmd',
      'Open Review "' + docTitle + '"');
  });
  _interceptProperty(window, '_rrpSubmit', function(actionItemId, instanceId, decision) {
    if (_panelEl) _appendLine(_mySession ? _mySession.initials : 'ME', 'cmd',
      'Click "' + (decision === 'approved' ? 'Approve' : 'Request Changes') + '"');
  });

  // ── Work queue items ──────────────────────────────────────────────────────
  _interceptProperty(window, 'openInProgressPanel', function(item) {
    if (_panelEl) _appendLine(_mySession ? _mySession.initials : 'ME', 'cmd',
      'Open Task "' + (item && item.title ? item.title : 'task') + '"');
  });
  _interceptProperty(window, 'saveInProgressUpdate', function(itemId) {
    if (_panelEl) _appendLine(_mySession ? _mySession.initials : 'ME', 'cmd',
      'Save Update id=' + (itemId||'').slice(0,8));
  });

  // ── MY REQUESTS routing events (emitted by mw-tabs.js) ───────────────────
  _interceptProperty(window, '_mwResolveAndRoute', function(instanceId, steps, seq, submitterResId, formName) {
    // Look up who step seq routes to from the pre-resolved step chain
    setTimeout(function() {
      // Re-fetch instance from DB to get latest notes (written async after routing)
      // CMD-AEGIS-1: matches §3 discipline — no hardcoded firm_id fallback. If
      // FIRM_ID is unresolved here, the script-runner enrich step is skipped
      // rather than executing with an empty/wrong firm context.
      var firmId = (typeof FIRM_ID !== 'undefined' && FIRM_ID) ||
                   (window.PHUD && window.PHUD.FIRM_ID) || null;
      if (!firmId) { return; }
      var supaUrl = typeof SUPA_URL !== 'undefined' ? SUPA_URL : (window.PHUD && window.PHUD.SUPABASE_URL) || '';
      var supaKey = typeof SUPA_KEY !== 'undefined' ? SUPA_KEY : (window.PHUD && window.PHUD.SUPABASE_KEY) || '';
      fetch(supaUrl + '/rest/v1/workflow_instances?id=eq.' + instanceId + '&select=notes&limit=1', {
        headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey }
      }).then(function(r){ return r.json(); }).then(function(rows) {
        var assignee = '';
        var assigneeResId = null;
        try {
          var notes = rows && rows[0] && rows[0].notes ? JSON.parse(rows[0].notes) : null;
          var chain = notes && notes.step_chain;
          if (chain && chain[seq]) {
            assignee = ' → ' + (chain[seq].assignee_name || '');
            assigneeResId = chain[seq].assignee_resource_id || null;
          }
        } catch(e) {}
        if (_panelEl) _appendLine('SYS', 'result',
          '→ routed step ' + seq + assignee);

        // If the local user is the new assignee (i.e., submit-and-self-route),
        // the work queue won't auto-refresh — trigger it. Skip on Aegis since
        // Aegis doesn't render My Work. Guarded heavily: only if
        // _mwLoadUserView exists, we have an identified local resource, and
        // the assignee matches.
        if (!window._aegisMode
            && assigneeResId
            && window._myResource
            && window._myResource.id === assigneeResId
            && typeof window._mwLoadUserView === 'function') {
          // Invalidate cache flag so reload actually re-fetches
          if (typeof window._viewLoaded === 'object') window._viewLoaded['user'] = false;
          try {
            window._mwLoadUserView();
          } catch(e) {
            console.warn('[cmd-center] auto-refresh after route failed:', e);
          }
        }
      }).catch(function() {
        if (_panelEl) _appendLine('SYS', 'result', '→ routed step ' + seq);
      });
    }, 1500); // wait for notes patch to complete
  });
}

// Intercept property assignment on an object.
// Wraps the function with our observer each time it is set.
// Registry of observers — keyed by property name
// Used by polling fallback when defineProperty isn't available
var _interceptRegistry = {};

// Module-level _wrap so setInterval polling can reference it
function _wrap(originalFn, obs, prop) {
  var wrapped = function() {
    var args = Array.prototype.slice.call(arguments);
    var result = originalFn.apply(this, args); // preserve return value (Promises etc.)
    var now  = Date.now();
    var last = _interceptRegistry[prop] ? (_interceptRegistry[prop].lastCall || 0) : 0;
    if (now - last > 100) { // 100ms debounce shared across all wrappers for this prop
      if (_interceptRegistry[prop]) _interceptRegistry[prop].lastCall = now;
      if (!_scriptRunning) { // suppress during script — runner logs commands itself
        try { obs.apply(this, args); } catch(e) {}
      }
    }
    return result; // return Promise or value to caller
  };
  wrapped._cmdHooked   = true;
  wrapped._cmdOriginal = originalFn;
  return wrapped;
}

function _interceptProperty(obj, prop, observer) {
  // Store observer for polling fallback
  _interceptRegistry[prop] = { obj: obj, observer: observer, lastCall: 0 };

  // Try defineProperty first
  try {
    var desc = Object.getOwnPropertyDescriptor(obj, prop);
    var canDefine = !desc || desc.configurable;
    if (canDefine) {
      var _realFn = (desc && desc.value) || null;
      Object.defineProperty(obj, prop, {
        configurable: true,
        get: function() { return _realFn; },
        set: function(newFn) {
          if (newFn && newFn._cmdHooked) { _realFn = newFn; return; }
          _realFn = _wrap(newFn, observer, prop);
        }
      });
      if (_realFn) _realFn = _wrap(_realFn, observer, prop);
      return; // defineProperty succeeded
    }
  } catch(e) {}

  // Fallback: direct wrap if function already exists
  if (obj[prop] && !obj[prop]._cmdHooked) {
    obj[prop] = _wrap(obj[prop], observer, prop);
  }
}

// Poll every 1s to re-wrap any functions that were replaced after our initial hook
// This is the safety net for non-configurable properties
setInterval(function() {
  Object.keys(_interceptRegistry).forEach(function(prop) {
    var entry = _interceptRegistry[prop];
    var obj   = entry.obj;
    var fn    = obj[prop];
    if (fn && !fn._cmdHooked) {
      // Function was replaced without going through our setter — re-wrap it
      obj[prop] = _wrap(fn, entry.observer, prop);
    }
  });
}, 1000);

// Retry hooking until the target functions are defined (they load after cmd-center.js)


// ── Listen for form actions posted from embedded form overlays ───────────────
window.addEventListener('message', function(ev) {
  if (!ev.data) return;

  // compass_form_submit — fired by mw-tabs.js after instance is created.
  // Capture the formId so scripts can Wait ForEvent "compass_form_submit".
  if (ev.data.type === 'compass_form_submit') {
    _resolveEventListeners('compass_form_submit', ev.data);
    if (_panelEl) _appendLine('SYS', 'event', 'form submitted · ' + (ev.data.formId||'').slice(0,8));
    return;
  }

  if (ev.data.type !== 'cmd:form_action') return;
  if (_panelEl && !_scriptRunning) {
    _appendLine(_mySession ? _mySession.initials : 'ME', 'cmd', ev.data.action);
  }
  // If form is closed while script is running, abort the script —
  // BUT only if we're not in a post-submit state (form closes itself after submitForApproval)
  if (ev.data.action === 'Form Close' && _scriptRunning) {
    // Check if the last form command was Form Submit — if so, close is expected
    var lastFormCmd = _transcript.slice().reverse().find(function(l){
      return l.type === 'cmd' && l.text && l.text.startsWith('Form ');
    });
    var postSubmit = lastFormCmd && lastFormCmd.text.trim() === 'Form Submit';
    if (!postSubmit) {
      _scriptAborted = true;
      _appendLine('SYS', 'warn', 'Form closed — script aborted');
    }
  }
});

// ── Expose public API ─────────────────────────────────────────────────────────
window.CMDCenter = {
  toggle:       _togglePanel,
  run:          _runScript,
  runLine:      _executeCommand,
  saveScript:   _saveScript,
  getScripts:   function() { return Object.keys(_scripts); },
  appendLine:   _appendLine,
  sessions:     function() { return _sessions; },
  aliasMap:     function() { return _aliasMap; },
  myAlias:      function() { return _myAlias; },
  setAlias:     function(a) {
    if (!a) return;
    _myAlias = a.trim().toUpperCase();
    if (_mySession) {
      var _aliasKey = (window._aegisMode ? 'phud:cmd:alias:aegis:' : 'phud:cmd:alias:') + _mySession.userId;
      localStorage.setItem(_aliasKey, _myAlias);
    }
    var ai = document.getElementById('phr-alias-input');
    if (ai) ai.value = _myAlias;
  },
  resolveAlias: _resolveTargetAlias,
  // ── M2 feed API (CMD61 / Brief M2-FEED-1) ────────────────────────────────
  // Subscribe to every app_event broadcast, local or remote, after self-echo
  // filter + envelope unwrap. Callback receives (eventName, innerPayload).
  // Fire-and-forget; no unsubscribe (M2 panel is long-lived).
  onAppEvent:   function(callback) {
    if (typeof callback === 'function') _m2FeedListeners.push(callback);
  },
  // Returns the N newest buffered entries across all event_types, newest-first,
  // shaped as {eventName, data, ts}. Capped at what remains in the 30s window.
  recentEvents: function(n) {
    var max = (typeof n === 'number' && n > 0) ? n : 20;
    var out = [];
    for (var eventName in _eventBuffer) {
      if (!Object.prototype.hasOwnProperty.call(_eventBuffer, eventName)) continue;
      var arr = _eventBuffer[eventName];
      for (var i = 0; i < arr.length; i++) {
        out.push({ eventName: eventName, data: arr[i].data, ts: arr[i].ts });
      }
    }
    out.sort(function(a, b) { return b.ts - a.ts; });
    return out.slice(0, max);
  },
};

// ── Init ──────────────────────────────────────────────────────────────────────
async function _init() {
  // ── CMD-AEGIS-1: gate channel subscription on firm_id resolution ─────────
  // auth.js exposes window._phudFirmIdReady as a Promise that resolves to
  // the firm_id string (or null if no auth / no firm could be established).
  // We await it here, then re-read PHUD.FIRM_ID into the module-local
  // FIRM_ID before any code-path that builds channel names or session
  // identity. If firm_id is still unresolved after the await, we log a
  // clear error and return without subscribing — Aegis features become
  // unavailable but the page renders normally.
  try {
    if (window._phudFirmIdReady && typeof window._phudFirmIdReady.then === 'function') {
      await window._phudFirmIdReady;
    }
  } catch (e) { /* ensureFirmId never throws, but defensive */ }
  if (!FIRM_ID && window.PHUD && window.PHUD.FIRM_ID) {
    FIRM_ID = window.PHUD.FIRM_ID;
  }
  if (!FIRM_ID) {
    // CMD-AUTH-INIT-RACE: distinguish three failure modes so operators
    // can triage cold-load issues without reading source. The fail-fast
    // behavior itself is preserved (function returns early without
    // subscribing to any presence channel) — CMD-AEGIS-1's cross-firm
    // isolation holds. No fallback firm_id is ever introduced.
    var _authLoaded = (typeof Auth !== 'undefined') &&
                      !!window._phudFirmIdReady;
    var _hasJwt = _authLoaded && !!Auth.getCurrentUserId();
    var _detail = !_authLoaded
      ? 'auth.js was not loaded on this page'
      : !_hasJwt
        ? 'no authenticated session'
        : 'authenticated user has no firm_id (check users table)';
    console.error(
      '[cmd-center] FIRM_ID could not be established: ' + _detail + '. ' +
      'cmd-center.js cannot initialize; presence and command features unavailable. ' +
      '(See brief CMD-AEGIS-1 §6 / CMD-AUTH-INIT-RACE.)'
    );
    window._cmdCenterUninitialized = true;
    return;
  }

  // Clean up any alias keys persisted under anon- userIds from previous sessions
  Object.keys(localStorage).forEach(function(k) {
    if (k.startsWith('phud:cmd:alias:anon-')) localStorage.removeItem(k);
  });
  _loadScripts();
  _loadServerScripts();
  // CMD-AEGIS-PLAYBOOK-FOUNDATION: load substrate-backed playbooks +
  // run one-time localStorage→substrate migration. Both async; UI
  // proceeds with localStorage data while these complete in the
  // background, then re-renders once substrate state lands.
  (async function() {
    try {
      var loaded = await _loadPlaybooks();
      await _migrateLocalStorageToPlaybooks();
      if (_panelEl) {
        if (_renderLibrary)    _renderLibrary();
        if (_renderScriptList) _renderScriptList();
      }
      if (loaded > 0) {
        console.log('[Aegis Playbooks] loaded ' + loaded + ' playbook(s) from substrate');
      }
    } catch (e) {
      console.warn('[Aegis Playbooks] init load failed:', e && e.message);
    }
  })();
  // CMD88: Init-time prune of zombie session entries in localStorage.
  // Walks all phud:cmd:session:* keys and deletes entries that match ANY of:
  //   - key contains ':anon-' (pre-auth writes that escaped earlier guards)
  //   - entry parses null / missing required fields (name, ts)
  //   - entry.ts older than 5 min (300000 ms)
  // Then hydrates _sessions from the surviving entries (offline-tagged).
  try {
    var _now = Date.now();
    var STALE_MS = 300000;
    var _pruned = 0;
    Object.keys(localStorage).filter(function(k){return k.startsWith('phud:cmd:session:');}).forEach(function(k){
      var uid = k.replace('phud:cmd:session:','');
      var s = null;
      try { s = JSON.parse(localStorage.getItem(k)); } catch(e) {}
      var bad = (k.indexOf(':anon-') !== -1)
             || !s
             || !s.name
             || !s.ts
             || (_now - s.ts > STALE_MS);
      if (bad) {
        try { localStorage.removeItem(k); } catch(e) {}
        _pruned++;
        return;
      }
      if (uid && !_sessions[uid]) {
        s.online = false;
        _sessions[uid] = s;
        _aliasMap[s.alias || s.initials] = uid;
      }
    });
    console.log('[cmd-center] init prune: removed ' + _pruned + ' zombie session entries');
  } catch(e) {}
  await _loadSupabase();
  if (!window._myResource && _supabase) {
    try {
      var ar=await _supabase.auth.getSession(); var as2=ar&&ar.data&&ar.data.session; var au=as2&&as2.user;
      console.log('[Aegis] auth session:', au?au.id.slice(0,8)+'...':'null');
      if (au) {
        var tok=as2.access_token||SUPA_KEY;
        var rr=await fetch(SUPA_URL+'/rest/v1/resources?user_id=eq.'+au.id+'&select=id,first_name,last_name,user_id,email&limit=1',{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+tok}});
        var rows=await rr.json();
        console.log('[Aegis] resource row by user_id:',rows&&rows.length,rows&&rows[0]?rows[0].first_name:'none');
        if((!rows||!rows[0])&&au.email){var rr2=await fetch(SUPA_URL+'/rest/v1/resources?email=eq.'+encodeURIComponent(au.email)+'&select=id,first_name,last_name,user_id,email&limit=1',{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+tok}});rows=await rr2.json();}
        if(rows&&rows[0]){var rx=rows[0];var fn=((rx.first_name||'')+' '+(rx.last_name||'')).trim()||au.email||'Operator';window._myResource={name:fn,user_id:rx.user_id||au.id,id:rx.id};console.log('[Aegis] identity resolved:',fn);}
        else{window._myResource={name:(au.user_metadata&&(au.user_metadata.full_name||au.user_metadata.name))||au.email||'Operator',user_id:au.id};}
      }
    }catch(e){console.warn('[Aegis] identity resolve failed:',e.message);}
  }
  // Install property interceptors IMMEDIATELY — before mw-tabs.js assigns its functions
  // These use defineProperty so they catch any assignment, past or future
  _hookAppEvents();
  // Accept overrides — check sessionStorage for pop-out state
  var _popoutState = null;
  try {
    var stateParam = new URLSearchParams(window.location.search).get('state');
    if (stateParam) {
      var raw = sessionStorage.getItem(stateParam);
      if (raw) {
        _popoutState = JSON.parse(raw);
        sessionStorage.removeItem(stateParam); // clean up
      }
    }
  } catch(e) {}

  if (_popoutState && _popoutState.session) {
    _mySession = _popoutState.session;
  } else if (window._myResourceOverride) {
    _mySession = window._myResourceOverride;
  } else {
    _resolveSession();
  }
  if (_popoutState && _popoutState.scripts)    _scripts    = _popoutState.scripts;
  if (_popoutState && _popoutState.transcript) _transcript = _popoutState.transcript;
  if (window._scriptsOverride)    _scripts    = window._scriptsOverride;
  if (window._transcriptOverride) _transcript = window._transcriptOverride;

  // Defer connection until identity is resolved
  // cmd-center.js loads before compass.html sets _myResource, so we must wait
  if (!_mySession || _mySession.userId.startsWith('anon-')) {
    // Poll every 500ms until identity resolves, then connect
    var _identityPoll = setInterval(function() {
      _resolveSession();
      if (_mySession && !_mySession.userId.startsWith('anon-')) {
        clearInterval(_identityPoll);
        if (_channel) {
          // Already connected — re-track with correct identity on both channels (CMD62)
          var _idTrackPayload = {
            userId:   _mySession.userId,
            name:     _mySession.name,
            initials: _mySession.initials,
            alias:    _myAlias || _mySession.initials,
            location: _currentLocation(),
            ts:       Date.now(),
          };
          try { _channel.track(_idTrackPayload); } catch(e) {}
          if (_channelLegacy) { try { _channelLegacy.track(_idTrackPayload); } catch(e) {} }
        } else {
          _connect();
        }
        _updateStatusEl();
      }
    }, 500);
    // Give up after 10s and connect with whatever we have
    setTimeout(function() {
      clearInterval(_identityPoll);
      if (!_channel) {
        _connect();
      }
    }, 10000);
  } else {
    _connect();
  }
  // Poll status every 2s until connected — covers cases where panel opens after connect
  var _statusPoll = setInterval(function() {
    _updateStatusEl();
    if (window._cmdConnected) clearInterval(_statusPoll);
  }, 1000);

  // ── CMD87b / Brief Aegis Remote Narration: narrate.show subscriber ─────────
  // Compass-only. Aegis is operator-facing and renders no overlay (CMD89);
  // its Narrate local branch only fires Enter-advance flow control. Compass
  // never receives narrate.show on the Aegis tab.
  // §3-q8 self-targeting: when Aegis and Compass are the same human's two
  // tabs, _handleAppEvent's Aegis-exemption (Rule 15) does NOT fire on the
  // Compass tab — the Compass tab carries its own session/userId distinct
  // from the Aegis pop-out. So narrate.show round-trips and arrives normally.
  // Per-event target check ensures only the addressed session renders.
  // Rule 23 / 25 / 31: payload arrives via window.CMDCenter.onAppEvent (the
  // canonical subscription API). _cmdEmit-stamped event_id dedup is upstream;
  // our payload extraction relies on narrate_id (Rule 31).
  if (!window._aegisMode) {
    if (window.CMDCenter && typeof window.CMDCenter.onAppEvent === 'function') {
      window.CMDCenter.onAppEvent(function(eventName, payload) {
        if (eventName !== 'narrate.show') return;
        if (!payload || !payload.narrate_id || !payload.target) return;
        // Address check: only render if I'm the addressed session.
        if (!_mySession || payload.target !== _mySession.userId) return;
        _compassShowSpotlight(
          payload.message || '',
          !!payload.paused,
          payload.narrate_id,
          payload.spotlight || null,
          payload.timeout || null,
          !!payload.caption_suppressed
        );
      });
    } else {
      console.warn('[CMD87b] Compass narrate subscriber: CMDCenter.onAppEvent unavailable');
    }
  }

  console.log('[CMD Center] initialized — Ctrl+Shift+` to toggle panel');
}

window._sendToSession = function(alias, cmd) {
  var uid = _resolveTargetAlias(alias);
  if (!uid){console.warn('[CMD] unknown alias:',alias);return;}
  if (!_channel){console.warn('[CMD] not connected');return;}
  // B-UI-5 / CMD71: resolve $variables against Aegis's _storeVars before
  // transmission. Receiver has no access to sender-captured vars.
  var resolvedCmd = _resolveVarsInCmd(cmd);
  _channelSend({type:'broadcast',event:'cmd',payload:{target:uid,from:_myAlias||(window._aegisMode?'AEGIS':'OP'),cmd:resolvedCmd,cmdId:Date.now()}});
  console.log('[CMD] sent to',alias,'('+uid.slice(0,8)+'...):',resolvedCmd);
};
window._aegisSessions = function() {
  Object.entries(_sessions).forEach(function([uid,s]){
    console.log((s.alias||s.initials),s.name,'|',s.location,'|',s.online?'ONLINE':'offline','|',uid.slice(0,8)+'...');
  });
};
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){_init().then(function(){if(window._aegisMode)setTimeout(_buildPanel,50);});});}else{_init().then(function(){if(window._aegisMode)setTimeout(_buildPanel,50);});}

})();