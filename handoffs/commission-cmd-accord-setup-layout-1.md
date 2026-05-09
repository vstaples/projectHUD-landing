# Commission · CMD-ACCORD-SETUP-LAYOUT-1

**Phase:** 1 of Wave 1 — Foundation layout restructure
**Authored:** 2026-05-09
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Accord Meeting Setup Shell — Requirements Specification v1.0 §2, §12
**Predecessor:** CMD-ACCORD-MEETING-SETUP-1 sealed (all phases)
**Successor:** CMD-ACCORD-SETUP-HEADER-1 (blocked on this CMD)
**Coding agent:** execute sequentially; halt-and-surface after §8

---

## §1 — Scope

This CMD establishes the structural shell only. No column content. No header content. No footer logic. No filmstrip content.

**Deliverables:**
1. 4-zone CSS grid (`header / columns / filmstrip / footer`) occupying the full page content area
2. Three-column layout with drag-resize handles and localStorage persistence
3. Mockup v5 token palette applied to the Setup shell
4. Filmstrip zone with drag-resize handle (height only)
5. Placeholder zones for all content (correct class names, empty)
6. Full-page host mechanism (hides workstreams rail when Setup is active)
7. All Wave 2 affordance hooks present but inactive (tab containers, intelligence mode trigger stub)
8. All 8 smoke tests pass

**What does NOT ship in this CMD:**
- Any column content (briefing, agenda, attendees)
- Header fields (title, stakes, schedule meta)
- Footer verdict/budget/buttons
- Filmstrip frame rendering
- Tab rotation logic
- Intelligence Mode overlay
- Any substrate calls

---

## §2 — IR64 verification (before writing any code)

**V1 — Current `.ac-view-host` dimensions and positioning:**
```javascript
// In browser console on a page showing a meeting Setup shell:
var h = document.querySelector('.ac-view-host');
JSON.stringify(h.getBoundingClientRect());
```
Need: current width, height, top offset. Confirms whether `.ac-view-host` is already full-width or shares space with the workstreams rail.

**V2 — Workstreams rail selector:**
```javascript
// Find the left rail element
document.querySelector('.ac-left-rail, .ac-workstreams-rail, #accord-workstreams, [class*="workstream"][class*="rail"]')?.className;
```
Need: exact class name of the left workstreams sidebar so the full-page mechanism can hide it correctly.

**V3 — `hud-shell.js` content host selector:**
Search `hud-shell.js` for the element that hosts page content (the div that `accord-transitions.js` mounts `.ac-view-host` into). Need the exact container class/ID. The 4-zone grid must size correctly within it.

**V4 — Current `accord-meeting-setup.css` column class names:**
```bash
grep -n "ac-setup\|ac-setup-col\|ac-setup-body\|ac-setup-shell" /path/to/accord-meeting-setup.css | head -30
```
Document existing class names. The restructure may rename them; confirm which names are referenced in `accord-meeting-setup.js` and `accord-capture.js` (Phase 5 added wireBadgesIn calls that reference setup DOM).

Report all four in close-out before writing any CSS.

---

## §3 — Full-page host mechanism

The Setup shell must occupy the full content area, hiding the workstreams rail. Two approaches — agent selects the correct one based on V2/V3 findings:

**Option A (preferred): CSS class toggle on the content host.**
When `AccordMeetingSetup.render()` fires, add class `accord-setup-fullpage` to the `hud-shell` content host. When `AccordMeetingSetup.teardown()` fires, remove it. CSS:
```css
.accord-setup-fullpage .ac-left-rail { display: none; }
.accord-setup-fullpage .ac-view-host { width: 100%; }
```

**Option B: Direct style on the rail element.**
If the rail is not a sibling of the content host (making CSS class toggle impractical), `render()` sets `rail.style.display = 'none'` directly and `teardown()` restores it. IR71-safe: store the reference in a module var at render time; restore in teardown from the same reference.

Document which option was used and why in close-out.

**Teardown requirement:** the full-page mechanism MUST be undone in `teardown()`. If the operator navigates away from a Setup shell (e.g. clicks a running meeting in the workstreams list), the rail must reappear. This is a regression risk — smoke test 7 covers it.

---

## §4 — 4-zone CSS grid

The Setup shell's outermost container (`.ac-setup-shell`) becomes the 4-zone grid host:

```css
.ac-setup-shell {
  display: grid;
  grid-template-rows: auto 1fr 102px 54px;
  grid-template-areas:
    "header"
    "columns"
    "filmstrip"
    "footer";
  height: 100%;          /* fills .ac-view-host */
  min-height: 0;         /* prevents grid overflow */
  background: var(--ac-bg-deep);
  overflow: hidden;
}
```

Child zone selectors:
```css
.ac-setup-header   { grid-area: header;    }
.ac-setup-columns  { grid-area: columns;   min-height: 0; overflow: hidden; }
.ac-setup-filmstrip{ grid-area: filmstrip; }
.ac-setup-footer   { grid-area: footer;    }
```

---

## §5 — Three-column layout

`.ac-setup-columns` is a CSS grid with three column children:

```css
.ac-setup-columns {
  display: grid;
  grid-template-columns: var(--col-left-w, 360px) 1fr var(--col-right-w, 380px);
  grid-template-areas: "col-left col-center col-right";
  height: 100%;
  overflow: hidden;
}
.ac-setup-col-left   { grid-area: col-left;   overflow-y: auto; position: relative; border-right: 1px solid var(--ac-border-subtle); }
.ac-setup-col-center { grid-area: col-center; overflow-y: auto; position: relative; }
.ac-setup-col-right  { grid-area: col-right;  overflow-y: auto; position: relative; border-left: 1px solid var(--ac-border-subtle); }
```

`--col-left-w` and `--col-right-w` are CSS custom properties on `.ac-setup-columns`, set by JS drag logic and initialized from localStorage.

### §5.1 — Drag handles

Each handle is a `4px` wide absolutely-positioned div on the right border of `.ac-setup-col-left` and the right border of `.ac-setup-col-center`:

```html
<div class="ac-col-handle ac-col-handle--left"  data-handle="left"></div>
<div class="ac-col-handle ac-col-handle--right" data-handle="right"></div>
```

```css
.ac-col-handle {
  position: absolute;
  top: 0; bottom: 0;
  width: 8px;           /* wider hit target than visual */
  cursor: col-resize;
  z-index: 10;
  background: transparent;
}
.ac-col-handle:hover,
.ac-col-handle.dragging {
  background: var(--ac-border-active);
}
.ac-col-handle--left  { right: -4px; }
.ac-col-handle--right { right: -4px; }
```

### §5.2 — Drag logic (JS, in `accord-meeting-setup.js`)

Module-level vars:
```javascript
var _colDrag = { active: false, handle: null, startX: 0, startLeftW: 0, startRightW: 0 };
var COL_MIN_W = 260;
var COL_MAX_W = 600;
var LS_KEY_LEFT  = 'accord-setup-col-left-w';
var LS_KEY_RIGHT = 'accord-setup-col-right-w';
```

`mousedown` on a handle:
```javascript
function _onHandleMouseDown(ev) {
  var handle = ev.currentTarget;
  var cols = document.querySelector('.ac-setup-columns');
  if (!cols) return;
  var cs = getComputedStyle(cols);
  _colDrag.active    = true;
  _colDrag.handle    = handle.dataset.handle;
  _colDrag.startX    = ev.clientX;
  _colDrag.startLeftW  = parseInt(cs.getPropertyValue('--col-left-w'))  || 360;
  _colDrag.startRightW = parseInt(cs.getPropertyValue('--col-right-w')) || 380;
  handle.classList.add('dragging');
  document.addEventListener('mousemove', _onHandleMouseMove);
  document.addEventListener('mouseup',   _onHandleMouseUp);
  ev.preventDefault();
}
```

`mousemove`:
```javascript
function _onHandleMouseMove(ev) {
  if (!_colDrag.active) return;
  var dx = ev.clientX - _colDrag.startX;
  var cols = document.querySelector('.ac-setup-columns');
  if (!cols) return;
  if (_colDrag.handle === 'left') {
    var newW = Math.max(COL_MIN_W, Math.min(COL_MAX_W, _colDrag.startLeftW + dx));
    cols.style.setProperty('--col-left-w', newW + 'px');
  } else {
    var newW = Math.max(COL_MIN_W, Math.min(COL_MAX_W, _colDrag.startRightW - dx));
    cols.style.setProperty('--col-right-w', newW + 'px');
  }
}
```

`mouseup`:
```javascript
function _onHandleMouseUp(ev) {
  if (!_colDrag.active) return;
  _colDrag.active = false;
  document.querySelectorAll('.ac-col-handle.dragging').forEach(function(h) {
    h.classList.remove('dragging');
  });
  document.removeEventListener('mousemove', _onHandleMouseMove);
  document.removeEventListener('mouseup',   _onHandleMouseUp);
  // Persist
  var cols = document.querySelector('.ac-setup-columns');
  if (cols) {
    var cs = getComputedStyle(cols);
    try {
      localStorage.setItem(LS_KEY_LEFT,  cs.getPropertyValue('--col-left-w').trim());
      localStorage.setItem(LS_KEY_RIGHT, cs.getPropertyValue('--col-right-w').trim());
    } catch(e) {}
  }
}
```

Initialize from localStorage in `render()`:
```javascript
function _initColWidths() {
  var cols = document.querySelector('.ac-setup-columns');
  if (!cols) return;
  try {
    var lw = localStorage.getItem(LS_KEY_LEFT);
    var rw = localStorage.getItem(LS_KEY_RIGHT);
    if (lw) cols.style.setProperty('--col-left-w', lw);
    if (rw) cols.style.setProperty('--col-right-w', rw);
  } catch(e) {}
}
```

IR71: all DOM references re-queried inside each handler. `_colDrag` state uses primitives only (no DOM refs). `teardown()` removes `mousemove` and `mouseup` listeners if drag is in-flight.

---

## §6 — Filmstrip zone drag-resize

`.ac-setup-filmstrip` has a drag handle on its top border:

```html
<div class="ac-filmstrip-handle"></div>
<div class="ac-filmstrip-content"></div>
```

```css
.ac-setup-filmstrip {
  position: relative;
  background: var(--ac-bg-pane);
  border-top: 1px solid var(--ac-border-subtle);
  border-bottom: 1px solid var(--ac-border-subtle);
  overflow: hidden;
  /* height controlled by grid-template-rows on .ac-setup-shell */
}
.ac-filmstrip-handle {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 8px;
  cursor: row-resize;
  z-index: 10;
  background: transparent;
}
.ac-filmstrip-handle:hover,
.ac-filmstrip-handle.dragging {
  background: var(--ac-border-active);
}
.ac-filmstrip-content {
  height: 100%;
  overflow: hidden;
  /* placeholder: empty in this CMD */
}
```

Filmstrip height is controlled by updating `.ac-setup-shell`'s `grid-template-rows` third value. JS drag mechanic mirrors the column handle pattern. Constraints: min 48px, max 350px. Persist to `localStorage('accord-setup-filmstrip-h')`.

Module-level vars:
```javascript
var LS_KEY_FILM = 'accord-setup-filmstrip-h';
var FILM_MIN_H = 48;
var FILM_MAX_H = 350;
```

On `mousedown` on `.ac-filmstrip-handle`:
- Record `startY` and current filmstrip height (read from `grid-template-rows` or `offsetHeight`)
- On `mousemove`: compute `newH = startH - (ev.clientY - startY)`, clamp, update grid rows string
- On `mouseup`: persist, remove listeners

Initialize filmstrip height from localStorage in `render()`.

---

## §7 — Token palette

All new CSS uses the mockup v5 tokens via prefixed custom properties. Define on `.ac-setup-shell`:

```css
.ac-setup-shell {
  --ac-bg-deep:       #0a0e14;
  --ac-bg-pane:       #11161e;
  --ac-bg-elevated:   #161c26;
  --ac-bg-tile:       #1a212c;
  --ac-border-subtle: rgba(255,255,255,0.06);
  --ac-border-mid:    rgba(255,255,255,0.12);
  --ac-border-active: rgba(94,234,212,0.4);
  --ac-text-primary:  #e8edf2;
  --ac-text-secondary:#8a95a5;
  --ac-text-tertiary: #5a6678;
  --ac-text-faint:    #3a4456;
  --ac-cyan:          #5eead4;
  --ac-cyan-dim:      rgba(94,234,212,0.15);
  --ac-amber:         #fbbf77;
  --ac-amber-dim:     rgba(251,191,119,0.18);
  --ac-rose:          #fb7185;
  --ac-rose-dim:      rgba(251,113,133,0.18);
  --ac-violet:        #a78bfa;
  --ac-violet-dim:    rgba(167,139,250,0.18);
  --ac-green:         #4ade80;
  --ac-green-dim:     rgba(74,222,128,0.18);
  --ac-font-sans:     -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif;
  --ac-font-mono:     "SF Mono", "JetBrains Mono", "Fira Code", Menlo, monospace;
  --ac-font-serif:    "Lora", "Charter", "Georgia", serif;
}
```

**Token scope rule:** all CSS for the Setup shell uses `--ac-*` prefixed tokens only. Do NOT use the existing Accord production palette tokens (`--signal`, `--surface-raised`, etc.) in Setup shell styles. This enforces the visual identity separation (spec §12.3). The running-meeting 5-tab shell retains its own palette; the two surfaces are visually distinct by design.

---

## §8 — Wave 2 affordance hooks (present but inactive)

These structural elements must exist in the rendered HTML so Wave 2 CMDs can wire them without structural changes. They render as empty containers in this CMD.

### §8.1 — Tab containers (per column)

Each column includes a tab bar and a tab body, both empty:
```html
<!-- Left column -->
<div class="ac-setup-col-left">
  <div class="ac-col-tabbar" data-col="left">
    <!-- Wave 2: tab buttons rendered here -->
  </div>
  <div class="ac-col-tabbody" data-col="left">
    <!-- Wave 2: active tab content rendered here -->
    <!-- CMD-ACCORD-SETUP-LAYOUT-1: placeholder -->
    <div class="ac-col-placeholder">Briefing · coming soon</div>
  </div>
  <div class="ac-col-handle ac-col-handle--left" data-handle="left"></div>
</div>
```

Same pattern for center and right columns. Placeholder text: muted, mono, centered vertically in the available space.

### §8.2 — Intelligence Mode stub

A single empty div at the body level, outside the grid:
```html
<div class="ac-intel-overlay" id="ac-intel-overlay" style="display:none;">
  <!-- Wave 2: CMD-ACCORD-SETUP-INTELLIGENCE-1 populates this -->
</div>
```

`Cmd+I` / `Ctrl+I` keydown listener registered in `render()`, removed in `teardown()`:
```javascript
function _onIntelKey(ev) {
  if ((ev.metaKey || ev.ctrlKey) && ev.key === 'i') {
    ev.preventDefault();
    var overlay = document.getElementById('ac-intel-overlay');
    if (!overlay) return;
    // Wave 2 will replace this stub with full intelligence logic
    console.log('[AccordMeetingSetup] Intelligence Mode: not yet implemented');
  }
}
```

This ensures the keystroke is claimed and doesn't bubble to the browser's default (italic text shortcut). Wave 2 replaces the stub logic without touching the event wiring.

### §8.3 — Gathering mode class hook

`.ac-setup-shell` gets a `data-mode` attribute set to `prep` on render. Gathering mode (Wave 3) changes this to `gathering`. CSS can be pre-authored now:
```css
.ac-setup-shell[data-mode="gathering"] .ac-col-placeholder { /* gathering-specific overrides */ }
```

---

## §9 — HTML structure summary

```html
<!-- Rendered into .ac-view-host by AccordMeetingSetup.render() -->
<div class="ac-setup-shell" data-mode="prep" data-meeting-id="<uuid>">

  <!-- Zone 1: Header (auto height) -->
  <div class="ac-setup-header">
    <!-- Wave 1 CMD-ACCORD-SETUP-HEADER-1 populates this -->
    <div class="ac-zone-placeholder">Header · coming soon</div>
  </div>

  <!-- Zone 2: Columns (1fr) -->
  <div class="ac-setup-columns">

    <!-- Left column -->
    <div class="ac-setup-col-left">
      <div class="ac-col-tabbar" data-col="left"></div>
      <div class="ac-col-tabbody" data-col="left">
        <div class="ac-col-placeholder">Briefing · coming soon</div>
      </div>
      <div class="ac-col-handle ac-col-handle--left" data-handle="left"></div>
    </div>

    <!-- Center column -->
    <div class="ac-setup-col-center">
      <div class="ac-col-tabbar" data-col="center"></div>
      <div class="ac-col-tabbody" data-col="center">
        <div class="ac-col-placeholder">Agenda · coming soon</div>
      </div>
      <div class="ac-col-handle ac-col-handle--right" data-handle="right"></div>
    </div>

    <!-- Right column -->
    <div class="ac-setup-col-right">
      <div class="ac-col-tabbar" data-col="right"></div>
      <div class="ac-col-tabbody" data-col="right">
        <div class="ac-col-placeholder">Attendees · coming soon</div>
      </div>
    </div>

  </div>

  <!-- Zone 3: Filmstrip (102px default) -->
  <div class="ac-setup-filmstrip">
    <div class="ac-filmstrip-handle"></div>
    <div class="ac-filmstrip-content">
      <div class="ac-zone-placeholder">Workstream timeline · coming soon</div>
    </div>
  </div>

  <!-- Zone 4: Footer (54px fixed) -->
  <div class="ac-setup-footer">
    <div class="ac-zone-placeholder">Footer · coming soon</div>
  </div>

</div>

<!-- Intelligence Mode overlay — outside grid, full viewport -->
<div class="ac-intel-overlay" id="ac-intel-overlay" style="display:none;"></div>
```

---

## §10 — `accord-meeting-setup.js` changes

`render(host, meeting, workstreamId)` restructures to:

1. Call `teardown()` (idempotent)
2. Apply full-page mechanism (§3)
3. Write the §9 HTML into `host`
4. Set `window._accordDetachSurfaceHost = _detachHandler`
5. Call `_initColWidths()` (§5.2)
6. Call `_initFilmstripHeight()` (§6)
7. Wire column handle `mousedown` listeners
8. Wire filmstrip handle `mousedown` listener
9. Wire `Cmd+I` / `Ctrl+I` listener (§8.2)

All prior phase render calls (`_renderBriefing`, `_renderAgenda`, `_renderAnticipation`, `_renderFilmstrip`, `_renderFooterDuration`) are **commented out but preserved** — not deleted. They will be reconnected in Wave 1 successor CMDs as each zone is wired. Comment format:
```javascript
// CMD-ACCORD-SETUP-LAYOUT-1: deferred to CMD-ACCORD-SETUP-HEADER-1
// _renderBriefing(meeting, workstreamId);
```

`teardown()` must additionally:
- Undo full-page mechanism
- Remove column handle listeners (if drag in-flight)
- Remove filmstrip handle listeners (if drag in-flight)
- Remove `Cmd+I` listener

---

## §11 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Open an idle meeting | 4-zone grid renders. Header zone visible (placeholder). Three columns visible (placeholder text in each). Filmstrip strip visible at bottom (placeholder). Footer strip visible at very bottom. No console errors. |
| 2 | Drag left column handle right | Left column widens, center column narrows. Right column unchanged. Min/max constraints hold (260px/600px). |
| 3 | Drag left column handle left | Left column narrows to 260px minimum, stops. |
| 4 | Drag right column handle | Right column resizes. Center reflows. Min/max hold. |
| 5 | Reload page after resizing columns | Columns restore to resized widths from localStorage. |
| 6 | Drag filmstrip handle upward | Filmstrip zone expands. Columns zone shrinks. Max 350px. |
| 7 | Navigate away from idle meeting (e.g. click a running meeting in the rail) | Full-page mechanism undone — workstreams rail reappears. No stale Setup DOM in view host. No console errors. |
| 8 | `Cmd+I` / `Ctrl+I` keystroke | Console log fires: `[AccordMeetingSetup] Intelligence Mode: not yet implemented`. Browser does not apply italic to any text element. |

---

## §12 — Files manifest

| File | Change |
|---|---|
| `accord-meeting-setup.js` | `render()` restructured; full-page mechanism; grid HTML; drag logic; Wave 2 hooks; prior phase calls commented-out |
| `accord-meeting-setup.css` | Major restructure; 4-zone grid; 3-column layout; handles; filmstrip; token palette defined; placeholder styles |
| `accord-views.js` | No changes — still calls `AccordMeetingSetup.render(host, m, workstreamId)`; host mechanism transparent |
| `accord-transitions.js` | No changes |
| `version.js` | Operator-managed (IR65) |

---

## §13 — Discipline checklist

- `var` only
- IR71: no DOM refs stored in `_colDrag` state; re-queried in each handler
- IR71: filmstrip drag same pattern — primitives only in drag state
- Full-page mechanism undone in `teardown()` — verified by smoke test 7
- Drag listeners removed in `teardown()` if in-flight drag exists
- `Cmd+I` listener removed in `teardown()`
- All prior phase render calls commented-out with CMD attribution, not deleted
- Wave 2 hooks present but inert — no logic
- Token palette scoped to `.ac-setup-shell` — does not pollute global CSS
- `--ac-*` prefix used exclusively — no `--signal`, no Accord production tokens
- Close-out documents V1–V4 IR64 findings and which full-page Option (A or B) was used

---

**Halt-and-surface after §11. Close-out includes: IR64 V1–V4 findings, full-page mechanism option used, any structural deviation from §9 HTML with rationale.**

**After seal: CMD-ACCORD-SETUP-HEADER-1 is unblocked.**

---

*End Commission · CMD-ACCORD-SETUP-LAYOUT-1.*
