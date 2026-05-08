# Iron Rules 71-72 — Ratification Record

**Ratified:** 2026-05-08 (evening)
**Operator:** Vaughn Staples
**Ratification statement:** "I ratify Iron Rules 71 and 72 as canon."

---

## Iron Rule 71 — State-Mutation-Before-Invalidation Hazard

**Rule:** When mutating module state, function parameters, or DOM-node references in a flow that includes an upcoming clone-replace, function call with shadowing parameters, or fallback default-value path, the mutation must occur on the post-invalidation reference (or the invalidating operation must be reordered to happen first). Setting state on a node-or-value that is about to be replaced, shadowed, or defaulted-over is a silent-failure footgun.

**Source:** CMD-ACCORD-CONSTELLATION-ENTRY-1, three discrete instances:
1. Phase 4a D4 (param shadowing) — `_openCreateModal('rename')` parameter overwrote just-set `local.renameTargetId`
2. Phase 4b D1 (listener-on-detached-node) — clone-replace severed handler bindings to old node reference
3. Phase 5 D2 (missing-arg-with-fallback) — `createMeeting()` defaulted to "Untitled meeting" when title argument omitted

**Diagnostic question:** "Does the operation I'm about to perform invalidate, shadow, or default-over the state I just set?"

**Application:**
- For DOM clone-replace: clone-replace FIRST, then bind state/listeners to the new node
- For function calls with shadowing parameters: pass values explicitly via arguments
- For functions with default-value parameters: callers depending on non-default behavior must pass explicitly
- Code review and Phase 1 commission discipline: scan for state mutations adjacent to clone-replace, function calls, or default-fallback paths

**Status:** RATIFIED as canon 2026-05-08.

---

## Iron Rule 72 — Cross-Module Phase 1 Survey

**Rule:** Phase 1 (investigation) of any CMD that introduces or modifies a customer-facing surface, a shared client-side convention, or a navigation pattern must include an explicit cross-module survey: a documented walk through related conventions in sibling modules (Compass, Cadence, Pipeline, Aegis, Accord) to identify reusable patterns, doctrine candidates, and substrate-truth divergences.

**Source:** Four cross-CMD data points:
1. CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1 — sibling RLS conventions surveyed
2. CMD-SUBSTRATE-COUNTERFACTUAL-MIN — trigger / SECURITY DEFINER conventions surveyed
3. CMD-ACCORD-CONSTELLATION-ENTRY-1 Phase 1 — hash-routing, drag-drop, persistence, hierarchical-tree conventions surveyed (yielded Pipeline kanban pattern, Compass two-tier persistence, my-meetings.html Knowledge Tree as left-rail reference)
4. CMD-ACCORD-CONSTELLATION-ENTRY-1 Phase 5 — surface-module event-listening convention surveyed (yielded move-in-place architectural enabling-finding, saved ~2000 lines of rewiring)

**Application:**
- Phase 1 of qualifying CMDs includes mandatory "cross-module survey" deliverable
- Survey documents existing conventions, locations (file + line numbers), and applicability to current CMD
- If no existing convention exists, CMD becomes canonical establisher (and adds to doctrine queue accordingly)
- Survey results inform commission-phase decisions before code is written

**What qualifies:** any CMD touching customer-facing surfaces, shared client-side conventions (persistence, drag-drop, navigation, tree rendering, etc.), or cross-module navigation patterns. Substrate-only CMDs and pure server-side CMDs are exempt unless they also affect client convention surface.

**Status:** RATIFIED as canon 2026-05-08.

---

## Effect of ratification

- **Doctrine canon now stands at 38 ratified Iron Rules** (36-72) + IR58 amendment + Style Doctrine v1.8 §3.8 module-palette clause
- IR71 constrains all coding-agent work going forward, with particular emphasis on Phase 1 commission discipline
- IR72 constrains all qualifying CMD Phase 1 deliverables; cross-module survey is no longer optional practice — it is mandatory deliverable

**End of ratification record.**
