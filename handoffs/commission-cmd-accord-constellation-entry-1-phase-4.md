# Commission · CMD-ACCORD-CONSTELLATION-ENTRY-1 · Phase 4 (Drill-down + transitions + drag-drop)

**Status:** Phase 3 closed; Phase 4 commissioned 2026-05-08
**Operator:** Vaughn Staples
**Architect:** Claude (post-handoff)
**Scope this engagement:** Phase 4, structured as **two sub-engagements with a mid-phase checkpoint** — see §3.

---

## §1 — Phase 3 close-out acknowledgment

Phase 3 close-out received and reviewed. All eleven smoke gates green. Persistence keys, layout proportions, and IR64 findings absorbed. Three open notes carried into Phase 4 deliverables (tree search wiring, `accord:meeting-filed`/`unfiled` event emission, `+ New Meeting` button placement). One open note absorbed as compatibility annotation only (`:has()` selector — not Phase 4 work).

**Doctrine queue:**
- Cross-module Phase 1 survey at 4 points; reinforced this phase.
- Style-Doctrine palette claim now at 2 points.
- Deploy-incident pattern (filename log-duplication signal) recorded as 1st data point — emerging doctrine candidate; not actionable yet.

---

## §2 — One open architectural question (no work blocked)

The brief and scaffolding sketch the workstream-level view as **navigational** — breadcrumb, sub-workstreams list, meetings list, two `+ New …` buttons. That's structurally minimal. The architectural question Phase 4 work will surface is whether workstream-level deserves any **substrate-coaching** beyond strict navigation:

- workstream-level activity intelligence ("3 meetings in last 14d · 2 open commitments"),
- aggregated badges across the workstream (open dissents, overdue actions),
- substrate-derived prompts ("DC-014 was made 110 days ago — last reviewed when?")

The IR70 boundary statement landed in Phase 1 says navigational glow operates at *constellation* resolution; coaching lives in *surfaces below*. Workstream-level is the seam — is it constellation-resolution navigation, or one of the surfaces below? **Phase 4 ships the strict-navigational version.** Any additions are deferred to a follow-on CMD if they emerge as needs. Recording the question here so it's named, not silently buried.

---

## §3 — Phase 4 structure: two sub-engagements with mid-phase checkpoint

Phase 4 wraps six discrete deliverables. To keep the magic-moment (dissolve from constellation → workstream → meeting) verifiable before drag-drop layers atop it, the engagement structures as follows:

### Phase 4a — Views + transitions + ESC ascend + accessibility scaffolding

**Deliverables:**
1. **Workstream-level view** (strict navigational per §2): breadcrumb, sub-workstreams list, meetings list, `+ New Workstream` button (creates sub within parent), `+ New Meeting` button (lightweight surface forward-compatible with v3.5).
2. **Meeting-level view scaffolding**: breadcrumb, meeting-scoped tab bar (Live Capture / Living Document / Decision Ledger / Digest & Send / Minutes). Each tab scaffolded; rendering adopted from existing surfaces with meeting-scope filter applied.
3. **Smooth dissolve transitions** (CSS-based ~300ms, opacity + transform-scale composite per Phase 1 D5 v5-mockup reference): constellation → workstream-level uses clicked node's position as breadcrumb anchor; workstream-level → meeting-level expands clicked meeting to fill center pane; reverse on ESC ascend.
4. **ESC ascend behavior** wired to the Phase 3 listener (already exists; Phase 4a uses, not creates).
5. **Tree search wiring** — Phase 3 carry-forward: `oninput` handler mirrors `_mtgSearch` (my-meetings.html line 461). Text-match on title; hide non-matching `.ac-tree-meeting`; keep `.ac-tree-ws` / `.ac-tree-sub` visible when any descendant matches.
6. **`accord:meeting-filed` / `accord:meeting-unfiled` event emission** — Phase 3 carry-forward: `accord-workstreams.js` dispatches CustomEvents after successful file/unfile so `accord-rails.js` listeners refresh tree + parking lot without manual reload.
7. **`prefers-reduced-motion` honored** — transitions become instant swaps.
8. **Keyboard navigation** in left rail — arrow keys cycle; ENTER descends. Constellation node arrow-cycle deferred to Phase 4b alongside drag-drop work.

**Phase 4a halt-and-surface:** operator exercises click-descend, ESC-ascend, dissolve transitions, tree search. **Architect mid-phase checkpoint follows:** I review the dissolve quality before drag-drop layers atop it. If the dissolve is shaky, we adjust before drag-drop work. If it lands, Phase 4b commissions immediately.

### Phase 4b — Drag-drop + touch fallback + constellation keyboard nav

**Deliverables (commissioned only after Phase 4a checkpoint clears):**
1. **Drag-and-drop wiring** — parking-lot meeting → constellation node files at top-level workstream (disambiguation modal if sub-workstreams exist); parking-lot meeting → workstream-level view files at currently-displayed level; X button on placed meeting returns to parking lot via `accord.meeting.unplaced` event (existing substrate).
2. **Pipeline kanban pattern adopted verbatim** — Phase 1 D4 documented the reusable pattern (lines 2613-2710). HTML5 native drag-drop; no library.
3. **Touch fallback** — long-press equivalent to right-click; drag-drop deferred for mobile per Q-CE-8.
4. **Constellation keyboard navigation** — arrow keys cycle through nodes; ENTER descends. Pairs naturally with drag-drop's a11y considerations.

**Phase 4b halt-and-surface:** operator exercises drag-drop + touch fallback + keyboard descent. Verifies brief §11 success criteria for the full Phase 4 surface.

---

## §4 — Files (anticipated)

**New files:**
- `js/accord-workstream-view.js` — workstream-level view rendering, breadcrumb, sub-list, meetings-list, new-* buttons
- `js/accord-meeting-view.js` — meeting-level view scaffolding, tab-bar, meeting-scoped surface routing
- `js/accord-transitions.js` — dissolve transition orchestration, anchor-point math, reduced-motion fallback
- `css/accord-views.css` — view styles for workstream + meeting levels
- `css/accord-transitions.css` — dissolve transitions, animation curves

**Modified files:**
- `accord.html` — script loader extended with new modules
- `js/accord-rails.js` — wires `accord:level-changed` to view module mounts; tree search `oninput` (Phase 4a item 5)
- `js/accord-workstreams.js` — `accord:meeting-filed` / `_unfiled` event emission (Phase 4a item 6); already-expanded public API may grow further if disambiguation-modal needs new internals exposed (decide at implementation time)
- `js/accord-core.js` — possibly extended with helpers for transition orchestration (decide at implementation time)

**No changes:** `accord-constellation.js` / `accord-constellation.css` (Phase 2 module; Phase 4 may listen for new dispatched events but does not modify the module).

---

## §5 — Discipline (apply throughout)

- **Iron Rule 36 / 37 / 40 §1** — terse hand-off; silent work-mode; halt on missing input
- **Iron Rule 64** — verify mental models against codebase. Phase 4a's transition math depends on actual computed-style of constellation nodes at click time; verify against rendered DOM not assumed bounding boxes
- **Iron Rule 65** — does NOT fire this Phase. Client-side rendering only; no Edge Function bytes change
- **IR70 navigational/coaching boundary** — workstream-level view ships strict-navigational per §2. No activity intelligence, no aggregated badges, no substrate prompts on the workstream-level surface in Phase 4. Architect-operator decision required to add later
- **Style Doctrine palette** — Accord tokens only (Phase 2 IR64 finding); watch for Compass cyan creep in transition tints, drag-drop visual states, focus rings. Doctrine candidate at 2 points; a 3rd this phase ratifies the pattern
- **Cross-module convention** — sessionStorage + localStorage two-tier persistence for any new preferences emerging this phase

---

## §6 — Halt-and-surface terms

**After Phase 4a (mid-phase checkpoint):** structured close-out covering:
1. Files created/modified
2. Dissolve transition behavior (anchor-point math, timing, reduced-motion fallback verified)
3. Tree search behavior
4. `accord:meeting-filed` / `_unfiled` event emission verified
5. Smoke summary: click-descend + ESC-ascend + tree search across the verification fixture
6. Any IR64 findings
7. Open notes for Phase 4b

**Architect reviews; if dissolve quality is right and behaviors clean, Phase 4b commissions.**

**After Phase 4b (Phase 4 close-out):** structured close-out covering:
1. Files created/modified (Phase 4b additions)
2. Drag-drop behavior across the three target types (constellation node, tree workstream, workstream-level view)
3. Touch fallback verified
4. Constellation keyboard nav verified
5. Smoke summary against brief §7 Phase 4 verification gate (click → dissolve → workstream view → meeting view → drag → file → ESC ascend → return to constellation)
6. Any IR64 findings
7. Open notes for Phase 5 (closure regression + version pin bump + Legacy view toggle removal)

---

## §7 — Doctrine queue update

| Candidate | Pre-Phase-4 | Notes |
|---|---|---|
| Cross-module Phase 1 survey | 4 — ratifiable as IR71 | Phase 4 reinforces (transitions + persistence + tree search all reuse prior conventions) |
| Style Doctrine palette claim | 2 | Watch for 3rd in transition tints / drag-drop states |
| Deploy-incident pattern (filename log-duplication signal) | 1 (recorded Phase 3) | Watch for repeat |
| F-P3-6 navigational-classification | 2 (unchanged) | No new RLS this phase |
| F-P4-9 state-aware UPDATE RLS WITH CHECK | 2 (unchanged) | No UPDATE policies this phase |

---

## §8 — Reference set (Phase 4)

- `commission-cmd-accord-constellation-entry-1-phase-3.md` — Phase 3 commission (still informative)
- `phase-3-closeout-cmd-accord-constellation-entry-1.md` — Phase 3 close-out
- `brief-cmd-accord-constellation-entry-1.md` — updated brief
- `scaffolding-cmd-accord-constellation-entry-1-v3.md` — updated scaffolding
- `Iron_Rules_66-70_Ratification_Request.md` — doctrine canon
- `aegis-MASTER-handoff-2026-05-08.md` — build state
- `my-meetings.html` — `_mtgSearch` line 461 referenced for Phase 4a tree-search wiring; existing tree adoption complete from Phase 3
- Pipeline kanban file (lines 2613-2710) — drag-drop pattern reference for Phase 4b
- All Phase 2 + Phase 3 module files — Phase 4 consumes/extends, doesn't rewrite

---

*Commission CMD-ACCORD-CONSTELLATION-ENTRY-1 · Phase 4 · Drill-down + transitions + drag-drop · two sub-engagements.*
