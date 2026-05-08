# Commission · CMD-ACCORD-NRA-SUBSTRATE-1 · Phase 2 (Table + RLS)

**Status:** Phase 1 closed; Phase 2 commissioned 2026-05-08 evening
**Operator:** Vaughn Staples
**Architect:** Claude (post-handoff)
**Scope this engagement:** Phase 2 only — table migration, RLS policies, indexes, view, halt-and-surface

---

## §1 — Phase 1 close-out acknowledgment

Phase 1 halt-and-surface received and reviewed. All eight commissioned deliverables completed; investigation depth substantive; one critical IR64 finding (no `accord_actors` table) and several clean dispositions. Operator decisions required: zero — all Q1-Q5 dispositions matched brief architect-leans cleanly.

**Doctrine queue updates (Phase 1):**
- F-P3-2 reinforced to 4 data points (already canon)
- F-P3-9/F-P4-1 reinforced to 4 data points (already canon)
- F-P3-6 stays at 2 (NRA SELECT is plain firm-scoped; no navigational classification — brief §9 anticipated 3 was incorrect)
- F-P4-9 stays at 2; advances to 3 in Phase 2 if NRA's UPDATE policies use disjoint-USING + explicit-WITH-CHECK pattern
- IR72 reinforced (4th cross-CMD application; first since ratification — ratified-canon-applied-correctly data point)
- Param-state / clone-replace antipattern noted at 3 data points (architect ratification call carried separately)

---

## §2 — Phase 1 dispositions (operator-ratified)

### Disposition 1 — Schema FK corrections (IR64 finding §2.2)

**`accord_actors` does not exist in substrate.** Scaffolding §2.1 schema requires three column corrections per architect disposition:

| Original | Corrected | Rationale |
|---|---|---|
| `owner_actor_id uuid REFERENCES accord_actors(id)` | `owner_resource_id uuid REFERENCES resources(id)` | Owner = domain-actor concept (who is responsible for forward motion); matches CoC `actor_resource_id` and `accord_nodes.dissented_by` |
| `resolved_by_actor_id uuid REFERENCES accord_actors(id)` | `resolved_by_resource_id uuid REFERENCES resources(id)` | Resolver = domain-actor concept; matches owner pattern |
| `created_by_actor_id uuid NOT NULL REFERENCES accord_actors(id)` | `created_by_user_id uuid NOT NULL REFERENCES users(id)` | Creator = "who wrote this row" = auth identity; matches `accord_nodes.created_by` pattern (different concept than owner/resolver) |

**Two FK targets, three columns. Honest to substrate truth — owner/resolver are domain-actor concepts; creator is auth-identity concept.** This carries forward into RLS UPDATE policies: WITH CHECK on owner/resolver compares against `accord_user_to_resource(auth.uid())`; WITH CHECK on creator compares against `auth.uid()` directly.

**External-owner support deferred (per Phase 1 §2.2 sub-options):** v1 supports owner via `owner_resource_id` OR `owner_event_type` OR `owner_is_operator=true`. External-owner-without-resource-row deferred to CMD-ACCORD-NRA-OWNER-VISIBILITY-1.

### Disposition 2 — Resolution candidate semantics (Q1)

Add `resolution_candidate_at timestamptz` column to `accord_nras` schema. Trigger functions (Phase 4) set it without changing `state`. Surface checks for `resolution_candidate_at IS NOT NULL AND resolved_at IS NULL` to render confirmation prompts.

### Disposition 3 — `owner_event_type` text v1 with documented vocabulary (Q2)

Text column with v1 vocabulary documented as constraint comment:
- `next_phase_review`
- `next_status_sync`
- `next_meeting_in_workstream`
- `next_meeting_of_type:<type>` (where `<type>` is one of the 8 IR67 archetypes)
- `next_decision_review`
- `next_regulatory_milestone`

Promotion to enum deferred to follow-on CMD if vocabulary stabilizes by Surface ship.

### Disposition 4 — Trigger granularity per meeting (Q3)

Per-meeting trigger fires; queries matching NRAs and updates `resolution_candidate_at` per match. No batching optimization for v1. Phase 4 work item.

### Disposition 5 — Supersession atomicity transaction-level (Q4)

Phase 3 helper function `supersede_nra(p_old_id uuid, p_new_nra_data jsonb)` wraps INSERT-new + UPDATE-old in a single transaction. Trigger-based atomicity rejected (mixed semantics, harder RLS reasoning, audit-trail confusion). Phase 3 work item.

### Disposition 6 — IR68 substrate-level enforcement: surface-level v1 (Q5)

Substrate is firm-scoped + creator/owner-restricted (per F-P4-9 pattern). Surface in CMD-ACCORD-NRA-SURFACE-1 enforces operator-prep-only rendering. Phase 5 close-out flags forward-warning for CMD-ACCORD-NRA-OWNER-VISIBILITY-1: substrate-level enforcement may need addition then.

### Disposition 7 — `note` tag NRA scope

Phase 1 surfaced that `accord_nodes.tag` enumeration includes `note` alongside the five expected types (decision/action/risk/question/dissent). Architect-lean: **YES, `note` artifacts get NRA support.** NRA is artifact-shape-agnostic per IR66. Brief §3 says "every artifact in `accord_nodes`" — covers all 6 tags. Scaffolding §1 enumeration was illustrative not exhaustive; correctly scoped.

---

## §3 — Phase 2 deliverables

Per brief §4 Phase 2, refined with Phase 1 dispositions:

1. **Migration: `accord_nras` table** per corrected schema:
   - All scaffolding §2.1 columns with the three FK corrections (Disposition 1)
   - Add `resolution_candidate_at timestamptz` (Disposition 2)
   - Add `owner_event_type` constraint comment with v1 vocabulary (Disposition 3)
   - Constraint composition: `nra_declared_has_owner`, `nra_declared_has_core` per scaffolding §2.1

2. **RLS policies — F-P4-9 disjoint-USING + explicit-WITH-CHECK pattern:**
   - **SELECT:** `firm_id = my_firm_id()` (uniform with sibling Accord tables)
   - **INSERT:** `firm_id = my_firm_id() AND created_by_user_id = auth.uid()`
   - **UPDATE policies (4-5 disjoint policies enumerating state transitions):**
     - `nras_update_declared_to_resolved` — USING: state='declared'; WITH CHECK: state IN ('declared','resolved')
     - `nras_update_declared_to_superseded` — USING: state='declared'; WITH CHECK: superseded_at IS NOT NULL
     - `nras_update_deferred_to_declared` — USING: state='deferred'; WITH CHECK: state IN ('deferred','declared')
     - `nras_update_resolution_candidate` — USING: state='declared' AND resolved_at IS NULL; WITH CHECK: state='declared' AND resolution_candidate_at IS NOT NULL (trigger-only path; SECURITY DEFINER may apply per F-P3-2)
     - Additional policies as needed for waived/deferred state entry
   - **DELETE:** disabled
   - Phase 2 watches whether F-P4-9 advances to 3rd cross-CMD data point (ratifiable post-CMD)

3. **Indexes** per scaffolding §2.1:
   - `nras_node_id_idx` ON node_id
   - `nras_firm_id_state_idx` ON (firm_id, state)
   - `nras_due_date_idx` ON due_date WHERE state='declared'
   - `nras_owner_resource_idx` ON owner_resource_id WHERE state='declared'
   - `nras_trigger_kind_idx` ON (trigger_kind, trigger_target_id) WHERE state='declared' AND trigger_kind IS NOT NULL

4. **`accord_nras_current` view:**
   ```sql
   CREATE VIEW accord_nras_current AS
   SELECT * FROM accord_nras
   WHERE superseded_at IS NULL
     AND state IN ('declared', 'waived', 'deferred');
   ```

5. **Verification per Phase 2 verification gate** (brief §7):
   - Migration runs clean against current substrate
   - RLS policies enforce expected access patterns (test against multi-firm fixture if available)
   - Constraint composition rejects malformed NRAs (declared without owner; declared without core fields)
   - View returns correct current NRA for sample rows

6. **Phase 2 close-out** per established pattern:
   - Files created/modified
   - IR64 findings (mental model vs. codebase reality)
   - Smoke summary against verification gate
   - Doctrine queue update (F-P4-9 advancement check)
   - Open notes for Phase 3

---

## §4 — Files (anticipated)

**New SQL migrations:**
- `<timestamp>_accord_nras_table.sql` — table, constraints, indexes, view
- `<timestamp>_accord_nras_rls.sql` — RLS policies (SELECT, INSERT, UPDATE-disjoint set, DELETE-disabled)

**No client-side changes** in this Phase. CoC writer extension is Phase 3; trigger functions are Phase 4.

**No `version.js` bump** this Phase (deferred to Phase 5 closure per brief).

---

## §5 — Discipline (apply throughout)

- **IR36/37/40 §1** — terse hand-off; silent work-mode; halt on missing input
- **IR39** — substrate work; no surface or trigger scope creep
- **IR64** — verify mental models against codebase; the FK correction landed in Phase 1 informed Phase 2 schema, but Phase 2 may surface additional substrate divergences. Halt and surface if found
- **IR65** — does NOT fire this Phase (no version pin; client-side rendering unchanged; Edge Function bytes unchanged because no Edge Function reads `accord_nras` yet)
- **IR68** — substrate-level enforcement disposition is surface-level v1 (Disposition 6); document Phase 5 forward-flag for CMD-ACCORD-NRA-OWNER-VISIBILITY-1
- **IR71** — state-mutation-before-invalidation. Applies to any code work; Phase 2 is migration + RLS only, but if Phase 2 surfaces helper-function authoring, IR71 vigilance applies
- **F-P3-2** — SECURITY DEFINER admin lookups / INVOKER substrate. Phase 2 RLS uses `my_firm_id()` (DEFINER, established) and possibly `accord_user_to_resource(auth.uid())` (INVOKER, helper). No new helpers authored Phase 2
- **F-P4-9** — state-aware UPDATE RLS WITH CHECK explicit. Phase 2 policies follow this pattern; advancement to ratifiable threshold (3 data points) watches Phase 2 outcome

---

## §6 — Halt-and-surface terms

End Phase 2 with structured close-out covering:

1. Files created (migration files with line counts)
2. Migration smoke result (table exists; constraints active; indexes present; view returns expected shape)
3. RLS policy enumeration with USING/WITH CHECK summary
4. Constraint composition test results (rejects malformed NRAs)
5. F-P4-9 advancement check (does Phase 2 produce 3rd cross-CMD data point?)
6. Any IR64 findings (substrate divergences from scaffolding/Phase 1 dispositions)
7. Open notes for Phase 3 (CoC writer extension; helper function authoring)

**Phase 3 commissioning is architect's next move after operator reviews Phase 2.** Do not anticipate Phase 3 work.

---

## §7 — Doctrine queue update (commissioning Phase 2)

| Candidate | Pre-2 | Phase 2 watch |
|---|---|---|
| F-P3-2 | 4 (canon) | No new helpers; reinforced by usage |
| F-P3-7 DROP TRIGGER IF EXISTS | 3 (canon) | Phase 4 work |
| F-P3-9 / F-P4-1 prefix normalization | 4 (canon) | Phase 3 work (CoC events) |
| F-P3-6 navigational-classification | 2 | No advance — NRA SELECT is plain firm-scoped (Phase 1 confirmed) |
| F-P4-9 state-aware UPDATE RLS WITH CHECK | 2 | **Watch — advances to 3 if Phase 2 RLS uses pattern** |
| IR72 cross-module Phase 1 survey | RATIFIED | Reinforced Phase 1 |
| IR71 state-mutation-before-invalidation | RATIFIED | Phase 4 watch (trigger code) |
| Param-state / clone-replace antipattern | 3 — ratifiable | Architect call when |
| Optional-chaining silent-noop antipattern | 1 | Watch |
| Shared-state Promise.all race antipattern | 1 | Watch |
| Layout-stability vs meaningful-resort | 1 (design candidate) | No advance |
| Deploy-incident filename log-duplication | 1 | Watch |

---

## §8 — Reference set (Phase 2)

- `phase-1-halt-surface-cmd-accord-nra-substrate-1.md` — Phase 1 close-out
- `commission-cmd-accord-nra-substrate-1-phase-1.md` — Phase 1 commission (informative)
- `brief-cmd-accord-nra-substrate-1.md` — operator-ratified brief
- `scaffolding-cmd-accord-nra-substrate-1.md` — architect scaffolding (note: §2.1 schema requires the three FK corrections in Disposition 1 + the `resolution_candidate_at` column in Disposition 2; treat the brief addendum here as authoritative)
- `Iron_Rules_71-72_Ratifications.md` — IR71 + IR72 canon
- `aegis-MASTER-handoff-2026-05-08-evening.md` — build state
- Existing migration files for `accord_meetings`, `accord_nodes`, `workstreams` — Phase 2 mirrors patterns from these (RLS shape, index discipline)
- `coc.js` `EVENT_META` — Phase 3 reference (not Phase 2)

---

*Commission CMD-ACCORD-NRA-SUBSTRATE-1 · Phase 2 · Table + RLS.*
