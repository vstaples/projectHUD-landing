# Commission · CMD-ACCORD-MY-MEETINGS-2

**Phase:** New Architecture Track — My Meetings tabbed rail rework
**Authored:** 2026-05-13
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Operator direction 2026-05-13
**Predecessor:** CMD-ACCORD-MY-MEETINGS-1 sealed (behavioral rework)
**Successor:** CMD-ACCORD-SCHEDULE-1
**IR66 in effect:** Diagnose via console before any file change
**IR67 in effect:** Version + date in every modified file header
**IR68 in effect:** One diagnostic at a time
**IR69 in effect:** Test instructions proactively, one step at a time
**Coding agent:** execute sequentially; halt-and-surface after §8

---

## §1 — Scope

Replace the full-page overlay pattern from CMD-ACCORD-MY-MEETINGS-1 with a
tabbed rail pattern. The left rail panel gets two tabs at the top:

```
[ WORKSTREAMS ]  [ MY MEETINGS ]
```

**WORKSTREAMS tab (default):** Existing rail behavior unchanged — search,
+ NEW WORKSTREAM, workstream/meeting tree.

**MY MEETINGS tab:** Meeting list rendered directly in the rail panel —
LIVE NOW, PENDING YOUR RESPONSE, UPCOMING — in narrow rail-width card format.
No navigation away. Center constellation/meeting view stays put.

**What changes:**
- `accord-rails.js` — tab bar injection + tab switching logic
- `accord-my-meetings.js` — replace full-width render with narrow rail render
- `accord-views.css` — tab bar styles + narrow card styles

**What does NOT change:**
- `accord-my-meetings.js` data fetch logic — reused as-is
- `accord-my-meetings.js` RSVP logic — reused as-is
- `accord-my-meetings.js` refresh timer — reused as-is
- The `window.AccordMyMeetings` public API — keep `open`, `close`, `refresh`
  but remap them to tab activation rather than overlay

**What gets removed:**
- Full-page overlay mount/unmount (`.ac-my-meetings-view` absolute overlay)
- `← Back` button (no longer needed — tab switching replaces it)
- `.ac-rail-personal` nav item injection (replaced by tab)

---

## §2 — IR64 verification (before writing any code)

**V1 — Current rail header structure:**
```javascript
var header = document.querySelector('.ac-rail-header');
console.log('rail header HTML:', header?.outerHTML?.slice(0, 300));
console.log('rail header siblings:',
  Array.from(header?.parentElement?.children || [])
    .map(function(c) { return c.tagName + '.' + (c.className||'').split(' ')[0] + '#' + (c.id||''); })
    .join(' | '));
```

**V2 — Confirm `#ac-my-meetings-nav` current position:**
```javascript
var nav = document.getElementById('ac-my-meetings-nav');
console.log('my-meetings-nav:', nav?.outerHTML?.slice(0, 100) || 'NOT FOUND');
console.log('parent:', nav?.parentElement?.id, nav?.parentElement?.className);
```

**V3 — Confirm `accord-my-meetings.js` public API:**
```javascript
console.log('AccordMyMeetings:', typeof window.AccordMyMeetings);
console.log('methods:', window.AccordMyMeetings ?
  Object.keys(window.AccordMyMeetings).join(', ') : 'not loaded');
```

Report V1–V3 in close-out.

---

## §3 — No substrate changes

All data from existing tables. No migrations.

---

## §4 — Tab bar injection in `accord-rails.js`

### §4.1 — HTML structure target

```
#ac-rail-left
  ├─ .ac-rail-tabs              ← NEW tab bar (replaces .ac-rail-header)
  │    ├─ .ac-rail-tab[data-tab="workstreams"] "WORKSTREAMS" ← active by default
  │    └─ .ac-rail-tab[data-tab="my-meetings"] "MY MEETINGS"
  ├─ .ac-rail-panel[data-panel="workstreams"]  ← wraps existing workstream content
  │    ├─ #ac-tree-search
  │    ├─ #ac-tree-new-btn
  │    └─ .ac-tree-scroll
  └─ .ac-rail-panel[data-panel="my-meetings"]  ← NEW panel, hidden by default
       └─ #ac-mm-rail-content
```

**Note:** The existing `.ac-rail-header` ("WORKSTREAMS" label + collapse btn)
is replaced by the tab bar. The collapse button moves into the tab bar as a
right-aligned control.

### §4.2 — Injection function

```javascript
function _ensureRailTabs() {
  if (document.querySelector('.ac-rail-tabs')) return;  // idempotent

  var railLeft = document.getElementById('ac-rail-left');
  if (!railLeft) return;

  // Remove existing .ac-rail-header (replaced by tabs)
  var oldHeader = railLeft.querySelector('.ac-rail-header');
  var collapseBtn = oldHeader ? oldHeader.querySelector('.ac-rail-collapse') : null;

  // Remove old .ac-my-meetings-nav if present
  var oldNav = document.getElementById('ac-my-meetings-nav');
  if (oldNav) oldNav.remove();

  // Build tab bar
  var tabBar = document.createElement('div');
  tabBar.className = 'ac-rail-tabs';
  tabBar.innerHTML =
    '<button class="ac-rail-tab ac-rail-tab--active" ' +
    'data-tab="workstreams" data-action="rail-tab-switch">WORKSTREAMS</button>' +
    '<button class="ac-rail-tab" ' +
    'data-tab="my-meetings" data-action="rail-tab-switch">MY MEETINGS</button>' +
    (collapseBtn ? collapseBtn.outerHTML : '');

  // Wrap existing workstream content in a panel div
  var wsPanel = document.createElement('div');
  wsPanel.className = 'ac-rail-panel';
  wsPanel.dataset.panel = 'workstreams';

  // Move workstream children into wsPanel
  var search  = document.getElementById('ac-tree-search');
  var newBtn  = document.getElementById('ac-tree-new-btn');
  var scroll  = document.querySelector('.ac-tree-scroll');
  if (search) wsPanel.appendChild(search);
  if (newBtn) wsPanel.appendChild(newBtn);
  if (scroll) wsPanel.appendChild(scroll);

  // My Meetings panel
  var mmPanel = document.createElement('div');
  mmPanel.className = 'ac-rail-panel';
  mmPanel.dataset.panel = 'my-meetings';
  mmPanel.style.display = 'none';
  mmPanel.innerHTML = '<div id="ac-mm-rail-content"></div>';

  // Remove old header, insert new structure
  if (oldHeader) oldHeader.remove();
  railLeft.insertBefore(tabBar, railLeft.firstChild);
  railLeft.appendChild(wsPanel);
  railLeft.appendChild(mmPanel);

  // Wire tab clicks
  tabBar.addEventListener('click', function(ev) {
    var action = ev.target.dataset.action;
    if (action !== 'rail-tab-switch') return;
    var tab = ev.target.dataset.tab;
    _switchRailTab(tab);
  });
}

function _switchRailTab(tab) {
  // Update tab active states
  document.querySelectorAll('.ac-rail-tab').forEach(function(t) {
    t.classList.toggle('ac-rail-tab--active', t.dataset.tab === tab);
  });

  // Show/hide panels
  document.querySelectorAll('.ac-rail-panel').forEach(function(p) {
    p.style.display = p.dataset.panel === tab ? '' : 'none';
  });

  // Load My Meetings content when tab activated
  if (tab === 'my-meetings') {
    if (window.AccordMyMeetings) {
      window.AccordMyMeetings.renderInRail(
        document.getElementById('ac-mm-rail-content')
      );
    }
  } else {
    // Stop My Meetings refresh when switching away
    if (window.AccordMyMeetings) window.AccordMyMeetings.pauseRefresh();
  }
}
```

Call `_ensureRailTabs()` from `_wireChrome()` after existing rail setup.

---

## §5 — `accord-my-meetings.js` rework

### §5.1 — New public API

Replace existing `open` / `close` with rail-aware methods:

```javascript
window.AccordMyMeetings = {
  renderInRail: _renderInRail,   // render into provided container element
  pauseRefresh: _pauseRefresh,   // stop timer when tab not visible
  refresh:      _refresh,        // manual refresh
};
```

### §5.2 — `_renderInRail(container)`

```javascript
function _renderInRail(container) {
  if (!container) return;
  _mmContainer = container;
  container.innerHTML = '<div class="ac-mm-loading">Loading…</div>';
  _fetchAndRender();
  _startRefresh();
}

function _pauseRefresh() {
  _stopRefresh();
}
```

### §5.3 — Narrow card render

Replace `_myMeetingsHtml` with a narrow version. Same three zones, condensed:

```javascript
function _myMeetingsHtml(liveNow, pending, upcoming) {
  var html = '';

  // ── LIVE NOW ──────────────────────────────────────────────
  if (liveNow.length) {
    html += '<div class="ac-mm-zone">';
    html += '<div class="ac-mm-zone-label">● LIVE NOW</div>';
    liveNow.forEach(function(m) {
      html += '<div class="ac-mm-card ac-mm-card--live">';
      html += '<div class="ac-mm-card-title">' + esc(m.title) + '</div>';
      html += '<a class="ac-mm-join-btn" ' +
              'href="/accord.html?meeting=' + esc(m.meeting_id) + '">' +
              'JOIN →</a>';
      html += '</div>';
    });
    html += '</div>';
  }

  // ── PENDING ───────────────────────────────────────────────
  if (pending.length) {
    html += '<div class="ac-mm-zone">';
    html += '<div class="ac-mm-zone-label">PENDING ' +
            '<span class="ac-mm-badge">' + pending.length + '</span></div>';
    pending.forEach(function(m) {
      var dateStr = m.scheduled_for
        ? new Date(m.scheduled_for).toLocaleDateString(undefined,
            { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Date TBD';
      html += '<div class="ac-mm-card ac-mm-card--pending">';
      html += '<div class="ac-mm-card-title">' + esc(m.title) + '</div>';
      html += '<div class="ac-mm-card-meta">' + esc(dateStr) + '</div>';
      html += '<div class="ac-mm-rsvp-row">';
      html += '<button class="ac-mm-rsvp-btn ac-mm-rsvp-accept" ' +
              'data-action="mm-rsvp-accept" ' +
              'data-attendee-id="' + esc(m.attendee_id || '') + '">✓</button>';
      html += '<button class="ac-mm-rsvp-btn ac-mm-rsvp-decline" ' +
              'data-action="mm-rsvp-decline" ' +
              'data-attendee-id="' + esc(m.attendee_id || '') + '">✕</button>';
      html += '</div></div>';
    });
    html += '</div>';
  }

  // ── UPCOMING ──────────────────────────────────────────────
  if (upcoming.length) {
    html += '<div class="ac-mm-zone">';
    html += '<div class="ac-mm-zone-label">UPCOMING</div>';
    upcoming.forEach(function(m) {
      var dateStr = m.scheduled_for
        ? new Date(m.scheduled_for).toLocaleDateString(undefined,
            { weekday: 'short', month: 'short', day: 'numeric' })
        : 'TBD';
      html += '<div class="ac-mm-card ac-mm-card--upcoming" ' +
              'data-action="mm-open-meeting" ' +
              'data-meeting-id="' + esc(m.meeting_id) + '">';
      html += '<div class="ac-mm-card-title">' + esc(m.title) + '</div>';
      html += '<div class="ac-mm-card-meta">' + esc(dateStr) + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  if (!liveNow.length && !pending.length && !upcoming.length) {
    html += '<div class="ac-mm-empty">No upcoming meetings.</div>';
  }

  return html;
}
```

**Key differences from full-width version:**
- No role label on LIVE NOW cards (space constraint)
- No duration on UPCOMING cards
- RSVP buttons are icon-only (✓ / ✕) with tooltips
- No Back button

### §5.4 — Remove overlay methods

Delete `_openMyMeetings`, `_closeMyMeetings`, `_mountPanel`,
`_unmountPanel` — replaced by `_renderInRail`.

---

## §6 — CSS additions to `accord-views.css`

```css
/* ── Rail tab bar ───────────────────────────────────── */
.ac-rail-tabs {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--ac-border-subtle);
  flex-shrink: 0;
  padding: 0 4px;
  gap: 2px;
}
.ac-rail-tab {
  flex: 1;
  font-family: var(--ac-font-mono);
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.9px;
  padding: 9px 4px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--ac-text-faint);
  cursor: pointer;
  text-align: center;
  transition: color 0.15s, border-color 0.15s;
  margin-bottom: -1px;
}
.ac-rail-tab:hover { color: var(--ac-text-tertiary); }
.ac-rail-tab--active {
  color: var(--ac-cyan);
  border-bottom-color: var(--ac-cyan);
}

/* ── Rail panels ────────────────────────────────────── */
.ac-rail-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

/* ── My Meetings narrow cards ───────────────────────── */
#ac-mm-rail-content {
  overflow-y: auto;
  padding: 10px 10px 20px 10px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
}
.ac-mm-zone { display: flex; flex-direction: column; gap: 6px; }
.ac-mm-zone-label {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 1.2px;
  color: var(--ac-text-tertiary);
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0 2px 0;
}
.ac-mm-badge {
  background: var(--ac-amber-dim);
  color: var(--ac-amber);
  border-radius: 8px;
  padding: 1px 5px;
  font-size: 8px;
}
.ac-mm-card {
  background: var(--ac-bg-pane);
  border: 1px solid var(--ac-border-subtle);
  border-radius: 4px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ac-mm-card--live { border-color: rgba(34,197,94,0.3); }
.ac-mm-card--upcoming { cursor: pointer; }
.ac-mm-card--upcoming:hover {
  background: var(--ac-bg-tile);
  border-color: var(--ac-border-mid);
}
.ac-mm-card-title {
  font-size: 11px;
  font-weight: 500;
  color: var(--ac-text-primary);
  line-height: 1.3;
}
.ac-mm-card-meta {
  font-family: var(--ac-font-mono);
  font-size: 8.5px;
  color: var(--ac-text-tertiary);
}
.ac-mm-join-btn {
  display: inline-block;
  margin-top: 4px;
  font-family: var(--ac-font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.6px;
  padding: 5px 10px;
  background: rgba(34,197,94,0.12);
  color: #22c55e;
  border: 1px solid rgba(34,197,94,0.3);
  border-radius: 3px;
  text-decoration: none;
  align-self: flex-start;
}
.ac-mm-join-btn:hover { background: rgba(34,197,94,0.22); }
.ac-mm-rsvp-row { display: flex; gap: 6px; margin-top: 4px; }
.ac-mm-rsvp-btn {
  font-family: var(--ac-font-mono);
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 3px;
  cursor: pointer;
  border: 1px solid;
}
.ac-mm-rsvp-accept {
  background: rgba(34,197,94,0.1);
  color: #22c55e;
  border-color: rgba(34,197,94,0.3);
}
.ac-mm-rsvp-decline {
  background: rgba(251,113,133,0.1);
  color: var(--ac-rose);
  border-color: rgba(251,113,133,0.25);
}
.ac-mm-rsvp-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ac-mm-empty {
  font-size: 11px;
  color: var(--ac-text-faint);
  font-style: italic;
  padding: 8px 0;
}
.ac-mm-loading {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-faint);
  padding: 16px 0;
  text-align: center;
}
```

---

## §7 — Remove obsolete code

From `accord-my-meetings.js` remove:
- `_openMyMeetings()` / `_closeMyMeetings()` overlay functions
- `.ac-my-meetings-view` absolute overlay DOM creation
- `← Back` button HTML and wiring
- `window.AccordMyMeetings.open` / `.close` mappings

From `accord-rails.js` remove:
- `_ensureMyMeetingsRailItem()` function
- Call to `_ensureMyMeetingsRailItem()` in `_wireChrome()`
- `.ac-rail-personal` / `.ac-rail-divider` references if deployed

From `accord-views.css` remove:
- `.ac-rail-personal`, `.ac-rail-divider`, `.ac-rail-workstreams` rules
- `.ac-rail-nav-item`, `.ac-rail-nav-glyph`, `.ac-rail-nav-label` rules
- `.ac-mm-header`, `.ac-mm-title`, `.ac-mm-back` rules (Back button gone)
- `.ac-mm-join-btn` full-width version (replaced by narrow version above)

---

## §8 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Rail tab bar visible | Two tabs at top of rail: WORKSTREAMS (active, cyan underline) and MY MEETINGS. |
| 2 | WORKSTREAMS tab default | On load, WORKSTREAMS tab active. Search, + NEW WORKSTREAM, and tree visible as normal. |
| 3 | Click MY MEETINGS tab | Tab activates (cyan underline). Workstream content hides. MY MEETINGS content loads in rail. |
| 4 | LIVE NOW zone | Running meetings show with green-bordered card and JOIN → link. |
| 5 | PENDING zone | Pending invitations show with ✓ / ✕ buttons. |
| 6 | RSVP Accept inline | Click ✓ → `rsvp_status = accepted` in DB. Card moves on next refresh. |
| 7 | UPCOMING zone | Upcoming meetings listed in date order. Click → navigates to meeting. |
| 8 | Switch back to WORKSTREAMS | Click WORKSTREAMS tab → tree restores. MY MEETINGS refresh paused. |
| 9 | 30s refresh | With MY MEETINGS tab active, new running meeting appears within 30s. |
| 10 | No overlay anywhere | Confirm `.ac-my-meetings-view` absolute overlay does not exist in DOM. |

---

## §9 — Files manifest

| File | Change |
|---|---|
| `accord-rails.js` | Replace `_ensureMyMeetingsRailItem` with `_ensureRailTabs` + `_switchRailTab`; call from `_wireChrome` |
| `accord-my-meetings.js` | Replace overlay render with `_renderInRail`; remove overlay methods; update public API |
| `accord-views.css` | Tab bar + narrow card styles; remove obsolete overlay + nav-item styles |
| `version.js` | Operator-managed (IR65) |

---

## §10 — Discipline checklist

- `var` only
- IR66: console diagnosis before any file change
- IR67: version + date in every modified file header
- IR68: one diagnostic at a time
- IR69: test instructions proactively, one step at a time
- `data-action` on all interactive elements
- `_ensureRailTabs()` is idempotent — guard prevents double injection
- `_switchRailTab` pauses refresh when leaving MY MEETINGS tab
- RSVP uses authenticated `API.patch` — no token needed
- `--ac-*` token values from deployed `accord-meeting-setup.css` per IR66

---

**Halt-and-surface after §8. Close-out must confirm V1–V3 pre-flight,
smoke test 3 (tab switch), and smoke test 10 (no overlay in DOM).**

**After seal: CMD-ACCORD-SCHEDULE-1 is unblocked.**

---

*End Commission · CMD-ACCORD-MY-MEETINGS-2.*
