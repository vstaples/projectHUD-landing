# Scaffolding · CMD-ACCORD-NRA-SURFACE-1

**Status:** Architect scaffolding draft, 2026-05-08 late evening. Pre-brief; operator-architect dialogue locked the design decisions captured below.
**Architect:** Claude (post-handoff)
**Operator:** Vaughn Staples
**Predecessor:** CMD-ACCORD-NRA-SUBSTRATE-1 (sealed)
**Successors (chain):** CMD-ACCORD-NRA-BRIEFING-PACK-1 (briefing-pack integration; new follow-on) → CMD-ACCORD-MEETING-SETUP-1 (v5 mockup commissions)
**Doctrine canon at scaffold:** 39 ratified Iron Rules + IR58 amendment + Style Doctrine v1.8 §3.8

---

## §1 — Surface scope (locked via dialogue 2026-05-08)

NRA Surface v1 = **capture + display.** The substrate API (5 helpers + RLS UPDATE paths + view + candidate query) becomes operator-facing through:

1. **Node-creation NRA capture** — declare/waive/defer addressing in the node-creation flow (atomic with node creation; no orphan-without-NRA state)
2. **NRA display on rendered nodes** — always-visible badge wherever nodes appear; color-shifted aging on deferred; resolution-candidate flagged distinctly; click-to-edit reuses creation modal
3. **Cross-component reactivity** — six `accord:nra-*` CustomEvents dispatched on substrate mutations; subscribers refresh themselves

**Out of v1 scope (queued):**
- **CMD-ACCORD-NRA-BRIEFING-PACK-1** — briefing-pack integration (overdue NRA surfacing, deferred-aging escalation, resolution-candidate confirmation prompts in operator-prep context). Deserves its own design treatment when v5 mockup design context is in front of architect-operator
- **CMD-ACCORD-NRA-OWNER-VISIBILITY-1** — owner-facing NRA visibility; substrate-level enforcement; external-owner support (queued from prior CMD)
- **CMD-ACCORD-NRA-DEFER-NOTE-1** — micro-CMD if "deferral note" requirement emerges (substrate amendment)
- **CMD-ACCORD-NODE-RESOLUTION-SUBSTRATE-1** — adds `accord_nodes` resolution semantic + ships deferred third NRA trigger (queued from prior CMD)

---

## §2 — Design decisions (locked)

### Capture flow
- **1.1 Inline atomic** — node form + NRA fields in one panel; single submit creates node + NRA atomically. No window where node exists without NRA addressed
- **1.2 Waive collapses fields** — selecting Waive collapses all declare-fields to a single "waiver reason" text field
- **1.3 Defer is confirm-only** — selecting Defer shows "OK to defer? You'll be reminded periodically." No deferral note (substrate intentionally lightweight)

### Display
- **2.1 Always-visible badge** — every rendered node carries an NRA badge inline. Restrained design discipline required (small monochrome with subtle color; glanceable not loud)
- **2.2 Color shift with age (deferred)** — `⏸ deferred Nd` neutral ≤30d; amber 31-60d; red 60d+. Tunable constants in surface CSS
- **2.3 Resolution-candidate visible everywhere** — distinct styling (e.g., `✓? Ben Roy · candidate`) wherever the node renders
- **2.4 Click-to-edit reuses creation modal** — badge is the affordance; click opens NRA edit modal in pre-populated mode

### Surface integration
- **3.1 All node-creating surfaces get NRA capture** — comprehensive coverage prevents discipline-bypass loophole. Phase 1 IR72 survey verifies which surfaces actually create nodes
- **3.2 Grandfathered nodes show "+ Add NRA" affordance** — operator may add NRAs retroactively if useful; substrate decision was no-backfill but operator-discoverable
- **3.3 CustomEvents pattern** — six events: `accord:nra-declared`, `accord:nra-waived`, `accord:nra-deferred`, `accord:nra-resolved`, `accord:nra-superseded`, `accord:nra-candidate-flagged`

### Edge cases
- **4.1 "Update NRA" button** — substrate-supersedes silently; operator never sees the word "supersede"
- **4.2 "✓ NRA history (N)" badge** — when history exists but no current NRA; click opens history view
- **4.3 Side panel for history view** — vertical timeline; newest at top; node row stays as-is in source view

---

## §3 — Component architecture (architect-internal; plain-terms summary in §3.6)

### §3.1 — New components

**`AccordNRAModal`** — capture + edit modal. States: `declare`, `waive`, `defer`, `update` (supersede). Pre-populated when editing existing NRA. Reusable across all node-creating surfaces.

**`AccordNRABadge`** — inline badge component. Variants:
- Declared external: `→ <owner_name> · <date_display>` (color by urgency)
- Declared internal-event: `→ <event_type label> · <date_display>`
- Declared internal-operator: `→ Me · <date_display>`
- Waived: `⊘ guardrail`
- Deferred: `⏸ deferred Nd` (color shifts with N)
- Resolution-candidate: `✓? <owner> · candidate`
- History only: `✓ NRA history (N)`
- Grandfathered: `+ Add NRA`

**`AccordNRAHistoryPanel`** — side panel for history view. Vertical timeline; renders prior NRAs chronologically newest-first. Each row: state, type, owner, date, description, resolution mechanism if resolved, supersession arrow if superseded.

### §3.2 — Modified components

Phase 1 IR72 survey identifies; architect-anticipated targets:
- Live Capture surface (`accord-capture.js`) — wires capture modal at node creation
- Living Document surface (`accord-document.js`) — wires capture modal at node creation; renders badges on displayed nodes
- Decision Ledger (`accord-ledger.js`) — same
- Possibly Minutes (`accord-minutes.js`) — render badges on nodes; capture path likely not (minutes are sealed)
- Constellation parking-lot (`accord-rails.js`) — render badges on parking-lot meeting nodes if applicable
- Workstream-view sub-list rows (`accord-views.js`) — render badges if rows show node summaries

### §3.3 — Substrate API consumption

The five helpers are called via PostgREST RPC:
- `POST /rest/v1/rpc/declare_nra` — body: `{ p_node_id, p_nra_type, p_due_date, p_description, p_owner_resource_id, p_owner_event_type, p_owner_is_operator, p_trigger_kind, p_trigger_target_id }`
- `POST /rest/v1/rpc/waive_nra` — body: `{ p_node_id, p_reason }`
- `POST /rest/v1/rpc/defer_nra` — body: `{ p_node_id }`
- `POST /rest/v1/rpc/resolve_nra` — body: `{ p_nra_id, p_mechanism, p_resolved_event_id }`
- `POST /rest/v1/rpc/supersede_nra` — body: `{ p_old_nra_id, p_new_nra_data }` (used for "Update NRA")

Two RLS-direct paths via PostgREST PATCH:
- declared → deferred: `PATCH /rest/v1/accord_nras?nra_id=eq.<id>` body `{ state: 'deferred', deferred_at: '<now>' }`
- deferred → declared: `PATCH /rest/v1/accord_nras?nra_id=eq.<id>` body `{ state: 'declared', ... full declare fields ... }`

**Note: 'declared → deferred' direct PATCH is the path used when operator explicitly defers a previously-declared NRA** (different from "defer at creation" which uses `defer_nra` helper). Capture flow uses helpers; in-flight transitions use PATCH.

Read paths:
- `GET /rest/v1/accord_nras_current?node_id=eq.<id>` — current NRA per node (use for badge rendering)
- `GET /rest/v1/accord_nras?node_id=eq.<id>&order=created_at.desc` — full history (use for history panel)
- `GET /rest/v1/accord_nras_current?resolution_candidate_at=not.is.null&resolved_at=is.null` — global candidate count (briefing-pack-CMD use; v1 uses for badge styling decisions)

### §3.4 — Event dispatch

After every successful RPC/PATCH, the calling surface dispatches the appropriate CustomEvent on `window`:

```javascript
window.dispatchEvent(new CustomEvent('accord:nra-declared', {
  detail: { node_id, nra_id, firm_id }
}));
```

Subscribers register listeners and refresh their renderings:
- `AccordNRABadge` instances re-fetch `accord_nras_current` for their node_id
- `AccordCapture` etc. update displayed lists
- Briefing-pack CMD (future) uses these to refresh candidate counts

### §3.5 — Resolution-candidate detection on display

Surface code reads `accord_nras_current` for each rendered node. The view returns one row per node (or zero if no current NRA). Resolution-candidate flag is computed in surface from `resolution_candidate_at IS NOT NULL AND resolved_at IS NULL`.

When operator clicks a resolution-candidate badge, the edit modal opens with two prominent options: **"Confirm resolved"** (calls `resolve_nra` with mechanism matching the trigger that flagged it) or **"Not yet"** (clears `resolution_candidate_at` via direct PATCH; substrate stays declared). Per IR70 (substrate proposes, operator decides).

### §3.6 — Plain-terms summary (operator skim)

Translation of §3.1-§3.5:

- A new modal handles all NRA capture and edit (Declare/Waive/Defer/Update)
- A new badge component appears next to every node, showing NRA state at a glance
- A new side panel shows NRA history when operator wants to dig in
- Existing surfaces (Live Capture, Living Document, Decision Ledger, possibly others) get wiring to use the modal at node creation and render the badge on displayed nodes
- When operator declares/changes an NRA, the system fires events that other open views listen for and refresh themselves
- Substrate-detected resolution candidates render with distinct styling; operator clicks to confirm "yes, resolved" or "no, not yet"
- Architect flag for Phase 1: IR72 survey identifies the exact list of node-creating surfaces

---

## §4 — Phase plan (proposed; brief refines)

### Phase 1 — Investigation (4-6 hours)

**Mandatory deliverables (per IR72):**

1. **IR72 cross-module survey** — five survey targets:
   - Inventory of node-creating surfaces (`accord-capture.js`, `accord-document.js`, `accord-ledger.js`, possibly others) with line references to where `Accord.createNode()` or equivalent is invoked
   - Inventory of node-displaying surfaces (above plus `accord-minutes.js`, `accord-rails.js` parking-lot, `accord-views.js` sub-list)
   - Existing modal patterns used elsewhere (badge styling, side-panel patterns) — identify reusable conventions
   - Existing CustomEvent dispatch patterns (`accord:meeting-filed`, `accord:workstream-archived`, etc.) — confirm event-naming convention and listener-binding pattern
   - PostgREST RPC invocation pattern in existing surfaces — confirm error-handling and response-shape convention

2. **IR64 verification:**
   - `Accord.createNode()` (or equivalent) signature and call sites
   - `accord_nras_current` view returns expected shape via PostgREST GET
   - Existing modal markup (`#newMeetingModal`, `#rerenderConfirmModal`, etc.) for reuse pattern
   - `accord_nras` PATCH paths work via PostgREST (declared → deferred, deferred → declared)

3. **8-archetype walkthrough (IR67)** — pressure-test NRA capture form against 1:1 / status sync / project review / retrospective / decision review / kickoff / regulatory / board update meetings. Does the form serve all 8 archetypes cleanly? Specifically: is the owner-event-type vocabulary right for all archetypes (e.g., "next 1:1" vs "next phase review" — are both serveable)?

4. **F-P3-6 navigational-classification check** — does any surface code introduce navigational classification this CMD? Likely no (NRA Surface is rendering substrate that's already classified). Phase 1 confirms.

5. **Style Doctrine v1.8 §3.8 application check** — Accord palette tokens for badge colors (urgency-aging colors must be Accord palette, not borrowed). Phase 1 reviews existing palette tokens for amber/red equivalents.

6. **Forward-flag check for CMD-ACCORD-NRA-BRIEFING-PACK-1** — what hooks does briefing-pack CMD need from this CMD? Specifically: the CustomEvents must include enough payload (node_id, nra_id, firm_id minimum) for briefing-pack code to react. Phase 1 confirms the dispatch payload shape.

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

### Phase 5 — Closure (2 hours)

1. Full surface smoke: create node → declare NRA → defer → update → supersede → resolve, across multiple surfaces, observing reactivity
2. Resolution-candidate flow: trigger-detected candidate (insert meeting in workstream matching trigger) → badge updates → operator clicks → "Confirm resolved" or "Not yet"
3. Grandfathered "+ Add NRA" affordance verified on existing 47 nodes
4. History panel verified for nodes with multi-row NRA chains
5. 8-archetype walkthrough re-run on shipped product (not just designs)
6. Version pin bump (IR65 fires this Phase — surface code reads NRA substrate; Edge Function bytes change because surface render output changes)
7. CMD seal

**Total estimated effort:** 16-21 hours; multi-session probable.

---

## §5 — Substrate dependencies

**From CMD-ACCORD-NRA-SUBSTRATE-1 (sealed):**
- `accord_nras` table + 7 RLS policies + 6 indexes + view
- 5 helper functions (declare/waive/defer/resolve/supersede)
- 2 trigger functions (meeting-INSERT + meeting-seal candidate detection)
- 6 CoC EVENT_META entries

**From doctrine canon:**
- IR67 (8-archetype test) — applied Phase 1 + Phase 5
- IR68 (privacy-by-surface) — operator-private rendering enforced at surface; substrate is firm-scoped
- IR70 (substrate-derived intelligence) — applied to resolution-candidate flow (substrate proposes via candidate flag; operator decides via Confirm/Not yet)
- IR71 (state-mutation-before-invalidation) — applied to modal lifecycle (especially the supersede flow's clone-replace patterns from prior CMD work)
- IR72 (cross-module Phase 1 survey) — mandatory Phase 1 deliverable
- IR73 (state-aware UPDATE RLS WITH CHECK) — does NOT apply this CMD (no new RLS); but surface code must respect the existing UPDATE policies' state-transition gates

**This CMD does NOT modify:**
- `accord_nras` schema (substrate sealed)
- Helper functions (substrate sealed)
- Trigger functions (substrate sealed)
- CoC EVENT_META (sealed Phase 3 of prior CMD)

---

## §6 — File inventory (anticipated)

**New JS files:**
- `js/accord-nra.js` — `AccordNRAModal`, `AccordNRABadge`, `AccordNRAHistoryPanel`; substrate API dispatch + CustomEvent dispatch; main surface module

**New CSS:**
- `css/accord-nra.css` — modal + badge + history-panel styles. Accord palette only

**Modified JS (Phase 1 IR72 survey verifies exact list):**
- `js/accord-capture.js`
- `js/accord-document.js`
- `js/accord-ledger.js`
- `js/accord-minutes.js` (likely display only; possibly capture)
- `js/accord-rails.js` (likely display on parking-lot rows)
- `js/accord-views.js` (likely display on sub-list rows)

**Modified HTML:**
- `accord.html` — script loader extended; modal markup added; history-panel anchor added

**Edge Function changes:** none anticipated (no Edge Function reads `accord_nras` yet; surface uses PostgREST direct). Phase 1 confirms.

**Version pin bump (Phase 5):** IR65 fires — surface reads NRA substrate; render output changes.

---

## §7 — Discipline checklist for brief

- IR36/37/40 in play
- IR39 strict — capture + display only; no briefing-pack scope creep, no owner-visibility scope creep
- IR64 verification at Phase 1 (multiple targets per §4 Phase 1)
- IR65 fires Phase 5 (version pin; surface code touches Edge Function rendering)
- IR67 8-archetype test mandatory Phase 1 + Phase 5
- IR68 surface-level enforcement (operator-private rendering of NRA history; no NRA visibility outside operator-prep contexts in v1)
- IR70 substrate-derived intelligence (resolution-candidate flow)
- IR71 state-mutation-before-invalidation (modal lifecycle, especially supersede)
- IR72 cross-module survey is mandatory Phase 1 deliverable
- IR73 NOT applicable (no new RLS), but surface respects existing UPDATE policy gates
- Style Doctrine v1.8 §3.8 module palette discipline (Accord tokens only)
- Verification-test discipline (per NRA Substrate Phase 2/3 Findings): deterministic user-id; post-test SELECT verification

---

## §8 — Open questions architect dispositions before brief drafts

These are architect-internal; operator may weigh in but not required:

1. **Badge size and density discipline.** Visual aesthetic decision — needs reference designs from Phase 2. Architect-lean: very small monochrome badges (think 6px font size weight); spec defers to Phase 2 implementation
2. **Modal vs sheet for the capture form.** Modal interrupts; sheet (slide-in from right) is less disruptive. Architect-lean: modal v1 (matches existing convention from `#newMeetingModal`)
3. **History-panel mounting location.** Right side panel (matches workstream-view right rail pattern) vs left panel vs floating overlay. Architect-lean: right side panel, follows existing right-rail convention
4. **Owner-event-type vocabulary in capture form.** Phase 1 IR67 walkthrough may reveal vocabulary gaps. Architect-lean: ship with the substrate's documented v1 vocabulary; add archetypes via follow-on micro-CMDs as needed

---

## §9 — Doctrine queue impact (anticipated)

| Candidate | Pre-CMD | Post-CMD anticipated |
|---|---|---|
| Verification-test `auth.uid()` in SQL editor | 3 (one-CMD origin; deferred Path 2) | If Phase 1/Phase 2 verification tests apply the pattern, advances to 4 (cross-CMD survival); ratifiable as Iron Rule |
| Style Doctrine v1.8 §3.8 module palette | RATIFIED | Reinforced (Accord palette discipline applied to NRA badge styling) |
| Param-state / clone-replace antipattern | RATIFIED-via-IR71 | Watch for instances during modal lifecycle implementation |
| Optional-chaining silent-noop | 1 | Watch for instance during surface wiring |

---

## §10 — Successors / chain context

After CMD-ACCORD-NRA-SURFACE-1 seals:

1. **CMD-ACCORD-NRA-BRIEFING-PACK-1** — briefing-pack integration. Renders overdue NRAs, deferred-aging escalation, resolution-candidate prompts in operator-prep context. Designed when v5 mockup design context is in front of architect-operator (likely commissioned after CMD-ACCORD-MEETING-SETUP-1 or in concert with it)

2. **CMD-ACCORD-MEETING-SETUP-1** — v5 mockup commission. NRA Substrate + Surface have shipped; the briefing pack integrates NRA signals. Strategic-chain inflection point

3. **CMD-ACCORD-NODE-RESOLUTION-SUBSTRATE-1** — adds `accord_nodes` resolution semantic; ships deferred third NRA trigger (queued from prior CMD)

4. **CMD-ACCORD-NRA-OWNER-VISIBILITY-1** — owner-facing NRA visibility (queued from prior CMD)

This CMD is the operator-facing payoff of the NRA architecture. After this ships, every node in Accord carries declarable forward-motion intent visible to the operator. The substrate work invested across NRA Substrate becomes immediately useful.

---

*End scaffolding · CMD-ACCORD-NRA-SURFACE-1.*
