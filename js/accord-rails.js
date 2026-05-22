// ============================================================
// ProjectHUD — accord-rails.js
// CMD-ACCORD-CONSTELLATION-ENTRY-1 · Phase 3
// X-23: duplicate collapse handler removed + stale sessionStorage clear — 2026-05-14
// Version: v20260514-X-23b
// Modified: 2026-05-14
// Last modified: v20260513-CMD-ACCORD-MY-MEETINGS-2b (2026-05-13)
//   - X-19: drag-to-resize rail handle + localStorage persist.
//   - Card enrichment queries (started_at, workstreams(name), users(name)).
//   - Replace _ensureMyMeetingsRailItem with _ensureRailTabs + _switchRailTab.
//   - Tab bar pattern: WORKSTREAMS / MY MEETINGS tabs in left rail.
//   - CMD-ACCORD-CONSTELLATION-SLIDESHOW-1 S5.1: mount slideshow on zero-workstream
//     empty state; dismiss when workstreams exist.
//   - X-17: promote RLS-orphaned workstreams to root; var/function IR fix.
//   - v20260513-CMD-ACCORD-MY-MEETINGS-1: MY MEETINGS rail item injection.
//
// Three-pane layout orchestrator:
//   • Left rail — hierarchical workstream tree (workstream →
//     sub-workstream → meeting). Adapts my-meetings.html Knowledge
//     Tree patterns: chevron expand/collapse, .active highlight,
//     state-indicator dots. Three levels (Compass is four — we
//     drop the topmost client level per Phase 3 commission §3
//     deliverable 4 mapping).
//   • Right rail — parking-lot pane of unfiled meetings (firm-shared
//     per Phase 1 Decision 1; firm_id = my_firm_id() via RLS;
//     workstream_id IS NULL filter). Sortable, collapsible.
//   • Center pane — hosts the Phase 2 constellation when level =
//     'constellation'. Workstream-level + meeting-level views are
//     Phase 4 work.
//   • Legacy view toggle — flips between the new three-pane chrome
//     and the original five-tab surface-switch layout. Rollback
//     safety net for the Phase 4-5 transition window. Removed Phase 5.
//
// Persistence (sessionStorage + localStorage two-tier — Compass
// convention adopted Phase 1 §3):
//   accord-leftrail-collapsed   'true' | 'false'
//   accord-rightrail-collapsed  'true' | 'false'
//   accord-parking-sort         'date' | 'alpha'
//   accord-tree-expanded        JSON map { workstreamId: bool }
//
// Listens for four CustomEvents from accord-constellation.js and
// routes them to AccordWorkstreams' expanded public API:
//   accord:constellation-node-click       → setLevel('workstream')
//   accord:constellation-action           → rename/archive/view-subs
//   accord:constellation-create-workstream→ AccordWorkstreams.openCreate
//
// IR45: visual tokens declared via CSS, not measured.
// IR65 does NOT fire (client-side rendering only).
// ============================================================

(function () {
  'use strict';

  const API = window.API;
  const $   = id => document.getElementById(id);

  // ── Local state ─────────────────────────────────────────────
  const local = {
    workstreams:    [],   // active top + sub for tree (state=active)
    meetings:       [],   // filed meetings only (workstream_id NOT NULL)
    parkingLot:     [],   // unfiled meetings (workstream_id IS NULL)
    inbox:          [],   // pending RSVP invitations (virtual, client-side only)
    inboxExpanded:  true, // default open
    treeExpanded:   {},   // { workstreamId: true } — persisted
    parkingSort:    'date',
    initialized:    false,
  };

  // ── HTML escape ─────────────────────────────────────────────
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Persistence helpers (two-tier; mirrors accord-core convention)
  function _persistRead(key, fallback) {
    try {
      const s = sessionStorage.getItem(key);
      if (s !== null) return s;
      const l = localStorage.getItem(key);
      if (l !== null) return l;
    } catch (e) {}
    return fallback;
  }
  function _persistWrite(key, value) {
    try { sessionStorage.setItem(key, value); } catch (e) {}
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  // ── Date format ─────────────────────────────────────────────
  function _shortDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return '—'; }
  }

  // ── Grid-template-columns helper (X-23e + X-19b) ───────────
  // Centralizes the inline `grid-template-columns` write on
  // .ac-three-pane so rail collapse and rail resize stay in sync.
  //
  // Why inline: _initRailResize() persists user drag-resize via an
  // inline style on the grid container. That inline style beats the
  // CSS :has(.collapsed) rules' specificity, so the collapse rules
  // can't shrink the relevant column track on their own. This helper
  // is the single writer — it considers per-side inputs together:
  //   • collapsed?     → that track = 36px
  //   • drag override? → use it (live mousemove width)
  //   • saved width?   → localStorage 'accord-rail-width' (left) /
  //                       'accord-rightrail-width' (right), clamp 200–380
  //   • else default   → 250px (left) / 280px (right)
  //
  // overrides: optional { left?: number, right?: number } — passed
  // from the live mousemove handlers during drag.
  function _applyGridCols(overrides) {
    const pane = document.querySelector('.ac-three-pane');
    if (!pane) return;
    const left  = $('ac-rail-left');
    const right = $('ac-rail-right');
    const leftCollapsed  = !!(left  && left.classList.contains('collapsed'));
    const rightCollapsed = !!(right && right.classList.contains('collapsed'));
    overrides = overrides || {};

    function _resolveW(collapsed, override, savedKey, defaultW) {
      if (collapsed) return 36;
      if (typeof override === 'number') return override;
      const saved = parseInt(localStorage.getItem(savedKey), 10);
      return (Number.isFinite(saved) && saved >= 200 && saved <= 380) ? saved : defaultW;
    }

    const leftW  = _resolveW(leftCollapsed,  overrides.left,  'accord-rail-width',      250);
    const rightW = _resolveW(rightCollapsed, overrides.right, 'accord-rightrail-width', 280);
    pane.style.gridTemplateColumns = leftW + 'px 1fr ' + rightW + 'px';
  }

  // ── Boot sequence ───────────────────────────────────────────
  async function _init() {
    if (local.initialized) return;
    local.initialized = true;

    // Hydrate persisted preferences
    try {
      const expRaw = _persistRead('accord-tree-expanded', '{}');
      local.treeExpanded = JSON.parse(expRaw || '{}');
    } catch (e) { local.treeExpanded = {}; }
    local.parkingSort = _persistRead('accord-parking-sort', 'date');

    // Wire chrome (toggles, sort buttons, collapse buttons)
    _wireChrome();

    // X-23: clear stale sessionStorage collapse state on boot
    sessionStorage.removeItem('accord-leftrail-collapsed');
    sessionStorage.removeItem('accord-rightrail-collapsed');

    // Initial collapse state from persistence
    _applyRailCollapse('left',  _persistRead('accord-leftrail-collapsed',  'false') === 'true');
    _applyRailCollapse('right', _persistRead('accord-rightrail-collapsed', 'false') === 'true');

    // Listen for constellation events + workstream substrate changes
    _wireEventBus();

    // First load
    await refresh();

    // Mount the constellation. Constellation is owned by
    // accord-constellation.js; we just call init(host).
    _ensureConstellationMounted();

    console.log('[Accord-rails] three-pane orchestrator ready');
  }

  // ── Data load ───────────────────────────────────────────────
  async function refresh() {
    await Promise.all([_loadWorkstreams(), _loadMeetings(), _loadInbox()]);
    _renderTree();
    _renderParkingLot();
  }

  async function _loadWorkstreams() {
    try {
      const rows = await API.get(
        'workstreams?state=eq.active&select=workstream_id,parent_workstream_id,name,created_at&order=name.asc'
      );
      local.workstreams = Array.isArray(rows) ? rows : [];
    } catch (e) {
      console.error('[Accord-rails] workstream load failed', e);
      local.workstreams = [];
    }
  }

  async function _loadInbox() {
    // Fetch pending RSVP attendee rows for current user's resource
    try {
      const resourceId = (window.MC && window.MC.resourceId) ||
                         (window.Accord && window.Accord.state && window.Accord.state.resourceId) ||
                         (window.Accord && window.Accord.state && window.Accord.state.me && window.Accord.state.me.resource_id);
      if (!resourceId) { local.inbox = []; return; }

      const attendees = await API.get(
        'accord_meeting_attendees?resource_id=eq.' + resourceId +
        '&rsvp_status=eq.pending&select=attendee_id,meeting_id,invited_at'
      );
      if (!Array.isArray(attendees) || !attendees.length) { local.inbox = []; return; }

      // Fetch meeting titles for the pending invites
      const ids = attendees.map(a => a.meeting_id).join(',');
      const meetings = await API.get(
        'accord_meetings?meeting_id=in.(' + ids + ')' +
        '&select=meeting_id,title,scheduled_for,organizer_id'
      );
      const meetingMap = {};
      (meetings || []).forEach(m => { meetingMap[m.meeting_id] = m; });

      // Fetch organizer names
      const orgIds = [...new Set((meetings || []).map(m => m.organizer_id).filter(Boolean))];
      const orgMap = {};
      if (orgIds.length) {
        const resources = await API.get(
          'resources?resource_id=in.(' + orgIds.join(',') + ')&select=resource_id,name'
        );
        (resources || []).forEach(r => { orgMap[r.resource_id] = r.name; });
      }

      local.inbox = attendees.map(a => ({
        attendeeId:  a.attendee_id,
        meetingId:   a.meeting_id,
        invitedAt:   a.invited_at,
        title:       (meetingMap[a.meeting_id] || {}).title || 'Untitled',
        scheduledFor:(meetingMap[a.meeting_id] || {}).scheduled_for,
        organizerId: (meetingMap[a.meeting_id] || {}).organizer_id,
        organizer:   orgMap[(meetingMap[a.meeting_id] || {}).organizer_id] || 'Unknown',
      }));
    } catch (e) {
      console.warn('[Accord-rails] inbox load failed', e);
      local.inbox = [];
    }
  }

  async function _loadMeetings() {
    // Two queries: filed (for tree) + parking-lot (for right rail)
    try {
      const filed = await API.get(
        'accord_meetings?workstream_id=not.is.null' +
        '&select=meeting_id,title,workstream_id,scheduled_for,created_at,sealed_at,state' +
        '&order=scheduled_for.desc.nullslast,created_at.desc'
      );
      local.meetings = Array.isArray(filed) ? filed : [];
    } catch (e) {
      console.warn('[Accord-rails] filed-meetings load failed', e);
      local.meetings = [];
    }
    try {
      const unfiled = await API.get(
        'accord_meetings?workstream_id=is.null' +
        '&select=meeting_id,title,scheduled_for,created_at,sealed_at,state'
      );
      local.parkingLot = Array.isArray(unfiled) ? unfiled : [];
    } catch (e) {
      console.warn('[Accord-rails] parking-lot load failed', e);
      local.parkingLot = [];
    }
  }

  // ── Tree render (3-level: ws → sub → meeting) ───────────────
  function _renderTree() {
    const body = $('ac-tree-body');
    if (!body) return;

    // Always prepend Inbox (virtual pinned category)
    var inboxHtml = _renderInbox();

    if (!local.workstreams.length) {
      body.innerHTML = inboxHtml + '<div class="ac-tree-empty">No workstreams yet.<br>Use + NEW WORKSTREAM to begin.</div>';
      _wireInboxHandlers();
      // CMD-ACCORD-CONSTELLATION-SLIDESHOW-1 S5.1 -- mount slideshow if not dismissed
      // X-29: guard typeof shouldShow — AccordSlideshow may exist as a partial
      // object if accord-slideshow.js loses the async load race on first render.
      // If the object exists but shouldShow isn't ready yet, retry once after
      // 500ms to catch the common case where the script loads just after boot.
      (function _trySlideshowMount() {
        if (window.AccordSlideshow && typeof window.AccordSlideshow.shouldShow === 'function') {
          if (window.AccordSlideshow.shouldShow()) {
            var ssHost = document.getElementById('ac-constellation-host');
            if (ssHost) window.AccordSlideshow.mount(ssHost);
          }
        } else if (window.AccordSlideshow) {
          // Object exists but not yet fully initialized — retry once
          setTimeout(_trySlideshowMount, 500);
        }
        // If AccordSlideshow doesn't exist at all, silently skip (no slideshow module)
      }());
      return;
    }
    // If workstreams exist -- dismiss slideshow if somehow still showing
    if (window.AccordSlideshow) {
      if (typeof window.AccordSlideshow.dismiss === 'function') {
        window.AccordSlideshow.dismiss();
      } else if (typeof window.AccordSlideshow.dismount === 'function') {
        window.AccordSlideshow.dismount();
      }
    }

    // Build hierarchy
    // X-17: promote workstreams whose parent is invisible (RLS-filtered) to root
    // rather than dropping them.
    var visibleIds = new Set(local.workstreams.map(function(w) { return w.workstream_id; }));
    var tops = local.workstreams.filter(function(w) {
      return !w.parent_workstream_id || !visibleIds.has(w.parent_workstream_id);
    });
    var subsByParent = {};
    local.workstreams.filter(function(w) { return w.parent_workstream_id; }).forEach(function(w) {
      if (!subsByParent[w.parent_workstream_id]) subsByParent[w.parent_workstream_id] = [];
      subsByParent[w.parent_workstream_id].push(w);
    });
    var meetingsByWs = {};
    local.meetings.forEach(function(m) {
      if (!meetingsByWs[m.workstream_id]) meetingsByWs[m.workstream_id] = [];
      meetingsByWs[m.workstream_id].push(m);
    });

    var lvl = (window.Accord && window.Accord.state && window.Accord.state.level) || 'constellation';
    var ctx = (window.Accord && window.Accord.state && window.Accord.state.levelContext) || {};

    var html = '';
    tops.forEach(function(top) {
      html += _renderTopWs(top, subsByParent[top.workstream_id] || [], meetingsByWs, lvl, ctx);
    });

    body.innerHTML = inboxHtml + html;
    _wireTreeHandlers();
    _wireInboxHandlers();
  }

  function _renderInbox() {
    var count = local.inbox.length;
    if (!count) return '';  // No pending invites — hide entirely

    var expanded = local.inboxExpanded;
    var badge = '<span class="ac-inbox-badge">' + count + '</span>';
    var chevron = '<span class="ac-tree-chevron' + (expanded ? ' open' : '') + '">&#9656;</span>';

    var rows = '';
    if (expanded) {
      local.inbox.forEach(function(item) {
        var date = item.scheduledFor
          ? new Date(item.scheduledFor).toLocaleDateString('en-US', {month:'short', day:'numeric'})
          : (item.invitedAt ? new Date(item.invitedAt).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : '');
        rows +=
          '<div class="ac-tree-row ac-inbox-item" data-attendee-id="' + esc(item.attendeeId) + '" data-meeting-id="' + esc(item.meetingId) + '">' +
            '<span style="width:10px;flex-shrink:0;"></span>' +
            '<span class="ac-tree-label">' + esc(item.title) + '</span>' +
            '<span class="ac-tree-meta">' + esc(date) + '</span>' +
          '</div>';
      });
    }

    return (
      '<div class="ac-inbox-block">' +
        '<div class="ac-tree-row ac-tree-ws ac-inbox-header" id="ac-inbox-header">' +
          chevron +
          '<span class="ac-tree-label" style="color:#00d2ff;font-weight:700;letter-spacing:0.08em;">INBOX</span>' +
          badge +
        '</div>' +
        '<div class="ac-inbox-children" id="ac-inbox-children"' + (expanded ? '' : ' style="display:none"') + '>' +
          rows +
        '</div>' +
      '</div>' +
      '<div style="height:1px;background:rgba(0,210,255,0.1);margin:4px 0;"></div>'
    );
  }

  function _wireInboxHandlers() {
    // Toggle expand/collapse
    var header = document.getElementById('ac-inbox-header');
    if (header) {
      header.addEventListener('click', function() {
        local.inboxExpanded = !local.inboxExpanded;
        _renderTree();
      });
    }

    // Item click → show RSVP popup
    document.querySelectorAll('.ac-inbox-item').forEach(function(row) {
      row.addEventListener('click', function(e) {
        e.stopPropagation();
        _showRsvpPopup(row.dataset.attendeeId, row.dataset.meetingId, row);
      });
    });
  }

  function _showRsvpPopup(attendeeId, meetingId, anchorEl) {
    // Remove any existing popup
    var existing = document.getElementById('ac-inbox-rsvp-popup');
    if (existing) { existing.remove(); if (existing.dataset.attendeeId === attendeeId) return; }

    var item = local.inbox.find(function(i) { return i.attendeeId === attendeeId; });
    if (!item) return;

    var rect = anchorEl.getBoundingClientRect();
    var popup = document.createElement('div');
    popup.id = 'ac-inbox-rsvp-popup';
    popup.dataset.attendeeId = attendeeId;
    popup.style.cssText =
      'position:fixed;z-index:1000;' +
      'left:' + (rect.right + 8) + 'px;' +
      'top:' + rect.top + 'px;' +
      'background:#0d1a24;border:1px solid rgba(0,210,255,0.3);border-radius:6px;' +
      'padding:14px 16px;min-width:240px;box-shadow:0 8px 32px rgba(0,0,0,0.5);';

    var date = item.scheduledFor
      ? new Date(item.scheduledFor).toLocaleDateString('en-US', {weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})
      : '';

    popup.innerHTML =
      '<div style="font-family:\'Syne\',sans-serif;font-size:15px;font-weight:700;color:#e8f0f8;margin-bottom:4px;">' + esc(item.title) + '</div>' +
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:11px;color:#7a9abf;margin-bottom:2px;">Invited by <span style="color:#00d2ff">' + esc(item.organizer) + '</span></div>' +
      (date ? '<div style="font-family:\'JetBrains Mono\',monospace;font-size:11px;color:#7a9abf;margin-bottom:12px;">' + esc(date) + '</div>' : '<div style="margin-bottom:12px;"></div>') +
      '<div style="display:flex;gap:8px;">' +
        '<button id="ac-rsvp-accept" style="flex:1;padding:7px;background:rgba(52,192,112,0.1);border:1px solid rgba(52,192,112,0.4);color:#34c070;font-family:Arial,sans-serif;font-size:12px;border-radius:4px;cursor:pointer;">✓ Accept</button>' +
        '<button id="ac-rsvp-decline" style="flex:1;padding:7px;background:rgba(255,77,109,0.1);border:1px solid rgba(255,77,109,0.4);color:#ff4d6d;font-family:Arial,sans-serif;font-size:12px;border-radius:4px;cursor:pointer;">✕ Decline</button>' +
      '</div>';

    document.body.appendChild(popup);

    // Close on outside click
    setTimeout(function() {
      document.addEventListener('click', function _closePopup(e) {
        if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', _closePopup); }
      });
    }, 50);

    // Accept
    document.getElementById('ac-rsvp-accept').addEventListener('click', function() {
      _rsvpRespond(attendeeId, meetingId, 'accepted', popup);
    });
    // Decline
    document.getElementById('ac-rsvp-decline').addEventListener('click', function() {
      _rsvpRespond(attendeeId, meetingId, 'declined', popup);
    });
  }

  async function _rsvpRespond(attendeeId, meetingId, status, popup) {
    try {
      await API.patch('accord_meeting_attendees?attendee_id=eq.' + attendeeId, { rsvp_status: status });
      popup.remove();
      // Remove from local inbox and re-render
      local.inbox = local.inbox.filter(function(i) { return i.attendeeId !== attendeeId; });
      _renderTree();
    } catch(e) {
      console.error('[Accord-rails] RSVP respond failed', e);
    }
  }

  function _renderTopWs(ws, subs, meetingsByWs, lvl, ctx) {
    const expanded = local.treeExpanded[ws.workstream_id] !== false;  // default open
    const ownMeetings = meetingsByWs[ws.workstream_id] || [];
    const subMeetingCount = subs.reduce((acc, s) => acc + (meetingsByWs[s.workstream_id] || []).length, 0);
    const totalMeetings = ownMeetings.length + subMeetingCount;
    const isActive = lvl === 'workstream' && ctx.workstreamId === ws.workstream_id;

    let inner = '';

    // Sub-workstreams
    subs.forEach(sub => {
      inner += _renderSubWs(sub, meetingsByWs[sub.workstream_id] || [], lvl, ctx);
    });

    // Direct meetings (not under a sub)
    ownMeetings.forEach(m => {
      inner += _renderMeeting(m, lvl, ctx);
    });

    if (!subs.length && !ownMeetings.length) {
      inner += '<div class="ac-tree-leaf-empty">No meetings filed yet.</div>';
    }

    return `
      <div class="ac-tree-row ac-tree-ws${isActive ? ' active' : ''}" data-toggle="ac-tree-children-${esc(ws.workstream_id)}" data-ws-id="${esc(ws.workstream_id)}">
        ${_chevronSvg(expanded)}
        <span class="ac-tree-label">${esc(ws.name)}</span>
        ${totalMeetings > 0 ? `<span class="ac-tree-badge">${totalMeetings}</span>` : ''}
      </div>
      <div class="ac-tree-children" id="ac-tree-children-${esc(ws.workstream_id)}"${expanded ? '' : ' style="display:none"'}>
        ${inner}
      </div>`;
  }

  function _renderSubWs(ws, meetings, lvl, ctx) {
    const expanded = local.treeExpanded[ws.workstream_id] !== false;
    const isActive = lvl === 'workstream' && ctx.workstreamId === ws.workstream_id;
    let inner = '';
    meetings.forEach(m => { inner += _renderMeeting(m, lvl, ctx); });
    if (!meetings.length) {
      inner += '<div class="ac-tree-leaf-empty ac-tree-leaf-empty-deep">No meetings.</div>';
    }
    return `
      <div class="ac-tree-row ac-tree-sub${isActive ? ' active' : ''}" data-toggle="ac-tree-children-${esc(ws.workstream_id)}" data-ws-id="${esc(ws.workstream_id)}">
        ${_chevronSvg(expanded)}
        <span class="ac-tree-label">${esc(ws.name)}</span>
        ${meetings.length > 0 ? `<span class="ac-tree-badge">${meetings.length}</span>` : ''}
      </div>
      <div class="ac-tree-children" id="ac-tree-children-${esc(ws.workstream_id)}"${expanded ? '' : ' style="display:none"'}>
        ${inner}
      </div>`;
  }

  function _renderMeeting(m, lvl, ctx) {
    const isActive = lvl === 'meeting' && ctx.meetingId === m.meeting_id;
    const dot =
      m.sealed_at         ? 'sealed'   :
      m.state === 'running' ? 'running'  :
      m.state === 'closed'  ? 'closed'   :
                              'draft';
    const dateStr = m.scheduled_for ? _shortDate(m.scheduled_for) : _shortDate(m.created_at);
    return `
      <div class="ac-tree-row ac-tree-meeting${isActive ? ' active' : ''}" data-mtg-id="${esc(m.meeting_id)}">
        <span class="ac-tree-dot ac-tree-dot-${dot}" aria-hidden="true"></span>
        <span class="ac-tree-label">${esc(m.title || '(untitled)')}</span>
        <span class="ac-tree-meta">${esc(dateStr)}</span>
      </div>`;
  }

  function _chevronSvg(open) {
    return `<svg class="ac-tree-chevron${open ? ' open' : ''}" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none"/>
    </svg>`;
  }

  function _wireTreeHandlers() {
    const body = $('ac-tree-body');
    if (!body) return;

    // Make all rows focusable for keyboard navigation
    body.querySelectorAll('.ac-tree-row').forEach(row => {
      if (!row.hasAttribute('tabindex')) row.setAttribute('tabindex', '-1');
    });
    // First visible row is the initial tab stop
    const first = body.querySelector('.ac-tree-row');
    if (first) first.setAttribute('tabindex', '0');

    // Chevron + workstream/sub click → toggle expand AND set level
    body.querySelectorAll('.ac-tree-row[data-toggle]').forEach(row => {
      row.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const wsId = row.dataset.wsId;
        const targetId = row.dataset.toggle;
        const target = document.getElementById(targetId);

        // If chevron-only click intent (clicking the chevron itself) → toggle
        // expand without changing level. Click on label → set level + leave
        // expand state alone unless collapsed.
        const clickedChevron = ev.target.closest('.ac-tree-chevron');

        if (clickedChevron) {
          _toggleExpand(wsId, target, row);
        } else {
          // Set workstream level
          if (window.Accord?.setLevel) {
            window.Accord.setLevel('workstream', { workstreamId: wsId });
          }
          // Auto-expand if currently collapsed
          if (target && target.style.display === 'none') {
            _toggleExpand(wsId, target, row);
          }
        }
      });

      // CMD-ACCORD-CONSTELLATION-ENTRY-1 Phase 4b: right-click context
      // menu on tree workstream + sub-workstream rows. Mirrors the
      // constellation right-click pattern. Long-press fallback for
      // touch is handled by accord-dnd.js's pointer-events.
      row.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        _showTreeContextMenu(row, ev.clientX, ev.clientY);
      });
    });

    // Meeting leaf click → set level=meeting + workstreamId from parent context
    body.querySelectorAll('.ac-tree-meeting[data-mtg-id]').forEach(row => {
      row.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const mtgId = row.dataset.mtgId;
        // Find owning workstream from the meeting record
        const m = local.meetings.find(x => x.meeting_id === mtgId);
        const wsId = m ? m.workstream_id : null;
        if (window.Accord?.setLevel) {
          window.Accord.setLevel('meeting', { meetingId: mtgId, workstreamId: wsId });
        }
      });
    });
  }

  function _toggleExpand(wsId, target, row) {
    if (!target) return;
    const isOpen = target.style.display !== 'none';
    target.style.display = isOpen ? 'none' : '';
    local.treeExpanded[wsId] = !isOpen;
    _persistWrite('accord-tree-expanded', JSON.stringify(local.treeExpanded));
    row.querySelector('.ac-tree-chevron')?.classList.toggle('open', !isOpen);
  }

  // ── Tree context menu (Phase 4b) ────────────────────────────
  // Reused element: one menu instance per tree, repositioned per click.
  // Auto-dismisses on outside click or Escape.
  let _treeMenu = null;
  function _ensureTreeMenu() {
    if (_treeMenu) return _treeMenu;
    _treeMenu = document.createElement('div');
    _treeMenu.className = 'ac-tree-menu';
    _treeMenu.style.display = 'none';
    document.body.appendChild(_treeMenu);
    document.addEventListener('click', (ev) => {
      if (_treeMenu.style.display !== 'none' && !_treeMenu.contains(ev.target)) {
        _hideTreeMenu();
      }
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && _treeMenu.style.display !== 'none') {
        _hideTreeMenu();
      }
    });
    return _treeMenu;
  }
  function _hideTreeMenu() {
    if (_treeMenu) _treeMenu.style.display = 'none';
  }
  function _showTreeContextMenu(row, clientX, clientY) {
    const menu = _ensureTreeMenu();
    const wsId = row.dataset.wsId;
    if (!wsId) return;
    const ws = local.workstreams.find(w => w.workstream_id === wsId);
    const wsName = ws?.name || '(unknown)';

    menu.innerHTML = `
      <div class="ac-tree-menu-header">${esc(wsName)}</div>
      <button type="button" class="ac-tree-menu-item" data-action="rename">Rename…</button>
      <button type="button" class="ac-tree-menu-item" data-action="archive">Archive…</button>
    `;
    menu.style.display = 'block';
    // Position — clamp inside viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mw = menu.offsetWidth || 200;
    const mh = menu.offsetHeight || 90;
    menu.style.left = Math.max(4, Math.min(clientX, vw - mw - 4)) + 'px';
    menu.style.top  = Math.max(4, Math.min(clientY, vh - mh - 4)) + 'px';

    menu.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const action = btn.dataset.action;
        _hideTreeMenu();
        if (action === 'rename') {
          window.AccordWorkstreams?.openRename?.(wsId);
        } else if (action === 'archive') {
          window.AccordWorkstreams?.openArchiveConfirm?.(wsId);
        }
      });
    });
  }

  // ── Tree search (Phase 4a — mirrors my-meetings.html _mtgSearch) ──
  // Text-match on workstream name + meeting title. Hide non-matching
  // .ac-tree-meeting rows. Keep .ac-tree-ws / .ac-tree-sub rows visible
  // when any descendant matches; hide them when nothing inside matches.
  function _runTreeSearch(rawQuery) {
    const body = $('ac-tree-body');
    if (!body) return;
    const q = (rawQuery || '').trim().toLowerCase();

    // No query: restore all rows + their persisted expand states
    if (!q) {
      body.querySelectorAll('.ac-tree-row, .ac-tree-children, .ac-tree-leaf-empty').forEach(el => {
        el.style.display = '';
      });
      // Re-apply persisted collapse states for chevrons
      body.querySelectorAll('.ac-tree-children').forEach(child => {
        // Find owning row (nearest preceding sibling .ac-tree-row[data-toggle])
        const id = child.id;
        const wsId = id.replace(/^ac-tree-children-/, '');
        const expanded = local.treeExpanded[wsId] !== false;
        child.style.display = expanded ? '' : 'none';
      });
      return;
    }

    // With a query: build per-ws "any descendant matched" set, then apply
    const matchedTops = new Set();
    const matchedSubs = new Set();
    const matchedMtgs = new Set();

    // Meetings
    local.meetings.forEach(m => {
      const hay = (m.title || '').toLowerCase();
      if (!hay.includes(q)) return;
      matchedMtgs.add(m.meeting_id);
      // Walk up to owning ws and (if sub) parent top
      const owningWs = m.workstream_id;
      const ws = local.workstreams.find(w => w.workstream_id === owningWs);
      if (!ws) return;
      if (ws.parent_workstream_id) {
        matchedSubs.add(ws.workstream_id);
        matchedTops.add(ws.parent_workstream_id);
      } else {
        matchedTops.add(ws.workstream_id);
      }
    });

    // Workstream names
    local.workstreams.forEach(w => {
      if (!(w.name || '').toLowerCase().includes(q)) return;
      if (w.parent_workstream_id) {
        matchedSubs.add(w.workstream_id);
        matchedTops.add(w.parent_workstream_id);
      } else {
        matchedTops.add(w.workstream_id);
      }
    });

    // Apply visibility — meeting rows: shown if matched
    body.querySelectorAll('.ac-tree-meeting[data-mtg-id]').forEach(row => {
      row.style.display = matchedMtgs.has(row.dataset.mtgId) ? '' : 'none';
    });
    // Sub rows: shown if matchedSubs OR if their name matches OR if any of
    // their meetings match (already in matchedSubs by walk-up above)
    body.querySelectorAll('.ac-tree-sub[data-ws-id]').forEach(row => {
      const wsId = row.dataset.wsId;
      const visible = matchedSubs.has(wsId);
      row.style.display = visible ? '' : 'none';
      // Force-expand if visible so descendants show
      const child = document.getElementById(`ac-tree-children-${wsId}`);
      if (child) child.style.display = visible ? '' : 'none';
    });
    // Top-level rows: same logic
    body.querySelectorAll('.ac-tree-ws[data-ws-id]').forEach(row => {
      const wsId = row.dataset.wsId;
      const visible = matchedTops.has(wsId);
      row.style.display = visible ? '' : 'none';
      const child = document.getElementById(`ac-tree-children-${wsId}`);
      if (child) child.style.display = visible ? '' : 'none';
    });
    // Leaf-empty placeholders hide under search (nothing meaningful to show)
    body.querySelectorAll('.ac-tree-leaf-empty').forEach(el => {
      el.style.display = 'none';
    });
  }

  // ── Tree keyboard navigation (Phase 4a — left rail only) ──
  // Arrow keys cycle through visible rows; ENTER descends.
  // Constellation node arrow-cycle is Phase 4b (paired with drag-drop a11y).
  function _wireTreeKeyboard() {
    const search = $('ac-tree-search');
    const scroll = $('ac-tree-scroll');
    if (!scroll) return;

    scroll.addEventListener('keydown', (ev) => {
      if (!['ArrowDown','ArrowUp','Enter','Home','End'].includes(ev.key)) return;
      const rows = Array.from(scroll.querySelectorAll('.ac-tree-row'))
        .filter(r => r.offsetParent !== null);   // visible only
      if (!rows.length) return;
      const focused = document.activeElement?.closest('.ac-tree-row');
      let idx = focused ? rows.indexOf(focused) : -1;

      if (ev.key === 'ArrowDown') { idx = Math.min(rows.length - 1, idx + 1); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { idx = Math.max(0, idx - 1); ev.preventDefault(); }
      else if (ev.key === 'Home') { idx = 0; ev.preventDefault(); }
      else if (ev.key === 'End') { idx = rows.length - 1; ev.preventDefault(); }
      else if (ev.key === 'Enter') {
        if (focused) { focused.click(); ev.preventDefault(); }
        return;
      }

      const target = rows[idx];
      if (target) {
        target.setAttribute('tabindex', '0');
        target.focus();
      }
    });

    // Make rows focusable on render — set the first one as initial tab stop
    const first = scroll.querySelector('.ac-tree-row');
    if (first && !first.hasAttribute('tabindex')) first.setAttribute('tabindex', '0');
  }

  // ── Parking lot ─────────────────────────────────────────────
  function _renderParkingLot() {
    const body = $('ac-parking-body');
    if (!body) return;

    if (!local.parkingLot.length) {
      body.innerHTML = '<div class="ac-parking-empty">All meetings filed.</div>';
      return;
    }

    const sorted = _sortParking(local.parkingLot.slice(), local.parkingSort);

    let html = '';
    sorted.forEach(m => {
      const dot =
        m.sealed_at         ? 'sealed'   :
        m.state === 'running' ? 'running'  :
        m.state === 'closed'  ? 'closed'   :
                                'draft';
      const dateStr = m.scheduled_for ? _shortDate(m.scheduled_for) : _shortDate(m.created_at);
      html += `
        <div class="ac-parking-row" draggable="true" data-mtg-id="${esc(m.meeting_id)}" data-mtg-title="${esc(m.title || '')}">
          <span class="ac-parking-dot ac-parking-dot-${dot}" aria-hidden="true"></span>
          <span class="ac-parking-row-title">${esc(m.title || '(untitled)')}</span>
          <span class="ac-parking-row-date">${esc(dateStr)}</span>
          <button type="button" class="ac-parking-row-file" data-mtg-id="${esc(m.meeting_id)}" title="File this meeting">file…</button>
        </div>`;
    });
    body.innerHTML = html;

    _wireParkingHandlers();
  }

  function _sortParking(rows, mode) {
    if (mode === 'alpha') {
      return rows.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }
    // date desc — prefer scheduled_for, fall back to created_at
    return rows.sort((a, b) => {
      const at = a.scheduled_for || a.created_at || '';
      const bt = b.scheduled_for || b.created_at || '';
      return bt.localeCompare(at);
    });
  }

  function _wireParkingHandlers() {
    const body = $('ac-parking-body');
    if (!body) return;

    // Click row → set level=meeting (Phase 4 wires meeting-level view;
    // Phase 3 just records intent so accord-core's listeners can react)
    body.querySelectorAll('.ac-parking-row').forEach(row => {
      row.addEventListener('click', (ev) => {
        // Don't trigger when "file…" button clicked
        if (ev.target.closest('.ac-parking-row-file')) return;
        const mtgId = row.dataset.mtgId;
        if (window.Accord?.setLevel) {
          window.Accord.setLevel('meeting', { meetingId: mtgId, workstreamId: null });
        }
      });
    });

    // File button → existing AccordWorkstreams.openFileModal
    body.querySelectorAll('.ac-parking-row-file').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const mtgId = btn.dataset.mtgId;
        if (window.AccordWorkstreams?.openFileModal) {
          window.AccordWorkstreams.openFileModal(mtgId);
        }
      });
    });

    // Phase 4 will wire dragstart/drop on these rows; Phase 3 just sets
    // draggable=true so the affordance is discoverable.
  }

  // CMD-ACCORD-MY-MEETINGS-2 -- tab bar injection
  // CMD-ACCORD-MEETING-CENTER-1: MY MEETINGS tab removed. MY MEETINGS is now
  // the MEETING CENTER surface (accord-today.html) reached via Tier 1 tab.
  // WORKSTREAMS is a plain rail header, not a tab.
  function _ensureRailTabs() {
    if (document.querySelector('.ac-rail-tabs')) return;  // idempotent
    var railLeft = document.getElementById('ac-rail-left');
    if (!railLeft) return;

    // Remove legacy personal/divider/workstreams wrappers if present
    var personal  = railLeft.querySelector('.ac-rail-personal');
    var divider   = railLeft.querySelector('.ac-rail-divider');
    var wsWrapper = railLeft.querySelector('.ac-rail-workstreams');
    if (personal) personal.remove();
    if (divider)  divider.remove();

    // Remove old nav item if present
    var oldNav = document.getElementById('ac-my-meetings-nav');
    if (oldNav) oldNav.remove();

    // Capture header + collapse btn before removing
    var oldHeader   = railLeft.querySelector('.ac-rail-header');
    var collapseBtn = oldHeader ? oldHeader.querySelector('.ac-rail-collapse') : null;

    // Build plain header (no tab bar — WORKSTREAMS is the only rail panel)
    var header = document.createElement('div');
    header.className = 'ac-rail-header';
    header.innerHTML =
      '<div class="ac-rail-title">Workstreams</div>' +
      (collapseBtn ? collapseBtn.outerHTML : '');

    // Workstream panel — wrap existing content
    var wsPanel = document.createElement('div');
    wsPanel.className = 'ac-rail-panel';
    wsPanel.setAttribute('data-panel', 'workstreams');

    if (wsWrapper) {
      wsPanel.appendChild(wsWrapper);
    } else {
      var search = document.getElementById('ac-tree-search');
      var newBtn = document.getElementById('ac-tree-new-btn');
      var scroll = document.querySelector('.ac-tree-scroll');
      if (search) wsPanel.appendChild(search);
      if (newBtn) wsPanel.appendChild(newBtn);
      if (scroll) wsPanel.appendChild(scroll);
    }

    // Remove old header, insert new structure
    if (oldHeader) oldHeader.remove();
    railLeft.insertBefore(header, railLeft.firstChild);
    railLeft.appendChild(wsPanel);
  }

  function _switchRailTab(tab) {
    // No-op: tab switching retired with MY MEETINGS removal.
    // Retained to avoid errors if any legacy caller invokes it.
  }

  // X-19 + X-19b -- drag-to-resize both rails
  function _initRailResize() {
    _setupRailDrag('left');
    _setupRailDrag('right');
  }

  function _setupRailDrag(side) {
    const rail = document.getElementById('ac-rail-' + side);
    if (!rail) return;

    // Per-side handle ID. Left keeps the legacy 'ac-rail-resize-handle'
    // ID from X-19 for back-compat; right uses a qualified ID.
    const handleId = side === 'left'
      ? 'ac-rail-resize-handle'
      : 'ac-rail-resize-handle-right';
    if (document.getElementById(handleId)) return;  // idempotent

    // Layout is CSS grid on .ac-three-pane -- must update gridTemplateColumns,
    // not rail.style.width (grid overrides element width). IR66 confirmed 2026-05-13.
    const pane = rail.parentNode;

    // X-23e: restore widths through helper so collapse state is honored
    // on boot. (Idempotent — fine to call once per rail.)
    _applyGridCols();

    // Build handle. Side modifier flips positioning in CSS (right handle
    // anchors to left edge of right rail).
    const handle = document.createElement('div');
    handle.id = handleId;
    handle.className = 'ac-rail-resize-handle ac-rail-resize-handle--' + side;
    rail.appendChild(handle);

    let dragging = false;
    let startX   = 0;
    let startW   = 0;

    handle.addEventListener('mousedown', function (ev) {
      // No-op when the rail is collapsed -- prevents drag from clobbering
      // the saved width with the 36px spine measurement on mouseup.
      if (rail.classList.contains('collapsed')) return;
      ev.preventDefault();
      dragging = true;
      startX   = ev.clientX;
      startW   = rail.offsetWidth;
      document.body.style.cursor     = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', function (ev) {
      if (!dragging || !pane) return;
      // Left rail: dragging right widens it. Right rail: dragging right
      // narrows it (handle is on the rail's LEFT edge).
      const delta = ev.clientX - startX;
      const newW  = side === 'left'
        ? Math.min(380, Math.max(200, startW + delta))
        : Math.min(380, Math.max(200, startW - delta));
      // X-23e: route through helper so the opposite rail's collapse
      // state is respected during this drag.
      _applyGridCols(side === 'left' ? { left: newW } : { right: newW });
    });

    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      const key = side === 'left' ? 'accord-rail-width' : 'accord-rightrail-width';
      localStorage.setItem(key, String(rail.offsetWidth));
    });
  }

  // ── Chrome wiring (rail collapse, sort toggle) ──
  function _wireChrome() {
    // CMD-ACCORD-MY-MEETINGS-2 -- replace overlay nav item with tab bar.
    _ensureRailTabs();
    // X-19 -- drag-to-resize handle
    _initRailResize();

    // Left-rail collapse button
    $('ac-leftrail-collapse')?.addEventListener('click', () => {
      const next = !$('ac-rail-left')?.classList.contains('collapsed');
      _applyRailCollapse('left', next);
    });
    // Right-rail collapse button
    $('ac-rightrail-collapse')?.addEventListener('click', () => {
      const next = !$('ac-rail-right')?.classList.contains('collapsed');
      _applyRailCollapse('right', next);
    });
    // Parking sort toggle
    $('ac-parking-sort-btn')?.addEventListener('click', () => {
      local.parkingSort = local.parkingSort === 'date' ? 'alpha' : 'date';
      _persistWrite('accord-parking-sort', local.parkingSort);
      _updateSortBtnLabel();
      _renderParkingLot();
    });
    _updateSortBtnLabel();

    // Phase 5: legacy view toggle removed at closure. Top-level tab
    // bar gone; meeting-scoped tabs are the only surface entry-point.

    // New-meeting / new-workstream affordances inside the rails
    $('ac-tree-new-btn')?.addEventListener('click', () => {
      window.AccordWorkstreams?.openCreate?.();
    });

    // Phase 4a — tree search (debounced) + keyboard navigation
    const search = $('ac-tree-search');
    if (search) {
      let _searchTimer = null;
      search.addEventListener('input', (ev) => {
        clearTimeout(_searchTimer);
        const q = ev.target.value;
        _searchTimer = setTimeout(() => _runTreeSearch(q), 80);
      });
      search.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          search.value = '';
          _runTreeSearch('');
          search.blur();
        }
        if (ev.key === 'ArrowDown') {
          // Drop focus into the tree on first ArrowDown from search
          const first = $('ac-tree-scroll')?.querySelector('.ac-tree-row');
          if (first) {
            first.setAttribute('tabindex', '0');
            first.focus();
            ev.preventDefault();
          }
        }
      });
    }
    _wireTreeKeyboard();
  }

  function _applyRailCollapse(side, collapsed) {
    const railId = side === 'left' ? 'ac-rail-left' : 'ac-rail-right';
    const btnId  = side === 'left' ? 'ac-leftrail-collapse' : 'ac-rightrail-collapse';
    const rail   = $(railId);
    const btn    = $(btnId);
    if (!rail) return;
    rail.classList.toggle('collapsed', collapsed);
    btn?.setAttribute('aria-expanded', String(!collapsed));
    btn?.setAttribute('title', collapsed ? 'Expand' : 'Collapse');
    _persistWrite(`accord-${side === 'left' ? 'leftrail' : 'rightrail'}-collapsed`, String(collapsed));
    // X-23e: shrink/expand the actual grid column track to match.
    // Without this the rail element shrinks (width:36px from CSS) but
    // its column track stays at the saved width, leaving a dead gap
    // between the spine and the center pane.
    _applyGridCols();
  }

  function _updateSortBtnLabel() {
    const btn = $('ac-parking-sort-btn');
    if (!btn) return;
    btn.textContent = local.parkingSort === 'date' ? 'a–z' : 'date';
    btn.setAttribute('title', `Sort by ${local.parkingSort === 'date' ? 'name' : 'date'}`);
  }

  // ── Constellation mount ─────────────────────────────────────
  function _ensureConstellationMounted() {
    const host = $('ac-constellation-host');
    if (!host) return;
    if (!window.AccordConstellation?.init) {
      console.warn('[Accord-rails] AccordConstellation not loaded; skipping mount');
      return;
    }
    window.AccordConstellation.init(host);
  }

  // ── Event bus ───────────────────────────────────────────────
  function _wireEventBus() {
    // Constellation node click → workstream level
    window.addEventListener('accord:constellation-node-click', (ev) => {
      const wsId = ev.detail?.workstream_id;
      if (!wsId) return;
      window.Accord?.setLevel?.('workstream', { workstreamId: wsId });
    });

    // Constellation context menu actions
    window.addEventListener('accord:constellation-action', (ev) => {
      const { action, workstream_id } = ev.detail || {};
      if (!action || !workstream_id || !window.AccordWorkstreams) return;
      switch (action) {
        case 'rename':    window.AccordWorkstreams.openRename(workstream_id); break;
        case 'archive':   window.AccordWorkstreams.openArchiveConfirm(workstream_id); break;
        case 'view-subs': window.AccordWorkstreams.viewSubs(workstream_id); break;
      }
    });

    // Constellation empty-state CTA → open create modal
    window.addEventListener('accord:constellation-create-workstream', () => {
      window.AccordWorkstreams?.openCreate?.();
    });

    // Level-changed → refresh tree highlight (without re-fetching)
    window.addEventListener('accord:level-changed', () => {
      _renderTree();
    });

    // Listen for substrate changes — refresh both rails AND the
    // constellation so newly-created top-level workstreams appear,
    // renamed/archived/restored ones update visually, and meeting
    // file/unfile/refile flows propagate to the constellation's
    // activity-weight composite.
    const _refreshAll = () => {
      refresh();
      if (window.AccordConstellation?.refresh) {
        try { window.AccordConstellation.refresh(); } catch (e) {}
      }
    };
    ['accord:workstream-created',
     'accord:workstream-renamed',
     'accord:workstream-archived',
     'accord:workstream-restored',
     'accord:meeting-filed',
     'accord:meeting-unfiled',
     'accord:meeting-refiled',
     // X-15: refresh tree dots when a meeting starts or ends/seals so
     // the dot state (idle→running→closed/sealed) updates immediately.
     'accord:meeting-loaded',
     'accord:meeting-sealed'].forEach(eventName => {
      window.addEventListener(eventName, _refreshAll);
    });
  }

  // ── Boot ────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  // ── Expose ──────────────────────────────────────────────────
  window.AccordRails = {
    refresh,
    setParkingSort(mode) {
      if (mode !== 'date' && mode !== 'alpha') return;
      local.parkingSort = mode;
      _persistWrite('accord-parking-sort', mode);
      _updateSortBtnLabel();
      _renderParkingLot();
    },
    collapseRail(side, collapsed) {
      _applyRailCollapse(side, !!collapsed);
    },
  };
})();