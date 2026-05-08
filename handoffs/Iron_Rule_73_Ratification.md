# Iron Rule 73 — Ratification Record

**Ratified:** 2026-05-08 (evening, post CMD-ACCORD-NRA-SUBSTRATE-1 seal)
**Operator:** Vaughn Staples
**Ratification statement:** Operator confirmed CMD seal disposition including F-P4-9 → IR73 ratification (architect-lean).

---

## Iron Rule 73 — State-aware UPDATE RLS WITH CHECK explicit

**Rule:** Substrate tables with state-machine semantics (i.e., a `state` column with a CHECK enum and meaningful transitions between values) ship UPDATE RLS policies as a set of disjoint policies, each covering exactly one legal state transition. Each policy's `USING` predicate gates on the source state (e.g., `state = 'declared'`); each policy's `WITH CHECK` enumerates the legal target state and any required column transitions (e.g., `state = 'resolved' AND resolved_at IS NOT NULL AND resolved_by_resource_id IS NOT NULL`). DELETE policies are absent (default-deny), making such substrates append-only-via-state-changes. The pattern enforces state-machine invariants at the substrate layer; surface layers cannot bypass.

**Source:** Three cross-CMD data points across three substrate tables, eight total explicit UPDATE policies:

1. **CMD-SUBSTRATE-COUNTERFACTUAL-MIN** — `accord_nodes` (implicit single-policy version with `sealed_at IS NULL` predicate gating in-place mutation)
2. **CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1** — `workstreams` (2 explicit policies: `workstreams_update_active`, `workstreams_update_restore` — disjoint state USING + explicit WITH CHECK enumerating target state)
3. **CMD-ACCORD-NRA-SUBSTRATE-1** — `accord_nras` (5 explicit policies: declared→resolved, declared→superseded, declared→deferred, deferred→declared, resolution_candidate flag — all disjoint USING + explicit WITH CHECK)

The pattern emerged organically across substrate work and has now been applied across three different state-machine substrates with consistent shape.

**Application:**

- For any new substrate table with a `state` column carrying enum values and meaningful transitions, author one UPDATE RLS policy per legal transition
- Each policy: `USING (state = '<source>' AND <other gates>)` + `WITH CHECK (state = '<target>' AND <required column population>)`
- Omit DELETE policies entirely (default-deny enforces append-only-via-state-changes)
- Substrate clients (helpers, triggers, surface code) operate within the policy boundaries; substrate enforces state-machine invariants regardless of caller discipline

**What this rule prevents:**

- State-machine bypass via under-specified UPDATE policies (e.g., `USING (true) WITH CHECK (firm_id = my_firm_id())` would allow any state transition)
- Soft-delete vs hard-delete ambiguity (DELETE-disabled forces append-only discipline)
- Surface-layer state corruption (substrate cannot be coerced into invalid states by surface bugs)

**What this rule does NOT cover:**

- Tables without state-machine semantics (single-state tables use simpler UPDATE RLS)
- Cross-row state invariants (those require trigger functions, not RLS)
- Authorization concerns separate from state transitions (firm-scoping, owner-restriction continue to apply within the USING/WITH CHECK clauses)

**Status:** RATIFIED as canon 2026-05-08.

---

## Effect of ratification

- **Doctrine canon now stands at 39 ratified Iron Rules** (36-73) + IR58 amendment + Style Doctrine v1.8 §3.8
- IR73 constrains all future substrate authoring with state-machine semantics
- Substrate-only CMDs going forward apply IR73 in Phase 1 substrate planning and Phase 2 RLS authoring
- F-P4-9 candidate is removed from doctrine queue (promoted to canon as IR73)

---

## Doctrine candidates remaining at 1+ data points (post-IR73)

For successor architect's awareness:

- Verification-test `auth.uid()` in SQL editor (3 data points; one-CMD origin; deferred per architect-lean Path 2; watch for cross-CMD survival in CMD-ACCORD-NRA-SURFACE-1)
- Substrate-helper graceful-NULL `actor_resource_id` in CoC (1 data point)
- PostgreSQL `UPDATE OF` filter + side-effect columns (1 data point)
- Operator deploy gating in test instructions (1 data point; habit, not invariant)
- Supabase SQL editor session ephemerality (1 data point)
- Optional-chaining silent-noop antipattern (1 data point)
- Shared-state Promise.all race antipattern (1 data point)
- Layout-stability vs meaningful-resort design tension (1 data point)
- Deploy-incident filename log-duplication (1 data point)

**End of ratification record.**
