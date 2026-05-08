# Commission · CMD-ACCORD-CONSTELLATION-ENTRY-1 · Phase 3 (Three-pane layout structure)

**Status:** Phase 2 closed; Phase 3 commissioned 2026-05-08
**Operator:** Vaughn Staples
**Architect:** Claude (post-handoff)
**Scope this engagement:** Phase 3 only — three-pane layout structure with Legacy view rollback toggle, halt-and-surface

---

## §1 — Phase 2 close-out acknowledgment

Phase 2 close-out received and reviewed. All five sections (files, tunable weights, IR64 findings, multi-shape verification, smoke) clear. Three IR64 findings folded into the artifact stack:

- **Palette correction** — scaffolding §3.1 amended in place (cyan/teal → Accord editorial-amber)
- **Brand-new ring placement override** — scaffolding Q-CE-4 amended in place; three states (Active/Brand-new/Aging-or-dormant) codified
- **`scheduled_for` vs `created_at` precedence** — scaffolding Q-CE-4 amended in place; informative for Phase 4 timeline work

Open notes from §6 disposed below.

---

## §2 — Phase 2 open-note dispositions

### `AccordWorkstreams` public API expansion · Option 1

**Disposition:** **expand `AccordWorkstreams` public API** to expose the `create`, `rename`, `archive`, `view-subs` flows. Phase 3 wires the four constellation CustomEvents to those expanded receivers.

**Rationale:** `accord-workstreams.js` already owns these flows internally; exposing them via a thin public-API shim avoids duplication and keeps modal/flow logic single-sourced. `accord-workstreams.js` is already in Phase 3's modified-files list per brief §6, so the shim adds no new surface to the modification scope.

**Phase 3 deliverable adds:** expand `window.AccordWorkstreams` from `{ refresh, openFileModal }` to `{ refresh, openFileModal, openCreateModal, openRenameModal, openArchiveConfirm, openSubsModal }` (or equivalent — agent picks final naming, exposes existing internals, no new behavior).

### IR64 closure — workstreams disambiguation SQL

**Disposition:** **close in Phase 3.** The Phase 2 deferred SQL (`SELECT name, parent_workstream_id, archived_at FROM workstreams`) becomes load-bearing for Phase 3 because the left rail renders parent-child hierarchy and the right rail filters parking-lot. Knowing which filter excluded the second pre-fixture workstream (archived vs sub-workstream) is no longer immaterial.

**Phase 3 Step 1:** run the SQL, document the result inline in the close-out (which filter fired). One paragraph.

### Preview harness disposition

**Disposition:** **move to `/dev/` in Phase 3, not delete.** `accord-constellation-preview.html` retains value for tunable retuning across multi-firm fixture data. Move it out of `/` so it isn't a shipped surface; keep it accessible for ongoing constellation-tuning work. Delete (or formally retire) at Phase 5 closure if no longer used.

### Empty-state regression

**Disposition unchanged:** deferred to Phase 5 closure regression. Not blocking Phase 3.

### Pipeline drag-drop (Phase 4 forward-flag)

**Acknowledged.** Source: right-rail parking-lot row. Targets: left-rail node + center-pane workstream view + constellation node. Pattern documented Phase 1 D4 (Pipeline kanban, lines 2613-2710). Not Phase 3 work, but Phase 3's left-rail and right-rail rendering should leave hooks for the Phase 4 drag-drop wiring (drop targets discoverable; pointer events ungated; no z-index conflicts that Phase 4 has to unwind).

---

## §3 — Phase 3 deliverables

Per brief §4 Phase 3, with refinements absorbed from Phase 2:

1. **`AccordWorkstreams` public API expansion** (per §2 disposition above) — thin shim exposing existing internals; receivers for the four constellation CustomEvents.

2. **IR64 closure SQL** — run, document result. One paragraph in close-out.

3. **Three-pane layout structure in `accord.html`** — left rail (~250px) | center pane (flex) | right rail (~280px). At Phase 3 the center pane shows the Phase 2 constellation when the toggle is in "new view" mode, OR today's five top-level surfaces when the toggle is in "Legacy view" mode.

4. **Left rail (text tree)** — adopts `my-meetings.html` Knowledge Tree patterns:
   - **CSS:** lines 32-66 (`#mtg-tree-panel`, `.mtg-client/.mtg-project/.mtg-stream/.mtg-node`)
   - **DOM:** lines 160-170 markup pattern
   - **Render:** lines 288-330 (`_mtgBuildTree`, `_mtgTreeClient/Project/Stream`)
   - **Wire-up:** lines 420-450 (`_mtgWireTree` — click handlers, expand/collapse, active-node highlight)
   - **Adaptation:** Compass hierarchy is 4 levels (client → project → stream → meeting); Accord left rail is **3 levels** (workstream → sub-workstream → meeting). Skip the topmost client level; map project → workstream, stream → sub-workstream, meeting → meeting.
   - **Naming:** rename CSS classes from `.mtg-*` to `.ac-tree-*` to keep namespaces clean. Reuse vocabulary, not literals.
   - **Active-node highlight:** synchronizes with `Accord.state.level` + `levelContext` per Phase 1 §2 disposition.
   - Updates current-position highlight as operator descends. Collapsible (Q-CE-1) with persistent operator preference (`sessionStorage` + `localStorage` two-tier per Phase 1 §3 cross-module convention).

5. **Right rail (parking lot)** — meetings where `workstream_id IS NULL AND firm_id = my_firm_id()` (firm-shared per Phase 1 Decision 1). Date-sorted by default; alpha-sort toggle (persistent operator preference). Per-meeting display: title, date, sealed/draft indicator, drag handle (Phase 4 wires drag). Empty state: `.doc-empty` shape with single-line "All meetings filed." copy (per Phase 1 D8). Collapsible (Q-CE-2).

6. **"Legacy view" toggle** — visible affordance on the new top-level chrome that flips center pane between (a) constellation + new top-level UI and (b) today's five flat tabs. Rollback safety net for the Phase 4-5 transition window. Stored as `sessionStorage['accord-legacy-view']` per cross-module convention; defaults to new view. Removed at Phase 5 closure.

7. **Layout proportions** — left rail ~250px; right rail ~280px; center pane flex. Per scaffolding §2.

8. **Persistent operator preferences** — collapsed-state of each rail; sort-mode of parking lot; legacy-view toggle state. All via `sessionStorage` + `localStorage` two-tier (Compass convention adopted Phase 1 §3).

9. **Move preview harness to `/dev/`** (per §2 disposition).

---

## §4 — Files (anticipated)

**New files:**
- `js/accord-rails.js` — left rail (tree) + right rail (parking lot) + collapsibility + persistence
- `css/accord-rails.css` — three-pane grid + rail styles + tree node styles (or extend `accord-constellation.css`; agent picks)

**Modified files:**
- `accord.html` — three-pane layout structure; Legacy view toggle; constellation module integration
- `js/accord-workstreams.js` — public API expansion (per §2 disposition)
- `js/accord-core.js` — `Accord.state.level` + `levelContext` + sessionStorage persistence (per Phase 1 §2 disposition)

**Moved:**
- `accord-constellation-preview.html` → `/dev/accord-constellation-preview.html`

**No changes:**
- `accord-constellation.js` / `accord-constellation.css` (Phase 2 work; module is consumed, not modified)
- `version.js` (single-pin bump deferred to Phase 5 per brief)

---

## §5 — Discipline (apply throughout)

- **Iron Rule 36** — terse hand-off
- **Iron Rule 37** — silent work-mode
- **Iron Rule 40 §1** — halt on missing input
- **Iron Rule 64** — verify mental models against codebase. Phase 3 verifies the `my-meetings.html` adaptation against the actual file (line ranges from Phase 2 commission §1 are starting points, not gospel — re-verify if anything reads off)
- **Iron Rule 65** — does NOT fire this Phase. `accord.html` is a HTML loader, not a render-template-body. No Edge Function bytes change. Per-file cache-bust in loader-tag `?v=...` updates as needed (existing convention)
- **Style Doctrine §0.1** — no doctrine modifications without architect/operator ratification. If Phase 3 surfaces a new pattern that doesn't exist in doctrine (e.g., novel rail-collapse affordance), halt and report; don't invent
- **Cross-module convention adopted Phase 1 §3** — `sessionStorage` + `localStorage` two-tier persistence is Compass's convention; Accord adopts it for level state + rail collapse + sort preferences

---

## §6 — Halt-and-surface terms

End Phase 3 with operator-verifiable behavioral checks:

1. Three-pane layout renders (left rail | center pane | right rail) at correct proportions
2. Left rail navigation works — click workstream node, expand/collapse, active-state highlight tracks `Accord.state.level`
3. Right rail parking lot populates correctly (firm-scoped query; date-sorted by default; alpha-sort toggle works)
4. Legacy view toggle flips between new and old top-level UIs cleanly; both states stable
5. Persistent preferences survive refresh (both `sessionStorage` and `localStorage` write/read paths verified)
6. `AccordWorkstreams` public API expanded; the four constellation CustomEvents wire to working flows (create, rename, archive, view-subs)
7. IR64 SQL ran; result documented

**Phase 3 close-out shape:** same as Phase 2 close-out — Files / IR64 findings / Smoke summary / Open notes for Phase 4. One to two pages.

Do NOT anticipate Phase 4 work (drill-down + transitions + drag-drop is the largest phase per brief; gets its own commissioning addendum after Phase 3 review).

---

## §7 — Doctrine queue update

| Candidate | Pre-Phase-3 | Notes |
|---|---|---|
| Cross-module Phase 1 survey | 4 — ratifiable post-CMD as IR71 | Phase 3 actively *uses* the convention (sessionStorage + localStorage two-tier from Compass); reinforces the pattern |
| F-P3-6 navigational-classification | 2 (unchanged) | Phase 3 doesn't author new RLS |
| Style Doctrine palette claim | new candidate (Phase 2 IR64 finding) | "Module-specific palettes must reference the module's own tokens, not borrowed sister-module tokens." 1st data point. Watch for repeats |

---

## §8 — Reference set (Phase 3)

- `commission-cmd-accord-constellation-entry-1-phase-2.md` — Phase 2 commission (still informative)
- `phase-2-closeout-cmd-accord-constellation-entry-1.md` — Phase 2 close-out
- `brief-cmd-accord-constellation-entry-1.md` — updated brief
- `scaffolding-cmd-accord-constellation-entry-1-v3.md` — updated scaffolding (Phase 2 IR64 corrections folded)
- `Iron_Rules_66-70_Ratification_Request.md` — doctrine canon
- `aegis-MASTER-handoff-2026-05-08.md` — build state
- **`my-meetings.html`** — actively adopted in Phase 3 left rail (line ranges in §3 deliverable 4)
- `js/accord-constellation.js` / `css/accord-constellation.css` — Phase 2 module being integrated
- Existing Accord module files (`accord-core.js`, `accord-workstreams.js`, `accord.html`) — modified in Phase 3

---

*Commission CMD-ACCORD-CONSTELLATION-ENTRY-1 · Phase 3 · Three-pane layout structure.*
