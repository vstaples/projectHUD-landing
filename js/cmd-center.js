// ════════════════════════════════════════════════════════════════════════════
// cmd-center.js  ·  v20260416-CMD49
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

// Version banner — fires on every page load/refresh so you can confirm what's running
(function() {
  var versions = {
    'cmd-center':  'v20260416-CMD49',
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
console.group('%c CMD Center v20260416-CMD49 ', 'background:#00c9c9;color:#003333;font-weight:700;padding:2px 8px;border-radius:3px');
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
var _channel     = null;   // shared presence + command channel
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
  // Only send via WebSocket — avoid REST fallback which causes 401
  if (!_channel) return;
  try {
    var state = _channel.socket && _channel.socket.conn && _channel.socket.conn.readyState;
    // readyState 1 = OPEN
    if (state !== undefined && state !== 1) return;
    _channel.send(payload);
  } catch(e) {}
}

function _connect() {
  if (!_supabase || !_mySession) return;
  if (_channel) return; // already connected — don't re-subscribe

  _channel = _supabase.channel('cmd-center-' + FIRM_ID, {
    config: {
      presence:  { key: _mySession.userId + ':' + (window._aegisMode ? 'aegis' : Math.random().toString(36).slice(2,7)) },
      broadcast: { self: true, ack: false },
    }
  });

  // Presence: track who is online
  _channel.on('presence', { event: 'sync' }, function() {
    var state = _channel.presenceState();
    var execP = Object.values(state).map(function(p){return p[0];}).filter(function(p){return p&&!p.aegisObserver;});
    console.log('[Aegis] presence sync — '+execP.length+' exec session(s): '+execP.map(function(p){return p.name||'?';}).join(', '));
    _sessions = {};
    _aliasMap = {};
    Object.entries(state).forEach(function([key, presences]) {
      var p = presences[0];
      if (!p || !p.userId) return;
      if (p.aegisObserver && _mySession && p.userId !== _mySession.userId) return;
      var _ex = _sessions[p.userId];
      if (_ex && _ex.online && !_ex.aegisObserver && p.aegisObserver) return;
      _sessions[p.userId] = {name:p.name,initials:p.initials,alias:p.alias||p.initials,location:p.location,online:true,ts:p.ts,aegisObserver:p.aegisObserver||false};
      _aliasMap[p.alias||p.initials] = p.userId;
      try{localStorage.setItem('phud:cmd:session:'+p.userId,JSON.stringify(_sessions[p.userId]));}catch(e){}
    });
    _renderSessionList();
  });

  // Leave timers tracked at module scope (see top) so _renderSessionList can read them

  _channel.on('presence', { event: 'join' }, function(data) {
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
  });

  _channel.on('presence', { event: 'leave' }, function(data) {
    var p = data.leftPresences && data.leftPresences[0];
    if (!p) return;
    var uid = p.userId;
    // Debounce 8s — Supabase fires leave on every track() update.
    // If they re-join within 8s it was just a presence update, not a true disconnect.
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
  });

  // Commands: receive commands addressed to this session
  _channel.on('broadcast', { event: 'cmd' }, function(payload) {
    var d = payload.payload;
    if (!d) return;
    if (d.target !== _mySession.userId && d.target !== 'ALL') return;
    if (window._aegisMode) return; // Aegis dispatches but never executes
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
  });

  // Location updates — keep session location current without track() churn
  _channel.on('broadcast', { event: 'location_update' }, function(payload) {
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
  });

  // Results: receive results from other sessions
  _channel.on('broadcast', { event: 'result' }, function(payload) {
    var d = payload.payload;
    if (!d) return;
    // Self-echo skip: a session should ignore its own acks coming back via
    // broadcast.self=true. EXCEPT when we are Aegis — Aegis never acks (it
    // never executes cmds, see cmd handler above), so any 'result' arriving
    // here is from a target exec session. If that target shares Aegis's
    // userId (the operator ran Aegis + an exec tab in the same browser with
    // the same auth), the userId-match check would incorrectly swallow the
    // ack and cause 30s dispatch timeouts. Aegis is exempt.
    if (!window._aegisMode && d.from === _mySession.userId) return;
    var sess = _sessions[d.from];
    var who  = sess ? sess.initials : d.name || '??';
    _appendLine(who, 'result', '→ ' + d.result);
    // Resolve any waiting ForEvent listeners
    _resolveEventListeners('result:' + d.from, d);
  });

  // App events: other sessions broadcast what they're doing
  _channel.on('broadcast', { event: 'app_event' }, function(payload) {
    var d = payload.payload;
    if (!d || d.from === _mySession.userId) return;
    _resolveEventListeners(d.event, d);
  });

  _channel.subscribe(function(status) {
    if (status === 'SUBSCRIBED') {
      // Don't publish presence from pop-out window — it would create duplicate sessions
      if (!window._cmdCenterFullscreen) {
        _channel.track({
          userId:   _mySession.userId,
          name:     _mySession.name,
          initials: _mySession.initials,
          alias:    _myAlias || _mySession.initials,
          location: _currentLocation(),
          ts:       Date.now(),
          aegisObserver: window._aegisMode ? true : undefined,
        });
      }
      _appendLine('SYS', 'sys', 'Connected · session: ' + _mySession.name);
      // Store connection state so panel can pick it up when opened
      window._cmdConnected = true;
      window._cmdSessionName = _mySession ? _mySession.name : 'connected';
      _updateStatusEl();
      _renderSessionList();
      // Start LIVE clock
      _startLiveClock();
      // Location-only update — use a separate broadcast instead of track()
      // to avoid triggering leave/join cycles on every heartbeat
      // Only send location heartbeats from main window, not pop-out
      if (!window._cmdCenterFullscreen && !window._aegisMode) {
        setInterval(function() {
          if (!_channel) return;
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
    }
  });
}

// ── Event listener system for Wait ForEvent ───────────────────────────────────
function _waitForEvent(eventName, timeoutMs) {
  return new Promise(function(resolve, reject) {
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

// ── Filtered event wait ───────────────────────────────────────────────────────
// Like _waitForEvent but only resolves when the event data matches a filter.
// filterKey: field to check (e.g. 'assignee', 'userId', 'resource_id')
// filterVal: expected value — compared against common data fields
// Non-matching events re-queue the listener so it keeps waiting.
function _waitForEventFiltered(eventName, filterKey, filterVal, timeoutMs) {
  return new Promise(function(resolve, reject) {
    var deadline = Date.now() + (timeoutMs || 60000);

    function attempt() {
      if (!_eventListeners[eventName]) _eventListeners[eventName] = [];

      var timer = setTimeout(function() {
        _eventListeners[eventName] = (_eventListeners[eventName]||[]).filter(function(r){ return r !== resolver; });
        reject(new Error('Timeout waiting for event: ' + eventName
          + (filterKey ? ' [' + filterKey + '=' + filterVal + ']' : '')));
      }, Math.max(0, deadline - Date.now()));

      var resolver = function(data) {
        clearTimeout(timer);
        // No filter — resolve immediately
        if (!filterKey || !filterVal) { resolve(data); return; }
        // Build a set of acceptable values to match against.
        // For assignee filter: accept the raw alias, the resolved userId,
        // and the resolved resource_id (for events emitted by mw-events.js)
        var acceptableVals = [filterVal];
        if (filterKey === 'assignee') {
          var resolvedUid = _resolveTargetAlias(filterVal.toUpperCase());
          if (resolvedUid) {
            acceptableVals.push(resolvedUid);
            // Also accept the resource_id for this user if known from _sessions
            var resolvedSess = _sessions[resolvedUid];
            if (resolvedSess && resolvedSess.resourceId) acceptableVals.push(resolvedSess.resourceId);
          }
          // Own session: also accept _mySession.userId
          if (_mySession && (filterVal === _myAlias || filterVal === _mySession.initials)) {
            acceptableVals.push(_mySession.userId);
          }
        }
        // Check common field names that might carry assignee identity
        var fields = [
          data[filterKey],
          data.userId, data.user_id,
          data.resource_id, data.assigneeId,
          data.from, data.assignee,
        ].filter(Boolean).map(String);

        var matches = fields.some(function(f) {
          return acceptableVals.some(function(v) { return f === String(v); });
        });

        if (matches) {
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

// ── Broadcast app events from this session ────────────────────────────────────
window._cmdEmit = function(eventName, data) {
  if (!_channel || !_mySession) return;
  _channelSend({
    type: 'broadcast', event: 'app_event',
    payload: Object.assign({ event: eventName, from: _mySession.userId, name: _mySession.name }, data || {})
  });
  // Also resolve local listeners
  _resolveEventListeners(eventName, data);
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
      return 'submitted · instance ' + newId.slice(0,8);
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
    // Latest submitted instance — set by mw-tabs.js at submit time
    if (key === 'Latest instance_id' || key === 'submitted instance_id') {
      var id = window._lastSubmittedInstanceId || null;
      _storeVars['instance_id'] = id;
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
    _appendLine('SYS', 'result', '▶ resumed');
    return 'resumed';
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

// ── Execute a single command ──────────────────────────────────────────────────
async function _executeCommand(cmdLine, fromWho) {
  var parsed = _parseLine(cmdLine);
  if (!parsed) return;

  // Variable substitution — replace $varname with stored value
  var args = (parsed.args||[]).map(function(a) {
    return a.replace(/\$(\w+)/g, function(_, k) { return _storeVars[k] || a; });
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
      if (parsed.verb && parsed.verb.startsWith('Form ') && parsed.verb !== 'Form Open') {
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

      var _lv=['Assert','Log','Wait','Store','Get','DB Poll','DB Get','Run','Pause'];
      if (targetUserId && (_lv.indexOf(parsed.verb)===-1)) {
        // Dispatch via Realtime (non-local commands)
        _appendLine(parsed.target || 'SYS', 'cmd', line.replace(/^[A-Z]+:\s*/, ''));
        if (_channel) {
          _channelSend({
            type: 'broadcast', event: 'cmd',
            payload: {
              target: targetUserId,
              from:   _myAlias || _mySession.initials,
              cmd:    line.replace(/^[A-Z]+:\s*/, ''),
              cmdId:  Date.now() + '-' + i,
            }
          });
        }
        try {
          await _waitForEvent('result:' + targetUserId, 30000);
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
      // Re-track presence with new alias so other sessions pick it up
      if (_channel && _mySession && !window._cmdCenterFullscreen) {
        _channel.track({
          userId:   _mySession.userId,
          name:     _mySession.name,
          initials: _mySession.initials,
          alias:    _myAlias,
          location: _currentLocation(),
          ts:       Date.now(),
        });
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
    var _rl=['Assert','Log','Wait','Store','Get','DB Poll','DB Get','Run','Pause'];
    if (targetUserId && _channel && _rl.indexOf(parsed.verb)===-1) {
      _channelSend({
        type: 'broadcast', event: 'cmd',
        payload: { target: targetUserId, from: _myAlias || _mySession.initials, cmd: cmd, cmdId: Date.now() }
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
        try {
          var notes = rows && rows[0] && rows[0].notes ? JSON.parse(rows[0].notes) : null;
          var chain = notes && notes.step_chain;
          if (chain && chain[seq]) assignee = ' → ' + (chain[seq].assignee_name || '');
        } catch(e) {}
        if (_panelEl) _appendLine('SYS', 'result',
          '→ routed step ' + seq + assignee);
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
          // Already connected — re-track with correct identity
          _channel.track({
            userId:   _mySession.userId,
            name:     _mySession.name,
            initials: _mySession.initials,
            alias:    _myAlias || _mySession.initials,
            location: _currentLocation(),
            ts:       Date.now(),
          });
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
  _channelSend({type:'broadcast',event:'cmd',payload:{target:uid,from:_myAlias||(window._aegisMode?'AEGIS':'OP'),cmd:cmd,cmdId:Date.now()}});
  console.log('[CMD] sent to',alias,'('+uid.slice(0,8)+'...):',cmd);
};
window._aegisSessions = function() {
  Object.entries(_sessions).forEach(function([uid,s]){
    console.log((s.alias||s.initials),s.name,'|',s.location,'|',s.online?'ONLINE':'offline','|',uid.slice(0,8)+'...');
  });
};
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){_init().then(function(){if(window._aegisMode)setTimeout(_buildPanel,50);});});}else{_init().then(function(){if(window._aegisMode)setTimeout(_buildPanel,50);});}

})();