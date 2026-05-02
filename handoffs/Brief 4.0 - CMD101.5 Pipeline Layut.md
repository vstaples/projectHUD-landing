# BRIEF — CMD101.5: Pipeline Layout Reorganization

**Stamp target:** `v20260503-CMD101.05` (operator confirms before delivery)
**Predecessor:** CMD101.01 (current production)
**Scope:** Layout-only change. No new data, no new verbs, no schema changes.

---

## §1. CHANGE SUMMARY

Promote KPI strip + Funnel Velocity + Forecast Summary to **always-visible** above the tab strip. Tabs control only the body content below. Rename `Dashboard` tab → `List`.

---

## §2. NEW PAGE STRUCTURE

```
┌─────────────────────────────────────────────────────────────┐
│ KPI STRIP (6 cards, full width)                             │  always
├──────────────────────────────────────┬──────────────────────┤
│ FUNNEL VELOCITY (~70%)               │ FORECAST SUMMARY     │  always
│                                      │ (~30%, equal height) │
├──────────────────────────────────────┴──────────────────────┤
│ [ List ] [ Board ]                                          │  tabs
├─────────────────────────────────────────────────────────────┤
│ TAB BODY                                                    │  swaps
│                                                             │
│  List mode:    [Active Deals (~70%)] [Alerts + Touch (30%)] │
│  Board mode:   [Kanban — full width, no right rail]         │
└─────────────────────────────────────────────────────────────┘
```

---

## §3. MARKUP CHANGES — `pipeline.html`

### 3.1 Hoist permanent widgets out of `.view-dashboard`

Current structure (CMD101.01):
```html
<div class="hud-tabs">
  <button class="hud-tab active" data-view="dashboard">Dashboard</button>
  <button class="hud-tab" data-view="board">Board</button>
</div>
<section class="view-dashboard">
  [KPI strip]
  [Funnel Velocity]
  [Two-column grid: Active Deals + Right Rail (Forecast/Alerts/Touch)]
</section>
<section class="view-board" hidden>
  [Kanban]
</section>
```

New structure:
```html
<!-- ALWAYS VISIBLE -->
<div class="kpi-strip">
  [6 KPI cards]
</div>

<div class="permanent-row">
  <section class="panel-frame funnel-velocity">[Funnel Velocity]</section>
  <section class="panel-frame forecast-summary">[Forecast Summary — 3 rings]</section>
</div>

<!-- TABS -->
<div class="hud-tabs">
  <button class="hud-tab active" data-view="list">List</button>
  <button class="hud-tab" data-view="board">Board</button>
</div>

<!-- TAB BODY -->
<section class="view-list">
  <div class="list-grid">
    <section class="panel-frame active-deals">[Active Deals]</section>
    <aside class="list-sidebar">
      <section class="panel-frame alerts-stuck">[Alerts — Stuck]</section>
      <section class="panel-frame touch-today">[Touch Today]</section>
    </aside>
  </div>
</section>

<section class="view-board" hidden>
  [Kanban — full width]
</section>
```

### 3.2 Class renames

| Old | New |
|-----|-----|
| `.view-dashboard` | `.view-list` |
| `data-view="dashboard"` | `data-view="list"` |
| Tab label "Dashboard" | "List" |

---

## §4. LAYOUT — `hud.css` (or page-local `<style>`)

### 4.1 Permanent row — Funnel Velocity + Forecast Summary

```css
.permanent-row {
  display: grid;
  grid-template-columns: 1fr 320px;   /* same column ratio as previous list-grid */
  gap: 14px;
  margin-bottom: 14px;
  align-items: stretch;               /* equal heights */
}
```

Forecast Summary panel must shrink internal padding/ring sizes to match Funnel Velocity height.

### 4.2 Forecast Summary compaction

- Ring SVG: reduce from 74×74 → **56×56**
- Ring stroke-width: 6 → **5**
- Ring center text: 16px → **13px**
- Section label margin-bottom: 14px → **10px**
- Panel internal padding: 14/16 → **12/14**

Result: panel height ≈ Funnel Velocity panel (~140px). Confirm visually after build.

### 4.3 List grid (was dashboard-grid, scoped to list view only)

```css
.list-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 14px;
  align-items: start;
}
```

### 4.4 No changes to KPI strip CSS.

---

## §5. JS CHANGES

### 5.1 `pipeline.html` — view-switch handler

Find existing `switchView()` (or equivalent global) and update:
- `'dashboard'` → `'list'` everywhere
- `.view-dashboard` selector → `.view-list`
- Tab label assertion `'Dashboard'` → `'List'`

### 5.2 `cmd-center.js` — Switch View command

If the COMMANDS handler stores or compares view name strings, change:
- `'Dashboard'` → `'List'`
- `'dashboard'` → `'list'`

### 5.3 `hud-shell.js` — capture rule

`.hud-tab` click already extracts label text. Confirm `Switch View "List"` / `Switch View "Board"` is what the recorder emits after rename. No code change expected — label flows from DOM.

### 5.4 Default view on load

Default `data-view="list"` is active. KPI / Funnel / Forecast render unconditionally regardless of view state.

---

## §6. RECORDER IMPLICATIONS

- Existing `Switch View "Dashboard"` script lines become broken (verb still works, but no view named "Dashboard"). Operator should re-record any affected scripts.
- New canonical lines:
  - `Switch View "List"`
  - `Switch View "Board"`
- No other recorder changes.

---

## §7. FILE INVENTORY

| File | Change |
|------|--------|
| `pipeline.html` | Markup hoist + class renames + JS string updates |
| `hud.css` | Add `.permanent-row`, `.list-grid`; adjust forecast-summary internals (or scope locally in pipeline.html) |
| `cmd-center.js` | String rename `Dashboard` → `List` if referenced |
| `hud-shell.js` | None expected (verify) |

No schema changes. No `api.js` changes.

---

## §8. TEST PLAN

- [ ] Page loads with List tab active.
- [ ] KPI strip + Funnel Velocity + Forecast Summary visible above tabs.
- [ ] Funnel Velocity and Forecast Summary panels are equal height.
- [ ] Click `Board` tab → kanban shows full width; KPI/Funnel/Forecast remain visible above; right rail (Alerts/Touch) hidden.
- [ ] Click `List` tab → Active Deals + right rail (Alerts/Touch) reappear.
- [ ] D&D on kanban still works; PATCH persists.
- [ ] Recorder emits `Switch View "List"` / `Switch View "Board"`.
- [ ] Replay of new tab clicks works.

---

## §9. OUT OF SCOPE

- No widget content changes (KPI math, Funnel math, Forecast rings — all unchanged).
- No new verbs.
- No new alerts/scoring logic.
- Existing CMD101.01 script files are not migrated automatically.

---

**End of brief.**
