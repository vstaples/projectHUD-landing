// ════════════════════════════════════════════════════════════════════════════
// cmd-center.js  ·  v20260425-CMD82
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
(function() {
  var versions = {
    'cmd-center':  'v20260425-CMD82',
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
console.group('%c CMD Center v20260425-CMD82 ', 'background:#00c9c9;color:#003333;font-weight:700;padding:2px 8px;border-radius:3px');
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
var FIRM_ID  = (typeof PHUD !== 'undefined' && PHUD.FIRM_ID) ||
               'aaaaaaaa-0001-0001-0001-000000000001';

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
var _scripts     = {};     // { name: scriptText }
var _panelEl     = null;   // the floating panel DOM element
var _panelOpen   = false;
var _cmdTarget   = 'ALL';  // current command target userId or 'ALL'
var _execQueue   = [];     // pending async commands
var _eventListeners = {};  // { eventName: [resolvers] }
var _storeVars   = {};     // script variable storage { name: value }
var _scriptRunning = false; // suppress hook double-logging during script execution
var _scriptAborted = false; // set when panel closes mid-script
var _pauseResolve  = null;  // set by Pause command, cleared by Enter in command bar
var _leaveTimers   = {};    // { userId: timeoutId } — pending leave debounces; read by _renderSessionList

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
  if (!_myAlias && !_mySession.userId.startsWith('anon-')) {
    _myAlias = localStorage.getItem('phud:cmd:alias:' + _mySession.userId) || _mySession.initials;
  }
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

function _safeSendOn(ch, payload) {
  if (!ch) return;
  try { ch.send(payload); } catch(e) {}
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
        if (DEBUG_EVENTS) console.log('[Aegis] presence sync · dropping stale:',
          (p.alias || p.initials || '?'), p.name || '?',
          '· last ts ' + Math.round((_now - (p.ts||0))/1000) + 's ago');
        return;
      }
      _live[kv[0]] = p;
    });
    merged = _live;
    var execP = Object.values(merged).filter(function(p){return p&&!p.aegisObserver;});
    console.log('[Aegis] presence sync — '+execP.length+' exec session(s): '+execP.map(function(p){return p.name||'?';}).join(', '));
    _sessions = {};
    _aliasMap = {};
    Object.values(merged).forEach(function(p) {
      if (p.aegisObserver && _mySession && p.userId !== _mySession.userId) return;
      _sessions[p.userId] = {name:p.name,initials:p.initials,alias:p.alias||p.initials,location:p.location,online:true,ts:p.ts,aegisObserver:p.aegisObserver||false};
      _aliasMap[p.alias||p.initials] = p.userId;
      try{localStorage.setItem('phud:cmd:session:'+p.userId,JSON.stringify(_sessions[p.userId]));}catch(e){}
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
      try { localStorage.setItem('phud:cmd:session:' + p.userId, JSON.stringify(_sessions[p.userId])); } catch(e) {}
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
    if (d.target !== _mySession.userId && d.target !== 'ALL') return;
    if (window._aegisMode) return; // Aegis dispatches but never executes
    // CMD62: cmdId dedup — with broadcast.self=true on both channels,
    // every cmd arrives twice on a CMD62↔CMD62 pair. Drop the duplicate.
    if (d.cmdId && _seenCmdIds[d.cmdId]) return;
    if (d.cmdId) { _seenCmdIds[d.cmdId] = Date.now(); _purgeSeenCmdIds(); }
    _appendLine(d.from || 'SYS', 'cmd', d.cmd);
    _executeCommand(d.cmd, d.from).then(function(result) {
      // Always ack so the dispatcher doesn't time out. Undefined → true (completed).
      _channelSend({
        type: 'broadcast', event: 'result',
        payload: {
          from: _mySession.userId, name: _mySession.name,
          result: result === undefined ? true : result,
          cmdId: d.cmdId,
        }
      });
    }).catch(function(err) {
      // Execution threw — still ack, but carry the error so the dispatcher can see it.
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
    // Presence heartbeat — re-call track() periodically to survive silent
    // WebSocket reconnects. Phoenix auto-reconnects but does not re-call
    // track(); presence becomes stale on the server. 25s is shorter than
    // typical idle-disconnect windows. Calling track() on a healthy
    // connection is idempotent (just refreshes ts). Runs on Aegis too —
    // Aegis tracks itself as aegisObserver:true so other sessions know
    // there's an observer present. CMD-PRESENCE-1 / CMD80.
    setInterval(function() {
      if (window._cmdCenterFullscreen) return; // pop-out suppresses presence
      if (_channel && _channelReady)             _trackPresenceOn(_channel);
      if (_channelLegacy && _channelLegacyReady) _trackPresenceOn(_channelLegacy);
    }, 25000);
  }

  function _trackPresenceOn(ch) {
    if (window._cmdCenterFullscreen) return; // pop-out suppresses presence
    try {
      ch.track({
        userId:   _mySession.userId,
        name:     _mySession.name,
        initials: _mySession.initials,
        alias:    _myAlias || _mySession.initials,
        location: _currentLocation(),
        ts:       Date.now(),
        aegisObserver: window._aegisMode ? true : undefined,
      });
    } catch(e) {}
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

// ── Command registry ──────────────────────────────────────────────────────────
var COMMANDS = {

  // ── Navigation ──────────────────────────────────────────────────────────────
  'Set Tab': async function(args) {
    var tab = args[0];
    var tabMap = {
      'MY WORK': 'work', 'MY TIME': 'timesheet', 'MY CALENDAR': 'calendar',
      'MY MEETINGS': 'meetings', 'MY VIEWS': 'views', 'MY NOTES': 'concerns',
      'MY REQUESTS': 'requests', 'MY TEAM': 'team'
    };
    var key = tab.toUpperCase();
    var tabId = tabMap[key] || tab.toLowerCase();
    if (typeof uSwitchTab === 'function') {
      var btn = document.querySelector('[data-tab="' + tabId + '"]');
      uSwitchTab(tabId, btn);
      return 'tab active: ' + tab;
    }
    return 'uSwitchTab not available';
  },

  'Set SubTab': async function(args) {
    var sub = args[0].toUpperCase();
    if (sub === 'BROWSE' || sub === 'ACTIVE' || sub === 'HISTORY') {
      if (typeof myrSwitchView === 'function') {
        myrSwitchView(sub.toLowerCase());
        return 'subtab: ' + sub;
      }
    }
    return 'subtab not found: ' + sub;
  },
  'Set View': async function(args){var v=(args[0]||'').toLowerCase().replace(/\.html$/,'');var m={'compass':'/compass.html','cadence':'/cadence.html','dashboard':'/dashboard.html'};var h=m[v];if(!h)return 'Unknown view: '+args[0];window.location.href=h;return 'navigating to '+h;},

  // ── Forms ───────────────────────────────────────────────────────────────────
  'Form Open': async function(args) {
    var name = args[0];

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
    if (!def) return 'Form not found: ' + name + ' (available: ' + defs.map(function(f){ return f.source_name; }).join(', ') + ')';

    if (typeof myrLaunchRequest === 'function') {
      await myrLaunchRequest('form', def.id);
      return 'form opened: ' + def.source_name;
    }
    return 'myrLaunchRequest not available';
  },

  'Form Submit': async function(args) {
    var iframe = document.querySelector('#myr-html-form-overlay iframe, #myr-html-form-modal iframe');
    if (!iframe) return 'No form overlay open';
    // Clear any previous value so we can detect the new one
    var prevInstanceId = window._lastSubmittedInstanceId;
    iframe.contentWindow.postMessage({ source: 'cmd-center', cmd: 'Form Submit' }, '*');
    // Wait up to 15s for the instance to be created (mw-tabs sets _lastSubmittedInstanceId)
    for (var si = 0; si < 150; si++) {
      await new Promise(function(r){ setTimeout(r, 100); });
      if (window._lastSubmittedInstanceId && window._lastSubmittedInstanceId !== prevInstanceId) break;
      if (_scriptAborted) return 'aborted';
    }
    var newId = window._lastSubmittedInstanceId;
    if (newId && newId !== prevInstanceId) {
      _storeVars['instance_id'] = newId;
      // Return full UUID in ack so Aegis can capture it into its own _storeVars.
      // Transcript rendering truncates on display — see _appendLine.
      return 'submitted · instance ' + newId;
    }
    return 'submit triggered (instance id not yet available)';
  },

  'Form Insert': async function(args) {
    var field = args[0];
    var value = args[1] !== undefined ? args[1] : '';
    // Find the form overlay iframe and dispatch via postMessage
    var iframe = document.querySelector('#myr-html-form-overlay iframe, #myr-html-form-modal iframe');
    if (!iframe) return 'No form overlay open';
    iframe.contentWindow.postMessage({
      source: 'cmd-center', cmd: 'Form Insert', field: field, value: value
    }, '*');
    return 'inserted ' + field + ' = ' + value;
  },

  // Form Select "field" "value" — for <select> dropdowns.
  // Sets the value AND dispatches a real change event so onchange handlers fire.
  'Form Select': async function(args) {
    var field = args[0];
    var value = args[1] !== undefined ? args[1] : '';
    var iframe = document.querySelector('#myr-html-form-overlay iframe, #myr-html-form-modal iframe');
    if (!iframe) return 'No form overlay open';
    iframe.contentWindow.postMessage({
      source: 'cmd-center', cmd: 'Form Select', field: field, value: value
    }, '*');
    return 'selected ' + field + ' = ' + value;
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
    if (!iframe) return 'No form overlay open';
    iframe.contentWindow.postMessage({ source: 'cmd-center', cmd: 'Form Save' }, '*');
    return 'draft saved';
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
    await _runScript(script, scriptName);
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

// ── Run a multi-line script ───────────────────────────────────────────────────
async function _runScript(scriptText, scriptName) {
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

  _scriptRunning = true;
  _scriptAborted = false;
  _appendLine('SYS', 'sys', 'Script: ' + (scriptName||'inline') + ' · ' + lines.filter(function(l){ return !l.startsWith('#'); }).length + ' commands');
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

  try {
    for (var i = 0; i < lines.length; i++) {
      // Check abort flag — set by Stop button or form closure
      if (_scriptAborted) {
        _appendLine('SYS', 'warn', 'Script aborted at line ' + (i+1));
        break;
      }

      var line = lines[i];
      if (!line || line.startsWith('#')) continue;

      // Abort if panel was closed
      if (_scriptAborted) {
        _scriptAborted = false;
        _appendLine('SYS', 'warn', 'Script aborted — panel closed');
        break;
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
          break;
        }
      }

      // Determine target session via alias map
      var targetUserId = null;
      if (parsed.target) {
        targetUserId = _resolveTargetAlias(parsed.target);
      }

      var _lv=['Assert','Log','Wait','Store','Get','DB Poll','DB Get','Run','Pause',
               'Wait ForLocation','Wait ForInstance','Wait ForRoute','Wait ForForm','Wait ForQueueRow','Wait ForModal'];
      if (targetUserId && (_lv.indexOf(parsed.verb)===-1)) {
        // Dispatch via Realtime (non-local commands)
        // B-UI-5 / CMD71: resolve $variables against Aegis's _storeVars
        // BEFORE transmission. Receiver has no access to sender-captured
        // vars; the wire must carry resolved literals.
        var _bareLine = line.replace(/^[A-Z]+:\s*/, '');
        var _resolvedLine = _resolveVarsInCmd(_bareLine);
        _appendLine(parsed.target || 'SYS', 'cmd', _resolvedLine);
        if (_channel) {
          _channelSend({
            type: 'broadcast', event: 'cmd',
            payload: {
              target: targetUserId,
              from:   _myAlias || _mySession.initials,
              cmd:    _resolvedLine,
              cmdId:  Date.now() + '-' + i,
            }
          });
        }
        try {
          var _ackData = await _waitForEvent('result:' + targetUserId, 30000);
          // Propagate key vars from remote ack into local _storeVars so the
          // rest of the script (running locally on Aegis) can reference them.
          // Form Submit acks with 'submitted · instance XXXXXXXX' — extract the id.
          // The target stored the full UUID in its own _storeVars; we capture
          // the prefix here, which is sufficient for Log lines. For exact UUID
          // matching via $instance_id, add 'Store instance_id' to the script.
          if (_ackData && typeof _ackData.result === 'string') {
            var _m = _ackData.result.match(/^submitted · instance ([a-f0-9-]+)/i);
            if (_m) {
              _storeVars['instance_id'] = _m[1];
              _appendLine('SYS', 'sys', 'captured $instance_id = ' + _m[1]);
            }
          }
        } catch(e) {
          _appendLine('SYS', 'warn', 'Timeout waiting for ' + parsed.target);
        }
      } else {
        // Execute locally
        _appendLine(_myAlias || _mySession.initials, 'cmd', line.replace(/^[A-Z]+:\s*/, ''));
        try {
          await _executeCommand(line.replace(/^[A-Z]+:\s*/, ''), _myAlias || _mySession.initials);
        } catch(e) {
          _appendLine('SYS', 'err', 'Script halted: ' + e.message);
          break;
        }
      }

      // Small yield between commands
      await new Promise(function(r){ setTimeout(r, 200); });
    }
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
  // Load from localStorage
  var keys = Object.keys(localStorage).filter(function(k){ return k.startsWith('phud:script:'); });
  keys.forEach(function(k) {
    var name = k.replace('phud:script:', '');
    _scripts[name] = localStorage.getItem(k);
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

    <div style="font-size:9px;font-weight:700;letter-spacing:.14em;color:#EF9F27;padding:7px 10px 3px;text-transform:uppercase">Scripts</div>
    <div id="phr-scripts" style="flex:1;overflow-y:auto;padding-bottom:4px"></div>

    <div style="border-top:1px solid #0d1f2e;padding:6px 8px">
      <button id="phr-new-script" style="width:100%;font-size:10px;font-weight:700;padding:4px;border:1px solid rgba(0,201,201,.3);border-radius:3px;background:transparent;color:#00c9c9;cursor:pointer;font-family:monospace;letter-spacing:.05em">+ New Script</button>
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

    <!-- Library tab -->
    <div id="phr-pane-library" style="display:none;flex:1;overflow-y:auto;padding:10px 12px" class="phr-pane">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:10px;color:#EF9F27;line-height:1.7">
          Click to load into editor. Scripts auto-load from /scripts/ on startup.
        </div>
        <button id="phr-refresh-scripts" title="Reload scripts from server"
          style="font-size:10px;padding:2px 8px;border:1px solid rgba(0,201,201,.3);border-radius:3px;
                 background:transparent;color:#00c9c9;cursor:pointer;font-family:monospace;
                 white-space:nowrap;flex-shrink:0;margin-left:8px">↻ Refresh</button>
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
      // Persist for this userId
      if (_mySession) localStorage.setItem('phud:cmd:alias:' + _mySession.userId, _myAlias);
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
        // Wire refresh button each time library tab opens
        var refreshBtn = p.querySelector('#phr-refresh-scripts');
        if (refreshBtn && !refreshBtn._wired) {
          refreshBtn._wired = true;
          refreshBtn.onclick = async function() {
            var btn = this;
            btn.textContent = '↻ …';
            btn.disabled = true;
            await _loadServerScripts();
            _renderLibrary();
            btn.textContent = '↻ Refresh';
            btn.disabled = false;
          };
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

  // Save script
  p.querySelector('#phr-save-script').onclick = function() {
    var name = p.querySelector('#phr-script-name').value.trim().replace(/\s+/g, '-');
    var text = p.querySelector('#phr-editor').value;
    if (!name) { alert('Enter a script name'); return; }
    _saveScript(name, text);
    _activeScript = name;
    _renderScriptList();
    _appendLine('SYS', 'sys', 'Script saved: ' + name);
  };

  // Run script from editor
  p.querySelector('#phr-run-script').onclick = function() {
    var name = p.querySelector('#phr-script-name').value.trim().replace(/\s+/g, '-');
    var text = p.querySelector('#phr-editor').value;
    p.querySelector('[data-tab="transcript"]').click();
    _runScript(text, name);
  };

  // Delete script
  p.querySelector('#phr-del-script').onclick = function() {
    var name = p.querySelector('#phr-script-name').value.trim();
    if (name && confirm('Delete script "' + name + '"?')) {
      _deleteScript(name);
      _renderScriptList();
      p.querySelector('#phr-editor').value = '';
      p.querySelector('#phr-script-name').value = '';
    }
  };

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
    var _rl=['Assert','Log','Wait','Store','Get','DB Poll','DB Get','Run','Pause',
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
    html += '<div data-uid="' + uid + '" style="display:flex;align-items:center;gap:7px;padding:5px 10px;cursor:pointer;background:' + bg + ';border-left:' + border + '">'
      + '<div style="width:22px;height:22px;border-radius:50%;background:' + color + '22;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:' + color + ';flex-shrink:0">' + s.initials + '</div>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-size:11px;color:#ffffff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
      + s.name + aliasDisplay
      + (isMine ? ' <span style="font-size:9px;color:#EF9F27">(me)</span>' : '')
      + '</div>'
      + '<div style="font-size:9px;color:#EF9F27;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px">' + (s.location||'—') + '</div>'
      + '</div>'
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
}

function _renderScriptList() {
  var p = _panelEl;
  if (!p) return;
  var container = p.querySelector('#phr-scripts');
  if (!container) return;

  var names = Object.keys(_scripts).sort();
  var html = names.map(function(name) {
    var isActive = name === _activeScript;
    return `<div data-script="${name}" style="display:flex;align-items:center;gap:5px;padding:4px 10px;cursor:pointer;${isActive?'color:#00c9c9':'color:#ffffff'}">
      <span style="font-size:10px">${isActive?'▶':'◇'}</span>
      <span style="font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</span>
    </div>`;
  }).join('');

  if (!names.length) {
    html = '<div style="font-size:10px;color:#EF9F27;padding:6px 10px">No scripts saved</div>';
  }

  container.innerHTML = html;

  container.querySelectorAll('[data-script]').forEach(function(el) {
    el.onclick = function() {
      var name = el.dataset.script;
      _activeScript = name;
      var scriptEl = p.querySelector('#phr-script-name');
      var editorEl = p.querySelector('#phr-editor');
      if (scriptEl) scriptEl.value = name;
      if (editorEl) editorEl.value = _scripts[name] || '';
      _renderScriptList();
      p.querySelector('[data-tab="editor"]').click();
    };
  });
}

function _renderLibrary() {
  var p = _panelEl;
  if (!p) return;
  var container = p.querySelector('#phr-library-list');
  if (!container) return;

  var names = Object.keys(_scripts).sort();
  if (!names.length) {
    container.innerHTML = '<div style="font-size:11px;color:#EF9F27">No saved scripts.</div>';
    return;
  }

  container.innerHTML = names.map(function(name) {
    var text  = _scripts[name] || '';
    var lines = text.split('\n').filter(function(l){ return l.trim() && !l.trim().startsWith('#'); }).length;
    var firstComment = text.split('\n').find(function(l){ return l.trim().startsWith('#') && !l.match(/requires:/i); }) || '(no description)';
    var required = _parseScriptRequires(text);
    var reqBadges = required.length
      ? required.map(function(alias) {
          var uid = _resolveTargetAlias(alias);
          var live = uid && _sessions[uid] && _sessions[uid].online;
          var col = live ? '#1D9E75' : '#EF9F27';
          return '<span style="font-size:9px;font-family:monospace;color:' + col + ';border:1px solid ' + col + '44;border-radius:2px;padding:0 3px;margin-right:2px">' + alias + '</span>';
        }).join('')
      : '';
    return '<div style="border:1px solid #0d1f2e;border-radius:4px;padding:8px 10px;margin-bottom:6px;cursor:pointer" data-script="' + name + '" onmouseover="this.style.borderColor=\'#1a3a5a\'" onmouseout="this.style.borderColor=\'#0d1f2e\'">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">'
      + '<span style="font-size:11px;color:#EF9F27;font-weight:700">' + name + '</span>'
      + '<span style="font-size:10px;color:#EF9F27">' + lines + ' cmd' + (lines !== 1 ? 's' : '') + '</span>'
      + '</div>'
      + (reqBadges ? '<div style="margin-bottom:4px">' + reqBadges + '</div>' : '')
      + '<div style="font-size:10px;color:#EF9F27">' + _escHtml(firstComment) + '</div>'
      + '</div>';
  }).join('');

  container.querySelectorAll('[data-script]').forEach(function(el) {
    el.onclick = function() {
      var name = el.dataset.script;
      _activeScript = name;
      p.querySelector('#phr-script-name').value = name;
      p.querySelector('#phr-editor').value = _scripts[name] || '';
      _renderScriptList();
      p.querySelector('[data-tab="editor"]').click();
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
      var firmId = typeof FIRM_ID !== 'undefined' ? FIRM_ID : (window.PHUD && window.PHUD.FIRM_ID) || '';
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
    if (_mySession) localStorage.setItem('phud:cmd:alias:' + _mySession.userId, _myAlias);
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
  // Clean up any alias keys persisted under anon- userIds from previous sessions
  Object.keys(localStorage).forEach(function(k) {
    if (k.startsWith('phud:cmd:alias:anon-')) localStorage.removeItem(k);
  });
  _loadScripts();
  _loadServerScripts();
  try{Object.keys(localStorage).filter(function(k){return k.startsWith('phud:cmd:session:');}).forEach(function(k){var uid=k.replace('phud:cmd:session:','');var s=JSON.parse(localStorage.getItem(k));if(s&&uid&&!_sessions[uid]){s.online=false;_sessions[uid]=s;_aliasMap[s.alias||s.initials]=uid;}});}catch(e){}
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