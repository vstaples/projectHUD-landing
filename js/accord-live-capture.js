// ============================================================
// accord-live-capture.js
// CMD-ACCORD-LIVE-CAPTURE-1 · Phase 3
// 2026-05-17 · Operator: Vaughn Staples
//
// Live Capture surface — two-column (sidebar + canvas) running-
// meeting shell. Replaces the 5-tab shell when meeting.state
// is 'running'. Registered via AccordLiveCapture.render() called
// from accord-views.js:renderMeetingView().
//
// Phase 3 scope: topbar + sidebar (attendees + chat) wired.
// Canvas sections: Phase 4+5 scope — skeleton placeholder only.
//
// Iron Rules: 36, 40§1, 47, 64, 71, 72 in force.
// var only — no let/const.
// ============================================================

var AccordLiveCapture = (function () {
  'use strict';

  var API = window.API;

  // ── Module state ────────────────────────────────────────────
  var _meeting            = null;
  var _timerInterval      = null;
  var _chatSubscription   = null;
  var _chatMessages       = [];
  var _myResourceId       = null;
  var _attendeeNameMap    = {};    // resource_id → name
  var _presencePollTimer  = null;
  var _intersectionObs    = null;

  // Sidebar resize state
  var _sidebarDragging    = false;
  var _sidebarStartX      = 0;
  var _sidebarStartWidth  = 0;
  var _SIDEBAR_MIN        = 160;
  var _SIDEBAR_MAX        = 320;
  var _SIDEBAR_DEFAULT    = 240;
  var _SIDEBAR_STORAGE_KEY = 'accord.lc.sidebar.width';

  // ── Escape helper ───────────────────────────────────────────
  function _esc(s) {
    return String(s != null ? s : '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Font injection ──────────────────────────────────────────
  // Inject Outfit Google Fonts link into <head> if not already present.
  // Meeting Setup shell uses Inter/system-ui via --ac-font-sans; Outfit
  // is not loaded by any prior shell. Guard prevents duplicate <link>s.
  function _ensureOutfitFont() {
    if (document.querySelector('link[data-accord-outfit]')) return;
    var link  = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap';
    link.setAttribute('data-accord-outfit', '1');
    document.head.appendChild(link);
  }

  // ── Shell HTML ──────────────────────────────────────────────
  function _shellHtml(meeting) {
    return '<div class="ac-live-capture-shell" id="ac-lc-shell">' +

      // Inline scoped styles — palette + layout + slim scrollbars
      '<style>' +
      '.ac-live-capture-shell {' +
        '--void:    #0b0d14;' +
        '--surface: #10131e;' +
        '--raised:  #171c2e;' +
        '--hover:   #1d2338;' +
        '--b0: #1e2438; --b1: #252d44; --b2: #313d5e;' +
        '--hi: #dce6f5; --md: #8899b2; --lo: #7a8a9a;' +
        '--dec: #4a8cf5; --dec-bg: rgba(74,140,245,.09); --dec-bd: rgba(74,140,245,.24);' +
        '--act: #e89430; --act-bg: rgba(232,148,48,.08); --act-bd: rgba(232,148,48,.24);' +
        '--rsk: #e05252; --rsk-bg: rgba(224,82,82,.09);  --rsk-bd: rgba(224,82,82,.24);' +
        '--nt:  #48aa88; --nt-bg:  rgba(72,170,136,.08); --nt-bd:  rgba(72,170,136,.22);' +
        '--live: #34d499;' +
        'font-family: "Outfit", system-ui, sans-serif;' +
        'display: flex;' +
        'flex-direction: column;' +
        'height: 100%;' +
        'background: var(--void);' +
        'color: var(--hi);' +
        'overflow: hidden;' +
      '}' +

      // Slim scrollbars
      '.ac-live-capture-shell ::-webkit-scrollbar { width: 4px; height: 4px; }' +
      '.ac-live-capture-shell ::-webkit-scrollbar-track { background: transparent; }' +
      '.ac-live-capture-shell ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 2px; }' +
      '.ac-live-capture-shell ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.26); }' +

      // Topbar
      '.ac-lc-topbar {' +
        'display: flex; align-items: center; gap: 12px;' +
        'padding: 0 16px; height: 48px; flex-shrink: 0;' +
        'background: var(--surface);' +
        'border-bottom: 1px solid rgba(255,255,255,.06);' +
      '}' +
      '.ac-lc-logo {' +
        'font-weight: 600; font-size: 15px; letter-spacing: -.3px; color: var(--hi);' +
      '}' +
      '.ac-lc-logo em { font-style: normal; color: var(--dec); }' +
      '.ac-lc-live-pill {' +
        'display: flex; align-items: center; gap: 6px;' +
        'font-size: 11px; font-weight: 500; color: var(--live);' +
        'background: rgba(52,212,153,.10); border: 1px solid rgba(52,212,153,.22);' +
        'border-radius: 20px; padding: 2px 9px; flex-shrink: 0;' +
      '}' +
      '.ac-lc-live-dot {' +
        'width: 6px; height: 6px; border-radius: 50%;' +
        'background: var(--live);' +
        'animation: ac-lc-pulse 2s ease-in-out infinite;' +
      '}' +
      '@keyframes ac-lc-pulse {' +
        '0%, 100% { opacity: 1; } 50% { opacity: .35; }' +
      '}' +
      '.ac-lc-title {' +
        'flex: 1; min-width: 0;' +
        'font-size: 14px; font-weight: 500; color: var(--hi);' +
        'white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' +
      '}' +
      '.ac-lc-progress-wrap { flex-shrink: 0; display: flex; align-items: center; gap: 8px; }' +
      '.ac-lc-progress {' +
        'display: flex; gap: 2px;' +
        'height: 4px; border-radius: 2px; overflow: hidden; width: 80px;' +
      '}' +
      '.ac-lc-seg { height: 4px; flex: 1; border-radius: 1px; }' +
      '.ac-lc-seg--done   { background: var(--dec); }' +
      '.ac-lc-seg--active { background: rgba(74,140,245,.5); }' +
      '.ac-lc-seg--todo   { background: rgba(255,255,255,.12); }' +
      '.ac-lc-timer {' +
        'font-size: 12px; font-weight: 500; font-family: "SF Mono", "JetBrains Mono", monospace;' +
        'color: var(--md); flex-shrink: 0; min-width: 44px; text-align: right;' +
      '}' +
      '.ac-lc-end-btn {' +
        'font-size: 11px; font-weight: 600; letter-spacing: .3px;' +
        'color: var(--rsk); background: var(--rsk-bg); border: 1px solid var(--rsk-bd);' +
        'border-radius: 6px; padding: 4px 12px; cursor: not-allowed;' +
        'opacity: .35; pointer-events: none;' + // disabled until Phase 6
        'flex-shrink: 0;' +
      '}' +

      // Body = sidebar + canvas
      '.ac-lc-body {' +
        'display: flex; flex: 1; min-height: 0; overflow: hidden;' +
      '}' +

      // Sidebar
      '.ac-lc-sidebar {' +
        'display: flex; flex-direction: column;' +
        'flex-shrink: 0; position: relative;' +
        'background: var(--surface);' +
        'border-right: 1px solid rgba(255,255,255,.06);' +
        'overflow: hidden;' +
        'min-width: ' + _SIDEBAR_MIN + 'px;' +
        'max-width: ' + _SIDEBAR_MAX + 'px;' +
      '}' +
      '.ac-lc-resize-handle {' +
        'position: absolute; top: 0; right: -3px; bottom: 0; width: 6px;' +
        'cursor: col-resize; z-index: 10;' +
        'transition: background .15s;' +
      '}' +
      '.ac-lc-resize-handle:hover, .ac-lc-resize-handle.dragging {' +
        'background: rgba(74,140,245,.3);' +
      '}' +
      '.ac-lc-sidebar-inner {' +
        'flex: 1; overflow-y: auto; display: flex; flex-direction: column;' +
      '}' +
      '.ac-lc-section-label {' +
        'font-size: 10px; font-weight: 600; letter-spacing: 1px;' +
        'text-transform: uppercase; color: var(--lo);' +
        'padding: 14px 14px 6px;' +
      '}' +

      // Sections nav
      '.ac-lc-nav { padding: 0 8px 10px; }' +
      '.ac-lc-nav-item {' +
        'display: block; padding: 5px 8px; border-radius: 5px;' +
        'font-size: 12px; color: var(--md); text-decoration: none; cursor: pointer;' +
        'transition: background .1s, color .1s;' +
      '}' +
      '.ac-lc-nav-item:hover, .ac-lc-nav-item.active {' +
        'background: var(--raised); color: var(--hi);' +
      '}' +

      // Attendees
      '.ac-lc-attendees { padding: 0 8px 10px; }' +
      '.ac-lc-attendee-row {' +
        'display: flex; align-items: center; gap: 8px;' +
        'padding: 4px 6px; border-radius: 5px;' +
        'font-size: 12px;' +
        'transition: opacity .2s;' +
      '}' +
      '.ac-lc-attendee-row.absent { opacity: .45; }' +
      '.ac-lc-presence-dot {' +
        'width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;' +
        'background: rgba(255,255,255,.18);' +
      '}' +
      '.ac-lc-presence-dot.present { background: var(--live); }' +
      '.ac-lc-attendee-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }' +
      '.ac-lc-you-tag {' +
        'font-size: 9px; font-weight: 600; letter-spacing: .5px;' +
        'color: var(--dec); text-transform: uppercase; flex-shrink: 0;' +
      '}' +

      // Chat
      '.ac-lc-chat {' +
        'display: flex; flex-direction: column; flex: 1; min-height: 0;' +
        'border-top: 1px solid rgba(255,255,255,.06);' +
      '}' +
      '.ac-lc-chat-viewport {' +
        'flex: 1; overflow-y: auto;' +
        'padding: 10px 10px 6px;' +
        'background: rgba(72,170,136,.025);' +
        'border: 1px solid rgba(72,170,136,.10);' +
        'margin: 6px 8px 0;' +
        'border-radius: 8px 8px 0 0;' +
        'display: flex; flex-direction: column; gap: 2px;' +
      '}' +
      '.ac-lc-chat-msg-group { display: flex; flex-direction: column; margin-bottom: 6px; }' +
      '.ac-lc-chat-msg-header {' +
        'display: flex; gap: 6px; align-items: baseline;' +
        'font-size: 10px; color: var(--lo); margin-bottom: 2px; padding: 0 2px;' +
      '}' +
      '.ac-lc-chat-msg-header.me { justify-content: flex-end; }' +
      '.ac-lc-chat-msg-author { font-weight: 500; color: var(--md); }' +
      '.ac-lc-chat-msg-row { display: flex; }' +
      '.ac-lc-chat-msg-row.me { justify-content: flex-end; }' +
      '.ac-lc-chat-msg-row.other { justify-content: flex-start; }' +
      '.ac-lc-chat-bubble {' +
        'max-width: 82%; border-radius: 10px;' +
        'font-size: 12px; line-height: 1.45;' +
        'padding: 6px 10px; word-break: break-word;' +
      '}' +
      '.ac-lc-chat-msg-row.me    .ac-lc-chat-bubble { background: var(--dec-bg); border: 1px solid var(--dec-bd); color: var(--hi); border-radius: 10px 10px 2px 10px; }' +
      '.ac-lc-chat-msg-row.other .ac-lc-chat-bubble { background: var(--raised); border: 1px solid rgba(255,255,255,.06); color: var(--hi); border-radius: 10px 10px 10px 2px; }' +
      '.ac-lc-chat-input-row {' +
        'display: flex; gap: 6px; padding: 6px 8px 10px;' +
      '}' +
      '.ac-lc-chat-input {' +
        'flex: 1; background: var(--raised); border: 1px solid rgba(255,255,255,.10);' +
        'border-radius: 6px; padding: 6px 10px;' +
        'font-size: 12px; font-family: inherit; color: var(--hi);' +
        'resize: none; min-height: 32px; max-height: 80px; outline: none;' +
        'transition: border-color .15s;' +
      '}' +
      '.ac-lc-chat-input:focus { border-color: rgba(74,140,245,.4); }' +
      '.ac-lc-chat-send {' +
        'font-size: 11px; font-weight: 600; color: var(--dec);' +
        'background: var(--dec-bg); border: 1px solid var(--dec-bd);' +
        'border-radius: 6px; padding: 6px 12px; cursor: pointer;' +
        'flex-shrink: 0; transition: background .15s;' +
      '}' +
      '.ac-lc-chat-send:hover { background: rgba(74,140,245,.16); }' +
      '.ac-lc-chat-empty {' +
        'flex: 1; display: flex; align-items: center; justify-content: center;' +
        'font-size: 11px; color: var(--lo); font-style: italic;' +
      '}' +

      // Canvas
      '.ac-lc-canvas {' +
        'flex: 1; min-width: 0; overflow-y: auto;' +
        'padding: 24px 28px;' +
      '}' +
      '.ac-lc-canvas-placeholder {' +
        'display: flex; align-items: center; justify-content: center;' +
        'height: 60px; border-radius: 8px;' +
        'background: var(--surface); border: 1px dashed rgba(255,255,255,.08);' +
        'font-size: 12px; color: var(--lo); font-style: italic;' +
        'margin-bottom: 12px;' +
      '}' +
      '</style>' +

      // ── Topbar ─────────────────────────────────────────────
      '<div class="ac-lc-topbar">' +
        '<span class="ac-lc-logo">accord<em>.</em></span>' +
        '<div class="ac-lc-live-pill">' +
          '<span class="ac-lc-live-dot"></span>LIVE' +
        '</div>' +
        '<span class="ac-lc-title">' + _esc(meeting.title || 'Untitled') + '</span>' +
        '<div class="ac-lc-progress-wrap">' +
          '<div class="ac-lc-progress" id="ac-lc-progress-bar"></div>' +
        '</div>' +
        '<span class="ac-lc-timer" id="ac-lc-timer">00:00</span>' +
        '<button type="button" class="ac-lc-end-btn" id="ac-lc-end-btn">END MEETING</button>' +
      '</div>' +

      // ── Body ───────────────────────────────────────────────
      '<div class="ac-lc-body">' +

        // Sidebar
        '<div class="ac-lc-sidebar" id="ac-lc-sidebar">' +
          '<div class="ac-lc-resize-handle" id="ac-lc-resize-handle"></div>' +
          '<div class="ac-lc-sidebar-inner">' +

            // Sections nav
            '<div class="ac-lc-section-label">Sections</div>' +
            '<nav class="ac-lc-nav">' +
              '<a class="ac-lc-nav-item" data-section="agenda"     href="#ac-lc-sec-agenda">Agenda</a>' +
              '<a class="ac-lc-nav-item" data-section="decisions"  href="#ac-lc-sec-decisions">Decisions</a>' +
              '<a class="ac-lc-nav-item" data-section="actions"    href="#ac-lc-sec-actions">Action Items</a>' +
              '<a class="ac-lc-nav-item" data-section="risks"      href="#ac-lc-sec-risks">Risks &amp; Issues</a>' +
              '<a class="ac-lc-nav-item" data-section="parking"    href="#ac-lc-sec-parking">Parking Lot</a>' +
            '</nav>' +

            // Attendees
            '<div class="ac-lc-section-label">Live Attendees</div>' +
            '<div class="ac-lc-attendees" id="ac-lc-attendees">'+
              '<div style="font-size:11px;color:var(--lo);padding:4px 6px">Loading\u2026</div>' +
            '</div>' +

            // Chat
            '<div class="ac-lc-section-label">Team Chat</div>' +
            '<div class="ac-lc-chat">' +
              '<div class="ac-lc-chat-viewport" id="ac-lc-chat-viewport">' +
                '<div class="ac-lc-chat-empty" id="ac-lc-chat-empty">No messages yet.</div>' +
              '</div>' +
              '<div class="ac-lc-chat-input-row">' +
                '<textarea class="ac-lc-chat-input" id="ac-lc-chat-input" rows="1" placeholder="Message\u2026"></textarea>' +
                '<button class="ac-lc-chat-send" id="ac-lc-chat-send">Send</button>' +
              '</div>' +
            '</div>' +

          '</div>' +
        '</div>' +

        // Canvas — Phase 3 skeleton only; sections wired in Phase 4+5
        '<div class="ac-lc-canvas" id="ac-lc-canvas">' +
          '<div id="ac-lc-sec-agenda">' +
            '<div class="ac-lc-canvas-placeholder">Agenda section \u2014 Phase 4</div>' +
          '</div>' +
          '<div id="ac-lc-sec-decisions">' +
            '<div class="ac-lc-canvas-placeholder">Decisions section \u2014 Phase 5</div>' +
          '</div>' +
          '<div id="ac-lc-sec-actions">' +
            '<div class="ac-lc-canvas-placeholder">Action Items section \u2014 Phase 5</div>' +
          '</div>' +
          '<div id="ac-lc-sec-risks">' +
            '<div class="ac-lc-canvas-placeholder">Risks &amp; Issues section \u2014 Phase 5</div>' +
          '</div>' +
          '<div id="ac-lc-sec-parking">' +
            '<div class="ac-lc-canvas-placeholder">Parking Lot section \u2014 Phase 5</div>' +
          '</div>' +
        '</div>' +

      '</div>' + // .ac-lc-body
    '</div>';    // .ac-live-capture-shell
  }

  // ── Elapsed timer ───────────────────────────────────────────
  function _startTimer(startedAt) {
    _stopTimer();
    var el = document.getElementById('ac-lc-timer');
    if (!el) return;
    var origin = startedAt ? new Date(startedAt).getTime() : Date.now();
    function _tick() {
      var el2 = document.getElementById('ac-lc-timer');
      if (!el2) { _stopTimer(); return; }
      var elapsed = Math.max(0, Math.floor((Date.now() - origin) / 1000));
      var mm = Math.floor(elapsed / 60);
      var ss = elapsed % 60;
      el2.textContent = (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
    }
    _tick();
    _timerInterval = setInterval(_tick, 1000);
  }

  function _stopTimer() {
    if (_timerInterval) {
      clearInterval(_timerInterval);
      _timerInterval = null;
    }
  }

  // ── Progress bar ────────────────────────────────────────────
  // Renders 3-segment bar from accord_agenda_items.status.
  // Phase 4 will wire the discussed/skipped transitions — until then
  // the bar shows all items as todo (status=pending or unknown).
  function _loadProgressBar(meetingId) {
    if (!meetingId) return;
    API.get(
      'accord_agenda_items?meeting_id=eq.' + meetingId +
      '&select=agenda_item_id,status&order=position.asc'
    ).then(function(rows) {
      rows = rows || [];
      var bar = document.getElementById('ac-lc-progress-bar');
      if (!bar) return;
      if (!rows.length) {
        bar.innerHTML = '<div class="ac-lc-seg ac-lc-seg--todo" style="flex:1"></div>';
        return;
      }
      // Count statuses
      var done    = rows.filter(function(r) { return r.status === 'discussed'; }).length;
      var skipped = rows.filter(function(r) { return r.status === 'skipped';   }).length;
      var total   = rows.length;
      var todo    = total - done - skipped;
      // Active = first pending item (one segment highlighted at .5 opacity)
      var activeCount = (todo > 0) ? 1 : 0;
      var todoCount   = Math.max(0, todo - activeCount);
      var html = '';
      for (var i = 0; i < done;        i++) html += '<div class="ac-lc-seg ac-lc-seg--done"></div>';
      for (var j = 0; j < activeCount; j++) html += '<div class="ac-lc-seg ac-lc-seg--active"></div>';
      for (var k = 0; k < todoCount;   k++) html += '<div class="ac-lc-seg ac-lc-seg--todo"></div>';
      for (var l = 0; l < skipped;     l++) html += '<div class="ac-lc-seg ac-lc-seg--todo" style="opacity:.4"></div>';
      bar.innerHTML = html;
    }).catch(function(e) {
      console.warn('[AccordLiveCapture] progress bar load failed', e);
    });
  }

  // ── Attendees ────────────────────────────────────────────────
  function _loadAttendees(meetingId) {
    if (!meetingId) return;
    API.get(
      'accord_meeting_attendees?meeting_id=eq.' + meetingId +
      '&select=attendee_id,resource_id,role_in_meeting,rsvp_status'
    ).then(function(rows) {
      rows = rows || [];
      if (!rows.length) {
        _renderAttendees([]);
        return;
      }
      var resourceIds = rows.map(function(r) { return r.resource_id; });
      API.get(
        'resources?id=in.(' + resourceIds.join(',') + ')&select=id,name'
      ).then(function(resources) {
        (resources || []).forEach(function(r) {
          _attendeeNameMap[r.id] = r.name;
        });
        var attendees = rows.map(function(a) {
          return {
            resource_id: a.resource_id,
            name:        _attendeeNameMap[a.resource_id] || 'Unknown',
            role:        a.role_in_meeting,
            rsvp:        a.rsvp_status,
          };
        });
        _renderAttendees(attendees);
        // Poll presence every 15s since accord:presence-updated is not
        // a defined event (Phase 1: no such event found in accord-core.js)
        _startPresencePoll(attendees);
      });
    }).catch(function(e) {
      console.warn('[AccordLiveCapture] attendees load failed', e);
    });
  }

  function _buildPresenceMap() {
    // Delegate to accord-core.js internal state.
    // _meetingPresenceMap is module-scoped in accord-core.js and not
    // directly exposed on window.Accord. We reconstruct presence from
    // two sources that ARE accessible:
    //   1. window.CMDCenter.sessions() — same-firm users (user_id keyed)
    //   2. No direct access to _meetingPresenceMap from outside accord-core.
    // Workaround: accord-core.js re-renders #attendeesList on heartbeat;
    // we read the rendered .presence-dot.present elements from the legacy
    // panel (if present) OR fall back to CMDCenter sessions only.
    // Phase 4 handoff: request accord-core.js expose a getPresence() helper.
    var presence = {};
    // CMDCenter sessions: user_id → present; need resource_id translation.
    // accord-core.js populates window.CURRENT_USER = state.me with resource_id.
    // For self: always mark present.
    if (_myResourceId) presence[_myResourceId] = true;
    // For others: read from legacy #attendeesList if it exists in DOM
    // (rendered by accord-core.js _renderAttendees into the old panel).
    document.querySelectorAll('#attendeesList .presence-dot.present')
      .forEach(function(dot) {
        var row = dot.closest('[data-resource-id]');
        if (row && row.dataset.resourceId) {
          presence[row.dataset.resourceId] = true;
        }
      });
    return presence;
  }

  function _renderAttendees(attendees) {
    var container = document.getElementById('ac-lc-attendees');
    if (!container) return;
    if (!attendees || !attendees.length) {
      container.innerHTML = '<div style="font-size:11px;color:var(--lo);padding:4px 6px">No attendees.</div>';
      return;
    }
    var presence = _buildPresenceMap();
    // Sort: organizer first, then name
    var sorted = attendees.slice().sort(function(a, b) {
      if (a.role === 'organizer' && b.role !== 'organizer') return -1;
      if (b.role === 'organizer' && a.role !== 'organizer') return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    var html = '';
    sorted.forEach(function(a) {
      var isPresent = !!presence[a.resource_id];
      var isMe      = a.resource_id === _myResourceId;
      var dotCls    = isPresent ? 'ac-lc-presence-dot present' : 'ac-lc-presence-dot';
      var rowCls    = isPresent ? 'ac-lc-attendee-row' : 'ac-lc-attendee-row absent';
      html += '<div class="' + rowCls + '" data-resource-id="' + _esc(a.resource_id) + '">' +
                '<span class="' + dotCls + '"></span>' +
                '<span class="ac-lc-attendee-name">' + _esc(a.name) + '</span>' +
                (a.role === 'organizer' ? '<span class="ac-lc-you-tag">ORG</span>' : '') +
                (isMe ? '<span class="ac-lc-you-tag">YOU</span>' : '') +
              '</div>';
    });
    container.innerHTML = html;
    // IR71: re-query after innerHTML set
    var _stored = attendees;
    container._attendeeData = _stored;
  }

  function _startPresencePoll(attendees) {
    _stopPresencePoll();
    _presencePollTimer = setInterval(function() {
      _renderAttendees(attendees);
    }, 15000);
  }

  function _stopPresencePoll() {
    if (_presencePollTimer) {
      clearInterval(_presencePollTimer);
      _presencePollTimer = null;
    }
  }

  // ── Chat ─────────────────────────────────────────────────────
  function _fmtChatTime(isoStr) {
    if (!isoStr) return '';
    try {
      var d = new Date(isoStr);
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function _loadChatHistory(meetingId) {
    API.get(
      'accord_chat_messages?meeting_id=eq.' + meetingId +
      '&order=created_at.asc&limit=100' +
      '&select=message_id,body,created_at,author_resource_id'
    ).then(function(rows) {
      rows = rows || [];
      if (!rows.length) {
        _chatMessages = [];
        _renderChatStream([]);
        return;
      }
      var resourceIds = [];
      rows.forEach(function(r) {
        if (resourceIds.indexOf(r.author_resource_id) === -1)
          resourceIds.push(r.author_resource_id);
      });
      API.get('resources?id=in.(' + resourceIds.join(',') + ')&select=id,name')
        .then(function(resources) {
          var nameMap = {};
          (resources || []).forEach(function(r) { nameMap[r.id] = r.name; });
          rows.forEach(function(m) {
            m._author_name = nameMap[m.author_resource_id] || 'Unknown';
            m._is_me       = m.author_resource_id === _myResourceId;
          });
          _chatMessages = rows;
          _renderChatStream(_chatMessages);
          _scrollChatToBottom(false);
        });
    }).catch(function(e) {
      console.warn('[AccordLiveCapture] chat history load failed', e);
    });
  }

  function _renderChatStream(messages) {
    var viewport  = document.getElementById('ac-lc-chat-viewport');
    var emptyNote = document.getElementById('ac-lc-chat-empty');
    if (!viewport) return;

    if (!messages || !messages.length) {
      if (emptyNote) emptyNote.style.display = 'flex';
      return;
    }
    if (emptyNote) emptyNote.style.display = 'none';

    // Build HTML grouped by consecutive author
    var html = '';
    var lastAuthorId = null;
    messages.forEach(function(msg) {
      var isMe    = !!msg._is_me;
      var cls     = isMe ? ' me' : ' other';
      if (msg.author_resource_id !== lastAuthorId) {
        if (lastAuthorId !== null) html += '</div>';
        html += '<div class="ac-lc-chat-msg-group">';
        html += '<div class="ac-lc-chat-msg-header' + cls + '">';
        if (!isMe) {
          html += '<span class="ac-lc-chat-msg-author">' + _esc(msg._author_name || '') + '</span>';
        }
        html += '<span style="font-size:10px;color:var(--lo)">' + _esc(_fmtChatTime(msg.created_at)) + '</span>';
        html += '</div>';
        lastAuthorId = msg.author_resource_id;
      }
      html += '<div class="ac-lc-chat-msg-row' + cls + '">';
      html += '<div class="ac-lc-chat-bubble">' + _esc(msg.body) + '</div>';
      html += '</div>';
    });
    if (lastAuthorId !== null) html += '</div>';

    // Remove prior messages; keep empty note element
    var nodes = viewport.childNodes;
    for (var i = nodes.length - 1; i >= 0; i--) {
      if (nodes[i] !== emptyNote) viewport.removeChild(nodes[i]);
    }
    var frag = document.createElement('div');
    frag.innerHTML = html;
    while (frag.firstChild) viewport.appendChild(frag.firstChild);
  }

  function _appendChatMessage(msg) {
    var viewport  = document.getElementById('ac-lc-chat-viewport');
    var emptyNote = document.getElementById('ac-lc-chat-empty');
    if (!viewport) return;
    if (emptyNote) emptyNote.style.display = 'none';

    var isMe = !!msg._is_me;
    var cls  = isMe ? ' me' : ' other';
    var wrap = document.createElement('div');
    wrap.className = 'ac-lc-chat-msg-group';
    wrap.innerHTML =
      '<div class="ac-lc-chat-msg-header' + cls + '">' +
        (!isMe ? '<span class="ac-lc-chat-msg-author">' + _esc(msg._author_name || '') + '</span>' : '') +
        '<span style="font-size:10px;color:var(--lo)">' + _esc(_fmtChatTime(msg.created_at)) + '</span>' +
      '</div>' +
      '<div class="ac-lc-chat-msg-row' + cls + '">' +
        '<div class="ac-lc-chat-bubble">' + _esc(msg.body) + '</div>' +
      '</div>';
    viewport.appendChild(wrap);
  }

  function _scrollChatToBottom(smooth) {
    var viewport = document.getElementById('ac-lc-chat-viewport');
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }

  // Re-use subscription pattern verbatim from accord-capture.js:770–791.
  // Realtime client is window.Accord.state.realtimeClient.realtime.
  function _subscribeChatRealtime(meetingId) {
    var realtimeClient = window.Accord &&
                         window.Accord.state &&
                         window.Accord.state.realtimeClient &&
                         window.Accord.state.realtimeClient.realtime;
    if (!realtimeClient) {
      console.warn('[AccordLiveCapture] realtime client not available — chat Realtime inactive');
      return;
    }

    var channelName = 'accord-lc-chat-' + meetingId;
    var existing = window.Accord.state.realtimeClient.getChannels()
      .find(function(ch) { return ch.topic && ch.topic.includes(channelName); });
    if (existing) return;

    _chatSubscription = realtimeClient
      .channel(channelName)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'accord_chat_messages',
        filter: 'meeting_id=eq.' + meetingId
      }, function(payload) {
        var msg = payload.new;
        if (!msg) return;
        // Skip own messages already appended optimistically
        if (_chatMessages.find(function(m) { return m.message_id === msg.message_id; })) return;
        API.get('resources?id=eq.' + msg.author_resource_id + '&select=id,name&limit=1')
          .then(function(rows) {
            msg._author_name = (rows && rows[0]) ? rows[0].name : 'Unknown';
            msg._is_me       = msg.author_resource_id === _myResourceId;
            _chatMessages.push(msg);
            _appendChatMessage(msg);
            _scrollChatToBottom(true);
          });
      })
      .subscribe();
  }

  function _unsubscribeChatRealtime() {
    if (_chatSubscription) {
      try { _chatSubscription.unsubscribe(); } catch (e) {}
      _chatSubscription = null;
    }
  }

  function _sendChatMessage(meeting) {
    var input   = document.getElementById('ac-lc-chat-input');
    var sendBtn = document.getElementById('ac-lc-chat-send');
    if (!input) return;
    var body = input.value.trim();
    if (!body || !_myResourceId) return;

    sendBtn.disabled = true;
    input.value      = '';

    API.post('accord_chat_messages', {
      firm_id:            meeting.firm_id,
      meeting_id:         meeting.meeting_id,
      author_resource_id: _myResourceId,
      body:               body
    }).catch(function(e) {
      console.error('[AccordLiveCapture] chat send failed', e);
      input.value      = body;
      sendBtn.disabled = false;
    });
    // Display handled by Realtime subscription; no optimistic insert.
    sendBtn.disabled = false;
  }

  // ── Sidebar resize ──────────────────────────────────────────
  function _getSavedSidebarWidth() {
    try {
      var v = parseInt(localStorage.getItem(_SIDEBAR_STORAGE_KEY), 10);
      if (v >= _SIDEBAR_MIN && v <= _SIDEBAR_MAX) return v;
    } catch (e) {}
    return _SIDEBAR_DEFAULT;
  }

  function _saveSidebarWidth(w) {
    try { localStorage.setItem(_SIDEBAR_STORAGE_KEY, String(w)); } catch (e) {}
  }

  function _wireSidebarResize() {
    var sidebar = document.getElementById('ac-lc-sidebar');
    var handle  = document.getElementById('ac-lc-resize-handle');
    if (!sidebar || !handle) return;

    // Apply saved width
    sidebar.style.width = _getSavedSidebarWidth() + 'px';

    function _onMouseDown(ev) {
      ev.preventDefault();
      _sidebarDragging = true;
      _sidebarStartX   = ev.clientX;
      _sidebarStartWidth = sidebar.offsetWidth;
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    function _onMouseMove(ev) {
      if (!_sidebarDragging) return;
      var delta = ev.clientX - _sidebarStartX;
      var newW  = Math.min(_SIDEBAR_MAX, Math.max(_SIDEBAR_MIN, _sidebarStartWidth + delta));
      sidebar.style.width = newW + 'px';
    }

    function _onMouseUp(ev) {
      if (!_sidebarDragging) return;
      _sidebarDragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor  = '';
      document.body.style.userSelect = '';
      _saveSidebarWidth(sidebar.offsetWidth);
    }

    handle.addEventListener('mousedown', _onMouseDown);
    document.addEventListener('mousemove', _onMouseMove);
    document.addEventListener('mouseup',   _onMouseUp);
  }

  // ── Sections nav IntersectionObserver ───────────────────────
  function _wireNavObserver() {
    var canvas = document.getElementById('ac-lc-canvas');
    if (!canvas || !window.IntersectionObserver) return;

    var sections = ['agenda', 'decisions', 'actions', 'risks', 'parking'];
    var options  = { root: canvas, rootMargin: '-30% 0px -60% 0px', threshold: 0 };

    _intersectionObs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) return;
        var id  = entry.target.id; // e.g. 'ac-lc-sec-agenda'
        var key = id.replace('ac-lc-sec-', '');
        document.querySelectorAll('.ac-lc-nav-item').forEach(function(el) {
          el.classList.toggle('active', el.dataset.section === key);
        });
      });
    }, options);

    sections.forEach(function(sec) {
      var el = document.getElementById('ac-lc-sec-' + sec);
      if (el) _intersectionObs.observe(el);
    });
  }

  function _wireNavClicks() {
    document.querySelectorAll('.ac-lc-nav-item').forEach(function(link) {
      link.addEventListener('click', function(ev) {
        ev.preventDefault();
        var sec = link.dataset.section;
        var target = document.getElementById('ac-lc-sec-' + sec);
        var canvas = document.getElementById('ac-lc-canvas');
        if (target && canvas) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  // ── Teardown ─────────────────────────────────────────────────
  function _teardown() {
    _stopTimer();
    _stopPresencePoll();
    _unsubscribeChatRealtime();
    if (_intersectionObs) {
      _intersectionObs.disconnect();
      _intersectionObs = null;
    }
    _chatMessages  = [];
    _meeting       = null;
    _myResourceId  = null;
    _attendeeNameMap = {};
    var host = document.getElementById('ac-meeting-surface-host');
    if (host) host.innerHTML = '';
  }

  // ── accord:level-changed teardown listener ───────────────────
  // Named function so it can be removed without removing other listeners.
  function _onLevelChanged() {
    _teardown();
    window.removeEventListener('accord:level-changed', _onLevelChanged);
  }

  // ── accord:remote-agenda — refresh progress bar ──────────────
  function _onRemoteAgenda() {
    if (_meeting) _loadProgressBar(_meeting.meeting_id);
  }

  // ── Public API ───────────────────────────────────────────────
  function render(meeting) {
    _meeting = meeting;

    // Resolve myResourceId from accord-core state
    _myResourceId = (window.Accord &&
                     window.Accord.state &&
                     window.Accord.state.me &&
                     window.Accord.state.me.resource_id) || null;

    _ensureOutfitFont();

    var host = document.getElementById('ac-meeting-surface-host');
    if (!host) {
      console.error('[AccordLiveCapture] #ac-meeting-surface-host not found');
      return;
    }

    // Inject shell HTML
    host.innerHTML = _shellHtml(meeting);

    // IR72: emit accord:surface-changed so accord-ledger.js activates.
    // switchSurface() fails silently when no .surface#surface-capture
    // element exists (accord-core.js:193 uses getElementById — no throw).
    // Call it anyway so state.surface is set and the event fires.
    if (window.Accord && window.Accord.switchSurface) {
      window.Accord.switchSurface('capture');
    }

    // Start elapsed timer
    _startTimer(meeting.started_at);

    // Load progress bar
    _loadProgressBar(meeting.meeting_id);

    // Load attendees
    _loadAttendees(meeting.meeting_id);

    // Load chat history + subscribe Realtime
    _loadChatHistory(meeting.meeting_id);
    _subscribeChatRealtime(meeting.meeting_id);

    // Wire chat send
    var chatInput = document.getElementById('ac-lc-chat-input');
    var chatSend  = document.getElementById('ac-lc-chat-send');
    if (chatInput) {
      chatInput.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault();
          _sendChatMessage(meeting);
        }
      });
    }
    if (chatSend) {
      chatSend.addEventListener('click', function() {
        _sendChatMessage(meeting);
      });
    }

    // Wire sidebar resize handle
    _wireSidebarResize();

    // Wire nav observer + click anchors
    _wireNavObserver();
    _wireNavClicks();

    // Register teardown on level-changed (navigate away)
    window.removeEventListener('accord:level-changed', _onLevelChanged);
    window.addEventListener('accord:level-changed',    _onLevelChanged);

    // Re-render progress bar on remote agenda change
    window.removeEventListener('accord:remote-agenda', _onRemoteAgenda);
    window.addEventListener('accord:remote-agenda',    _onRemoteAgenda);
  }

  function destroy() {
    _teardown();
    window.removeEventListener('accord:level-changed', _onLevelChanged);
    window.removeEventListener('accord:remote-agenda', _onRemoteAgenda);
  }

  return { render: render, destroy: destroy };
})();