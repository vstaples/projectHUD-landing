# Architectural Scaffolding · CMD-ACCORD-CONSTELLATION-ENTRY-1 (v3)

**Status:** conceptual sketch (not a brief). Visualization + interaction layer atop CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1. **Revised v3** absorbs Iron Rules 66-70 and the design arc framework from 2026-05-07.

**Architect:** Vaughn (operator) + Claude (architect)
**Date:** 2026-05-07 (v1, v2) → 2026-05-08 (v3)
**Strategic context:** Second and final CMD in the 2-CMD Accord-constellation arc. Substrate ready; this CMD ships the operator-facing transformation.

**v3 changes vs v2:**
- §14 NEW — Doctrine alignment (IR66-70 application)
- §3 revised — constellation node rendering pressure-tested against 8 archetypes
- §5 revised — meeting-scoped tab demotion pressure-tested for substrate-shape-agnosticism
- §6 revised — parking-lot interaction model strengthened per privacy-by-surface
- §15 NEW — relationship to Meeting Setup v3.5 (downstream surface)

---

## §1 — What this CMD is for

CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1 shipped the substrate (workstreams table, two-level nesting, parking-lot semantics, archive cascade, CoC events). Today's Accord still presents five flat list-style top-level surfaces (Live Capture / Living Document / Decision Ledger / Digest & Send / Minutes). The substrate is hierarchical; the surface is not.

This CMD transforms Accord's top level into:

1. **Constellation visualization** as the new top-level entry surface — replaces today's flat tab bar
2. **Three-pane layout** at top level: left rail (Compass-style hierarchical text tree) | center (constellation visualization OR descended workstream view) | right rail (parking-lot pane of unfiled meetings)
3. **Smooth dissolve transitions** between hierarchy levels (constellation → workstream → meeting)
4. **ESC-back-to-ascend** behavior for navigating up the hierarchy
5. **Drag-and-drop** for filing meetings: parking-lot → workstream node, workstream → workstream (refile), X-button → parking-lot (unfile)
6. **`+New Workstream`** button at constellation level (top-level workstreams) and at sub-level (sub-workstreams within a top-level)
7. **Demotion of the existing five surfaces** to meeting-scoped views accessible after descent into a meeting context

After this CMD ships:
- Operator opening Accord lands on the constellation
- Constellation shows top-level workstreams as nodes; activity-weighted glow per workstream
- Left rail mirrors hierarchy textually for keyboard/screen-reader access
- Right rail shows parking-lot meetings the operator hasn't filed
- Click a node → dissolve into that workstream's view
- Click a meeting → dissolve into meeting-scoped view
- ESC at any level → ascend one level
- Drag a parking-lot meeting onto any workstream node at any level → file it
- All transitions visually continuous; cognitive load reduced

This is the "moment Accord stops feeling like another to-do list and starts feeling alive" CMD per the operator's morning reflection.

---

## §2 — Three-pane layout

Per the Compass Knowledge Tree screenshot the operator surfaced 2026-05-07, the canonical three-pane shape is:

| Pane | Content | Persistent across hierarchy levels? |
|---|---|---|
| Left rail (~250px) | Hierarchical text navigation tree (workstream → sub-workstream → meeting) | Yes; updates current-position highlight as operator descends |
| Center (~flex) | Constellation at top level; workstream view at workstream level; meeting view at meeting level | No; content changes by level |
| Right rail (~280px) | Parking-lot pane: unfiled meetings, alpha- or date-sorted, drag-source for filing | Yes; visible at every level so operator can drag-drop at the appropriate level |

**Architectural commitments:**

- The left rail is **textual** (no visualization); serves as both navigation and accessibility fallback
- The center pane is **visual** at top level (constellation), **list-shaped** at lower levels (per operator's reflection: "give me one fun entry point and a graceful elevator ride down")
- The right rail is **persistent** because the operator's reflection specifically called out drag-and-drop at any level

**Open architect deliberation:**
- Q-CE-1: should the left rail be collapsible (operator hides it for full-width center pane)? Architect-lean yes, with persistent operator preference
- Q-CE-2: should the right rail be collapsible too? Architect-lean yes; same persistence pattern
- Q-CE-3: when the parking lot is empty, does the right rail show something or auto-collapse? Architect-lean shows a subtle empty state ("All meetings filed.") rather than collapse — keeps the layout stable

---

## §3 — Constellation visualization (center pane at top level)

### §3.1 What's a node?

Each top-level workstream is one constellation node. Sub-workstreams are NOT nodes at top level (they appear after descent into the parent workstream).

Node visual properties:
- **Size:** proportional to "activity weight" (more on this in §3.3)
- **Glow intensity:** proportional to recency of last meeting + open-commitment density
- **Color:** state-based — active workstreams render in Accord palette (editorial-amber `--signal` per Style Doctrine v1.7); archived workstreams muted gray (in outer ring or filtered out). Phase 2 IR64 correction: scaffolding originally said "cyan/teal" — that was Compass palette borrowed inadvertently. Accord uses its own tokens.
- **Position:** see §3.2 layout strategy
- **Label:** workstream name beneath node

The Aegis Cockpit pattern is the inspiration; the Accord constellation adapts it for workstreams rather than firms.

**v3 IR66 check (substrate-shape-agnosticism):** Does the constellation work for operators whose workstream shapes vary widely?
- Engineering project workstream (rich substrate, many meetings) — works; large node, intense glow
- 1:1 cadence workstream (simple, recurring) — works; medium node, steady glow
- Status sync workstream (lots of meetings, low substrate density) — works; large node by recency, modest glow
- Retrospective workstream (sparse, periodic) — works; smaller node, may sit in outer ring
- Kickoff workstream (one meeting, then quiet) — works; small node, low recency
- Regulatory review workstream (slow tempo, heavy substrate) — works; medium recency, intense glow

**Pass.** Constellation default state is substrate-shape-agnostic.

### §3.2 Layout strategy

Three approaches deliberated; architect-lean noted:

**A.** Concentric rings by recency: most-recent-activity workstreams in inner ring, dormant in outer ring. Distance from center encodes recency.

**B.** Angular sectors by node-type: if workstreams have type metadata (project, recurring, initiative, etc.) — angular position encodes type. **Rejected:** workstreams aren't typed in the substrate; would require Q-W-style additions.

**C.** Operator-draggable positioning: operators position nodes wherever they want; positions persist per operator. **Rejected for v1:** introduces persistence substrate (per-operator constellation_node_position table) that's premature.

**Architect-lean A** (concentric by recency). Simple algorithm; meaningful information; no substrate additions. Empty constellations (new operators with zero workstreams) show "+ Create your first workstream" prompt in the center.

**Open Q-CE-4:** if A, what's the recency threshold for inner-vs-outer ring? Architect-lean: meetings in last 14 days = inner; 14-60 days = middle; 60+ days OR no meetings ever = outer. Empirically tunable.

**Phase 2 IR64 refinement (codified in `accord-constellation.js`):** brand-new workstreams (zero meetings, recent `created_at`) override to **middle** ring, not outer. Rationale: a fresh workstream is unstarted, not dormant. Outer ring is reserved for genuinely dormant workstreams (no meetings AND old `created_at`). Three states differentiated:
- Active (recent meetings) → inner
- Brand-new (no meetings, recent `created_at` ≤ 60d) → middle
- Aging/dormant (no meetings, old `created_at`, OR last meeting > 60d) → outer

**Phase 2 IR64 refinement (days-since-last-touch source):** `accord_meetings.scheduled_for` preferred (operator-declared meeting time); falls back to `created_at` when `scheduled_for` IS NULL. Codified in implementation; informative for Phase 4 timeline-anchored work.

### §3.3 Activity weight computation

Per-workstream metric driving size + glow. Composite of:
- Recent meetings count (last 30 days; weight × 1.0)
- Open commitment density (decisions + actions filed under this workstream where status != 'done' or sealed_at IS NOT NULL but not closed; weight × 0.5)
- Days-since-last-touch (inverse-exponential; weight × 0.3)

Computed at query time initially. If performance is acceptable for typical operator workstream counts (≤20), no caching needed. If bigger, materialized view candidate for future CMD.

**Open Q-CE-5:** is per-workstream activity computed cross-firm or operator-scoped? Activity weight likely scoped to the firm context. Confirm during Phase 1 investigation.

### §3.4 Interactions

- **Click node** → dissolve transition to that workstream's view
- **Hover node** → tooltip with workstream name + meeting count + recent activity summary
- **Drag from right rail to node** → file meeting under this top-level workstream (if no sub-workstreams, files directly; if sub-workstreams exist, opens disambiguation modal asking which level)
- **Right-click node** → context menu with rename, archive, view-sub-workstreams (modal listing them)
- **Long-press / touch hold** (tablet support) → equivalent to right-click

---

## §4 — Workstream-level view (center pane after descent)

After clicking a constellation node, center pane dissolves to:

**Top:** breadcrumb "← Constellation / [Workstream Name]" — clicking ← or pressing ESC ascends.

**Sub-workstreams section** (if any): smaller constellation-style or list-style sub-nodes. Architect-lean: simple list with drill-in behavior. Sub-workstreams don't get a sub-constellation visualization — that would over-engineer; the operator's "flat list is fine below the top level" reflection ratifies.

**Meetings list:** chronological (most recent first), with:
- Meeting title
- Sealed/draft state
- Decision/action counts
- Click → dissolve into meeting-scoped view

**`+ New Workstream`** button (when at top level of a workstream, this creates a SUB-workstream within the current parent).

**`+ New Meeting`** button — opens the Meeting Setup surface (v3.5 design when CMD-ACCORD-MEETING-SETUP-1 ships; lighter-weight equivalent until then). Setup defaults to filing the new meeting under the current workstream.

**Drag targets:** the entire workstream-level view is a drop zone for parking-lot meetings — drop anywhere files at that level (if a sub-workstream is hovered, it nests; otherwise it files at the parent level).

---

## §5 — Meeting-level view (the demotion of existing surfaces)

This is the architectural shift the operator surfaced 2026-05-07: today's five top-level surfaces become **meeting-scoped tabs accessible after descent**.

After clicking a meeting, center pane dissolves to:

**Top:** breadcrumb "← Constellation / [Workstream] / [Meeting Title]"

**Tab bar (meeting-scoped):**
- **Live Capture** (only if meeting is unsealed; primary action when meeting is in-progress)
- **Living Document** (thread-by-thread substrate view, scoped to this meeting)
- **Decision Ledger** (decisions filed in this meeting's threads)
- **Digest & Send** (digest preparation for this meeting; "ROUTE + SEND" button if ready)
- **Minutes** (rendered minutes for this meeting; download/view/print/re-render)

**Each tab is a familiar surface** — but scoped to ONE meeting rather than the firm's full meeting history.

**v3 IR66 + IR67 check:** do these meeting-scoped tabs work for all 8 archetypes (1:1, status sync, project review, retrospective, decision review, kickoff, regulatory, board update)?

- All 8 archetypes produce sealed minutes → Minutes tab works universally ✓
- All 8 produce decisions or actions (substrate items) → Living Document + Decision Ledger work universally ✓
- All 8 produce a digest the operator may want to send → Digest & Send works universally ✓
- All 8 have a Live Capture session when running → Live Capture works universally ✓

**Pass.** Meeting-scoped tabs are substrate-shape-agnostic.

**Implications:**
- The flat-list mental friction the operator identified ("Decision Ledger is becoming a well-refined but unusable artifact") dissolves because the ledger is now contextually scoped
- "Digest & Send vs Minutes overlap" question dissolves because both are tabs on the same meeting
- Live Capture's session-shape now lives where it belongs — inside an active meeting context

**Open Q-CE-6:** what about searches/queries that span meetings (e.g., "all open dissents across my workstreams")? Architect-lean: cross-cutting views are out of scope for this CMD. Future CMD-ACCORD-CROSS-CUT-VIEWS-1 candidate.

---

## §6 — Parking lot pane (right rail)

Persistent across all levels.

**Content:** all meetings where `workstream_id IS NULL AND firm_id = my_firm_id()`. Firm-shared per Phase 1 Decision 1 disposition (parking lot is an organizational scratchpad of unfiled meetings; per-organizer privacy queued as a future CMD candidate). Existing `accord_meetings_select` policy (`firm_id = my_firm_id()`) is sufficient — no new RLS authored.

**Sort:** date-sorted by default (most recent first); alpha-sort toggle. Architect-lean: persistent operator preference for sort mode.

**Per-meeting display:** meeting title, date, sealed/draft indicator, drag handle.

**Empty state:** "All meetings filed." subtle; layout stays stable.

**Drag source:** dragging a parking-lot meeting initiates a file operation; valid drop targets:
- Constellation node (files at top-level workstream)
- Sub-workstream in left rail or workstream-level view (files at sub-level)
- Workstream-level view in center pane (files at currently-displayed workstream's level)

**X button on each row:** placed meeting in the constellation/workstream view returns to parking-lot when the operator clicks X (already in substrate via `accord.meeting.unplaced` event).

**v3 IR68 check (privacy-by-surface) — REVISED post-Phase-1:** the parking-lot pane is firm-shared, not operator-private. Phase 1 clarified that IR68's privacy concern is operator-authored intelligence about attendees (Anticipation/Briefing column content in Meeting Setup v3.5) — not navigational scratchpad surfaces like the parking lot. Substrate is firm-scoped (`accord_meetings_select` enforces `firm_id = my_firm_id()`), and that's appropriate: an unfiled meeting is organizational metadata, not strategic intelligence. Per-organizer parking-lot privacy is queued as a future low-priority CMD candidate (CMD-ACCORD-PARKING-LOT-PRIVACY-1) if requirements emerge. ✓

---

## §7 — Smooth dissolve transitions

The operator-experience-load-bearing element. CSS-based; ~300ms duration; opacity + transform-scale composite.

**Transition shapes:**
- **Constellation → workstream-level:** the clicked node's position becomes the breadcrumb anchor; surrounding nodes fade out; center pane content fades in from the breadcrumb position outward
- **Workstream-level → meeting-level:** clicked meeting "expands" to fill center pane (transform-scale from list-row size to full-pane); content swap inside
- **ESC ascend:** reverse of descent; center pane content collapses toward the breadcrumb element; previous level fades back in

**Implementation discipline:**
- Use CSS `transition` properties on opacity + transform; not JS animation libraries
- Single render of the new content; CSS handles the fade
- ESC triggers history.back() via existing browser hash routing OR custom level-state tracking (TBD per Phase 1 investigation)

**Open Q-CE-7:** does the existing Accord surface use hash routing or surface state stored in JS only? Confirm during Phase 1.

**v3 IR70 check (substrate-derived intelligence):** transitions are presentation, not coaching. They don't surface substrate intelligence — that's deferred to the meeting-level Meeting Setup surface (CMD-ACCORD-MEETING-SETUP-1). This CMD's scope is the navigation layer; substrate-coaching belongs in surfaces below. ✓ (Compliant by scope.)

---

## §8 — Substrate questions (Phase 1 investigation)

Despite this being primarily a UI CMD, several substrate questions need answering:

1. **Activity weight computation source:** does the substrate already provide queryable views? Confirm structure of any existing aggregation views.

2. **Empty-constellation state:** new operators with no workstreams — confirm parking-lot-with-zero-workstreams behavior (CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1 §4 addresses this).

3. **Sub-workstream rendering at top level:** confirm top-level constellation shows ONLY workstreams where `parent_workstream_id IS NULL`.

4. **Surface routing:** does `accord.html` use hash routing for the existing five surfaces, or JS state? Affects ESC implementation (Q-CE-7).

5. **Existing transition patterns:** does Compass or Cadence use CSS-based dissolve transitions? Iron Rule 64 — survey before authoring.

6. **Drag-and-drop library or hand-rolled:** does any existing surface use drag-drop? Modal/dialog patterns from CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1 are reusable.

7. **Cross-module Phase 1 survey (cross-CMD doctrine candidate):** check if Compass and Cadence have constellation-style or hierarchical-drill-down patterns that should inform Accord's. This contributes to the cross-module survey doctrine candidate (currently 3 data points; ratifiable on 4th).

---

## §9 — Phase shape (proposed)

**Phase 1 — Investigation:** survey existing surface routing, transition conventions, drag-drop usage, aggregation views, empty-state patterns, workstream activity query primitives, AND cross-module patterns from Compass/Cadence. Halt and surface Q-CE-1 through Q-CE-10 with recommended dispositions.

**Phase 2 — Constellation visualization (center pane at top level):** build the radial layout, node rendering, activity-weight query, hover/click behaviors. Cosmetic only initially; no transitions yet. Halt for verification.

**Phase 3 — Three-pane layout structure:** introduce left rail (text tree) + right rail (parking lot) + center pane scaffolding. Existing five top-level surfaces TEMPORARILY accessible via small "Legacy view" toggle (rollback path while transition stabilizes; removed at Phase 5 closure). Halt for verification.

**Phase 4 — Drill-down + transitions + drag-and-drop:** dissolve transitions; meeting-level view scaffolding; drag-and-drop interactions; ESC ascend behavior. The largest phase. Halt for verification.

**Phase 5 — Demote existing surfaces + closure:** five existing top-level surfaces become meeting-scoped tabs in meeting-level view; "Legacy view" toggle removed; behavioral verification per §5.X subtests; closure regression sweep.

**Estimated effort:** **18-25 hours**, multi-session probable.

**Iron Rule 65:** does NOT fire. No render template body changes; the meeting-scoped Minutes tab continues to use the existing render-minutes Edge Function unchanged. Single-pin bump in `js/version.js`.

---

## §10 — Open Q-CE deliberations

| ID | Question | Architect lean |
|---|---|---|
| Q-CE-1 | Left rail collapsible? | Yes, with persistent preference |
| Q-CE-2 | Right rail collapsible? | Yes, same pattern |
| Q-CE-3 | Empty parking-lot behavior? | Subtle empty state, no auto-collapse |
| Q-CE-4 | Recency thresholds for concentric rings? | 14d / 60d cutoffs (tunable) |
| Q-CE-5 | Activity weight scope? | Firm-scoped (confirm Phase 1) |
| Q-CE-6 | Cross-cutting views in this CMD? | Out of scope (defer to future CMD) |
| Q-CE-7 | ESC integration with history? | Defer to Phase 1 surface-routing survey |
| Q-CE-8 | Mobile/tablet support? | Read-only mobile (drag-drop deferred); architect-lean ship desktop-first |
| Q-CE-9 | Accessibility (keyboard nav of constellation)? | Left rail provides keyboard fallback; arrow keys cycle through nodes; ENTER descends |
| Q-CE-10 | Animation reduction (prefers-reduced-motion)? | Honor; transitions become instant swaps |

Eight architect-lean defaults; two deferred to Phase 1.

---

## §11 — What this CMD does NOT change

- workstreams substrate (locked from prior CMD)
- accord_meetings.workstream_id linkage (locked from prior CMD)
- Render templates / Edge Functions (IR65 does NOT fire)
- Compass / Cadence / Aegis surfaces (no cross-module work; survey only)
- Live Capture's substrate behavior (still creates accord_meetings with workstream_id NULL by default)
- CoC events from prior CMD (no new events; existing 7 events sufficient)
- Iron Rule 58 amended writer pattern (no changes)
- Any accord_nodes / accord_edges / accord_belief_adjustments behavior

This CMD is purely operator-facing layer.

---

## §12 — Architectural significance

Three commitments worth marking at scaffolding:

**1. The substrate is correct; the surface follows.** CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1 shipped substrate that this CMD's surface architecture now reveals. Without this CMD, the substrate's value is invisible to operators.

**2. The operator's reflective input shaped the scope.** The morning reflection — "give me one fun entry point and a graceful elevator ride down" plus "the existing tab bar is itself part of the rework" — directly produced Phase 5's demotion of existing surfaces.

**3. The MIN discipline still applies, even on a larger CMD.** Mobile drag-drop deferred; cross-cutting views deferred; per-operator constellation-position persistence deferred; node-type-based angular layout deferred.

---

## §13 — Pending operator deliberation

Q-CE-1 through Q-CE-10 deserve operator input before brief drafting. Most have architect leans; brief drafting can proceed when operator confirms architect leans (or amends them).

---

## §14 — Doctrine alignment (NEW in v3)

This CMD is the first to ship under the doctrine canon ratified 2026-05-08 morning (IR66-70). Per-rule application:

### IR66 — Substrate-Shape-Agnosticism

**Application:** the constellation, three-pane layout, and meeting-scoped tabs must serve all workstream shapes and all 8 meeting archetypes by default.

**Pressure-tests passed (see §3.1, §5):**
- Constellation node rendering works for engineering, 1:1, status sync, retrospective, kickoff, regulatory, board, decision-review workstreams
- Meeting-scoped tabs work for all 8 archetypes (Living Document, Decision Ledger, Digest & Send, Minutes, Live Capture all universal)

**Implication for brief:** any visual or interaction design that privileges one workstream shape (e.g., engineering-project canvas affordances) must be opt-in only, not default. Brief should explicitly call this out for the coding agent.

### IR67 — The 8-Archetype Test

**Application:** each visible affordance gets walked through the 8 archetypes during Phase 1 investigation. Anything serving fewer than ~7 archetypes goes to opt-in or out.

**Implication for brief:** Phase 1 investigation deliverable includes an explicit 8-archetype walkthrough for each surface element (constellation node, workstream-level view, meeting-scoped tabs, drag-drop, ESC ascend, transitions).

### IR68 — Privacy-by-Surface

**Application:** audience-by-surface explicit at design time:
- **Constellation:** firm-shared (operator's view of their firm's workstream world; substrate is firm-scoped per `workstreams_select`)
- **Workstream-level view:** firm-shared (workstreams are firm-scoped substrate)
- **Meeting-level view:** participant-scoped (only meeting participants see)
- **Parking lot:** firm-shared (organizational scratchpad of unfiled meetings; per-organizer privacy queued as future CMD candidate per Phase 1 Decision 1)
- **Sealed minutes / decisions / actions:** participant-scoped

**Implication for brief:** RLS policies covering these surface-audience boundaries must be explicit. No surface element can leak across these audience boundaries.

### IR69 — Universal Default; Power-User Views Layered

**Application:** the constellation default must work for the new operator with one workstream and one meeting. Power-user features — alpha-sort toggle, collapsible rails, animation-reduction toggle, keyboard-cycle through nodes — are opt-in.

**Implication for brief:** ship the universal default first; opt-in affordances are toggleable, not default-on. New-operator empty state is first-class consideration.

### IR70 — Substrate-Derived Intelligence > Information Presentation

**Application:** this CMD's scope is *navigation*, not *substrate intelligence*. Substrate-derived coaching (prep prompts, urgency math, pattern attribution) belongs in surfaces below — Meeting Setup (v3.5) is where coaching lives.

**Implication for brief:** the constellation surfaces *what's there* (workstreams, meetings); it doesn't *coach the operator* on what to do about them. That's the next surface down.

---

## §15 — Relationship to Meeting Setup v3.5

When CMD-ACCORD-MEETING-SETUP-1 commissions, the v3.5 design becomes its brief reference. This CMD (constellation-entry) is the surface *above* meeting setup in the navigation hierarchy:

```
Constellation (this CMD)
  ↓ click workstream node
Workstream-level view (this CMD)
  ↓ click meeting (or "+ New Meeting")
Meeting-level view OR Meeting Setup surface (CMD-ACCORD-MEETING-SETUP-1)
  ↓ click meeting tab
Living Document / Decision Ledger / Digest & Send / Minutes / Live Capture (this CMD; demoted from existing surfaces)
```

**The "+ New Meeting" affordance from §4 is the bridge.** When CMD-ACCORD-MEETING-SETUP-1 ships, "+ New Meeting" opens the v3.5 briefing-pack design. Until then, it opens a lighter-weight equivalent. The current CMD does NOT block on Meeting Setup shipping; the affordance is forward-compatible.

**Architectural commitment:** descent into a meeting always goes through *some* meeting-scoped view. Whether that view is the simple meeting-level tabs (this CMD) or the rich Meeting Setup briefing pack (future CMD) depends on meeting state — unsealed/upcoming meetings open Meeting Setup; sealed meetings open meeting-scoped tabs.

---

## §16 — What's left for brief drafting

1. Operator confirms or amends architect-leans on Q-CE-1 through Q-CE-10
2. Operator ratifies this v3 scaffolding
3. Architect drafts brief from v3 — investigation-first phase shape (Phase 1 surveys before any visual work)
4. Brief delivered to operator for ratification
5. Operator commissions CMD with coding agent (next architect agent post-handoff)

---

*End of architectural scaffolding v3 — CMD-ACCORD-CONSTELLATION-ENTRY-1.*
