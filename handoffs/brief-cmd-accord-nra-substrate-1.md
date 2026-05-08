# Brief · CMD-ACCORD-NRA-SUBSTRATE-1

**Status:** Brief draft, 2026-05-08 evening. Awaiting operator ratification.
**Architect:** Claude (post-handoff)
**Operator:** Vaughn Staples
**Predecessors sealed:** CMD-SUBSTRATE-COUNTERFACTUAL-MIN, CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1, CMD-ACCORD-CONSTELLATION-ENTRY-1
**Successor:** CMD-ACCORD-NRA-SURFACE-1 (next compass-step)
**Scaffolding:** `scaffolding-cmd-accord-nra-substrate-1.md`

---

## §1 — Objective

Stand up the substrate that captures, evolves, and audit-trails NRAs (Next Required Actions) for every artifact in `accord_nodes`. This CMD ships:

- A new `accord_nras` table with full lifecycle support (declare / waive / defer / resolve / supersede)
- RLS policies enforcing firm-scope and node-visibility inheritance
- Six new CoC events covering NRA lifecycle (`accord.nra.*`)
- Trigger functions that detect substrate-level events satisfying NRA conditions (meeting scheduled, meeting sealed, action resolved, decision resolved) and mark resolution candidates for operator confirmation
- An `accord_nras_current` view for retrieving the current NRA per artifact

This is **substrate only**. No surface work; no operator-facing UI. Surface work is CMD-ACCORD-NRA-SURFACE-1.

---

## §2 — Why this CMD now

Three reasons in order of weight:

1. **Forward-motion reconstruction is currently labor.** Operators reconstruct "what's the next required action on this artifact?" from minutes, memory, and inference. Substrate-level NRA externalizes that into queryable data. Senior PMs do this in their head; NRA gives the system the same view.

2. **Defense-kit substrate.** When prior decisions are challenged ("why this supplier?"), reconstructing the decision's full forward-motion history requires walking minutes + attached docs + action items + offline notes. With NRA history preserved as substrate, "DC-014 had clean NRA progression: BOM confirmed → 2 reviews monitored clean → resolved" becomes a single retrievable artifact. This is the foundation for Meeting Setup v5's defense-kit-style features.

3. **Strategic compass alignment.** The build's strategic chain (per `accord-vision-v1.md`) requires NRA Substrate as the next foundation step. Surface and Meeting Setup commission downstream of this; without substrate, the chain stalls.

---

## §3 — Substrate definition (operator-locked)

NRA = **Next Required Action** = structured answer to "what has to happen next for this artifact to move forward?"

**Discipline:**
- Every artifact in `accord_nodes`, at creation, must have NRA addressed in one of three states:
  - **Declared** — type (pending external / pending internal), date, owner, description; optional trigger condition
  - **Waived** — guardrail artifact requiring no forward motion; carries waiver reason
  - **Deferred** — operator commits to declare later; soft prompt with elapsed-day accrual visible; no hard expiration
- NRA is artifact-anchored; evolves over the artifact's life; full sequence preserved as substrate
- Resolution mechanisms: action completion, meeting occurrence, meeting scheduling, operator confirmation
- **NRA closure ≠ artifact closure** (closing a "schedule reconvene" NRA satisfies the NRA, not the underlying risk)
- v1 visibility: operator-private at surface (per IR68); substrate is firm-scoped and node-visibility-gated
- Existing 47 nodes: **grandfathered** — no backfill required

**Out of scope (queued or out):**
- NRA on meetings or workstreams (nodes only for v1)
- Offline-thread substrate (queued: CMD-ACCORD-OFFLINE-THREAD-1)
- NRA visibility to owners or participants (queued: CMD-ACCORD-NRA-OWNER-VISIBILITY-1)
- Surface work (CMD-ACCORD-NRA-SURFACE-1)
- Backfill of existing nodes

---

## §4 — Phase plan

### Phase 1 — Investigation (4-6 hours)

**Mandatory deliverables (per IR72):**

1. **IR72 cross-module survey** — six survey targets:
   - Compass workstream-state events (analogous "checkpoint" or "next-step" substrate)
   - Pipeline action lifecycle (existing "next required step" semantics)
   - Cadence cdn-* substrate ("next meeting must address X" semantics)
   - Existing trigger functions on `accord_meetings` (closest analog for adoption)
   - CoC writer prefix discipline (`accord.*` convention; F-P3-9/F-P4-1)
   - Helper functions (`my_firm_id()` and equivalents)

2. **IR64 verification** — substrate assumptions:
   - `accord_nodes` schema carries the artifact types listed (decision/action/risk/question/dissent)
   - `accord_actors` table FK assumption
   - `my_firm_id()` helper exists and matches expected signature
   - F-P4-9 UPDATE RLS pattern is established convention

3. **IR68 substrate-level disposition** — confirm whether surface-level operator-privacy is sufficient OR identify substrate-level enforcement gap. Architect-lean: surface-level is sufficient for v1; document if Phase 1 finds otherwise.

4. **F-P3-6 navigational-classification check** — does `accord_nras` SELECT policy fit the F-P3-6 pattern? If yes, advances doctrine candidate from 2 to 3 data points.

5. **8-archetype walkthrough (IR67)** — pressure-test NRA shape against 1:1 / status sync / project review / retrospective / decision review / kickoff / regulatory / board update meetings. Anything serving fewer than ~7 archetypes is demoted or cut. (Architect prediction: NRA serves all 8 cleanly because it's substrate-shape-agnostic per IR66 — confirm.)

6. **Five architect-internal open questions** (resolution-candidate semantics, owner_event_type type, trigger granularity, supersession atomicity, IR68 disposition) dispositioned by Phase 1.

7. **Halt-and-surface** with all dispositions and Phase 2 readiness.

### Phase 2 — Table + RLS (3-4 hours)

1. Migration: `accord_nras` table per scaffolding §2.1 schema
2. RLS policies (SELECT firm-scoped + node-visibility-gated; INSERT firm-scoped; UPDATE state-aware per F-P4-9; DELETE disabled)
3. Indexes per scaffolding §2.1
4. `accord_nras_current` view (or equivalent helper)
5. Constraint composition verified (declared-has-owner, declared-has-core)
6. Phase 2 close-out

### Phase 3 — CoC events + writer (2-3 hours)

1. Six new CoC events: `accord.nra.declared`, `accord.nra.waived`, `accord.nra.deferred`, `accord.nra.resolved`, `accord.nra.superseded`, `accord.nra.escalation_surfaced`
2. CoC writer extension with prefix normalization per F-P3-9
3. Helper functions for NRA lifecycle (`declare_nra`, `waive_nra`, `defer_nra`, `resolve_nra`, `supersede_nra`) — these become Surface's substrate API
4. Phase 3 close-out

### Phase 4 — Trigger functions (3-4 hours)

1. `accord_meetings` trigger extension — fires on INSERT (meeting_scheduled) and UPDATE-of-sealed_at (meeting_sealed); identifies matching NRAs by `trigger_kind + trigger_target_id`; marks resolution candidates
2. `accord_nodes` trigger extension — fires on action/decision resolution; identifies matching NRAs; marks candidates
3. `accord_nras` trigger — on declared INSERT validates constraint composition; on supersession validates new NRA exists
4. SECURITY DEFINER vs INVOKER per F-P3-2 conventions (likely DEFINER for cross-table reads; Phase 1 confirms)
5. DROP TRIGGER IF EXISTS pattern per F-P3-7
6. Phase 4 close-out

### Phase 5 — Closure (2 hours)

1. Substrate-level smoke test (insert NRA → declare → defer → declare → supersede → resolve; verify CoC chain at each step)
2. F-P3-6 / F-P3-9 / F-P4-9 dispositions; advance to ratifiable thresholds where applicable
3. IR72 cross-module survey CoC trail confirmed (4th data point reinforces canon)
4. Version pin bump (IR65 fires)
5. CMD seal

**Total estimated effort:** 14-19 hours; multi-session probable.

---

## §5 — Substrate dependencies

**From CMD-SUBSTRATE-COUNTERFACTUAL-MIN (locked):**
- `accord_nodes` table with type taxonomy (decision/action/risk/question/dissent)
- `seq_id` substrate primitive
- `dissent` substrate
- Date-fields convention

**From CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1 (locked):**
- `workstreams` table (naming inconsistency noted; CMD-ACCORD-NAMING-NORMALIZATION-1 queued, out of scope for this CMD)
- `accord_meetings.workstream_id` foreign key
- 7 CoC events: `accord.workstream.*` (prefix convention to extend with `accord.nra.*`)
- Trigger function patterns (workstream cascade, parking-lot index — closest analogs for NRA triggers)

**From doctrine canon:**
- IR67 (8-archetype test) — applied Phase 1
- IR68 (privacy-by-surface) — substrate-level disposition required Phase 1
- IR70 (substrate-derived intelligence) — applied to resolution-candidate flow (substrate proposes, operator confirms)
- IR71 (state-mutation-before-invalidation) — applied to trigger and supersession code
- IR72 (cross-module Phase 1 survey) — mandatory Phase 1 deliverable

**This CMD does NOT modify:**
- Existing `accord_nodes` schema (NRA is on a new table; nodes unchanged)
- Existing `accord_meetings` triggers (extended with new logic; existing logic preserved)
- Existing CoC writer prefix convention (extended; not replaced)

---

## §6 — File inventory (anticipated)

**New SQL migrations:**
- `<timestamp>_accord_nras_table.sql` — table, constraints, indexes, view
- `<timestamp>_accord_nras_rls.sql` — RLS policies
- `<timestamp>_accord_nras_triggers.sql` — trigger functions on `accord_nras`, `accord_meetings`, `accord_nodes`
- `<timestamp>_accord_nras_helper_functions.sql` — `declare_nra`, `waive_nra`, etc.

**New CoC writer additions:**
- Six new event types added to taxonomy
- Writer extended (location TBD per Phase 1 CoC writer survey)

**No client-side changes** in this CMD. Surface CMD ships UI.

---

## §7 — Verification gates

### Phase 1 verification
- All six IR72 survey targets walked and documented
- All four IR64 verification points confirmed or surfaced as findings
- IR68 disposition decided (substrate-level vs. surface-level enforcement)
- Five open questions dispositioned
- 8-archetype walkthrough produces no demotion/cut recommendations (or surfaces them with rationale)

### Phase 2 verification
- Table migration runs clean against current substrate
- RLS policies enforce expected access patterns (test with multi-firm fixture)
- Constraint composition rejects malformed NRAs (declared without owner; declared without core fields)
- View returns correct current NRA for sample nodes

### Phase 3 verification
- Six new CoC events writable through extended writer
- Helper functions enforce state transitions correctly
- Prefix normalization confirmed (`accord.nra.*` matches existing convention)

### Phase 4 verification
- Trigger on `accord_meetings` INSERT correctly identifies matching NRAs and marks candidates
- Trigger on `accord_meetings` UPDATE (sealed_at) correctly identifies matching NRAs and marks candidates
- Trigger on `accord_nodes` action/decision resolution correctly identifies matching NRAs
- Supersession is atomic (old marked superseded + new inserted in single transaction)
- CoC events fire correctly for all six event types

### Phase 5 closure verification
- Full substrate smoke (declare → defer → declare → supersede → resolve)
- CoC chain integrity verified at each step
- Doctrine queue advancements confirmed (F-P3-6, F-P3-9, F-P4-9 wherever applicable; IR72 4th data point)
- Version pin bump landed atomically per IR65

### Final acceptance
- Operator confirms substrate is queryable per defined patterns
- Operator confirms readiness for CMD-ACCORD-NRA-SURFACE-1 to commission against this substrate

---

## §8 — Open questions architect dispositions before Phase 1

These are architect-internal; operator may weigh in but not required:

1. **Resolution candidate semantics** — separate column vs. inferred state. Architect-lean: separate column (`resolution_candidate_at` timestamp) — explicit is better than inferred for substrate clarity. Phase 1 confirms.
2. **`owner_event_type` as text vs. enum** — flexibility vs. type-safety. Architect-lean: text v1 with documented vocabulary (`next_phase_review`, `next_status_sync`, `next_meeting_in_workstream`, `next_meeting_of_type:X`). Promote to enum if Surface stabilizes vocabulary.
3. **Trigger granularity** — `meeting_scheduled_in_workstream` fires per meeting, not per workstream-batch. v1: per meeting (simpler). Phase 1 confirms.
4. **Supersession atomicity** — transaction-level (helper function wraps both writes). Phase 1 confirms whether trigger-based atomicity is feasible OR transaction-level is the cleanest option.
5. **IR68 disposition** — substrate-level vs. surface-level enforcement. Architect-lean: surface-level is sufficient v1; substrate is firm-scoped and node-visibility-gated. Phase 1 confirms.

---

## §9 — Doctrine queue impact (anticipated)

| Candidate | Pre-CMD | Post-CMD anticipated |
|---|---|---|
| F-P3-6 navigational-classification | 2 | 3 if NRA SELECT policy fits pattern → ratifiable |
| F-P3-9/F-P4-1 prefix normalization | 3 (confirmed) | 4 (reinforced; canon) |
| F-P4-9 state-aware UPDATE RLS WITH CHECK | 2 | 3 if NRA UPDATE policies use the pattern → ratifiable |
| IR72 cross-module survey | RATIFIED | reinforced (4th data point post-ratification) |
| IR71 state-mutation-before-invalidation | RATIFIED | applied to trigger + supersession code |

---

## §10 — Halt-and-surface terms

Each Phase ends with structured close-out per established CMD pattern (Phase 2-5 close-outs match the shape used in CMD-ACCORD-CONSTELLATION-ENTRY-1):

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

1. Every existing or future `accord_nodes` artifact CAN have NRAs declared, waived, deferred, resolved, and superseded — full lifecycle queryable
2. NRA history is preserved per artifact (defense-kit substrate is constructible)
3. Substrate-detected resolution candidates fire correctly without auto-resolving (operator-confirmation discipline preserved per IR70)
4. Six new CoC events round-trip correctly through writer + reader
5. RLS policies enforce firm-scope + node-visibility inheritance
6. v1 operator-private property holds at surface level (substrate is firm-scoped and node-gated; surface CMD enforces operator-prep context)
7. CMD-ACCORD-NRA-SURFACE-1 can commission against this substrate with no architectural rework required

---

## §12 — Ratification

**Operator:** if this brief is acceptable as commissioned scope, please respond with explicit ratification statement:

> "I ratify CMD-ACCORD-NRA-SUBSTRATE-1 as commissioned."

Or specify amendments / questions / dispositions before ratification.

After ratification, architect commissions Phase 1 with the coding agent.

---

*End brief · CMD-ACCORD-NRA-SUBSTRATE-1.*
