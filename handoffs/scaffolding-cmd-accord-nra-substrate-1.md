# Scaffolding · CMD-ACCORD-NRA-SUBSTRATE-1

**Status:** Architect scaffolding draft, 2026-05-08 evening. Pre-brief; subject to architect-operator dialogue refinement.
**Architect:** Claude (post-handoff)
**Operator:** Vaughn Staples
**Predecessors:** CMD-SUBSTRATE-COUNTERFACTUAL-MIN (sealed), CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1 (sealed), CMD-ACCORD-CONSTELLATION-ENTRY-1 (sealed)
**Successors (chain):** CMD-ACCORD-NRA-SURFACE-1 → CMD-ACCORD-MEETING-SETUP-1 (v5 mockup commissions here)
**Doctrine canon at scaffold:** 38 ratified Iron Rules + IR58 amendment + Style Doctrine v1.8 §3.8

---

## §1 — Substrate definition (locked via dialogue 2026-05-08)

**NRA = Next Required Action.** Structured answer to "what has to happen next for this artifact to move forward?"

**Discipline:**
- Every artifact in `accord_nodes` (decision, action, risk, question, dissent), at creation, must have NRA addressed in one of three states:
  - **Declared** (with type, date, owner, description; optional trigger condition)
  - **Waived** (guardrail artifact requiring no forward motion; carries waiver reason)
  - **Deferred** (operator commits to declare later; soft prompt with elapsed-day accrual; no hard expiration)
- NRA is artifact-anchored; evolves over the artifact's life; the full sequence is preserved as substrate
- Resolution mechanisms: action completion, meeting occurrence, meeting scheduling, operator confirmation
- **NRA closure ≠ artifact closure** (closing "schedule reconvene" NRA satisfies the NRA, not the underlying risk)
- v1 visibility: operator-private (per IR68); owner-visibility queued as `CMD-ACCORD-NRA-OWNER-VISIBILITY-1` for after Surface ships
- Existing 47 nodes: **grandfathered** (no backfill required; system treats them as legitimately NRA-less rather than missing data)

**Out of v1 scope (queued or out):**
- NRA on meetings or workstreams (architectural decision: nodes only for v1)
- Offline-thread substrate (queued: `CMD-ACCORD-OFFLINE-THREAD-1`)
- NRA visibility to owners or participants (queued: `CMD-ACCORD-NRA-OWNER-VISIBILITY-1`)
- Backfill of NRAs on existing nodes
- Any surface work (CMD-ACCORD-NRA-SURFACE-1)

---

## §2 — Substrate shape (architect-internal; plain-terms summary in §2.5)

### §2.1 — New table: `accord_nras`

```
accord_nras (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id             uuid NOT NULL REFERENCES accord_nodes(id) ON DELETE CASCADE,
  firm_id             uuid NOT NULL,
  
  -- State
  state               text NOT NULL CHECK (state IN ('declared', 'waived', 'deferred', 'resolved', 'superseded')),
  
  -- Declared NRA fields (NULL when state IN ('waived', 'deferred'))
  nra_type            text CHECK (nra_type IN ('pending_external', 'pending_internal') OR nra_type IS NULL),
  due_date            date,
  description         text,
  
  -- Owner: at-least-one constraint when state='declared'
  owner_actor_id      uuid REFERENCES accord_actors(id),  -- external person
  owner_event_type    text,  -- e.g., 'next_phase_review', 'next_status_sync', 'next_meeting_in_workstream'
  owner_is_operator   boolean NOT NULL DEFAULT false,
  
  -- Optional trigger condition (substrate-detected resolution candidate)
  trigger_kind        text,  -- 'meeting_sealed_in_workstream' | 'meeting_scheduled_in_workstream' | 'action_resolved' | 'decision_resolved' | NULL
  trigger_target_id   uuid,  -- contextual target (workstream_id, node_id depending on trigger_kind)
  
  -- Waived state
  waived_at           timestamptz,
  waived_reason       text,
  
  -- Deferred state
  deferred_at         timestamptz,
  -- elapsed-day accrual computed by surface from deferred_at
  
  -- Resolved state
  resolved_at         timestamptz,
  resolved_by_actor_id uuid REFERENCES accord_actors(id),
  resolved_mechanism  text CHECK (resolved_mechanism IN ('manual', 'meeting_scheduled', 'meeting_sealed', 'action_resolved', 'decision_resolved') OR resolved_mechanism IS NULL),
  resolved_event_id   uuid,  -- pointer to the satisfying event (meeting_id, node_id) when applicable
  
  -- Supersession (when an artifact's NRA evolves; old row becomes superseded; new row is current)
  superseded_at       timestamptz,
  superseded_by_id    uuid REFERENCES accord_nras(id),
  
  -- Lifecycle
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by_actor_id uuid NOT NULL REFERENCES accord_actors(id)
);

-- At-least-one owner constraint (only when state='declared')
ALTER TABLE accord_nras ADD CONSTRAINT nra_declared_has_owner
  CHECK (
    state != 'declared' 
    OR owner_actor_id IS NOT NULL 
    OR owner_event_type IS NOT NULL 
    OR owner_is_operator = true
  );

-- Declared NRAs need core fields
ALTER TABLE accord_nras ADD CONSTRAINT nra_declared_has_core
  CHECK (
    state != 'declared' 
    OR (nra_type IS NOT NULL AND due_date IS NOT NULL AND description IS NOT NULL)
  );

-- Indexes
CREATE INDEX nras_node_id_idx ON accord_nras(node_id);
CREATE INDEX nras_firm_id_state_idx ON accord_nras(firm_id, state);
CREATE INDEX nras_due_date_idx ON accord_nras(due_date) WHERE state = 'declared';
CREATE INDEX nras_owner_actor_idx ON accord_nras(owner_actor_id) WHERE state = 'declared';
CREATE INDEX nras_trigger_kind_idx ON accord_nras(trigger_kind, trigger_target_id) WHERE state = 'declared' AND trigger_kind IS NOT NULL;
```

### §2.2 — Current-NRA derivation

The "current" NRA for a node is the NRA row where `superseded_at IS NULL AND state IN ('declared', 'waived', 'deferred')`. There can be at most one such row per node.

A view (or query helper) exposes this:
```
CREATE VIEW accord_nras_current AS
SELECT * FROM accord_nras
WHERE superseded_at IS NULL
  AND state IN ('declared', 'waived', 'deferred');
```

### §2.3 — RLS posture

- **SELECT:** `firm_id = my_firm_id()` AND node visibility via existing `accord_nodes` RLS chain (participant-scoped through `accord_meetings` membership). NRAs inherit node visibility — if you can see the node, you can see its NRAs.
- **INSERT:** firm-scoped; created_by_actor_id must match auth.uid()'s actor.
- **UPDATE:** firm-scoped; restricted to specific column sets per state transition (declared → resolved updates `resolved_at`, `resolved_by_actor_id`, `resolved_mechanism`, `resolved_event_id`; declared → superseded updates `superseded_at`, `superseded_by_id`; etc.). Pattern follows F-P4-9 (state-aware UPDATE RLS WITH CHECK explicit) — Phase 1 verifies whether F-P4-9 advances to ratifiable threshold here.
- **DELETE:** disabled (substrate is append-only; supersession + state changes are how NRAs "end").

**v1 operator-private clarification:** at substrate level, NRAs are firm-scoped and node-visibility-gated. The "operator-private" property emerges at *surface*: surface code only renders NRAs in operator-prep contexts (briefing pack, prep workspace), not in attendee-facing contexts. Substrate doesn't enforce operator-privacy directly because there's no canonical "operator vs attendee" runtime distinction in substrate today. **This deserves Phase 1 IR64 verification** — confirm the assumption is right or surface a substrate-level enforcement need.

### §2.4 — CoC events

Six new events, all chained to the artifact's CoC stream (`accord.node.{node_id}`):

- `accord.nra.declared` — payload: `{nra_id, nra_type, due_date, description, owner_*, trigger_*}`
- `accord.nra.waived` — payload: `{nra_id, waived_reason}`
- `accord.nra.deferred` — payload: `{nra_id}`
- `accord.nra.resolved` — payload: `{nra_id, resolved_mechanism, resolved_event_id}`
- `accord.nra.superseded` — payload: `{old_nra_id, new_nra_id}`
- `accord.nra.escalation_surfaced` — payload: `{nra_id, surfaced_in_meeting_id}` — fired when an NRA is surfaced as overdue/aged on a meeting briefing pack (audit trail for which meeting flagged what)

CoC writer prefix normalization per F-P3-9/F-P4-1: events use `accord.nra.*` prefix to match the established convention.

### §2.5 — Plain-terms summary (for operator skim)

Translation of §2.1-§2.4:

- A new database table (`accord_nras`) stores every NRA every artifact has ever had
- Each NRA row carries: type, date, owner, description, state (declared/waived/deferred/resolved/superseded), and bookkeeping for resolution and supersession
- One artifact can have many NRA rows (history); only one is "current" at a time
- The full chain is preserved as substrate so the defense-kit scenario works ("DC-014 had clean NRA progression")
- Six new CoC events log every change to NRA state — same audit-trail discipline as everything else in Accord
- v1 NRA visibility is operator-private at surface level; substrate is firm-scoped
- Architect flag for Phase 1: confirm that surface-level operator-privacy is sufficient, or find a substrate enforcement gap

---

## §3 — Event-driven resolution mechanics

NRA can be resolved by substrate events fired elsewhere in the build. This is the substrate-level "coaching" infrastructure — when something happens, the NRA system reacts.

### §3.1 — Resolution triggers (substrate-detected)

| Trigger kind | Fires when | Resolution candidate flagged |
|---|---|---|
| `meeting_scheduled_in_workstream` | A new `accord_meetings` row is INSERT-ed with workstream_id matching `trigger_target_id` | NRA is candidate-resolved (manual confirm) |
| `meeting_sealed_in_workstream` | An `accord_meetings.sealed_at` is UPDATE-ed and workstream_id matches `trigger_target_id` | NRA is candidate-resolved (manual confirm) |
| `action_resolved` | An `accord_nodes` of type=action UPDATE-s sealed/closed state and id matches `trigger_target_id` | NRA candidate-resolved |
| `decision_resolved` | (rare; for NRAs that resolve when a related decision is overturned/ratified) | NRA candidate-resolved |

**Implementation pattern:** trigger functions on `accord_meetings` and `accord_nodes` query for matching `accord_nras` rows with `state='declared' AND trigger_kind=X AND trigger_target_id=Y`, mark them as `resolution_candidate` (architect note: a separate column or `resolved_state IS NULL` semantic; Phase 1 decides), surface to operator at next briefing-pack render.

**Critical: resolution is operator-confirmed, not auto-resolved.** Substrate-detected resolution flags an NRA as a *candidate* for closure; the operator confirms or denies in surface flow. This honors IR70 (substrate-derived intelligence; operator-actionable) — substrate proposes, operator decides. v1 takes this conservative posture; v2 (CMD-ACCORD-NRA-SURFACE-1 or later) may add auto-resolve for high-confidence triggers.

### §3.2 — Escalation surfacing

When an NRA's `due_date` passes without resolution (`due_date < CURRENT_DATE AND state='declared' AND resolved_at IS NULL`):

- Briefing-pack surfaces the NRA as overdue (Surface CMD's job)
- Substrate fires `accord.nra.escalation_surfaced` CoC event the first time it's surfaced in a given meeting's briefing pack (idempotent per meeting)

For deferred NRAs: surface logic computes `now() - deferred_at` in days; renders elapsed accrual visibly. No substrate-side trigger fires unless operator-configured threshold is later added (out of v1).

### §3.3 — Architectural enabling-finding required from Phase 1 cross-module survey (IR72)

Phase 1 must survey:

1. **Compass workstream-state events** — does Compass have analogous "checkpoint" or "next-step" substrate? If so, naming/shape may inform NRA's vocabulary
2. **Pipeline action lifecycle** — Pipeline kanban tracks action progression; Pipeline's substrate may have "next required step" semantics (e.g., "this action is in Review state; next required is Approver-action"). If so, NRA may align to Pipeline's vocabulary or reveal divergence
3. **Cadence cdn-* substrate** — Cadence handles meeting cadence; does it carry "next meeting must address X" substrate? If so, may inform NRA's `meeting_scheduled_in_workstream` trigger
4. **Existing trigger functions** — `accord_meetings` triggers (workstream cascade, parking-lot index) are the closest analog; reuse pattern. SECURITY DEFINER vs INVOKER per F-P3-2
5. **Existing CoC writer** — `accord.workstream.*` events established the prefix convention; `accord.nra.*` follows. F-P3-9/F-P4-1 prefix normalization at 3 data points; this CMD reinforces (cross-module data point #4 likely)
6. **`my_firm_id()` and other helper functions** — reuse established patterns; do not introduce new helper names

This is an IR72 cross-module survey CMD by definition (touches shared client-side conventions through the Surface follow-on; affects substrate that Surface and downstream CMDs read). Phase 1 cross-module survey is **mandatory deliverable**.

---

## §4 — Phase plan (proposed; brief refines)

### Phase 1 — Investigation (4-6 hours)

Mandatory deliverables:
1. **IR72 cross-module survey** per §3.3 (six survey targets above)
2. **IR64 verification** of substrate assumptions:
   - `accord_nodes` schema actually has the types listed (decision/action/risk/question/dissent)
   - `accord_actors` table shape matches `owner_actor_id` FK assumption
   - `my_firm_id()` helper exists and matches expected signature
   - F-P4-9 UPDATE RLS pattern is the established convention
3. **F-P3-6 navigational-classification check** — does the `accord_nras` SELECT policy fit the F-P3-6 pattern (workstream-id-based or organizer-based classification in policy logic)? If yes, advances doctrine candidate from 2 to 3
4. **CoC writer survey** — confirm `accord.*` prefix discipline; identify writer location and structure for the six new events
5. **Trigger function survey** — find the closest existing analog (workstream cascade or meeting state change) for adoption pattern
6. **IR68 verification** — confirm at substrate level whether operator-privacy can be enforced (per architect flag in §2.3); recommend disposition
7. **8-archetype walkthrough** — pressure-test NRA shape against 1:1 / status sync / project review / retrospective / decision review / kickoff / regulatory / board update meetings. Does NRA serve all 8? Anything serving fewer than ~7 is demoted or cut
8. **Halt-and-surface** with dispositions, IR64 findings, and Phase 2 readiness

### Phase 2 — Table + RLS (3-4 hours)

1. Migration: `accord_nras` table per §2.1 schema
2. RLS policies (SELECT, INSERT, UPDATE; DELETE disabled)
3. Indexes
4. `accord_nras_current` view (or equivalent helper)
5. F-P4-9 state-aware UPDATE RLS WITH CHECK explicit (per Phase 1 disposition)
6. Phase 2 close-out

### Phase 3 — CoC events + writer (2-3 hours)

1. Six new event types added to event taxonomy
2. CoC writer extended (prefix normalization per F-P3-9)
3. Helper functions for declaring/waiving/deferring/resolving/superseding NRAs (these become Surface's substrate API)
4. Phase 3 close-out

### Phase 4 — Trigger functions (3-4 hours)

1. `accord_meetings` trigger extension — fires on INSERT (meeting_scheduled) and UPDATE-of-sealed_at (meeting_sealed); identifies matching NRAs; marks candidates
2. `accord_nodes` trigger extension — fires on action/decision resolution; identifies matching NRAs; marks candidates
3. `accord_nras` trigger — on declared INSERT, validates constraint composition; on supersession, validates new NRA exists
4. SECURITY DEFINER vs INVOKER per F-P3-2 conventions (likely DEFINER for cross-table reads)
5. DROP TRIGGER IF EXISTS pattern per F-P3-7
6. Phase 4 close-out

### Phase 5 — Closure (2 hours)

1. Substrate-level smoke (insert NRA → declare → defer → declare → supersede → resolve; verify CoC chain)
2. Cross-module Phase 1 survey CoC trail confirmed (4th data point for IR72 — already ratified, so reinforces canon)
3. F-P3-6 / F-P3-9 / F-P4-9 dispositions (advance to ratifiable thresholds where applicable)
4. Version pin bump (IR65 fires)
5. CMD seal

**Total estimated effort:** 14-19 hours, multi-session probable.

---

## §5 — Open questions for brief drafting

These are architect-internal questions to resolve before brief drafts. Operator may weigh in but not required.

1. **Resolution candidate semantics (§3.1):** is `resolution_candidate` a separate column, or is it inferred from `state='declared' AND trigger_fired_but_unconfirmed`? Phase 1 disposition.
2. **Operator-privacy enforcement (§2.3 flag):** substrate-level constraint vs. surface-level convention. Phase 1 disposition.
3. **Trigger granularity:** `meeting_scheduled_in_workstream` could fire per meeting or per workstream-batch. v1: per meeting (simpler). Phase 1 confirms.
4. **`owner_event_type` as text vs. enum:** flexibility (text) vs. type-safety (enum). Architect-lean: text v1 with documented vocabulary; enum if vocabulary stabilizes by Surface. Brief decides.
5. **Supersession atomicity:** when an NRA is superseded by a new NRA, both rows must update atomically. Trigger or transaction-level? Phase 1 confirms.

---

## §6 — Discipline checklist for brief

- IR36/37/40 in play
- IR39 strict — substrate work; no surface scope creep
- IR64 verification at Phase 1 (multiple targets per §4 Phase 1)
- IR65 fires Phase 5 (version pin)
- IR68 substrate-level disposition required (Phase 1)
- IR72 cross-module survey is **mandatory** Phase 1 deliverable
- F-P3-2 / F-P3-7 / F-P3-9 / F-P4-1 / F-P4-9 all apply per Phase 1 survey
- F-P3-6 cross-CMD data-point opportunity (advances if NRA SELECT policy matches navigational-classification pattern)
- Cross-module Phase 1 survey is now mandatory canon (IR72 ratified 2026-05-08); no longer doctrine candidate
- IR71 (state-mutation-before-invalidation) applies to coding-agent work — particular vigilance on trigger function interactions and supersession atomicity

---

## §7 — Successors / chain context

After CMD-ACCORD-NRA-SUBSTRATE-1 seals:

1. **CMD-ACCORD-NRA-SURFACE-1** — minimum NRA UI; declare/waive/defer affordances at node creation; current-NRA display; resolution-candidate confirmation flow; deferred-NRA aging surfacing. Operator-private surfaces only (per IR68).

2. **CMD-ACCORD-NRA-OWNER-VISIBILITY-1** (queued; activates when operator decides) — owner-facing NRA visibility; affects IR68 application and likely introduces new participant-scoped surface category.

3. **CMD-ACCORD-MEETING-SETUP-1** — v5 mockup commission. By this time, NRA Substrate + Surface have shipped; the briefing pack integrates NRA signals from day one (overdue NRAs, deferred-aging, resolution-candidates surfaced).

The substrate work in this CMD is foundation for at least three downstream CMDs. Get it right.

---

*End scaffolding · CMD-ACCORD-NRA-SUBSTRATE-1.*
