# Commission · CMD-ACCORD-NRA-SURFACE-1 · Phase 1 (Investigation)

**Status:** Commissioned 2026-05-08 late evening
**Operator:** Vaughn Staples
**Architect:** Claude (post-handoff)
**Scope this engagement:** Phase 1 only — investigation, halt-and-surface

---

## §1 — Reference set

- `brief-cmd-accord-nra-surface-1.md` — operator-ratified brief (this CMD)
- `scaffolding-cmd-accord-nra-surface-1.md` — architect scaffolding (component architecture, design decisions, plain-terms summary in §3.6)
- `Iron_Rule_73_Ratification.md` — IR73 canon (state-aware UPDATE RLS WITH CHECK; this CMD respects existing UPDATE policy gates)
- `Iron_Rules_71-72_Ratifications.md` — IR71 (state-mutation-before-invalidation; modal lifecycle vigilance) + IR72 (cross-module Phase 1 survey, mandatory deliverable)
- `Iron_Rules_66-70_Ratifications.md` — IR67 (8-archetype test; mandatory Phase 1 + Phase 5), IR68 (privacy-by-surface), IR70 (substrate-derived intelligence)
- `Style_Doctrine_v1_8.md` — §3.8 module-palette discipline (Accord tokens only)
- `aegis-MASTER-handoff-2026-05-08-late-evening.md` — full build state through CMD-ACCORD-NRA-SUBSTRATE-1 seal
- All prior NRA Substrate close-outs (Phase 1-5) — Phase 5 close-out has the substrate API surface this CMD consumes

---

## §2 — Phase 1 deliverables

Per brief §4 Phase 1, execute seven deliverables. Investigation only — no component code, no surface wiring. End Phase 1 with halt-and-surface document.

1. **IR72 cross-module survey** — five survey targets:
   - Inventory of node-creating surfaces with line references to where `Accord.createNode()` (or equivalent) is invoked
   - Inventory of node-displaying surfaces (capture + ledger + document + minutes + parking-lot + workstream-view sub-list)
   - Existing modal patterns reusable (badge styling, side-panel patterns)
   - Existing CustomEvent dispatch patterns (`accord:meeting-filed`, `accord:workstream-archived`, etc.) — confirm event-naming convention and listener-binding pattern
   - PostgREST RPC invocation pattern (error-handling, response-shape conventions)

2. **IR64 verification** — confirm:
   - `Accord.createNode()` (or equivalent) signature and call sites
   - `accord_nras_current` view returns expected shape via PostgREST GET
   - Existing modal markup for reuse pattern (`#newMeetingModal`, `#rerenderConfirmModal`)
   - `accord_nras` PATCH paths work via PostgREST (declared → deferred, deferred → declared)

3. **8-archetype walkthrough (IR67)** — pressure-test NRA capture form against 1:1 / status sync / project review / retrospective / decision review / kickoff / regulatory / board update meetings. Specifically: is the owner-event-type vocabulary (`next_phase_review`, `next_status_sync`, `next_meeting_in_workstream`, `next_meeting_of_type:<type>`, `next_decision_review`, `next_regulatory_milestone`) right for all archetypes, or are there gaps?

4. **F-P3-6 navigational-classification check** — does any surface code introduce navigational classification this CMD? Architect-lean: no (NRA Surface renders substrate that's already classified). Phase 1 confirms.

5. **Style Doctrine v1.8 §3.8 application check** — Accord palette tokens for badge urgency-aging colors must be Accord palette, not borrowed. Phase 1 reviews existing palette tokens for amber/red equivalents (or surfaces palette gap).

6. **Forward-flag check for CMD-ACCORD-NRA-BRIEFING-PACK-1** — confirm the dispatch payload shape (node_id, nra_id, firm_id minimum) is sufficient for briefing-pack code to react. May surface need for additional payload fields.

7. **Halt-and-surface** with all dispositions, IR64 findings, and Phase 2 readiness.

---

## §3 — Discipline (apply throughout)

- **IR36/37/40 §1** — terse hand-off; silent work-mode; halt on missing input
- **IR39** — capture + display only; no briefing-pack scope creep, no owner-visibility scope creep, no substrate amendments
- **IR64** — verify mental models against codebase; do not rely on scaffolding's substrate-API assumptions without confirmation
- **IR65** — does NOT fire this Phase (investigation only); fires Phase 5 (version pin)
- **IR67** — 8-archetype walkthrough is mandatory deliverable 3
- **IR68** — operator-private rendering enforced at surface (no NRA visibility outside operator-prep contexts in v1)
- **IR70** — substrate-derived intelligence flow (resolution-candidate confirm/not-yet)
- **IR71** — state-mutation-before-invalidation; vigilance on modal lifecycle (especially supersede via clone-replace patterns from prior CMD work)
- **IR72** — cross-module Phase 1 survey is mandatory canon (ratified 2026-05-08); deliverable 1
- **IR73** — does NOT add new RLS this CMD, but surface code must respect the existing UPDATE policies' state-transition gates when invoking PATCH paths
- **Style Doctrine v1.8 §3.8** — module palette discipline (Accord tokens only)
- **Verification-test discipline** (per NRA Substrate Phase 2 Finding 1, Phase 3 Finding 1): deterministic user-id resolution + post-test SELECT verification; do NOT rely on RAISE EXCEPTION surfacing in SQL editor

---

## §4 — What Phase 1 does NOT do

- Does NOT author components (modal, badge, history-panel)
- Does NOT modify any existing surface files
- Does NOT modify substrate (NRA Substrate sealed)
- Does NOT make ratification calls on doctrine candidates (operator's call post-Phase-1)
- Does NOT draft Phase 2-5 deliverables; halt-and-surface ends Phase 1 cleanly

---

## §5 — Halt-and-surface terms

Per established CMD pattern. Single document covering:

1. IR72 cross-module survey results (five targets, with file/line references)
2. IR64 findings (mental model vs. codebase reality)
3. 8-archetype walkthrough results (any vocabulary gaps surfaced)
4. F-P3-6 check result
5. Style Doctrine v1.8 §3.8 palette token inventory (or palette gap surfaced)
6. CMD-ACCORD-NRA-BRIEFING-PACK-1 forward-flag (dispatch payload spec)
7. Phase 2 readiness statement (or blockers if found)
8. Doctrine queue advancement candidates

Phase 2 commissioning is architect's next move after operator reviews Phase 1.

---

*Commission CMD-ACCORD-NRA-SURFACE-1 · Phase 1 · Investigation.*
