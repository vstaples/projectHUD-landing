// ============================================================
// ProjectHUD — accord-constellation.js
// CMD-ACCORD-CONSTELLATION-ENTRY-1 · Phase 2
//
// Radial concentric-ring constellation visualization of top-level
// workstreams. Reads firm-scoped substrate (RLS-enforced); renders
// SVG with activity-weighted node sizes + amber glow per Style
// Doctrine v1.7 palette (warm editorial — NOT cyan/teal, see
// scaffolding §3.1 IR64 finding in Phase 1 halt-and-surface).
//
// Phase 2 scope:
//   • Render only — no transitions, no rails, no drag-drop
//   • Hover tooltip, right-click context menu (events dispatched;
//     wiring is Phase 3)
//   • Click is placeholder — emits accord:constellation-node-click;
//     full transition added Phase 4
//   • Empty-state prompt for zero-workstream firms
//
// Activity-weight composite (per scaffolding §3.3 + commission
// Decision 4 sealed-proxy):
//   recent_meetings_count(30d)        × WEIGHT_RECENT_MEETINGS
//   open_unsealed_node_count          × WEIGHT_OPEN_COMMITMENTS
//   inv_exp(days_since_last_touch)    × WEIGHT_DAYS_SINCE_TOUCH
// Three weights exposed as TUNE constants for empirical tuning
// once multi-firm fixture data accumulates (Phase 1 D6 disposition).
//
// Top-level workstream nodes only. Sub-workstream meetings + nodes
// roll up to the top-level parent's weight (§3.1 architectural
// commitment).
//
// IR65 does NOT fire (no render template body changes; SVG is
// client-side).
// IR45: tag/visual colors declared via CSS tokens, not measured.
// IR67: 8-archetype walkthrough completed Phase 1 D6 (PASS).
// ============================================================

(function () {
  'use strict';

  // ── Tunable constants ───────────────────────────────────────
  const TUNE = {
    // Activity-weight composite weights
    WEIGHT_RECENT_MEETINGS:    1.0,
    WEIGHT_OPEN_COMMITMENTS:   0.5,
    WEIGHT_DAYS_SINCE_TOUCH:   0.3,

    // Window thresholds (days)
    MEETING_RECENT_DAYS:       30,
    DAYS_SINCE_INV_EXP_TAU:    45,    // half-life-ish for inv-exp recency curve

    // Recency rings (Q-CE-4 final values per Phase 1)
    RECENCY_INNER_DAYS:        14,
    RECENCY_MIDDLE_DAYS:       60,

    // Visual scale
    NODE_RADIUS_MIN:           18,
    NODE_RADIUS_MAX:           42,
    GLOW_RADIUS_PAD:           28,    // glow circle radius = node radius + this × weight-norm

    // Layout (fractions of viewBox half-extent)
    RING_RADIUS_INNER:         0.30,
    RING_RADIUS_MIDDLE:        0.55,
    RING_RADIUS_OUTER:         0.82,

    VIEWBOX_SIZE:              800,
    LABEL_OFFSET:              16,    // px below node circle baseline
  };

  // ── Module state ────────────────────────────────────────────
  const state = {
    container:     null,
    svg:           null,
    tooltip:       null,
    menu:          null,
    workstreams:   [],     // active top-level workstreams, decorated with weight + ring
    childMap:      {},     // top_id -> [sub_id, ...]
    parentTopMap:  {},     // any_id -> top_id (top maps to itself)
    meetingsByTop: {},     // top_id -> [{meeting_id, created_at, scheduled_for}, ...] (rolled up)
    openNodesByTop:{},     // top_id -> count
    weightMax:     1,      // normalization scalar
  };

  const API = window.API;
  const $  = id => document.getElementById(id);

  // ── HTML escape ─────────────────────────────────────────────
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Public API ──────────────────────────────────────────────
  async function init(container) {
    if (!container) {
      console.error('[accord-constellation] init: container element required');
      return;
    }
    state.container = container;
    container.classList.add('ac-stage');
    _ensureChrome();
    _wireGlobalDismiss();
    await refresh();
  }

  async function refresh() {
    if (!state.container) return;
    await _loadAll();
    _decorate();
    _render();
  }

  function setTune(overrides) {
    Object.assign(TUNE, overrides || {});
    if (state.container) _render();
  }

  function getTune() { return Object.assign({}, TUNE); }

  // ── Data loading ────────────────────────────────────────────
  async function _loadAll() {
    state.workstreams    = [];
    state.childMap       = {};
    state.parentTopMap   = {};
    state.meetingsByTop  = {};
    state.openNodesByTop = {};

    // Dependency chain: meetings rollup reads parentTopMap (built by
    // _loadWorkstreams); nodes rollup reads meetingsByTop (built by
    // _loadMeetingRollup). Parallel Promise.all caused intermittent
    // empty rollups on fast meeting fetches — operator-found Phase 4b
    // defect (Control Adapter showed 0 total despite 3 filed meetings).
    // Serialize the chain.
    await _loadWorkstreams();
    await _loadMeetingRollup();
    await _loadOpenNodeRollup();
  }

  async function _loadWorkstreams() {
    // Fetch all active workstreams (top + sub) — RLS auto-scopes by firm.
    let rows = [];
    try {
      rows = await API.get(
        'workstreams?state=eq.active&select=workstream_id,parent_workstream_id,name,created_at&order=name.asc'
      ) || [];
    } catch (e) {
      console.error('[accord-constellation] workstream load failed', e);
      return;
    }

    // Build parent-top map
    const byId = {};
    rows.forEach(w => { byId[w.workstream_id] = w; });
    rows.forEach(w => {
      if (!w.parent_workstream_id) {
        state.parentTopMap[w.workstream_id] = w.workstream_id;
      } else {
        // sub: top is its parent (two-level max enforced by trigger)
        state.parentTopMap[w.workstream_id] = w.parent_workstream_id;
        if (!state.childMap[w.parent_workstream_id]) {
          state.childMap[w.parent_workstream_id] = [];
        }
        state.childMap[w.parent_workstream_id].push(w.workstream_id);
      }
    });

    // Top-level only for rendering
    state.workstreams = rows.filter(w => !w.parent_workstream_id);
  }

  async function _loadMeetingRollup() {
    // All filed meetings; firm-scoped via RLS; aggregate to top-level parent.
    let rows = [];
    try {
      rows = await API.get(
        'accord_meetings?workstream_id=not.is.null&select=meeting_id,workstream_id,created_at,scheduled_for'
      ) || [];
    } catch (e) {
      console.warn('[accord-constellation] meeting load failed', e);
      return;
    }
    rows.forEach(r => {
      const top = state.parentTopMap[r.workstream_id];
      if (!top) return;     // workstream archived or not in active set
      if (!state.meetingsByTop[top]) state.meetingsByTop[top] = [];
      state.meetingsByTop[top].push(r);
    });
  }

  async function _loadOpenNodeRollup() {
    // Sealed-proxy v1: count unsealed accord_nodes with substantive tags,
    // joined to active filed meetings via meeting_id, rolled up to top.
    // Two queries: (1) candidate unsealed nodes; (2) bucket by meeting → top.
    // Cheap at current substrate (47 nodes, 36 meetings, 2 workstreams);
    // remains cheap at expected scale.
    let nodeRows = [];
    try {
      nodeRows = await API.get(
        'accord_nodes?tag=in.(decision,action,risk,question)' +
        '&sealed_at=is.null' +
        '&select=node_id,meeting_id,tag'
      ) || [];
    } catch (e) {
      console.warn('[accord-constellation] node load failed', e);
      return;
    }
    if (!nodeRows.length) return;

    // Build meeting→top map from rolled-up meetings
    const meetingToTop = {};
    Object.entries(state.meetingsByTop).forEach(([top, mtgs]) => {
      mtgs.forEach(m => { meetingToTop[m.meeting_id] = top; });
    });

    nodeRows.forEach(n => {
      const top = meetingToTop[n.meeting_id];
      if (!top) return;
      state.openNodesByTop[top] = (state.openNodesByTop[top] || 0) + 1;
    });
  }

  // ── Decorate workstreams with derived metrics ───────────────
  function _decorate() {
    const now = Date.now();
    const RECENT_MS = TUNE.MEETING_RECENT_DAYS * 86400000;
    const TAU = TUNE.DAYS_SINCE_INV_EXP_TAU;

    let maxWeight = 0;

    state.workstreams.forEach(w => {
      const mtgs   = state.meetingsByTop[w.workstream_id] || [];
      const nOpen  = state.openNodesByTop[w.workstream_id] || 0;

      // Recent meetings: count of meetings whose scheduled_for OR created_at
      // is within RECENT_MS. scheduled_for can be null; fall back to created_at.
      let nRecent = 0;
      let lastMs = 0;
      mtgs.forEach(m => {
        const t = m.scheduled_for ? new Date(m.scheduled_for).getTime() :
                  m.created_at    ? new Date(m.created_at).getTime()    : 0;
        if (!t) return;
        if (now - t <= RECENT_MS) nRecent++;
        if (t > lastMs) lastMs = t;
      });
      const totalMtgs = mtgs.length;

      // Days since last touch — fall back to workstream.created_at if no meetings
      const lastTouchMs = lastMs || (w.created_at ? new Date(w.created_at).getTime() : now);
      const daysSince   = Math.max(0, (now - lastTouchMs) / 86400000);
      const recencyInv  = Math.exp(-daysSince / TAU);   // 1.0 at touch-now, →0 at infinity

      // Composite weight (raw)
      const weight =
        TUNE.WEIGHT_RECENT_MEETINGS  * nRecent +
        TUNE.WEIGHT_OPEN_COMMITMENTS * nOpen +
        TUNE.WEIGHT_DAYS_SINCE_TOUCH * recencyInv * 10;  // scale recencyInv into integer-comparable range

      // Ring assignment from days-since (Q-CE-4)
      let ring;
      if (daysSince <= TUNE.RECENCY_INNER_DAYS)       ring = 'inner';
      else if (daysSince <= TUNE.RECENCY_MIDDLE_DAYS) ring = 'middle';
      else                                            ring = 'outer';

      // For brand-new workstreams with no meetings, place in middle (not outer);
      // outer ring should mean "dormant," not "fresh."
      if (totalMtgs === 0 && daysSince <= TUNE.RECENCY_MIDDLE_DAYS) ring = 'middle';

      Object.assign(w, {
        _weight:     weight,
        _nRecent:    nRecent,
        _nTotal:     totalMtgs,
        _nOpen:      nOpen,
        _daysSince:  daysSince,
        _lastMs:     lastTouchMs,
        _ring:       ring,
        _subCount:   (state.childMap[w.workstream_id] || []).length,
      });

      if (weight > maxWeight) maxWeight = weight;
    });

    state.weightMax = maxWeight || 1;
  }

  // ── Chrome (containers for SVG, tooltip, menu) ──────────────
  function _ensureChrome() {
    state.container.innerHTML = '';
    state.container.style.position = state.container.style.position || 'relative';

    // Tooltip
    state.tooltip = document.createElement('div');
    state.tooltip.className = 'ac-tooltip';
    state.tooltip.style.display = 'none';
    state.container.appendChild(state.tooltip);

    // Context menu
    state.menu = document.createElement('div');
    state.menu.className = 'ac-context-menu';
    state.menu.style.display = 'none';
    state.container.appendChild(state.menu);
  }

  function _wireGlobalDismiss() {
    document.addEventListener('click', (ev) => {
      if (state.menu && state.menu.style.display !== 'none' &&
          !state.menu.contains(ev.target)) {
        _hideMenu();
      }
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && state.menu && state.menu.style.display !== 'none') {
        _hideMenu();
      }
    });
  }

  // ── Render ──────────────────────────────────────────────────
  function _render() {
    // Remove previous SVG / empty-state (preserve tooltip + menu)
    Array.from(state.container.children).forEach(c => {
      if (c !== state.tooltip && c !== state.menu) c.remove();
    });

    if (!state.workstreams.length) {
      _renderEmpty();
      return;
    }
    _renderConstellation();
  }

  function _renderEmpty() {
    const empty = document.createElement('div');
    empty.className = 'ac-empty';
    empty.innerHTML = `
      <div class="ac-empty-inner">
        <svg width="100%" viewBox="0 0 680 420" role="img" xmlns="http://www.w3.org/2000/svg" style="max-width:520px;display:block;margin:0 auto 8px;">
          <title>No workstreams yet</title>
          <desc>Animated constellation placeholder — create your first workstream to begin</desc>
          <defs>
            <style>
              .ace-orb{fill:none;stroke:rgba(0,210,255,0.12);stroke-width:0.5}
              .ace-ring{fill:none;stroke:#00d2ff;stroke-width:1;opacity:0.6}
              .ace-core{fill:#00d2ff;opacity:0.25}
              .ace-bright{fill:#00d2ff;opacity:0.7}
              .ace-spoke{stroke:rgba(0,210,255,0.18);stroke-width:0.5;fill:none}
              .ace-lbl{font-family:'JetBrains Mono',monospace;font-size:11px;fill:rgba(0,210,255,0.45);letter-spacing:0.12em}
              .ace-h{font-family:'Syne',system-ui,sans-serif;font-size:22px;font-weight:700;fill:#e8f0f8}
              .ace-sub{font-family:'JetBrains Mono',monospace;font-size:12px;fill:#7a9abf;letter-spacing:0.04em}
              .ace-cta-bg{fill:rgba(0,210,255,0.08);stroke:rgba(0,210,255,0.35);stroke-width:1}
              .ace-cta-t{font-family:'JetBrains Mono',monospace;font-size:11px;fill:#e8f0f8;letter-spacing:0.1em}
              .ace-p1{animation:ace-pulse 3s ease-in-out infinite;transform-origin:340px 185px}
              .ace-p2{animation:ace-pulse 3s ease-in-out 1s infinite;transform-origin:340px 185px}
              .ace-p3{animation:ace-pulse 3s ease-in-out 2s infinite;transform-origin:340px 185px}
              .ace-f1{animation:ace-float 6s ease-in-out infinite}
              .ace-f2{animation:ace-float 6s ease-in-out 2s infinite}
              .ace-f3{animation:ace-float 6s ease-in-out 4s infinite}
              @keyframes ace-pulse{0%,100%{opacity:0.12}50%{opacity:0.28}}
              @keyframes ace-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
            </style>
          </defs>
          <circle class="ace-orb ace-p1" cx="340" cy="185" r="60"/>
          <circle class="ace-orb ace-p2" cx="340" cy="185" r="105"/>
          <circle class="ace-orb ace-p3" cx="340" cy="185" r="150"/>
          <line class="ace-spoke" x1="340" y1="185" x2="245" y2="110"/>
          <line class="ace-spoke" x1="340" y1="185" x2="440" y2="108"/>
          <line class="ace-spoke" x1="340" y1="185" x2="460" y2="218"/>
          <line class="ace-spoke" x1="340" y1="185" x2="390" y2="290"/>
          <line class="ace-spoke" x1="340" y1="185" x2="232" y2="262"/>
          <line class="ace-spoke" x1="340" y1="185" x2="220" y2="185"/>
          <g class="ace-f1"><circle class="ace-core" cx="340" cy="185" r="22"/><circle class="ace-ring" cx="340" cy="185" r="22"/><circle class="ace-bright" cx="340" cy="185" r="8"/></g>
          <g class="ace-f2"><circle class="ace-core" cx="245" cy="110" r="12"/><circle class="ace-ring" cx="245" cy="110" r="12"/><circle class="ace-bright" cx="245" cy="110" r="4"/></g>
          <text class="ace-lbl" x="183" y="105" text-anchor="middle">workstream</text>
          <g class="ace-f3"><circle class="ace-core" cx="440" cy="108" r="14"/><circle class="ace-ring" cx="440" cy="108" r="14"/><circle class="ace-bright" cx="440" cy="108" r="5"/></g>
          <text class="ace-lbl" x="490" y="103" text-anchor="middle">workstream</text>
          <g class="ace-f1"><circle class="ace-core" cx="460" cy="218" r="10"/><circle class="ace-ring" cx="460" cy="218" r="10"/><circle class="ace-bright" cx="460" cy="218" r="3.5"/></g>
          <g class="ace-f2"><circle class="ace-core" cx="390" cy="290" r="11"/><circle class="ace-ring" cx="390" cy="290" r="11"/><circle class="ace-bright" cx="390" cy="290" r="4"/></g>
          <g class="ace-f3"><circle class="ace-core" cx="232" cy="262" r="13"/><circle class="ace-ring" cx="232" cy="262" r="13"/><circle class="ace-bright" cx="232" cy="262" r="4.5"/></g>
          <text class="ace-lbl" x="175" y="277" text-anchor="middle">workstream</text>
          <g class="ace-f1"><circle class="ace-core" cx="220" cy="185" r="9"/><circle class="ace-ring" cx="220" cy="185" r="9"/><circle class="ace-bright" cx="220" cy="185" r="3"/></g>
          <text class="ace-h" x="340" y="350" text-anchor="middle">No workstreams yet</text>
          <text class="ace-sub" x="340" y="374" text-anchor="middle">Workstreams group your meetings into themes you can navigate</text>
          <rect x="260" y="390" width="160" height="28" rx="3" class="ace-cta-bg"/>
          <text class="ace-cta-t" x="340" y="409" text-anchor="middle">+ create workstream</text>
        </svg>
      </div>`;
    state.container.appendChild(empty);

    // SVG CTA button wires to the same event as before
    empty.querySelector('rect.ace-cta-bg')?.addEventListener('click', () => {
      _emit('accord:constellation-create-workstream', { source: 'empty-state' });
    });
    empty.querySelector('text.ace-cta-t')?.addEventListener('click', () => {
      _emit('accord:constellation-create-workstream', { source: 'empty-state' });
    });
  }

  function _renderConstellation() {
    const VBS  = TUNE.VIEWBOX_SIZE;
    const cx   = VBS / 2;
    const cy   = VBS / 2;
    const half = VBS / 2;

    const svg = _svg('svg', {
      class: 'ac-svg',
      viewBox: `0 0 ${VBS} ${VBS}`,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': 'Workstream constellation',
    });

    // Decorative ring guides (very subtle, behind nodes)
    [TUNE.RING_RADIUS_INNER, TUNE.RING_RADIUS_MIDDLE, TUNE.RING_RADIUS_OUTER].forEach(f => {
      svg.appendChild(_svg('circle', {
        class: 'ac-ring-guide',
        cx, cy, r: half * f,
      }));
    });

    // Layout: bucket by ring, distribute evenly per ring with -π/2 start
    const buckets = { inner: [], middle: [], outer: [] };
    state.workstreams.forEach(w => buckets[w._ring].push(w));
    // Sort each bucket by weight desc so heaviest sits at the top of each ring
    Object.values(buckets).forEach(arr => arr.sort((a, b) => b._weight - a._weight));

    const ringR = {
      inner:  half * TUNE.RING_RADIUS_INNER,
      middle: half * TUNE.RING_RADIUS_MIDDLE,
      outer:  half * TUNE.RING_RADIUS_OUTER,
    };

    Object.entries(buckets).forEach(([ringName, list]) => {
      const N = list.length;
      if (!N) return;
      const R = ringR[ringName];
      list.forEach((w, i) => {
        // Evenly distribute; start at top (-π/2). For N=1, place at top.
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / N;
        const x = cx + R * Math.cos(angle);
        const y = cy + R * Math.sin(angle);
        svg.appendChild(_renderNode(w, x, y));
      });
    });

    state.container.appendChild(svg);
    state.svg = svg;
  }

  function _renderNode(w, x, y) {
    const wn = w._weight / state.weightMax;        // 0..1 weight-norm
    const r  = TUNE.NODE_RADIUS_MIN +
               (TUNE.NODE_RADIUS_MAX - TUNE.NODE_RADIUS_MIN) * wn;
    const glowR = r + TUNE.GLOW_RADIUS_PAD * wn;

    const g = _svg('g', {
      class: 'ac-node',
      'data-ws-id': w.workstream_id,
      tabindex: '0',
      role: 'button',
      'aria-label': `${w.name} — ${w._nTotal} meeting${w._nTotal === 1 ? '' : 's'}`,
    });

    // Glow halo
    g.appendChild(_svg('circle', {
      class: 'ac-node-glow',
      cx: x, cy: y, r: glowR,
      style: `opacity:${(0.20 + 0.55 * wn).toFixed(3)}`,
    }));

    // Node body
    g.appendChild(_svg('circle', {
      class: 'ac-node-body',
      cx: x, cy: y, r: r,
    }));

    // Inner highlight rim
    g.appendChild(_svg('circle', {
      class: 'ac-node-rim',
      cx: x, cy: y, r: r,
    }));

    // Label
    const labelY = y + r + TUNE.LABEL_OFFSET;
    const label = _svg('text', {
      class: 'ac-node-label',
      x: x, y: labelY,
      'text-anchor': 'middle',
    });
    label.textContent = w.name;
    g.appendChild(label);

    // Sub-count chip (small, beside label) — only if subs exist
    if (w._subCount > 0) {
      const chipY = labelY + 16;
      const chip = _svg('text', {
        class: 'ac-node-subchip',
        x: x, y: chipY,
        'text-anchor': 'middle',
      });
      chip.textContent = `${w._subCount} sub-workstream${w._subCount === 1 ? '' : 's'}`;
      g.appendChild(chip);
    }

    // Interactions
    g.addEventListener('mouseenter', (ev) => _showTooltip(w, ev));
    g.addEventListener('mousemove',  (ev) => _moveTooltip(ev));
    g.addEventListener('mouseleave', _hideTooltip);

    g.addEventListener('click', (ev) => {
      ev.stopPropagation();
      _emit('accord:constellation-node-click', {
        workstream_id: w.workstream_id,
        name: w.name,
      });
    });

    g.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      _showMenu(w, ev);
    });

    g.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        _emit('accord:constellation-node-click', {
          workstream_id: w.workstream_id,
          name: w.name,
        });
      }
    });

    return g;
  }

  // ── Tooltip ─────────────────────────────────────────────────
  function _showTooltip(w, ev) {
    const tt = state.tooltip;
    if (!tt) return;
    const lastTouch = w._lastMs ? _humanDate(w._lastMs) : '—';
    const recentLine = w._nRecent > 0
      ? `${w._nRecent} in last ${TUNE.MEETING_RECENT_DAYS}d`
      : `quiet · last touch ${Math.round(w._daysSince)}d ago`;
    tt.innerHTML = `
      <div class="ac-tt-name">${esc(w.name)}</div>
      <div class="ac-tt-row"><span class="ac-tt-label">Meetings</span>
        <span class="ac-tt-val">${w._nTotal} total · ${recentLine}</span></div>
      <div class="ac-tt-row"><span class="ac-tt-label">Open substrate</span>
        <span class="ac-tt-val">${w._nOpen} unsealed</span></div>
      <div class="ac-tt-row"><span class="ac-tt-label">Last activity</span>
        <span class="ac-tt-val">${esc(lastTouch)}</span></div>
      ${w._subCount > 0 ? `<div class="ac-tt-row"><span class="ac-tt-label">Sub-workstreams</span><span class="ac-tt-val">${w._subCount}</span></div>` : ''}`;
    tt.style.display = 'block';
    _moveTooltip(ev);
  }

  function _moveTooltip(ev) {
    const tt = state.tooltip;
    if (!tt || tt.style.display === 'none') return;
    const rect = state.container.getBoundingClientRect();
    const px = ev.clientX - rect.left + 14;
    const py = ev.clientY - rect.top + 14;
    // Clamp so tooltip stays inside container
    const maxX = rect.width  - tt.offsetWidth  - 8;
    const maxY = rect.height - tt.offsetHeight - 8;
    tt.style.left = Math.max(8, Math.min(px, maxX)) + 'px';
    tt.style.top  = Math.max(8, Math.min(py, maxY)) + 'px';
  }

  function _hideTooltip() {
    if (state.tooltip) state.tooltip.style.display = 'none';
  }

  // ── Context menu ────────────────────────────────────────────
  function _showMenu(w, ev) {
    const m = state.menu;
    if (!m) return;
    _hideTooltip();
    m.innerHTML = `
      <div class="ac-menu-header">${esc(w.name)}</div>
      <button type="button" class="ac-menu-item" data-action="rename">Rename…</button>
      <button type="button" class="ac-menu-item" data-action="archive">Archive…</button>
      ${w._subCount > 0
        ? `<button type="button" class="ac-menu-item" data-action="view-subs">View ${w._subCount} sub-workstream${w._subCount === 1 ? '' : 's'}</button>`
        : `<button type="button" class="ac-menu-item ac-menu-item-disabled" disabled>No sub-workstreams</button>`}`;
    m.style.display = 'block';

    const rect = state.container.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    const maxX = rect.width  - m.offsetWidth  - 8;
    const maxY = rect.height - m.offsetHeight - 8;
    m.style.left = Math.max(8, Math.min(px, maxX)) + 'px';
    m.style.top  = Math.max(8, Math.min(py, maxY)) + 'px';

    m.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        _hideMenu();
        _emit('accord:constellation-action', {
          action,
          workstream_id: w.workstream_id,
          name: w.name,
        });
      });
    });
  }

  function _hideMenu() {
    if (state.menu) state.menu.style.display = 'none';
  }

  // ── Helpers ─────────────────────────────────────────────────
  function _svg(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      el.setAttribute(k, v);
    });
    return el;
  }

  function _emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function _humanDate(ms) {
    try {
      const d = new Date(ms);
      const days = Math.round((Date.now() - ms) / 86400000);
      if (days <= 0)   return 'today';
      if (days === 1)  return 'yesterday';
      if (days < 7)    return `${days} days ago`;
      if (days < 30)   return `${Math.round(days / 7)}w ago`;
      return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return '—'; }
  }

  // ── Expose ──────────────────────────────────────────────────
  window.AccordConstellation = {
    init,
    refresh,
    setTune,
    getTune,
  };
})();