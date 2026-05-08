# Iron Rules 71-72 — Ratification Request

**Source:** CMD-ACCORD-CONSTELLATION-ENTRY-1 close arc (Phases 1-5; 2026-05-08)

Two rules emerged during the CMD's five Phases, each with the data-point support for ratification:

- IR71 from cumulative defect pattern across Phases 4a, 4b, 5 (3 data points)
- IR72 from cross-CMD investigative practice (4 data points across consecutive CMDs)

---

## Iron Rule 71 — State-Mutation-Before-Invalidation Hazard

**Rule:** When mutating module state, function parameters, or DOM-node references in a flow that includes an upcoming clone-replace, function call with shadowing parameters, or fallback default-value path, the mutation must occur on the post-invalidation reference (or the invalidating operation must be reordered to happen first). Setting state on a node-or-value that is about to be replaced, shadowed, or defaulted-over is a silent-failure footgun.

**Origin:** Three discrete instances in CMD-ACCORD-CONSTELLATION-ENTRY-1:

1. **Phase 4a D4 (param shadowing).** `_openCreateModal('rename')` was called after setting `local.renameTargetId`, but the function's `renameTargetId` parameter (defaulting to `null`) overwrote the just-set state. Patch: pass id explicitly so the parameter carries the value.
2. **Phase 4b D1 (listener-on-detached-node).** Disambig modal radios were bound to a button reference, then `cloneNode` replaced the button — leaving handlers updating a detached element. Patch: clone-replace first, then wire state and listeners on the new node.
3. **Phase 5 D2 (missing-arg-with-fallback).** `Accord.createMeeting(title, threadTitle)` was called from workstream-view's `+ New meeting` flow without a title argument; the function's default-fallback created meetings titled "Untitled meeting". Patch: open the existing modal to collect title before invoking.

Each defect was operator-found in testing, none caught by architect or coding-agent self-review. The unifying pattern: state was set or expected on a reference that the next operation silently invalidated.

**Diagnostic question:** "Does the operation I'm about to perform invalidate, shadow, or default-over the state I just set?"

**Application:**
- For DOM clone-replace: clone-replace FIRST, then bind state/listeners to the new node.
- For function calls with shadowing parameters: pass values explicitly via arguments; never rely on an enclosing scope mutation to "carry through."
- For functions with default-value parameters: callers that depend on non-default behavior must pass the value explicitly.
- During code review or commission Phase 1: scan for state mutations adjacent to clone-replace, function calls, or default-fallback paths.

**Failure mode it prevents:** Silent state corruption that manifests as "feature appears to work but produces wrong/empty/default values." These defects pass smoke testing because the surface code path executes successfully; the corruption only appears in operator-found testing of the actual outcome.

---

## Iron Rule 72 — Cross-Module Phase 1 Survey

**Rule:** Phase 1 (investigation) of any CMD that introduces or modifies a customer-facing surface, a shared client-side convention, or a navigation pattern must include an explicit cross-module survey: a documented walk through the related conventions in sibling modules (Compass, Cadence, Pipeline, Aegis, Accord) to identify reusable patterns, doctrine candidates, and substrate-truth divergences.

**Origin:** Four CMDs adopted this practice consecutively, with each instance producing concrete value:

1. **CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1** — surveyed sibling RLS conventions; pattern reused.
2. **CMD-SUBSTRATE-COUNTERFACTUAL-MIN** — surveyed prior trigger / SECURITY DEFINER conventions; pattern reused.
3. **CMD-ACCORD-CONSTELLATION-ENTRY-1 Phase 1** — surveyed hash-routing, drag-drop, persistence, hierarchical-tree conventions across all platforms. Yielded:
   - Knowledge that no existing surface uses hash routing (informed Q-CE-7 disposition: custom level-state)
   - Pipeline kanban as canonical drag-drop pattern (reused verbatim Phase 4b)
   - sessionStorage + localStorage two-tier persistence as Compass convention (adopted Phase 3)
   - `my-meetings.html` Knowledge Tree as left-rail reference (adapted Phase 3)
4. **CMD-ACCORD-CONSTELLATION-ENTRY-1 Phase 5** — surveyed surface-module event-listening convention to inform inlining strategy. Yielded the move-in-place architectural enabling-finding that saved ~2000 lines of rewiring.

Each instance prevented duplication of effort and surfaced reusable patterns the proposing architect did not initially have in mind.

**Application:**
- Phase 1 of qualifying CMDs includes a mandatory "cross-module survey" deliverable.
- The survey documents what conventions exist, where they live (file + line numbers), and which apply to the current CMD's surface area.
- If a survey reveals no existing convention for a given pattern, the CMD becomes the canonical establisher of that convention (and adds to doctrine queue accordingly).
- Survey results inform commission-phase decisions before any code is written.

**What qualifies:** any CMD touching customer-facing surfaces, shared client-side conventions (persistence, drag-drop, navigation, tree rendering, etc.), or cross-module navigation patterns. Substrate-only CMDs and pure server-side CMDs are exempt unless they also affect the client convention surface.

**Failure mode it prevents:** Reinventing patterns that already exist elsewhere in the build; missing reusable substrate; producing surfaces that violate cross-module visual or interaction consistency without realizing it.

---

## Ratification block

**Operator:** if these rules are accepted as canon, please respond with explicit ratification statement:

> "I ratify Iron Rules 71 and 72 as canon."

Or specify per-rule acceptance/modification.

After ratification, these rules join the doctrine canon. IR71 constrains all coding-agent work going forward (with particular emphasis on Phase 1 commission discipline); IR72 constrains all qualifying CMD Phase 1 deliverables.

**End of ratification request.**
