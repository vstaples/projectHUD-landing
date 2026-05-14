// ============================================================
// ProjectHUD — accord-rails.js
// CMD-ACCORD-CONSTELLATION-ENTRY-1 · Phase 3
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
    await Promise.all([_loadWorkstreams(), _loadMeetings()]);
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

    if (!local.workstreams.length) {
      body.innerHTML = '<div class="ac-tree-empty">No workstreams yet.<br>Use + NEW WORKSTREAM to begin.</div>';
      // CMD-ACCORD-CONSTELLATION-SLIDESHOW-1 S5.1 -- mount slideshow if not dismissed
      if (window.AccordSlideshow && window.AccordSlideshow.shouldShow()) {
        var ssHost = document.getElementById('ac-constellation-host');
        if (ssHost) window.AccordSlideshow.mount(ssHost);
      }
      return;
    }
    // If workstreams exist -- dismiss slideshow if somehow still showing
    if (window.AccordSlideshow) window.AccordSlideshow.dismiss();

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

    body.innerHTML = html;
    _wireTreeHandlers();
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

    // Build tab bar
    var tabBar = document.createElement('div');
    tabBar.className = 'ac-rail-tabs';
    tabBar.innerHTML =
      '<button class="ac-rail-tab ac-rail-tab--active" ' +
      'data-tab="workstreams" data-action="rail-tab-switch">WORKSTREAMS</button>' +
      '<button class="ac-rail-tab" ' +
      'data-tab="my-meetings" data-action="rail-tab-switch">MY MEETINGS</button>' +
      (collapseBtn ? collapseBtn.outerHTML : '');

    // Workstream panel -- wrap existing content
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

    // My Meetings panel
    var mmPanel = document.createElement('div');
    mmPanel.className = 'ac-rail-panel';
    mmPanel.setAttribute('data-panel', 'my-meetings');
    mmPanel.style.display = 'none';
    mmPanel.innerHTML = '<div id="ac-mm-rail-content"></div>';

    // Remove old header, insert new structure
    if (oldHeader) oldHeader.remove();
    railLeft.insertBefore(tabBar, railLeft.firstChild);
    railLeft.appendChild(wsPanel);
    railLeft.appendChild(mmPanel);

    // Wire tab delegation
    tabBar.addEventListener('click', function (ev) {
      var target = ev.target;
      if (!target.dataset || target.dataset.action !== 'rail-tab-switch') return;
      _switchRailTab(target.dataset.tab);
    });

    // Wire collapse button in new tab bar
    var newCollapseBtn = tabBar.querySelector('.ac-rail-collapse');
    if (newCollapseBtn) {
      newCollapseBtn.addEventListener('click', function () {
        var next = !document.getElementById('ac-rail-left').classList.contains('collapsed');
        _applyRailCollapse('left', next);
      });
    }
  }

  function _switchRailTab(tab) {
    document.querySelectorAll('.ac-rail-tab').forEach(function (t) {
      t.classList.toggle('ac-rail-tab--active', t.dataset.tab === tab);
    });
    document.querySelectorAll('.ac-rail-panel').forEach(function (p) {
      p.style.display = p.getAttribute('data-panel') === tab ? '' : 'none';
    });
    if (tab === 'my-meetings') {
      if (window.AccordMyMeetings) {
        window.AccordMyMeetings.renderInRail(
          document.getElementById('ac-mm-rail-content')
        );
      }
    } else {
      if (window.AccordMyMeetings) window.AccordMyMeetings.pauseRefresh();
    }
  }

  // X-19 -- drag-to-resize left rail
  function _initRailResize() {
    var rail = document.getElementById('ac-rail-left');
    if (!rail) return;
    if (document.getElementById('ac-rail-resize-handle')) return;  // idempotent

    // Restore saved width
    var saved = localStorage.getItem('accord-rail-width');
    if (saved) {
      var w = parseInt(saved, 10);
      if (w >= 200 && w <= 380) rail.style.width = w + 'px';
    }

    // Build handle
    var handle = document.createElement('div');
    handle.id        = 'ac-rail-resize-handle';
    handle.className = 'ac-rail-resize-handle';
    rail.appendChild(handle);

    var _dragging = false;
    var _startX   = 0;
    var _startW   = 0;

    handle.addEventListener('mousedown', function (ev) {
      ev.preventDefault();
      _dragging = true;
      _startX   = ev.clientX;
      _startW   = rail.offsetWidth;
      document.body.style.cursor     = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', function (ev) {
      if (!_dragging) return;
      var newW = Math.min(380, Math.max(200, _startW + (ev.clientX - _startX)));
      rail.style.width = newW + 'px';
    });

    document.addEventListener('mouseup', function () {
      if (!_dragging) return;
      _dragging = false;
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      localStorage.setItem('accord-rail-width', String(rail.offsetWidth));
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
     'accord:meeting-refiled'].forEach(eventName => {
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