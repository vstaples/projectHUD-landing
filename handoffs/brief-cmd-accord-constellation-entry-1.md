# Brief · CMD-ACCORD-CONSTELLATION-ENTRY-1

**Status:** Ready for commission.
**Architect:** Claude (with operator Vaughn Staples)
**Operator ratification:** v3 scaffolding ratified 2026-05-08; architect-leans on Q-CE-1 through Q-CE-10 ratified by trust.
**Strategic context:** Final CMD in the 2-CMD Accord-constellation arc. Substrate ready (CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1); this CMD ships the operator-facing transformation.
**Reference:** `scaffolding-cmd-accord-constellation-entry-1-v3.md` for full architectural sketch.

---

## §1 — Goal

Transform Accord's top-level surface from five flat tabs (Live Capture / Living Document / Decision Ledger / Digest & Send / Minutes) into a three-pane hierarchical constellation experience:

- **Left rail** — Compass-style hierarchical text tree (workstream → sub-workstream → meeting)
- **Center pane** — constellation visualization at top level; workstream view at workstream level; meeting view at meeting level
- **Right rail** — parking-lot pane of unfiled meetings (drag-source for filing)

After this CMD ships, the existing five tabs no longer exist as top-level surfaces — they become **meeting-scoped tabs** accessible only after descent into a specific meeting context.

---

## §2 — Scope

**In scope:**

1. Constellation visualization (radial concentric-ring layout by recency)
2. Three-pane layout (left rail | center | right rail)
3. Smooth dissolve transitions between hierarchy levels (CSS-based, ~300ms)
4. ESC-back-to-ascend behavior (one level up per ESC press)
5. Drag-and-drop for filing parking-lot meetings onto workstream nodes (any level)
6. `+ New Workstream` button at constellation level (top-level) and within workstream view (sub-level)
7. `+ New Meeting` button (within workstream view; opens lightweight setup surface that becomes Meeting Setup v3.5 when CMD-ACCORD-MEETING-SETUP-1 ships)
8. Demotion of existing five top-level surfaces to meeting-scoped tabs (Phase 5)
9. Empty-state handling (new operators with zero workstreams, empty parking lot)
10. Accessibility fallbacks (keyboard navigation via left rail; prefers-reduced-motion honored)

**Out of scope (deferred to future CMDs):**

- Cross-cutting views ("all open dissents across workstreams") — defer to CMD-ACCORD-CROSS-CUT-VIEWS-1
- Per-operator constellation node positioning (operator drags nodes around) — defer to CMD-ACCORD-CONSTELLATION-CUSTOM-LAYOUT-1
- Mobile/tablet drag-drop (read-only mobile only in this CMD) — defer to CMD-ACCORD-MOBILE-1
- Materialized aggregation views for activity-weight (only if Phase 1 finds query-time computation insufficient)
- Workstream-typing (project / recurring / initiative metadata) — not in substrate; not added in this CMD
- Sub-workstream sub-constellation visualization (sub-workstreams are list-shaped, not visual)

---

## §3 — Doctrine compliance

This CMD is the first to ship under Iron Rules 66-70 (ratified 2026-05-08).

**IR66 — Substrate-Shape-Agnosticism:** the constellation default state must work for all workstream shapes (engineering project, 1:1 cadence, status sync, retrospective, kickoff, regulatory review, board update, decision review). No surface element privileges one workstream shape.

**IR67 — The 8-Archetype Test:** Phase 1 deliverable includes explicit 8-archetype walkthrough for each surface element (constellation node, workstream-level view, meeting-scoped tabs, drag-drop, ESC ascend, transitions). Anything serving fewer than ~7 archetypes is demoted to opt-in or cut.

**IR68 — Privacy-by-Surface:** audience boundaries are explicit and substrate-enforced:
- Constellation: firm-shared (operator's view of their firm's workstream world)
- Workstream-level view: firm-shared (firm-scoped substrate)
- Meeting-level view: participant-scoped
- Parking lot: firm-shared (organizational scratchpad of unfiled meetings)
- Sealed minutes/decisions/actions: participant-scoped

RLS policies covering these boundaries verified during Phase 1; new policies authored if gaps found.

**IR69 — Universal Default; Power-User Views Layered:** the constellation default works for the new operator with one workstream and one meeting. Power-user features (alpha-sort toggle, collapsible rails, animation-reduction, keyboard cycle) are opt-in toggleables.

**IR70 — Substrate-Derived Intelligence > Information Presentation:** this CMD's scope is *navigation*, not *substrate intelligence*. Coaching belongs in surfaces below (Meeting Setup v3.5). The constellation surfaces *what's there*; it doesn't *coach the operator on what to do about it*.

**IR65 — Bytes-on-the-wire:** does NOT fire. No render template body changes; the meeting-scoped Minutes tab continues to use the existing render-minutes Edge Function unchanged. Single-pin bump in `js/version.js`.

---

## §4 — Phase shape

### Phase 1 — Investigation (halt-and-surface)

**Objective:** answer the substrate-and-survey questions before any visual or interaction code is written.

**Deliverables:**

1. **Activity-weight query primitives:** does the substrate already provide queryable views of "recent meetings count per workstream" / "open commitments per workstream"? Document the query shape that will drive node size + glow. If aggregation views need authoring, propose them; if query-time computation is sufficient (≤20 workstreams typical), confirm.

2. **Surface routing audit:** does `accord.html` use hash routing (e.g., `accord.html#decisions`) or surface state stored in JS only? Affects ESC integration (Q-CE-7).

3. **Cross-module Phase 1 survey (Iron Rule 64 + cross-module survey doctrine):** check if Compass and Cadence have constellation-style or hierarchical-drill-down patterns. If yes, surface the conventions for adoption. This survey advances the cross-module survey doctrine candidate to its 4th cross-CMD data point (potentially ratifiable post-CMD).

4. **Drag-and-drop pattern inventory:** does any existing surface use drag-drop? If yes, what library or hand-rolled pattern? Modal/dialog patterns from CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1 are reusable.

5. **Transition convention survey:** does any other ProjectHUD surface use CSS-based dissolve transitions? Adopt existing convention if present.

6. **8-archetype walkthrough for each surface element:** explicit pressure-test of constellation node, workstream-level view, meeting-scoped tabs, drag-drop, ESC ascend, transitions against all 8 meeting archetypes (1:1, status sync, project review, retrospective, decision review, kickoff, regulatory, board update). Document any element that fails for ≥2 archetypes; propose demotion to opt-in or cut. **Additionally produce an explicit IR70 boundary statement defining where navigation ends and coaching begins for this CMD's surfaces: activity-weight glow operates at navigational resolution ("this workstream warrants attention") — not at coaching resolution (specific actor patterns, silence-break day-counts, urgency math). Coaching lives in surfaces below (Meeting Setup v3.5 and downstream).**

7. **RLS policy gap audit:** verify RLS policies enforce the IR68 audience boundaries. If gaps exist, propose policies to author in Phase 2.

8. **Empty-state inventory:** new operator with zero workstreams (parking-lot may have items); operator with workstreams but empty parking-lot; operator with workstreams and meetings but no recent activity. Document the visual/textual handling for each.

**Halt-and-surface:** Phase 1 ends with a summary document for operator review. Operator confirms or amends Q-CE-4, Q-CE-5, Q-CE-7 (and any other questions surfaced during investigation) before Phase 2 begins.

**Estimated effort:** 2-3 hours.

### Phase 2 — Constellation visualization (center pane at top level)

**Objective:** ship the radial visualization with no transitions yet.

**Deliverables:**

1. **Constellation rendering** — concentric-ring layout per Phase 1 thresholds. Top-level workstreams only (filter `parent_workstream_id IS NULL`).
2. **Activity-weight computation** — node size + glow per Phase 1 query.
3. **Node interactions** — hover (tooltip), click (placeholder; full transition added Phase 4), right-click (context menu: rename, archive, view-sub-workstreams).
4. **Empty constellation** — "+ Create your first workstream" prompt for operators with zero workstreams.
5. **Color/glow conventions** — active workstreams cyan/teal; archived workstreams muted gray (in outer ring or filtered).
6. **Labels** — workstream name beneath each node.

**Halt-and-surface:** operator views static constellation; confirms visual quality before Phase 3.

**Estimated effort:** 4-5 hours.

### Phase 3 — Three-pane layout structure

**Objective:** introduce left rail + right rail; existing five top-level surfaces remain accessible via "Legacy view" toggle as rollback path.

**Deliverables:**

1. **Left rail (text tree)** — hierarchical workstream → sub-workstream → meeting list. Updates current-position highlight as operator descends. Collapsible (per Q-CE-1) with persistent operator preference.
2. **Right rail (parking lot)** — meetings where `workstream_id IS NULL AND firm_id = my_firm_id()` (firm-shared per Decision 1 disposition; per-organizer privacy queued as future CMD). Date-sorted by default; alpha-sort toggle. Persistent operator sort preference. Collapsible (per Q-CE-2). Empty state: "All meetings filed."
3. **Center pane scaffolding** — at this phase center pane shows constellation (Phase 2 work) at top level; "Legacy view" toggle accessible to flip back to today's five top-level tabs (rollback safety).
4. **Layout proportions** — left rail ~250px; right rail ~280px; center pane flex.
5. **Persistent operator preferences** — collapsed-state of each rail, sort-mode of parking lot, animation-reduction.

**Halt-and-surface:** operator confirms three-pane layout works; "Legacy view" toggle confirmed functional.

**Estimated effort:** 4-5 hours.

### Phase 4 — Drill-down + transitions + drag-and-drop

**Objective:** the largest phase — descend behavior, dissolve transitions, drag-drop interactions, ESC ascend.

**Deliverables:**

1. **Workstream-level view** — breadcrumb, sub-workstreams list, meetings list, `+ New Workstream` button (creates sub-workstream within parent), `+ New Meeting` button (lightweight setup surface forward-compatible with Meeting Setup v3.5).
2. **Meeting-level view scaffolding** — breadcrumb, tab bar (Live Capture / Living Document / Decision Ledger / Digest & Send / Minutes). Each tab scaffolded; content rendering adopted from existing surfaces with meeting-scope filter applied.
3. **Smooth dissolve transitions** — CSS-based ~300ms; opacity + transform-scale composite. Constellation → workstream-level: clicked node's position becomes breadcrumb anchor. Workstream-level → meeting-level: clicked meeting expands to fill center pane.
4. **ESC ascend behavior** — ESC at any level ascends one level. Implementation per Q-CE-7 disposition (hash routing or custom level-state).
5. **Drag-and-drop** — parking-lot meeting → constellation node files at top-level workstream (or opens disambiguation modal if sub-workstreams exist); parking-lot meeting → workstream-level view files at currently-displayed level; X button on placed meeting returns to parking lot via `accord.meeting.unplaced` event (existing substrate from prior CMD).
6. **Touch fallback** — long-press equivalent to right-click; drag-drop deferred for mobile.
7. **Animation-reduction** — `prefers-reduced-motion` honored; transitions become instant swaps.
8. **Accessibility** — left rail keyboard-navigable; arrow keys cycle through constellation nodes; ENTER descends.

**Halt-and-surface:** operator exercises drill-down + drag-drop + ESC; confirms behavioral correctness.

**Estimated effort:** 6-8 hours (largest phase).

### Phase 5 — Demote existing surfaces + closure

**Objective:** five existing top-level surfaces removed from top-level navigation; "Legacy view" toggle removed; behavioral verification + closure regression sweep.

**Deliverables:**

1. **Top-level tab bar removal** — Live Capture / Living Document / Decision Ledger / Digest & Send / Minutes no longer accessible from top level.
2. **Meeting-scoped tab content** — each tab's content rendering verified at meeting-scope filter (already scaffolded Phase 4; verify correctness across all 8 archetypes).
3. **"Legacy view" toggle removal** — rollback safety net removed; constellation is the only top-level entry.
4. **Behavioral verification per surface element** — explicit 8-archetype walkthrough confirms each meeting-scoped tab works correctly for 1:1, status sync, project review, retrospective, decision review, kickoff, regulatory review, board update meetings.
5. **Closure regression sweep** — full Accord smoke test (create workstream, create meeting under workstream, descend, exercise each meeting tab, ascend, file meeting from parking lot, archive workstream).
6. **Version pin bump** — single-pin bump in `js/version.js` (e.g., `v20260508-CMD-ACCORD-CONSTELLATION-ENTRY-1-final`).

**Halt-and-surface:** operator runs final acceptance test; CMD seals.

**Estimated effort:** 2-3 hours.

**Total estimated effort:** **18-25 hours**, multi-session probable.

---

## §5 — Substrate dependencies

**From CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1 (locked, do not modify):**

- `workstreams` table (id, parent_workstream_id, firm_id, name, archived_at, created_at, etc.) — naming inconsistency vs. other Accord tables (`accord_meetings`, `accord_nodes`, etc.) noted; rename queued as CMD-ACCORD-NAMING-NORMALIZATION-1 (out of scope for this CMD per §11)
- `accord_meetings.workstream_id` foreign key (NULL = parking lot)
- Two-level nesting trigger
- Archive cascade
- Parking-lot index (organizer_id + workstream_id IS NULL)
- 7 CoC events: `accord.workstream.created`, `accord.workstream.archived`, `accord.workstream.unarchived`, `accord.workstream.renamed`, `accord.meeting.placed`, `accord.meeting.unplaced`, `accord.meeting.refiled`

**This CMD does NOT modify substrate.** All substrate work was completed in CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1. RLS policies may be ADDED if Phase 1 audit reveals gaps (per IR68 compliance), but no existing substrate is altered.

---

## §6 — File inventory (anticipated)

**New files:**
- `js/accord-constellation.js` — constellation rendering, layout, interactions
- `js/accord-rails.js` — left rail (tree) + right rail (parking lot) + collapsibility + persistence
- `js/accord-meeting-scope.js` — meeting-scoped tab routing + content scoping for the five demoted surfaces
- `css/accord-constellation.css` — radial layout, transitions, three-pane layout
- Possible: `migrations/<timestamp>_constellation_rls_gaps.sql` — IF Phase 1 audit finds gaps

**Modified files:**
- `accord.html` — three-pane layout structure; legacy tab removal Phase 5
- `js/accord-workstreams.js` — minor: parking-lot pane integration with existing workstream UI
- `js/version.js` — single-pin bump at Phase 5 closure
- Possibly: `js/accord-capture.js`, `js/accord-living-document.js`, `js/accord-decision-ledger.js`, `js/accord-digest.js`, `js/accord-minutes.js` — meeting-scope filter wiring (filter by current meeting_id from URL/state)

**Reference files (read-only for this CMD):**
- `accord-meeting-setup-v3-5.html` — design reference for "+ New Meeting" forward-compatibility
- Compass / Cadence surfaces — surveyed in Phase 1 for hierarchical-drill-down conventions

---

## §7 — Verification gates (per phase halt-and-surface)

**Phase 1 verification:** Q-CE-4, Q-CE-5, Q-CE-7 confirmed or amended; 8-archetype walkthrough complete; RLS gap audit complete; cross-module survey complete.

**Phase 2 verification:** static constellation renders correctly for ≥3 workstreams across multiple shapes; activity-weight visually meaningful; empty constellation prompt visible for zero-workstream operator.

**Phase 3 verification:** three-pane layout renders; left rail navigation works; right rail parking lot populates correctly; "Legacy view" toggle flips between new and old top-level UIs cleanly.

**Phase 4 verification:** click constellation node → dissolve transition into workstream view; click meeting → dissolve into meeting-level view; ESC ascends correctly; drag parking-lot meeting onto constellation node files correctly; X button on placed meeting returns to parking lot; keyboard navigation works.

**Phase 5 verification:** "Legacy view" removed; all 8 archetype meeting-scoped tabs render correctly; closure regression smoke test passes; version pin bumped.

---

## §8 — Open Q-CE dispositions (ratified by operator trust)

| ID | Question | Disposition |
|---|---|---|
| Q-CE-1 | Left rail collapsible? | **Yes**, with persistent preference |
| Q-CE-2 | Right rail collapsible? | **Yes**, same pattern |
| Q-CE-3 | Empty parking-lot behavior? | **Subtle empty state** ("All meetings filed."); no auto-collapse |
| Q-CE-4 | Recency thresholds for concentric rings? | **14d / 60d cutoffs** (tunable; final values confirm Phase 1) |
| Q-CE-5 | Activity weight scope? | **Firm-scoped** (confirm Phase 1) |
| Q-CE-6 | Cross-cutting views in this CMD? | **Out of scope**; defer to future CMD |
| Q-CE-7 | ESC integration with history? | **Defer to Phase 1** surface-routing survey |
| Q-CE-8 | Mobile/tablet support? | **Read-only mobile** (drag-drop deferred); ship desktop-first |
| Q-CE-9 | Accessibility (keyboard nav)? | **Left rail keyboard fallback**; arrow keys cycle nodes; ENTER descends |
| Q-CE-10 | Animation reduction? | **Honor `prefers-reduced-motion`**; transitions become instant swaps |

---

## §9 — Doctrine candidates this CMD may advance

Per the doctrine queue active at the start of this CMD:

- **Cross-module Phase 1 survey** (currently 3 data points; this CMD's Phase 1 cross-module survey makes it 4 — ratifiable as Iron Rule post-closure)
- **F-P3-2 SECURITY DEFINER admin lookups / INVOKER substrate** (confirmed at 3; no further data expected from this CMD as substrate is unchanged)
- **F-P3-7 DROP TRIGGER IF EXISTS pattern** (confirmed at 3; no triggers added this CMD)
- **F-P3-9/F-P4-1 accord.* prefix normalization in CoC writer** (confirmed at 3; CoC writer unchanged this CMD)
- **F-P3-6 navigational-classification IR42 pattern** (currently 2; if this CMD adds RLS gaps in Phase 1 → Phase 2 with navigational classification, may advance to 3 — ratifiable)
- **F-P4-9 state-aware UPDATE RLS WITH CHECK explicit** (currently 2 within AWS-1; if this CMD adds new RLS policies and maintains the WITH CHECK explicit pattern, advances to 3 cross-CMD — ratifiable)

Doctrine observations are surfaced at each phase halt-and-surface.

---

## §10 — Hand-off and continuation

**This brief is the first CMD commissioned under the new architect agent post-handoff.** The previous architect (this session, Claude with the operator) drafted v1, v2, v3 scaffolding and this brief. The new architect agent inherits via `aegis-MASTER-handoff-2026-05-08.md` and continues commissioning, reviewing coding-agent phase deliverables, surfacing doctrine observations, and supporting operator ratifications.

**Coding agent receives:** this brief + scaffolding v3 + the IR66-70 ratifications + the active doctrine queue. Coding agent does NOT receive the design-arc transcripts (those are architect-internal context).

**Operator role in this CMD:**
- Phase 1 halt-and-surface: confirm Q-CE-4, Q-CE-5, Q-CE-7 dispositions; review 8-archetype walkthrough; review RLS gap audit
- Phases 2-4 halt-and-surface: behavioral verification at each phase
- Phase 5 halt-and-surface: closure regression, final acceptance, CMD seals

---

## §11 — Closing architectural commitment

This CMD is "the moment Accord stops feeling like another to-do list and starts feeling alive." That phrase is the operator's, from the morning reflection that produced scaffolding v1. It deserves to be the CMD's closure standard.

If after Phase 5 the operator still feels Accord is a list-of-tabs in disguise, the CMD has missed. If after Phase 5 the operator opens Accord and feels they're entering a *space* their workstreams inhabit — with depth, hierarchy, parking-lot scratchpad, and a graceful elevator down to whichever meeting is at hand — the CMD has shipped what it was meant to ship.

That qualitative outcome is the canonical success criterion. Quantitative phase verifications support it; they don't replace it.

---

*End of brief — CMD-ACCORD-CONSTELLATION-ENTRY-1.*

*Estimated total effort: 18-25 hours. Multi-session probable. First CMD shipped under doctrine canon IR66-70.*
