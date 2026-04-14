// ════════════════════════════════════════════════════════════════════════════
// cmd-center.js  ·  v20260412-CMD27
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
    'cmd-center':  'v20260412-CMD27',
    'mw-core':     typeof window._mwCoreVersion !== 'undefined' ? window._mwCoreVersion : '—',
    'mw-tabs':     typeof window._mwTabsVersion !== 'undefined' ? window._mwTabsVersion : '—',
    'mw-events':   typeof window._mwEventsVersion !== 'undefined' ? window._mwEventsVersion : '—',
    'mw-team':     typeof window._mwTeamVersion !== 'undefined' ? window._mwTeamVersion : '—',
  };
  console.group('%c CMD Center v20260412-CMD27 ', 'background:#00c9c9;color:#003333;font-weight:700;padding:2px 8px;border-radius:3px');
  console.log('%cHotkey: Ctrl+Shift+` to toggle panel', 'color:#00c9c9');
  Object.entries(versions).forEach(function([mod, ver]) {
    console.log('%c' + mod.padEnd(16) + '%c' + ver,
      'color:rgba(255,255,255,.4);font-family:monospace',
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
var _sessions    = {};     // { userId: { name, initials, location, online, ts } }
var _transcript  = [];     // { ts, who, type, text }
var _scripts     = {};     // { name: scriptText }
var _panelEl     = null;   // the floating panel DOM element
var _panelOpen   = false;
var _cmdTarget   = 'ALL';  // current command target userId or 'ALL'
var _execQueue   = [];     // pending async commands
var _eventListeners = {};  // { eventName: [resolvers] }
var _storeVars   = {};     // script variable storage { name: value }

// ── Load Supabase JS client ───────────────────────────────────────────────────
function _loadSupabase() {
  return new Promise(function(resolve) {
    if (window.supabase) { resolve(); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
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
function _updateStatusEl() {
  if (!_panelEl) return;
  var statusEl = _panelEl.querySelector('#phr-status');
  if (!statusEl) return;
  if (window._cmdConnected) {
    statusEl.textContent = '● ' + (window._cmdSessionName || 'connected');
    statusEl.style.color = '#1D9E75';
  } else {
    statusEl.textContent = 'connecting…';
    statusEl.style.color = 'rgba(255,255,255,.3)';
  }
}

function _connect() {
  if (!_supabase || !_mySession) return;
  if (_channel) return; // already connected — don't re-subscribe

  _channel = _supabase.channel('cmd-center-' + FIRM_ID, {
    config: { presence: { key: _mySession.userId } }
  });

  // Presence: track who is online
  _channel.on('presence', { event: 'sync' }, function() {
    var state = _channel.presenceState();
    _sessions = {};
    Object.entries(state).forEach(function([key, presences]) {
      var p = presences[0];
      if (p) {
        _sessions[p.userId] = {
          name:     p.name,
          initials: p.initials,
          location: p.location,
          online:   true,
          ts:       p.ts,
        };
      }
    });
    _renderSessionList();
  });

  // Track pending leave timers so we can cancel them if user re-joins
  var _leaveTimers = {};

  _channel.on('presence', { event: 'join' }, function(data) {
    var p = data.newPresences && data.newPresences[0];
    if (!p) return;
    // Cancel any pending leave timer for this user
    if (_leaveTimers[p.userId]) {
      clearTimeout(_leaveTimers[p.userId]);
      delete _leaveTimers[p.userId];
    }
    var isNew = !_sessions[p.userId];
    _sessions[p.userId] = {
      name: p.name, initials: p.initials, location: p.location,
      online: true, ts: Date.now(), lastSeen: Date.now()
    };
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
    }, 8000);
  });

  // Commands: receive commands addressed to this session
  _channel.on('broadcast', { event: 'cmd' }, function(payload) {
    var d = payload.payload;
    if (!d) return;
    if (d.target !== _mySession.userId && d.target !== 'ALL') return;
    _appendLine(d.from || 'SYS', 'cmd', d.cmd);
    _executeCommand(d.cmd, d.from).then(function(result) {
      if (result !== undefined) {
        _channel.send({
          type: 'broadcast', event: 'result',
          payload: { from: _mySession.userId, name: _mySession.name, result: result, cmdId: d.cmdId }
        });
      }
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
    if (!d || d.from === _mySession.userId) return;
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
          location: _currentLocation(),
          ts:       Date.now(),
        });
      }
      _appendLine('SYS', 'sys', 'Connected · session: ' + _mySession.name);
      // Store connection state so panel can pick it up when opened
      window._cmdConnected = true;
      window._cmdSessionName = _mySession ? _mySession.name : 'connected';
      _updateStatusEl();
      _renderSessionList();
      // Location-only update — use a separate broadcast instead of track()
      // to avoid triggering leave/join cycles on every heartbeat
      // Only send location heartbeats from main window, not pop-out
      if (!window._cmdCenterFullscreen) {
        setInterval(function() {
          if (!_channel) return;
          _channel.send({
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

// ── Broadcast app events from this session ────────────────────────────────────
window._cmdEmit = function(eventName, data) {
  if (!_channel || !_mySession) return;
  _channel.send({
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

  // ── Forms ───────────────────────────────────────────────────────────────────
  'Form Open': async function(args) {
    var name = args[0];
    var def = (window._myrFormDefs||[]).find(function(f){
      return (f.source_name||'').toLowerCase().includes(name.toLowerCase());
    });
    if (!def) return 'Form not found: ' + name;
    // Open the form launch overlay
    if (typeof myrLaunchRequest === 'function') {
      await myrLaunchRequest('form', def.id);
      return 'form opened: ' + def.source_name;
    }
    return 'myrLaunchRequest not available';
  },

  'Form Submit': async function(args) {
    // Trigger submit button in the open form iframe
    var iframe = document.querySelector('#myr-html-form-modal iframe, #myr-html-form-overlay iframe');
    if (!iframe) return 'No form overlay open';
    var btn = iframe.contentDocument && iframe.contentDocument.querySelector('[onclick*="submitForApproval"], .btn-p');
    if (btn) { btn.click(); return 'submit triggered'; }
    return 'Submit button not found in form';
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

  'Form AddRow': async function(args) {
    var table = args[0]; // "misc" or "ent"
    var iframe = document.querySelector('#myr-html-form-overlay iframe, #myr-html-form-modal iframe');
    if (!iframe) return 'No form overlay open';
    iframe.contentWindow.postMessage({
      source: 'cmd-center', cmd: 'Form AddRow', field: table
    }, '*');
    return 'added row to ' + table;
  },

  'Form Close': async function(args) {
    var overlay = document.getElementById('myr-html-form-modal') ||
                  document.getElementById('myr-html-form-overlay');
    if (overlay) { overlay.remove(); return 'form closed'; }
    return 'no form overlay found';
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
  'Click': async function(args) {
    var target = args[0];
    var scope  = args[1]; // optional: instance_id or selector

    if (target === 'Approve') {
      var btn = document.getElementById('rrp-approve-btn');
      if (btn) { btn.click(); return 'approve clicked'; }
      return 'Approve button not found — is review panel open?';
    }
    if (target === 'Review' || target === 'Open') {
      // Find the work item and click its action button
      var wiBtn = document.querySelector('.wi-action-btn');
      if (scope) {
        wiBtn = document.querySelector('.wi-action-btn[data-wi-id="' + scope + '"]') ||
                Array.from(document.querySelectorAll('.wi-action-btn')).find(function(b){
                  return b.dataset.wiId && b.dataset.wiId.startsWith(scope.slice(0,8));
                });
      }
      if (wiBtn) { wiBtn.click(); return 'review opened'; }
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
    return 'Unknown click target: ' + target;
  },

  // ── Wait ─────────────────────────────────────────────────────────────────────
  'Wait': async function(args) {
    var val = args[0];
    if (String(val).match(/^\d+$/)) {
      await new Promise(function(r){ setTimeout(r, parseInt(val)); });
      return 'waited ' + val + 'ms';
    }
    if (val === 'ForEvent') {
      var eventName = args[1];
      var data = await _waitForEvent(eventName, 30000);
      return 'event received: ' + eventName + (data && data.instanceId ? ' · instance ' + data.instanceId : '');
    }
    return 'unknown Wait argument: ' + val;
  },

  // ── Storage ──────────────────────────────────────────────────────────────────
  'Store': async function(args) {
    var key = args[0];
    var val = args[1] !== undefined ? args[1] : (_storeVars['_lastResult'] || '');
    _storeVars[key] = val;
    return 'stored ' + key + ' = ' + val;
  },

  'Get': async function(args) {
    var key = args[0];
    if (key === 'Active instance_id' || key === 'instance_id') {
      var inst = (window._myrInstances||[]).find(function(i){ return i.status === 'in_progress'; });
      var id = inst ? inst.id : null;
      _storeVars['instance_id'] = id;
      return id || 'no active instance found';
    }
    if (_storeVars[key] !== undefined) return String(_storeVars[key]);
    return 'variable not found: ' + key;
  },

  // ── Assertions ───────────────────────────────────────────────────────────────
  'Assert': async function(args) {
    var key   = args[0];
    var value = args[1];
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

  // ── UI helpers ───────────────────────────────────────────────────────────────
  'Reload': async function(args) {
    if (typeof loadUserRequests === 'function') { await loadUserRequests(); return 'requests reloaded'; }
    return 'loadUserRequests not available';
  },

  'Log': async function(args) {
    return args.join(' ');
  },
};

// ── Parse a command line into [verb, ...args] ─────────────────────────────────
// Handles: VS: Set Tab "MY REQUESTS"
//          AK: Click "Approve"
//          Wait ForEvent "workflow_request.created"
function _parseLine(line) {
  line = line.trim();
  if (!line || line.startsWith('#') || line.startsWith('//')) return null;

  var target = null;
  var initials = line.match(/^([A-Z]{1,3}):\s*/);
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

// ── Run a multi-line script ───────────────────────────────────────────────────
async function _runScript(scriptText, scriptName) {
  var lines = scriptText.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);
  _appendLine('SYS', 'sys', 'Script: ' + (scriptName||'inline') + ' · ' + lines.filter(function(l){ return !l.startsWith('#'); }).length + ' commands');

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line || line.startsWith('#')) continue;

    var parsed = _parseLine(line);
    if (!parsed) continue;

    // Determine target session
    var targetUserId = null;
    if (parsed.target) {
      // Match initials to session
      var match = Object.entries(_sessions).find(function([uid, s]) {
        return s.initials === parsed.target;
      });
      targetUserId = match ? match[0] : null;
    }

    if (targetUserId && targetUserId !== _mySession.userId) {
      // Dispatch to remote session
      _appendLine(parsed.target || 'SYS', 'cmd', line.replace(/^[A-Z]+:\s*/, ''));
      if (_channel) {
        _channel.send({
          type: 'broadcast', event: 'cmd',
          payload: {
            target: targetUserId,
            from:   _mySession.initials,
            cmd:    line.replace(/^[A-Z]+:\s*/, ''),
            cmdId:  Date.now() + '-' + i,
          }
        });
      }
      // Wait for result with 30s timeout
      try {
        await _waitForEvent('result:' + targetUserId, 30000);
      } catch(e) {
        _appendLine('SYS', 'warn', 'Timeout waiting for ' + parsed.target);
      }
    } else {
      // Execute locally
      _appendLine(_mySession.initials, 'cmd', line.replace(/^[A-Z]+:\s*/, ''));
      try {
        await _executeCommand(line.replace(/^[A-Z]+:\s*/, ''), _mySession.initials);
      } catch(e) {
        _appendLine('SYS', 'err', 'Script halted: ' + e.message);
        break;
      }
    }

    // Small yield between commands
    await new Promise(function(r){ setTimeout(r, 200); });
  }

  _appendLine('SYS', 'result', '✓ Script complete · ' + (scriptName||'inline'));
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
    // Try manifest first
    var manifestResp = await fetch('/scripts/index.json', { cache: 'no-store' }).catch(function(){ return null; });
    var filenames = [];

    if (manifestResp && manifestResp.ok) {
      var manifest = await manifestResp.json();
      filenames = Array.isArray(manifest) ? manifest : (manifest.scripts || []);
    } else {
      // No manifest — try fetching the scripts directory listing
      // Fall back to scanning for known script names via HEAD requests
      var knownNames = ['demo_expense_report', 'test_expense_full', 'test_expense_draft', 'verify_routing_chain'];
      for (var i = 0; i < knownNames.length; i++) {
        var headResp = await fetch('/scripts/' + knownNames[i] + '.txt', { method: 'HEAD', cache: 'no-store' }).catch(function(){ return null; });
        if (headResp && headResp.ok) filenames.push(knownNames[i] + '.txt');
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
      'position:fixed;bottom:20px;right:20px;width:680px;height:520px',
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
}

function _panelHTML() {
  return `
<div id="phr-titlebar" style="background:#040710;border-bottom:1px solid #0d1f2e;padding:6px 10px;display:flex;align-items:center;gap:8px;flex-shrink:0;cursor:move">
  <span style="font-size:11px;font-weight:700;color:#00c9c9;letter-spacing:.1em;flex-shrink:0">COMMAND CENTER</span>
  <span id="phr-status" style="font-size:10px;color:rgba(255,255,255,.3);flex-shrink:0">connecting…</span>
  <div style="flex:1"></div>
  <button class="phr-tab-btn phr-tab-active" data-tab="transcript" style="font-size:10px;padding:2px 8px;border:1px solid rgba(0,201,201,.3);border-radius:3px;background:rgba(0,201,201,.1);color:#00c9c9;cursor:pointer;font-family:monospace;letter-spacing:.05em">Transcript</button>
  <button class="phr-tab-btn" data-tab="monitor" style="font-size:10px;padding:2px 8px;border:1px solid rgba(255,255,255,.12);border-radius:3px;background:transparent;color:rgba(255,255,255,.4);cursor:pointer;font-family:monospace;letter-spacing:.05em">Monitor</button>
  <button class="phr-tab-btn" data-tab="editor" style="font-size:10px;padding:2px 8px;border:1px solid rgba(255,255,255,.12);border-radius:3px;background:transparent;color:rgba(255,255,255,.4);cursor:pointer;font-family:monospace;letter-spacing:.05em">Editor</button>
  <button class="phr-tab-btn" data-tab="library" style="font-size:10px;padding:2px 8px;border:1px solid rgba(255,255,255,.12);border-radius:3px;background:transparent;color:rgba(255,255,255,.4);cursor:pointer;font-family:monospace;letter-spacing:.05em">Library</button>
  <div style="width:1px;height:16px;background:rgba(255,255,255,.1);margin:0 2px;flex-shrink:0"></div>
  <button id="phr-pop-dot" title="Pop out to new window" style="font-size:11px;padding:2px 7px;border:1px solid rgba(29,158,117,.4);border-radius:3px;background:rgba(29,158,117,.1);color:#1D9E75;cursor:pointer;font-family:monospace;flex-shrink:0">⤢ Pop Out</button>
  <button id="phr-min-dot" title="Minimize" style="font-size:11px;padding:2px 7px;border:1px solid rgba(255,255,255,.12);border-radius:3px;background:transparent;color:rgba(255,255,255,.4);cursor:pointer;font-family:monospace;flex-shrink:0">—</button>
  <button id="phr-close-dot" title="Close" style="font-size:11px;padding:2px 7px;border:1px solid rgba(226,75,74,.4);border-radius:3px;background:rgba(226,75,74,.1);color:#E24B4A;cursor:pointer;font-family:monospace;flex-shrink:0">✕</button>
</div>

<div style="display:flex;flex:1;min-height:0">

  <!-- Sidebar -->
  <div style="width:180px;border-right:1px solid #0d1f2e;display:flex;flex-direction:column;flex-shrink:0">

    <div style="border-bottom:1px solid #0d1f2e">
      <div style="font-size:9px;font-weight:700;letter-spacing:.14em;color:rgba(255,255,255,.25);padding:7px 10px 3px;text-transform:uppercase">Sessions</div>
      <div id="phr-sessions" style="padding-bottom:4px"></div>
    </div>

    <div style="font-size:9px;font-weight:700;letter-spacing:.14em;color:rgba(255,255,255,.25);padding:7px 10px 3px;text-transform:uppercase">Scripts</div>
    <div id="phr-scripts" style="flex:1;overflow-y:auto;padding-bottom:4px"></div>

    <div style="border-top:1px solid #0d1f2e;padding:6px 8px">
      <button id="phr-new-script" style="width:100%;font-size:10px;font-weight:700;padding:4px;border:1px solid rgba(0,201,201,.3);border-radius:3px;background:transparent;color:#00c9c9;cursor:pointer;font-family:monospace;letter-spacing:.05em">+ New Script</button>
    </div>
  </div>

  <!-- Main area -->
  <div style="flex:1;display:flex;flex-direction:column;min-width:0">

    <!-- Transcript tab -->
    <div id="phr-pane-transcript" style="flex:1;overflow-y:auto;padding:8px 12px;display:block" class="phr-pane"></div>
    <div id="phr-pane-monitor" style="display:none;flex:1;overflow-y:auto;padding:8px 12px;flex-direction:column;gap:1px" class="phr-pane">
      <div style="font-size:10px;color:rgba(255,255,255,.25);padding:4px 0 8px;font-family:monospace">Session presence events — join / leave / location updates</div>
    </div>

    <!-- Editor tab -->
    <div id="phr-pane-editor" style="display:none;flex:1;flex-direction:column" class="phr-pane">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 12px;border-bottom:1px solid #0d1f2e;flex-shrink:0">
        <input id="phr-script-name" placeholder="script-name" style="font-family:monospace;font-size:11px;background:transparent;border:none;outline:none;color:#EF9F27;width:160px">
        <div style="display:flex;gap:5px">
          <button id="phr-save-script" style="font-size:10px;padding:2px 8px;border:1px solid rgba(255,255,255,.15);border-radius:3px;background:transparent;color:rgba(255,255,255,.5);cursor:pointer;font-family:monospace">Save</button>
          <button id="phr-run-script" style="font-size:10px;padding:2px 8px;border:1px solid #1D9E75;border-radius:3px;background:rgba(29,158,117,.1);color:#1D9E75;cursor:pointer;font-family:monospace;font-weight:700">▶ Run</button>
          <button id="phr-del-script" style="font-size:10px;padding:2px 8px;border:1px solid rgba(226,75,74,.3);border-radius:3px;background:transparent;color:rgba(226,75,74,.6);cursor:pointer;font-family:monospace">Delete</button>
        </div>
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
        style="flex:1;width:100%;background:#040710;border:none;outline:none;color:rgba(255,255,255,.75);font-family:monospace;font-size:11px;padding:10px 12px;resize:none;line-height:1.7"></textarea>
    </div>

    <!-- Library tab -->
    <div id="phr-pane-library" style="display:none;flex:1;overflow-y:auto;padding:10px 12px" class="phr-pane">
      <div style="font-size:10px;color:rgba(255,255,255,.3);margin-bottom:10px;line-height:1.7">
        All saved scripts. Click to load into editor. Scripts are stored in browser localStorage.
      </div>
      <div id="phr-library-list"></div>
    </div>

    <!-- Script status bar -->
    <div id="phr-script-bar" style="display:none;border-top:1px solid #0d1f2e;padding:5px 12px;display:flex;align-items:center;gap:8px;flex-shrink:0;background:#040710">
      <span style="font-size:10px;color:rgba(255,255,255,.25)">RUNNING</span>
      <span id="phr-running-name" style="font-size:10px;color:#EF9F27;font-weight:700;flex:1"></span>
      <button id="phr-stop-btn" style="font-size:10px;padding:2px 8px;border:1px solid rgba(226,75,74,.4);border-radius:3px;background:transparent;color:#E24B4A;cursor:pointer;font-family:monospace">■ Stop</button>
    </div>

    <!-- Command bar -->
    <div style="border-top:1px solid #0d1f2e;padding:7px 10px;display:flex;gap:7px;align-items:center;flex-shrink:0;background:#040710">
      <div id="phr-target-pill" style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:3px;border:1px solid rgba(0,201,201,.3);background:rgba(0,201,201,.1);color:#00c9c9;cursor:pointer;flex-shrink:0;white-space:nowrap">ALL ▾</div>
      <input id="phr-cmd" placeholder="Enter command…" style="flex:1;background:transparent;border:none;outline:none;font-family:monospace;font-size:12px;color:#fff;caret-color:#00c9c9">
      <button id="phr-run-cmd" style="font-size:10px;font-weight:700;padding:4px 14px;border-radius:3px;border:none;background:#00c9c9;color:#003333;cursor:pointer;letter-spacing:.05em;font-family:monospace">RUN</button>
    </div>
  </div>
</div>`;
}

function _wirePanel() {
  var p = _panelEl;

  // Close/minimize dots
  p.querySelector('#phr-close-dot').onclick = function() { _togglePanel(); };
  p.querySelector('#phr-min-dot').onclick   = function() { p.style.height = p.style.height === '36px' ? '520px' : '36px'; };
  p.querySelector('#phr-pop-dot').onclick = function() {
    _popOut();
  };

  // Tab switching
  p.querySelectorAll('.phr-tab-btn').forEach(function(btn) {
    btn.onclick = function() {
      _activeTab = btn.dataset.tab;
      p.querySelectorAll('.phr-tab-btn').forEach(function(b) {
        b.style.background  = b === btn ? 'rgba(0,201,201,.1)' : 'transparent';
        b.style.color       = b === btn ? '#00c9c9' : 'rgba(255,255,255,.4)';
        b.style.borderColor = b === btn ? 'rgba(0,201,201,.3)' : 'rgba(255,255,255,.12)';
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
      if (_activeTab === 'library') _renderLibrary();
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
  p.querySelector('#phr-run-cmd').onclick = _runCmd;

  // Target pill cycling
  p.querySelector('#phr-target-pill').onclick = function() {
    var sessionIds = ['ALL'].concat(Object.keys(_sessions));
    var idx = sessionIds.indexOf(_cmdTarget);
    _cmdTarget = sessionIds[(idx + 1) % sessionIds.length];
    var sess = _sessions[_cmdTarget];
    var label = _cmdTarget === 'ALL' ? 'ALL' : (sess ? sess.initials : _cmdTarget);
    this.textContent = label + ' ▾';
    this.style.color = _cmdTarget === 'ALL' ? '#00c9c9' : _sessionColor(_cmdTarget);
    this.style.borderColor = _cmdTarget === 'ALL' ? 'rgba(0,201,201,.3)' : 'rgba(255,255,255,.2)';
  };

  // Drag to move
  var tb = p.querySelector('#phr-titlebar');
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

function _runCmd() {
  var p = _panelEl;
  if (!p) return;
  var input = p.querySelector('#phr-cmd');
  var cmd   = input.value.trim();
  if (!cmd) return;
  _cmdHistory.push(cmd);
  _cmdHistoryIdx = -1;
  input.value = '';

  // Prefix with target if not already addressed
  var fullCmd = cmd;
  if (_cmdTarget !== 'ALL' && !cmd.match(/^[A-Z]{1,3}:\s*/)) {
    var sess = _sessions[_cmdTarget];
    if (sess) fullCmd = sess.initials + ': ' + cmd;
  }

  _appendLine(_mySession ? _mySession.initials : 'ME', 'cmd', cmd);

  // Determine if dispatching to remote session
  var parsed = _parseLine(fullCmd);
  if (parsed && parsed.target && _mySession && parsed.target !== _mySession.initials) {
    var match = Object.entries(_sessions).find(function([uid, s]) { return s.initials === parsed.target; });
    if (match && _channel) {
      _channel.send({
        type: 'broadcast', event: 'cmd',
        payload: { target: match[0], from: _mySession.initials, cmd: cmd, cmdId: Date.now() }
      });
      return;
    }
  }

  _executeCommand(fullCmd, _mySession ? _mySession.initials : 'ME');
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
    var color   = _sessionColor(uid);
    var isMine  = _mySession && uid === _mySession.userId;
    var isTarget = uid === _cmdTarget;
    var bg = isTarget ? 'rgba(0,201,201,.06)' : 'transparent';
    var border = isTarget ? '2px solid #00c9c9' : '2px solid transparent';
    html += `<div data-uid="${uid}" style="display:flex;align-items:center;gap:7px;padding:5px 10px;cursor:pointer;background:${bg};border-left:${border}">
      <div style="width:22px;height:22px;border-radius:50%;background:${color}22;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:${color};flex-shrink:0">${s.initials}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;color:rgba(255,255,255,.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.name}${isMine?' <span style="font-size:9px;color:rgba(255,255,255,.25)">(me)</span>':''}</div>
        <div style="font-size:9px;color:rgba(255,255,255,.3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px">${s.location||'—'}</div>
      </div>
      <div style="width:6px;height:6px;border-radius:50%;background:${s.online?'#1D9E75':'rgba(255,255,255,.15)'};flex-shrink:0"></div>
    </div>`;
  });

  if (!Object.keys(_sessions).length) {
    html = '<div style="font-size:10px;color:rgba(255,255,255,.2);padding:8px 10px">No sessions yet</div>';
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
        pill.textContent = sess.initials + ' ▾';
        pill.style.color = _sessionColor(_cmdTarget);
        pill.style.borderColor = 'rgba(255,255,255,.2)';
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
    return `<div data-script="${name}" style="display:flex;align-items:center;gap:5px;padding:4px 10px;cursor:pointer;${isActive?'color:#00c9c9':'color:rgba(255,255,255,.4)'}">
      <span style="font-size:10px">${isActive?'▶':'◇'}</span>
      <span style="font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</span>
    </div>`;
  }).join('');

  if (!names.length) {
    html = '<div style="font-size:10px;color:rgba(255,255,255,.2);padding:6px 10px">No scripts saved</div>';
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
    container.innerHTML = '<div style="font-size:11px;color:rgba(255,255,255,.3)">No saved scripts.</div>';
    return;
  }

  container.innerHTML = names.map(function(name) {
    var lines = (_scripts[name]||'').split('\n').filter(function(l){ return l.trim() && !l.trim().startsWith('#'); }).length;
    return `<div style="border:1px solid #0d1f2e;border-radius:4px;padding:8px 10px;margin-bottom:6px;cursor:pointer" data-script="${name}" onmouseover="this.style.borderColor='#1a3a5a'" onmouseout="this.style.borderColor='#0d1f2e'">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
        <span style="font-size:11px;color:#EF9F27;font-weight:700">${name}</span>
        <span style="font-size:10px;color:rgba(255,255,255,.25)">${lines} cmd${lines!==1?'s':''}</span>
      </div>
      <div style="font-size:10px;color:rgba(255,255,255,.3)">${(_scripts[name]||'').split('\n').find(function(l){ return l.trim().startsWith('#'); })||'(no description)'}</div>
    </div>`;
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
  div.innerHTML = '<span style="display:table-cell;color:rgba(255,255,255,.2);font-size:10px;white-space:nowrap;width:58px;vertical-align:top">' + ts + '</span>'
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
    err:    '#E24B4A', sys:    'rgba(255,255,255,.3)', event: '#7dd3fc'
  };
  var color = colors[type] || 'rgba(255,255,255,.6)';

  // For SYS lines prefix with # so they read as comments in scripts
  var displayText = (type === 'sys' || type === 'result' || type === 'event')
    ? '# ' + text
    : (who !== 'SYS' && who !== (_mySession && _mySession.initials) ? who + ': ' : '') + text;

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
  if (!_panelEl) {
    _buildPanel();
    _panelOpen = true;
  } else {
    _panelEl.style.display = _panelOpen ? 'none' : 'flex';
    _panelOpen = !_panelOpen;
  }
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
      try { obs.apply(this, args); } catch(e) {}
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
  if (!ev.data || ev.data.type !== 'cmd:form_action') return;
  if (_panelEl) _appendLine(_mySession ? _mySession.initials : 'ME', 'cmd', ev.data.action);
});

// ── Expose public API ─────────────────────────────────────────────────────────
window.CMDCenter = {
  toggle:      _togglePanel,
  run:         _runScript,
  runLine:     _executeCommand,
  saveScript:  _saveScript,
  getScripts:  function() { return Object.keys(_scripts); },
  appendLine:  _appendLine,
  sessions:    function() { return _sessions; },
};

// ── Init ──────────────────────────────────────────────────────────────────────
async function _init() {
  _loadScripts();
  _loadServerScripts(); // async — loads /scripts/*.txt in background
  await _loadSupabase();
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

// Seed a sample script if none exist
setTimeout(function() {
  if (!Object.keys(_scripts).length) {
    _saveScript('test_expense_full',
`# Full expense report signature loop test
# Targets: VS (submitter), AK (manager), FH (finance)

VS: Set Tab "MY REQUESTS"
VS: Set SubTab "BROWSE"
VS: Form Open "Expense Report"
VS: Form Insert employee_name "Vaughn Staples"
VS: Form Insert business_purpose "Client Visit"
VS: Form Submit
VS: Get instance_id
Wait 2000
VS: Set SubTab "ACTIVE"
VS: Click "Review" $instance_id
VS: Click "Approve"
VS: Click "Approve"
AK: Wait ForEvent "workflow_request.created"
AK: Click "Review"
AK: Click "Approve"
FH: Wait ForEvent "workflow_request.created"
FH: Click "Review"
FH: Click "Approve"
Log All steps complete`
    );

    _saveScript('test_expense_draft',
`# Save and continue draft
VS: Set Tab "MY REQUESTS"
VS: Set SubTab "BROWSE"
VS: Form Open "Expense Report"
VS: Form Insert employee_name "Vaughn Staples"
VS: Form Insert airfare 212.00`
    );

    _saveScript('verify_routing_chain',
`# Verify current instance routing state
VS: Get instance_id
DB Get workflow_requests instance_id=eq.$instance_id
DB Get coc_events entity_id=eq.$instance_id`
    );

    _saveScript('demo_expense_report',
`# ── Expense Report Demo ─────────────────────────────────────────
# Submits a complete expense report for Vaughn Staples
# Trip: NovaBio client visit, Mar 31 – Apr 3, 2026
# ────────────────────────────────────────────────────────────────

# Navigate to MY REQUESTS > BROWSE
VS: Set Tab "MY REQUESTS"
Wait 1500
VS: Set SubTab "BROWSE"
Wait 1500

# Open the Expense Report form
VS: Form Open "Expense Report"
Wait 2000

# ── Employee Information ─────────────────────────────────────────
VS: Form Insert "Employee Name" "Vaughn Staples"
Wait 600
VS: Form Insert "Trip Start Date" "2026-03-31"
Wait 600
VS: Form Insert "Trip End Date" "2026-04-03"
Wait 600
VS: Form Insert "Business Purpose" "Client Visit"
Wait 600
VS: Form Insert "Purpose Description" "NovaBio Quality System Implementation kick-off"
Wait 600
VS: Form Insert "Customer Name" "NovaBio Corp"
Wait 600
VS: Form Insert "Customer Location" "Boston, MA"
Wait 1500

# Scroll down to Daily Expenses grid
VS: Form Scroll daily
Wait 1000

# ── Meals — 4 days (Mon–Thu) ─────────────────────────────────────
VS: Form Insert breakfast[0] 18.50
Wait 400
VS: Form Insert lunch[0] 24.00
Wait 400
VS: Form Insert dinner[0] 68.00
Wait 400
VS: Form Insert breakfast[1] 16.75
Wait 400
VS: Form Insert lunch[1] 22.50
Wait 400
VS: Form Insert dinner[1] 94.00
Wait 400
VS: Form Insert breakfast[2] 19.00
Wait 400
VS: Form Insert lunch[2] 28.00
Wait 400
VS: Form Insert dinner[2] 112.00
Wait 400
VS: Form Insert lunch[3] 21.00
Wait 1200

# ── Transportation & Lodging ─────────────────────────────────────
VS: Form Insert airfare[0] 387.00
Wait 600
VS: Form Insert lodging[0] 219.00
Wait 400
VS: Form Insert lodging[1] 219.00
Wait 400
VS: Form Insert lodging[2] 219.00
Wait 400
VS: Form Insert taxi[0] 42.00
Wait 400
VS: Form Insert taxi[3] 38.00
Wait 1200

# Scroll to Miscellaneous section
VS: Form Scroll misc
Wait 1000

# ── Miscellaneous Expenses ───────────────────────────────────────
VS: Form Insert "misc[0].description" "Conference materials & printing"
Wait 400
VS: Form Insert "misc[0].date" "2026-03-31"
Wait 400
VS: Form Insert "misc[0].type" "Billable"
Wait 400
VS: Form Insert "misc[0].amount" 47.50
Wait 800

VS: Form AddRow misc
Wait 500
VS: Form Insert "misc[1].description" "Client gift — NovaBio branded items"
Wait 400
VS: Form Insert "misc[1].date" "2026-04-01"
Wait 400
VS: Form Insert "misc[1].type" "Billable"
Wait 400
VS: Form Insert "misc[1].amount" 125.00
Wait 1200

# Scroll to Entertainment section
VS: Form Scroll entertainment
Wait 1000

# ── Entertainment Detail ─────────────────────────────────────────
VS: Form Insert "ent[0].date" "2026-04-01"
Wait 400
VS: Form Insert "ent[0].type" "Dinner"
Wait 400
VS: Form Insert "ent[0].guests" "Dr. Sarah Chen · CMO · NovaBio Corp"
Wait 400
VS: Form Insert "ent[0].purpose" "Q2 implementation roadmap alignment"
Wait 400
VS: Form Insert "ent[0].amount" 248.00
Wait 800

VS: Form AddRow ent
Wait 500
VS: Form Insert "ent[1].date" "2026-04-02"
Wait 400
VS: Form Insert "ent[1].type" "Lunch"
Wait 400
VS: Form Insert "ent[1].guests" "Marcus Webb · VP Ops · NovaBio Corp; Lisa Park · QA Lead · NovaBio Corp"
Wait 400
VS: Form Insert "ent[1].purpose" "Quality system gap analysis working session"
Wait 400
VS: Form Insert "ent[1].amount" 143.00
Wait 1500

# Scroll to top to review before saving
VS: Form Scroll top
Wait 2000

# Save as draft
VS: Form Save
Wait 2000

# Close form
VS: Form Close
Wait 1500

# Reopen from ACTIVE tab — continue draft
VS: Set SubTab "ACTIVE"
Wait 1500

# Submit for approval
VS: Continue Draft id=last
Wait 2000
VS: Form Scroll top
Wait 1000
VS: Form Submit
Wait 1000
Log Demo complete — expense report submitted for approval`
    );

    _renderScriptList && _renderScriptList();
  }
}, 500);

_init();

})();