# Brief · CMD-ACCORD-NRA-SURFACE-1

**Status:** Brief draft, 2026-05-08 late evening. Awaiting operator ratification.
**Architect:** Claude (post-handoff)
**Operator:** Vaughn Staples
**Predecessor sealed:** CMD-ACCORD-NRA-SUBSTRATE-1
**Successor:** CMD-ACCORD-NRA-BRIEFING-PACK-1 (briefing-pack integration; new follow-on)
**Scaffolding:** `scaffolding-cmd-accord-nra-surface-1.md`

---

## §1 — Objective

Make NRA Substrate operator-facing. Ship the capture-and-display surface that turns the substrate API (5 helpers + RLS UPDATE paths + view) into operator-usable affordances. Specifically:

- **NRA capture at node creation** — declare/waive/defer addressing in the same flow as creating a decision/action/risk/etc. Atomic with node creation; no orphan-without-NRA state
- **NRA display on rendered nodes** — always-visible badge wherever nodes appear; click-to-edit; resolution-candidate visible; deferred-aging color shifts
- **NRA history on demand** — side-panel timeline view for nodes with multi-row NRA chains
- **Cross-component reactivity** — six `accord:nra-*` CustomEvents propagate substrate mutations to all rendered surfaces
- **Grandfathered node support** — "+ Add NRA" affordance on the 47 pre-substrate nodes

This is **capture + display only**. Briefing-pack integration is **CMD-ACCORD-NRA-BRIEFING-PACK-1** (new follow-on; commissioned when v5 mockup design context is in front of architect-operator).

---

## §2 — Why this CMD now

Three reasons in order of weight:

1. **Substrate without surface is invisible.** NRA Substrate sealed today is queryable but operator can't see it. Surface CMD makes the substrate investment immediately useful — every node in Accord gains visible forward-motion intent
2. **The strategic chain inflection point.** This CMD is the gateway to CMD-ACCORD-MEETING-SETUP-1 (where v5 mockup commissions). The briefing pack in v5 integrates NRA signals; substrate AND surface must both ship before that integration is design-honest
3. **Operator-discipline-by-construction.** The capture flow forces operators to address NRA at every node creation. The substrate enforces it; the surface makes it natural. Together they install the discipline without operator effort

---

## §3 — Surface scope (operator-locked via dialogue)

### Capture flow
- Inline atomic — node form + NRA fields in one panel; single submit creates node + NRA atomically
- Waive collapses fields — selecting Waive collapses all declare-fields to a single "waiver reason" text field
- Defer is confirm-only — selecting Defer shows "OK to defer? You'll be reminded periodically." No deferral note (substrate intentionally lightweight)

### Display
- Always-visible badge on every rendered node (restrained design discipline required)
- Color shift with age on deferred NRAs (≤30d neutral, 31-60d amber, 60d+ red; tunable)
- Resolution-candidate visible everywhere with distinct styling (`✓? <owner> · candidate`)
- Click-to-edit reuses creation modal in pre-populated mode

### Surface integration
- All node-creating surfaces get NRA capture (Phase 1 IR72 survey identifies exact list)
- Grandfathered nodes show "+ Add NRA" affordance
- Six CustomEvents dispatched on substrate mutations: `accord:nra-declared`, `accord:nra-waived`, `accord:nra-deferred`, `accord:nra-resolved`, `accord:nra-superseded`, `accord:nra-candidate-flagged`

### Edge cases
- "Update NRA" button substrate-supersedes silently; operator never sees the word "supersede"
- "✓ NRA history (N)" badge when history exists but no current NRA
- Side panel for history view — vertical timeline; newest at top

**Out of scope (queued):**
- Briefing-pack integration → CMD-ACCORD-NRA-BRIEFING-PACK-1
- Owner-facing NRA visibility → CMD-ACCORD-NRA-OWNER-VISIBILITY-1
- Substrate-level operator-private enforcement (carries from prior CMD; revisit in owner-visibility CMD)
- `accord_nodes` resolution semantic (third NRA trigger) → CMD-ACCORD-NODE-RESOLUTION-SUBSTRATE-1
- External-owner support → CMD-ACCORD-NRA-OWNER-VISIBILITY-1

---

## §4 — Phase plan

### Phase 1 — Investigation (4-6 hours)

**Mandatory deliverables (per IR72):**

1. **IR72 cross-module survey** — five survey targets:
   - Inventory of node-creating surfaces with line references to where `Accord.createNode()` or equivalent is invoked
   - Inventory of node-displaying surfaces (capture + ledger + document + minutes + parking-lot + workstream-view sub-list)
   - Existing modal patterns reusable (badge styling, side-panel patterns)
   - Existing CustomEvent dispatch patterns (`accord:meeting-filed`, `accord:workstream-archived`, etc.)
   - PostgREST RPC invocation pattern (error-handling, response-shape conventions)

2. **IR64 verification:**
   - `Accord.createNode()` (or equivalent) signature and call sites
   - `accord_nras_current` view returns expected shape via PostgREST GET
   - Existing modal markup for reuse pattern (`#newMeetingModal`, `#rerenderConfirmModal`)
   - `accord_nras` PATCH paths work via PostgREST (declared → deferred, deferred → declared)

3. **8-archetype walkthrough (IR67)** — pressure-test NRA capture form against all 8 meeting archetypes. Specifically: is the owner-event-type vocabulary right for all archetypes (e.g., "next 1:1" vs "next phase review" — both serveable)?

4. **F-P3-6 navigational-classification check** — does any surface code introduce navigational classification this CMD? Likely no. Phase 1 confirms.

5. **Style Doctrine v1.8 §3.8 application check** — Accord palette tokens for badge urgency-aging colors must be Accord palette, not borrowed. Phase 1 reviews existing palette tokens.

6. **Forward-flag check for CMD-ACCORD-NRA-BRIEFING-PACK-1** — confirm the dispatch payload shape (node_id, nra_id, firm_id minimum) is sufficient for briefing-pack code to react.

7. **Halt-and-surface** with all dispositions, IR64 findings, and Phase 2 readiness.

### Phase 2 — Modal + badge components (4-5 hours)

1. `AccordNRAModal` — capture + edit modal with declare/waive/defer/update modes
2. `AccordNRABadge` — inline badge with all 8 variants (declared external, declared internal-event, declared internal-operator, waived, deferred, candidate, history-only, grandfathered)
3. CSS (Accord palette only per Style Doctrine §3.8)
4. Smoke: render each badge variant in isolation; modal opens/submits cleanly
5. Phase 2 close-out

### Phase 3 — Surface wiring: node-creation paths (3-4 hours)

1. Wire modal into Live Capture (Phase 1 verifies actual call sites)
2. Wire modal into Living Document
3. Wire modal into Decision Ledger if Phase 1 verifies it creates nodes
4. Wire any other surfaces Phase 1 IR72 survey identifies
5. Helper RPC dispatch + CustomEvent dispatch on success
6. Smoke: create node via each wired surface; NRA captured atomically
7. Phase 3 close-out

### Phase 4 — Surface wiring: display paths (3-4 hours)

1. Render `AccordNRABadge` on rendered nodes in Live Capture, Living Document, Decision Ledger
2. Render badges on Minutes node references, parking-lot meeting nodes, workstream-view sub-list rows (per Phase 1 inventory)
3. Click handler on badge opens edit modal in update mode
4. Click handler on history-only badge opens `AccordNRAHistoryPanel`
5. CustomEvent listeners trigger badge re-render on substrate mutation
6. Smoke: declare/edit/supersede/resolve on one surface; verify other surfaces refresh badges via events
7. Phase 4 close-out

### Phase 5 — Closure (2-3 hours)

1. Full surface smoke: create node → declare NRA → defer → update → supersede → resolve, across multiple surfaces, observing reactivity
2. Resolution-candidate flow: trigger-detected candidate (insert meeting in workstream matching trigger) → badge updates → operator clicks → "Confirm resolved" or "Not yet"
3. Grandfathered "+ Add NRA" affordance verified on existing 47 nodes
4. History panel verified for nodes with multi-row NRA chains
5. 8-archetype walkthrough re-run on shipped product (not just designs)
6. Version pin bump (IR65 fires this Phase)
7. CMD seal

**Total estimated effort:** 16-21 hours; multi-session probable.

---

## §5 — Substrate dependencies

**From CMD-ACCORD-NRA-SUBSTRATE-1 (sealed):**
- `accord_nras` table + 7 RLS policies + 6 indexes + `accord_nras_current` view
- 5 helper functions (declare/waive/defer/resolve/supersede) — all SECURITY INVOKER
- 2 trigger functions (meeting-INSERT + meeting-seal candidate detection)
- 6 CoC EVENT_META entries

**From doctrine canon:**
- IR67 (8-archetype test) — applied Phase 1 + Phase 5
- IR68 (privacy-by-surface) — operator-private rendering enforced at surface
- IR70 (substrate-derived intelligence) — applied to resolution-candidate flow
- IR71 (state-mutation-before-invalidation) — applied to modal lifecycle (especially supersede)
- IR72 (cross-module Phase 1 survey) — mandatory Phase 1 deliverable
- IR73 (state-aware UPDATE RLS WITH CHECK) — surface respects existing UPDATE policy gates (no new RLS)
- Style Doctrine v1.8 §3.8 — module palette discipline

**This CMD does NOT modify:**
- `accord_nras` schema (substrate sealed)
- Helper functions (substrate sealed)
- Trigger functions (substrate sealed)
- CoC EVENT_META (sealed Phase 3 of prior CMD)

---

## §6 — File inventory (anticipated)

**New files:**
- `js/accord-nra.js` — `AccordNRAModal`, `AccordNRABadge`, `AccordNRAHistoryPanel`; substrate API dispatch + CustomEvent dispatch
- `css/accord-nra.css` — modal + badge + history-panel styles (Accord palette only)

**Modified files (Phase 1 IR72 survey verifies exact list):**
- `js/accord-capture.js` — wires modal at node creation; renders badges
- `js/accord-document.js` — same
- `js/accord-ledger.js` — same
- `js/accord-minutes.js` — likely display only
- `js/accord-rails.js` — likely display on parking-lot rows
- `js/accord-views.js` — likely display on sub-list rows
- `accord.html` — script loader extended; modal + history-panel anchors added
- `js/version.js` — single-pin bump (Phase 5; IR65 fires)

**Edge Function changes:** none anticipated. Phase 1 confirms.

---

## §7 — Verification gates

### Phase 1 verification
- All five IR72 survey targets walked and documented with line references
- All four IR64 verification points confirmed or surfaced as findings
- 8-archetype walkthrough produces no demotion/cut recommendations on capture form
- Style Doctrine v1.8 §3.8 palette tokens identified (or palette gap surfaced)
- Forward-flag check for CMD-ACCORD-NRA-BRIEFING-PACK-1 produces dispatch payload spec

### Phase 2 verification
- All 8 badge variants render correctly in isolation
- Modal opens/submits cleanly across all 4 modes (declare/waive/defer/update)
- CSS uses Accord palette only

### Phase 3 verification
- Each wired surface creates nodes with NRA captured atomically
- Helper RPC errors handled gracefully (per existing convention)
- CustomEvents fire on all six event types

### Phase 4 verification
- Badges render on all node-display surfaces with correct variant per NRA state
- Click on badge opens edit modal pre-populated
- Click on history-only badge opens history panel
- CustomEvent listeners trigger badge re-render across surfaces

### Phase 5 closure verification
- Full lifecycle smoke across multiple surfaces (declare → defer → update → supersede → resolve)
- Resolution-candidate flow verified end-to-end
- Grandfathered "+ Add NRA" affordance verified on existing 47 nodes
- History panel verified for nodes with multi-row chains
- 8-archetype walkthrough re-run on shipped product
- IR65 dual-pin coordination verified

### Final acceptance
- Operator confirms NRA is captured atomically at every node creation
- Operator confirms NRA badges render correctly across all surfaces
- Operator confirms reactivity works (changes propagate without manual refresh)
- Operator confirms readiness for CMD-ACCORD-NRA-BRIEFING-PACK-1 to commission

---

## §8 — Open questions architect dispositions before Phase 1

These are architect-internal; operator may weigh in but not required:

1. **Badge size and density discipline.** Visual aesthetic decision; spec defers to Phase 2 implementation. Architect-lean: very small monochrome badges (think 6px font weight); small monochrome with subtle color
2. **Modal vs sheet for the capture form.** Architect-lean: modal v1 (matches existing convention from `#newMeetingModal`)
3. **History-panel mounting location.** Architect-lean: right side panel (follows existing right-rail convention)
4. **Owner-event-type vocabulary in capture form.** Architect-lean: ship with substrate's documented v1 vocabulary; add archetypes via follow-on micro-CMDs as needed

---

## §9 — Doctrine queue impact (anticipated)

| Candidate | Pre-CMD | Post-CMD anticipated |
|---|---|---|
| Verification-test `auth.uid()` in SQL editor | 3 (one-CMD origin; deferred Path 2) | If Phase 1/Phase 2 verification tests apply the pattern, advances to 4 (cross-CMD survival); ratifiable as Iron Rule |
| Style Doctrine v1.8 §3.8 module palette | RATIFIED | Reinforced (Accord palette discipline applied to NRA badge styling) |
| Param-state / clone-replace antipattern | RATIFIED-via-IR71 | Watch for instances during modal lifecycle implementation |
| Optional-chaining silent-noop | 1 | Watch for instance during surface wiring |

---

## §10 — Halt-and-surface terms

Each Phase ends with structured close-out per established CMD pattern (Phase 2-5 close-outs match the shape used in CMD-ACCORD-CONSTELLATION-ENTRY-1 and CMD-ACCORD-NRA-SUBSTRATE-1):

1. Files created/modified
2. IR64 findings (mental model vs. codebase reality)
3. Smoke summary against Phase verification gate
4. Doctrine queue update
5. Open notes for next Phase

Phase 1 close-out is more substantive (investigation phase) per established convention.

CMD seals at Phase 5 close-out + operator final acceptance.

---

## §11 — Success criteria (CMD-level)

The CMD succeeds when:

1. Every node-creation flow in Accord captures NRA atomically (no node can be created without NRA addressed via declare/waive/defer)
2. Every rendered node anywhere in Accord carries an NRA badge (or "+ Add NRA" affordance for grandfathered)
3. Operator can declare/edit/supersede/resolve NRA from the badge with a single click; modal handles all four modes cleanly
4. Resolution-candidate state is visible and actionable wherever the node renders (Confirm/Not yet flow honors IR70)
5. NRA history is accessible via side panel for any node with multi-row chain
6. CustomEvents propagate substrate mutations across all open surfaces; no manual refresh required
7. Deferred-aging color shifts visibly mark NRAs aging past 30d / 60d thresholds
8. CMD-ACCORD-NRA-BRIEFING-PACK-1 can commission against this surface with no architectural rework required

---

## §12 — Ratification

**Operator:** if this brief is acceptable as commissioned scope, please respond with explicit ratification statement:

> "I ratify CMD-ACCORD-NRA-SURFACE-1 as commissioned."

Or specify amendments / questions / dispositions before ratification.

After ratification, architect commissions Phase 1 with the coding agent.

---

*End brief · CMD-ACCORD-NRA-SURFACE-1.*
