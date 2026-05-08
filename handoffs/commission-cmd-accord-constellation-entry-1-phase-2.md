# Commission · CMD-ACCORD-CONSTELLATION-ENTRY-1 · Phase 2 (Constellation visualization)

**Status:** Phase 1 closed; Phase 2 commissioned 2026-05-08
**Operator:** Vaughn Staples
**Architect:** Claude (post-handoff)
**Scope this engagement:** Phase 2 only — constellation rendering, no transitions yet, halt-and-surface

---

## §1 — Phase 1 dispositions (operator-ratified)

The four blockers from your Phase 1 halt-and-surface are resolved as follows. The brief and scaffolding v3 in your reference set have been updated in place to reflect substrate truth; the changes below are recorded here for audit-trail clarity.

### Decision 1 — Gap 1 RLS · Option B (firm-shared parking-lot)

**Disposition:** firm-shared. Parking lot is an organizational scratchpad of unfiled meetings, not strategic intelligence about attendees. Existing `accord_meetings_select` (`firm_id = my_firm_id()`) is sufficient; **no new RLS policy authored in Phase 2.**

**Rationale (operator clarification at Phase 1 review):** IR68's privacy concern is operator-authored content about attendees (Anticipation/Briefing column intelligence in Meeting Setup v3.5 — the "Tom Liu — DISSENT SIMMERING" surface) that would feel surveillance-state if attendees saw it. The parking lot is navigational metadata, not surveillance content. Operator labeled per-organizer parking-lot privacy a low-priority feature.

**Brief §3 IR68 application table updated:**
- Constellation: operator-private → **firm-shared (operator's view of their firm's workstream world)**
- Parking lot: operator-private → **firm-shared (organizational scratchpad of unfiled meetings)**

**F-P3-6 doctrine candidate:** stays at 2 cross-CMD data points. No advancement this CMD. Will advance on next genuine instance (likely CMD-2 NRA Substrate or beyond).

**Future CMD candidate queued:** CMD-ACCORD-PARKING-LOT-PRIVACY-1 (per-organizer parking-lot scoping if requirements emerge later).

### Decision 2 — Naming · option (ii) for this CMD; rename queued separately

**Disposition for this CMD:** option (ii) — brief/scaffolding wording corrected to substrate truth (`workstreams`, not `accord_workstreams`). No substrate change in this CMD. Brief §11 scope discipline preserved.

**Future CMD queued: CMD-ACCORD-NAMING-NORMALIZATION-1** (operator concurs the table SHOULD be `accord_workstreams` to match the rest of the Accord namespace; rename touches FK `accord_meetings.workstream_id`, RLS policies `workstreams_select` / `workstreams_update_active` / `workstreams_update_restore`, indexes, triggers, the 7 `accord.workstream.*` CoC events, and all code references). IR65 fires on that CMD; not bundled into this one.

**For Phase 2:** treat the table as `workstreams`. PostgREST queries already use that name correctly.

### Decision 3 — Compass Knowledge Tree referent · confirmed

**Disposition:** the reference is `my-meetings.html`, dynamically loaded by `loadMyMeetingsView()` in `mw-tabs.js` (same injection pattern as `my-work.html`). Phase 1 file inventory missed it because it's not directly script-loaded by `compass.html`.

**Phase 3 reference (added to your set):** `my-meetings.html`. Specifically:
- **CSS:** lines 32-66 (`#mtg-tree-panel`, `.mtg-client/.mtg-project/.mtg-stream/.mtg-node`, chevron + active-state + outcome dots)
- **DOM:** lines 160-170 (`#mtg-tree-panel` markup, search input, new-button)
- **Render functions:** lines 288-330 (`_mtgBuildTree`, `_mtgTreeClient`, `_mtgTreeProject`, `_mtgTreeStream`)
- **Wire-up:** lines 420-450 (`_mtgWireTree` — click handlers, expand/collapse, active-node highlight)

The Compass hierarchy is four levels (client → project → stream → meeting); Accord's left rail will be three levels (workstream → sub-workstream → meeting). Adopt the rendering vocabulary (chevron expand/collapse, `.mtg-node.active` highlight, outcome dots) and adapt the level-walking logic. Phase 3 work; named here so it's known up-front.

### Decision 4 — Activity-weight derivation · sealed-proxy v1

**Disposition:** Phase 2 v1 uses `sealed_at IS NULL` proxy for thread-active. Compose three weights (recent meetings × 1.0, sealed-proxy commitment count × 0.5, days-since-last-touch × 0.3) as **tunable constants in `accord-constellation.js`** per D6 calibration disposition. Revisit only if calibration reveals over-glow with multi-firm fixture data.

**Forward note:** if CMD-2 (NRA Substrate) or CMD-6 (Counterfactual POC) need true server-side "open" status, that's their scope — likely involves migrating `_statusOf` JS edge logic server-side as a view or function. Not this CMD's problem.

---

## §2 — Updated reference set (Phase 2 onward)

- `brief-cmd-accord-constellation-entry-1.md` — **updated** with substrate-truth corrections (IR68 application table, parking-lot query, naming reference)
- `scaffolding-cmd-accord-constellation-entry-1-v3.md` — **updated** with substrate-truth corrections (§6 query, §6 IR68 check rewritten, §14 IR68 application table)
- `phase-1-halt-surface-cmd-accord-constellation-entry-1.md` — your Phase 1 close document (no changes)
- `Iron_Rules_66-70_Ratification_Request.md` — doctrine canon
- `aegis-MASTER-handoff-2026-05-08.md` — build state
- **NEW:** `my-meetings.html` — Compass Knowledge Tree reference (Phase 3 use; informative for Phase 2 only)

---

## §3 — Phase 2 deliverables

Per brief §4 Phase 2, ship the radial constellation visualization with no transitions yet:

1. **Constellation rendering** — concentric-ring layout per Q-CE-4 thresholds (14d inner / 60d middle / 60d+ outer; tunable constants). Top-level workstreams only (filter `parent_workstream_id IS NULL`).
2. **Activity-weight computation** — sealed-proxy formula per Decision 4. Three weights as tunable constants in `accord-constellation.js`.
3. **Node interactions** — hover (tooltip with workstream name + meeting count + recent activity summary), click (placeholder; full transition added Phase 4), right-click (context menu: rename, archive, view-sub-workstreams).
4. **Empty constellation** — "+ Create your first workstream" prompt for operators with zero workstreams. Adopt `.doc-empty` styling vocabulary (catalogued in Phase 1 D8).
5. **Color/glow conventions** — active workstreams cyan/teal; archived workstreams muted gray (filtered or outer-ring-only).
6. **Labels** — workstream name beneath each node.

**File targets per brief §6:**
- New: `js/accord-constellation.js`, `css/accord-constellation.css`
- Modified: none in Phase 2 (left rail / right rail / `accord.html` integration is Phase 3)

---

## §4 — Discipline (apply throughout)

- **Iron Rule 36** — terse hand-off
- **Iron Rule 37** — silent work-mode
- **Iron Rule 40 §1** — halt on missing input
- **Iron Rule 64** — verify mental models against codebase. Phase 1 already did this for substrate; Phase 2 verifies any rendering assumptions against actual `js/accord-*.js` patterns
- **Iron Rule 65** — does NOT fire this Phase (no render template body changes; client-side rendering only)
- **IR66/67/69/70** — already pressure-tested in Phase 1 D6 walkthrough. Phase 2 implementation honors:
  - Activity-weight glow operates at navigational resolution (per the IR70 boundary statement in brief §4 Phase 1 deliverable 6)
  - Three composite weights exposed as tunables
  - Universal default; no power-user affordances rendered yet (toggles come Phase 3)

---

## §5 — Phase 2 halt-and-surface terms

End Phase 2 with a static constellation operator can view. Halt-and-surface message names:

1. What renders correctly (workstream count, ring distribution, glow distribution)
2. Any architect-mental-model divergence found during implementation
3. Any tunable values that needed mid-Phase adjustment for the visible substrate (currently: 2 workstreams, 36 meetings)
4. Empty-state behavior verified (test by opening with zero-workstream firm fixture if available)

**Operator verification gate:** static constellation renders for ≥3 workstreams across multiple shapes (engineering / 1:1 / status sync / regulatory etc. when fixture supports). Currently substrate has 2 workstreams; that's enough to verify rendering correctness, but the multi-shape pressure-test waits until multi-firm fixture lands.

Do NOT anticipate Phase 3 work. Phase 3 (left rail + right rail + `accord.html` three-pane structure) is the architect's next commission after operator reviews Phase 2.

---

## §6 — Doctrine queue update (post-Phase-1)

| Candidate | Pre-CMD | Post-Phase-1 | Notes |
|---|---|---|---|
| Cross-module Phase 1 survey | 3 | **4** — ratifiable post-CMD as IR71 (operator's call) | Pattern: scaffolding → brief → Phase 1 deliverable explicitly surveys cross-module conventions |
| F-P3-6 navigational-classification | 2 | **2** (unchanged) — does NOT advance under Decision 1 (Option B) | Will advance on next genuine instance |
| F-P4-9 state-aware UPDATE RLS WITH CHECK | 2 | 2 (unchanged) | No UPDATE policies authored Phase 2 |
| F-P3-2 / F-P3-7 / F-P3-9 / F-P4-1 | 3 (confirmed) | unchanged | No CoC writer or substrate trigger work this CMD |

---

*Commission CMD-ACCORD-CONSTELLATION-ENTRY-1 · Phase 2 · Constellation visualization.*
