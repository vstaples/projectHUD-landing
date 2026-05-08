# Commission · CMD-ACCORD-CONSTELLATION-ENTRY-1 · Phase 4b (Drag-drop + lifecycle affordances)

**Status:** Phase 4a closed; Phase 4b commissioned 2026-05-08
**Operator:** Vaughn Staples
**Architect:** Claude (post-handoff)
**Scope this engagement:** Phase 4b — original commissioned scope + bundled enhancement scope (operator-authorized via Q5 option 3)

---

## §1 — Phase 4a close-out acknowledgment

Phase 4a close-out received. All commissioned deliverables shipped; 7 operator-found defects patched and verified. Two doctrine candidates (optional-chaining silent-noop, param-state double-write) recorded at 1 data point each. Style Doctrine palette claim at 3 — **ratify as Style Doctrine clause this Phase**, not Iron Rule. IR71 (cross-module Phase 1 survey) ratifiable at operator's discretion.

---

## §2 — Phase 4b deliverables

### Original commissioned scope (Phase 4b §3 of prior commission)

1. **Drag-and-drop wiring** — parking-lot meeting → drop targets:
   - constellation node (top-level workstream file)
   - tree workstream/sub-workstream row
   - workstream-view center pane (files at currently-displayed level)
   - X button on placed meeting → unplaced (parking lot return) via existing `accord.meeting.unplaced` event
2. **Disambiguation modal** when target workstream has sub-workstreams — operator picks parent or sub
3. **Pipeline kanban pattern adopted verbatim** — Phase 1 D4 reference (lines 2613-2710); HTML5 native, no library
4. **Touch fallback** — long-press = right-click equivalent; drag-drop deferred for mobile per Q-CE-8
5. **Constellation keyboard navigation** — arrow keys cycle nodes; ENTER descends; pairs with drag-drop a11y considerations

### Bundled enhancement scope (operator-authorized via Q5 option 3)

6. **Workstream lifecycle affordances** — rename + archive accessible from:
   - **Left-rail tree:** right-click context menu on `.ac-tree-ws` and `.ac-tree-sub` rows → `Rename…` / `Archive…`
   - **Workstream-view header:** action button group beside title → Rename, Archive (`.ac-btn-secondary`)
   - **Workstream-view sub-list rows:** hover-revealed action buttons mirroring parking-lot's `file…` pattern → Rename, Archive
   - All four routes converge on `AccordWorkstreams.openRename(id)` and new `AccordWorkstreams.openArchiveConfirm(id)`

7. **Source-of-truth constraint (per Q4):** `archiveWorkstream(id)` (bare confirm) is **REPLACED** by `openArchiveConfirm(id)`. Public API loses `archiveWorkstream`, gains `openArchiveConfirm`. No wrapping, no backwards-compat shim — bare-confirm path lingering would be a future bug magnet.

8. **Mid-detail confirmation modal (per Q2):**
   - Enumerated sub-workstream names when archiving sub-bearing workstream
   - Meeting count when meetings_count ≤ 10: enumerated meeting titles
   - Meeting count when meetings_count > 10: count-only ("12 meetings will return to the parking lot")
   - Reuse `#rerenderConfirmModal` backdrop pattern (existing in `accord.html`)
   - Replaces existing native `confirm()` in archive flow

9. **Language alignment (per Q1):** all new UI affordances read "Archive" — not "Delete." Substrate operation unchanged (still `state = 'archived'` with cascade trigger). Operator's "delete" intent → archive in substrate truth.

10. **Restore parity (per Q3):** **NO restore affordance** in constellation / tree / workstream-view. Legacy management surface retains restore role until Phase 5 closure plans the future of that surface. Document this constraint in code comment so Phase 5 architect doesn't reintroduce.

### Doctrine ratification this Phase

11. **Style Doctrine clause: module-specific palette discipline.** Add clause to Style Doctrine v1.7 (or successor): "Module-specific palettes must reference the module's own tokens. Tokens borrowed from inspiration-source modules (e.g., Compass's cyan during Accord work) must be swapped to the consuming module's tokens before commit." 3 data points across Phase 2, Phase 3, Phase 4a establish the pattern under one inspiration source (Compass); promotion to Iron Rule waits for the pattern surviving under different inspiration-source pressure.

---

## §3 — Files (anticipated)

**New files:**
- `js/accord-dnd.js` — drag-drop orchestration, disambiguation modal, touch long-press handler

**Modified files:**
- `accord.html` — script loader extended with `accord-dnd.js`; `#rerenderConfirmModal` reuse for archive confirmation (or extract to shared modal helper if pattern proliferation warrants)
- `js/accord-rails.js` — tree right-click context menu (rename/archive); parking-lot row drag source attributes; constellation node drop target attributes
- `js/accord-views.js` — workstream-view header action buttons; sub-list row hover-revealed actions; workstream-view drop target wiring
- `js/accord-workstreams.js` — public API: `archiveWorkstream` removed, `openArchiveConfirm` added; archive confirmation modal logic
- `js/accord-constellation.js` — keyboard navigation (arrow cycle, ENTER descend); drop target attributes on nodes
- `css/accord-views.css` — sub-list row hover-action styling; modal styling for confirmation
- `css/accord-rails.css` — tree right-click menu styling (or reuse constellation context-menu pattern)
- `css/accord-constellation.css` — drop-target visual feedback (hover-during-drag); keyboard focus indicator

**Style Doctrine update:**
- `Style_Doctrine_v1_7.md` — add module-palette clause; bump to v1.8 or note as amendment

---

## §4 — Discipline (apply throughout)

- **Iron Rule 36/37/40 §1** — terse hand-off; silent work-mode; halt on missing input
- **Iron Rule 64** — verify mental models against codebase. Drag-drop has subtle z-index/pointer-events interactions with hover-revealed action buttons on the same rows; verify both work without conflict
- **Iron Rule 65** — does NOT fire. Client-side rendering only
- **Iron Rule 39** — scope discipline. Bundled enhancement scope is explicitly authorized in this commission. No further scope creep — if operator-found defects emerge during testing, patch within current scope. New scope-extensions halt for architect review (same pattern as Phase 4a)
- **IR70 navigational/coaching boundary** — drag-drop is navigational (file/unfile is structural, not coaching). No substrate-coaching surfaces emerge from this Phase
- **Module palette discipline (newly ratified Style Doctrine clause)** — any new tokens use Accord palette; no Compass borrows
- **Cross-module convention** — sessionStorage + localStorage two-tier persistence for any new preferences

---

## §5 — Halt-and-surface terms

End Phase 4b with structured close-out covering:

1. Files created/modified
2. Drag-drop behavior across the four target types (constellation node, tree row, workstream-view, parking-lot return)
3. Disambiguation modal behavior (verified across sub-bearing and sub-less workstreams)
4. Touch fallback verified (long-press → context menu equivalent)
5. Constellation keyboard navigation verified
6. Lifecycle affordances verified across all four surfaces (tree right-click, workstream-view header, sub-list hover, plus existing constellation right-click)
7. Source-of-truth constraint verified (no `archiveWorkstream` callsites remain)
8. Mid-detail confirmation modal verified (≤10 enumeration; >10 count-only)
9. Style Doctrine clause integrated into doctrine canon
10. Smoke summary against full Phase 4 verification gate (brief §7)
11. Any IR64 findings
12. Open notes for Phase 5 closure

---

## §6 — Doctrine queue update

| Candidate | Pre-4b | Notes |
|---|---|---|
| Cross-module Phase 1 survey | 4 — ratifiable as IR71 | Operator's call when |
| Style Doctrine palette claim | 3 — **ratify this Phase as Style Doctrine clause** | Iron Rule promotion waits for different inspiration-source pressure |
| Optional-chaining silent-noop antipattern | 1 | Watch for non-toggle-binding manifestations |
| Param-state double-write antipattern | 1 | Watch for shape variations |
| Deploy-incident / filename log-duplication | 1 | Same fingerprint across two incidents; stays at 1 |
| F-P3-6 navigational-classification | 2 (unchanged) | No new RLS this Phase |
| F-P4-9 state-aware UPDATE RLS WITH CHECK | 2 (unchanged) | No UPDATE policies this Phase |

---

## §7 — Reference set (Phase 4b)

- `phase-4a-closeout-cmd-accord-constellation-entry-1.md` — Phase 4a final state
- `mid-phase-4a-handoff-cmd-accord-constellation-entry-1.md` — defect-iteration context (informative)
- `commission-cmd-accord-constellation-entry-1-phase-4.md` — original Phase 4 commission (still informative)
- `brief-cmd-accord-constellation-entry-1.md` — updated brief
- `scaffolding-cmd-accord-constellation-entry-1-v3.md` — updated scaffolding
- `Iron_Rules_66-70_Ratification_Request.md` — doctrine canon
- `Style_Doctrine_v1_7.md` — receives module-palette clause this Phase
- `aegis-MASTER-handoff-2026-05-08.md` — build state
- Pipeline kanban file (lines 2613-2710) — drag-drop pattern reference
- All Phase 2/3/4a module files — Phase 4b extends, doesn't rewrite

---

*Commission CMD-ACCORD-CONSTELLATION-ENTRY-1 · Phase 4b · Drag-drop + lifecycle affordances.*
