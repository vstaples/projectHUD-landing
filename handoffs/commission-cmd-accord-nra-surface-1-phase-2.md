# Commission · CMD-ACCORD-NRA-SURFACE-1 · Phase 2 (Modal + badge components + API.rpc utility)

**Status:** Phase 1 closed; Phase 2 commissioned 2026-05-08 late evening
**Operator:** Vaughn Staples
**Architect:** Claude (post-handoff)
**Scope this engagement:** Phase 2 only — `AccordNRAModal` + `AccordNRABadge` + `AccordNRAHistoryPanel` components + `API.rpc()` client-side utility extension + smoke. Halt-and-surface.

---

## §1 — Phase 1 close-out acknowledgment

Phase 1 halt-and-surface received. Three findings disposed:

- **Finding 1 noted** — `Accord.createNode()` does not exist; two inline `accord_nodes` POST sites identified at `accord-capture.js:300` (5 tags) and `accord-ledger.js:923` (dissent only). **Phase 3 surface-wiring scope tightens to these two call sites.** Smaller, more concrete than original anticipation
- **Finding 2 dispositioned: Option 1** — extend client-side API helper to support RPC. Architect-lean confirmed by operator. Substrate Phase 3 invested in supersession atomicity via transaction-wrapped helper; bypassing via direct PATCH would put atomicity burden on every caller. The RPC shim is a thin client-side utility, not substrate scope creep
- **Finding 3 noted** — kickoff + board-update archetype vocabulary gaps queued as follow-on micro-CMD candidates. Not blocking; ship Phase 2 with current vocabulary

**Two new doctrine candidates** (1 data point each; both watch):
- Substrate-API documentation may not match codebase reality — verify all referenced namespace methods in Phase 1 IR64 (this CMD reinforced; data point recorded)
- `API.rpc()` extension required for substrate helper consumption (likely reinforced in CMD-ACCORD-NRA-BRIEFING-PACK-1)

**Operator decisions required:** zero remaining for Phase 2.

---

## §2 — Phase 2 deliverables

### Deliverable 1 — `API.rpc()` client-side utility extension (per Phase 1 Finding 2 / Option 1)

Extend the existing client-side API helper module to support PostgREST RPC calls. Match existing convention for error-handling, response-shape, and auth-header pattern.

**Function signature:**

```javascript
API.rpc(functionName, body)
  // → POST /rest/v1/rpc/<functionName>
  // body: JSON-serializable object matching helper function parameters
  // returns: parsed response or throws on error
  // matches existing API.* convention for error-handling
```

**Architect IR64 verification flag:** Phase 1 found `API.rpc()` does not exist; Phase 2 verifies the actual client-side API module location and structure before extending. Halt and surface if the API module's existing convention (e.g., async/await pattern, error type, auth-header injection) doesn't fit a clean RPC extension. Architect-lean: integrate as additive method on existing API namespace; do not refactor existing methods.

### Deliverable 2 — `AccordNRAModal` component

Capture + edit modal for all NRA flows. Four modes (declare/waive/defer/update). Markup added to `accord.html`; render logic in `js/accord-nra.js`.

**Modes:**
- **Declare:** type (pending external/pending internal), date, owner, description, optional trigger condition. Submit calls `API.rpc('declare_nra', {...})`
- **Waive:** waiver reason text field (other fields collapsed per design decision 1.2). Submit calls `API.rpc('waive_nra', {...})`
- **Defer:** confirmation only ("OK to defer? You'll be reminded periodically"). Submit calls `API.rpc('defer_nra', {...})`
- **Update:** pre-populated declare-form fields with current NRA values. Submit calls `API.rpc('supersede_nra', {p_old_nra_id, p_new_nra_data})`. Operator never sees the word "supersede" — UI says "Update NRA"

**Reuse existing modal markup pattern** (`#newMeetingModal`, `#rerenderConfirmModal` per Phase 1 IR72 survey). Consistent backdrop, ESC-to-close, click-outside-to-close behavior.

**IR71 vigilance:** modal lifecycle uses clone-replace patterns from prior CMD work. Apply IR71 discipline: clone-replace FIRST, then bind state and listeners on new node references. Pass NRA ID and mode explicitly via arguments; do not rely on enclosing-scope state mutations to "carry through" across the clone-replace.

**Form validation** mirrors substrate constraints:
- Declared NRAs: type + date + description required; at least one of (owner_resource_id, owner_event_type, owner_is_operator=true) required
- Waived NRAs: waiver reason required
- Deferred NRAs: no field requirements

### Deliverable 3 — `AccordNRABadge` component

Inline badge rendered next to nodes. Eight variants per design decisions:

| Variant | Render | Color/style |
|---|---|---|
| Declared external | `→ <owner_name> · <date_display>` | Per urgency state; neutral default |
| Declared internal-event | `→ <event_type_label> · <date_display>` | Same |
| Declared internal-operator | `→ Me · <date_display>` | Same |
| Waived | `⊘ guardrail` | Muted gray |
| Deferred | `⏸ deferred Nd` | Color shifts: ≤30d neutral, 31-60d amber, 60d+ red |
| Resolution-candidate | `✓? <owner> · candidate` | Distinct tint signaling "system thinks this might be done" |
| History only | `✓ NRA history (N)` | Resolved-state green; click opens history panel |
| Grandfathered | `+ Add NRA` | Affordance treatment; subtle prompt styling |

**Style Doctrine v1.8 §3.8 application:** badge colors use Accord palette tokens only. Phase 1 should have surfaced the palette tokens for amber/red equivalents (or palette gap). If palette gap was surfaced and not yet filled, halt and surface for architect disposition before authoring CSS.

**Click handlers:**
- Declared / candidate / waived / deferred badges → opens `AccordNRAModal` in update mode (pre-populated)
- History-only badge → opens `AccordNRAHistoryPanel`
- Grandfathered badge → opens `AccordNRAModal` in declare mode (no node-ID-mutation; just declares the missing NRA)

**Restrained design discipline:** small monochrome with subtle color; glanceable not loud. Architect-lean: ~6px font weight; tight padding; subtle background. Phase 2 implementation surfaces final spec; operator sees rendered badges in Phase 2 close-out for visual approval.

### Deliverable 4 — `AccordNRAHistoryPanel` component

Side panel for NRA history view. Mounted on right side per design decision 4.3 (matches existing right-rail convention).

**Render:** vertical timeline; newest at top. Each row shows:
- State (declared/waived/deferred/resolved/superseded) + state-specific glyph
- Type (pending external / pending internal) for declared rows
- Owner (resource name OR event type OR "Me")
- Date (due_date for declared; deferred_at for deferred; resolved_at for resolved; etc.)
- Description for declared rows; waiver reason for waived rows
- Resolution mechanism for resolved rows
- Supersession arrow (`⤴ superseded by row above`) when applicable

**Mount/dismount:** opens via `AccordNRABadge` history-only click; closes via X button or ESC. Does NOT modify the source view (node row stays as-is in source surface).

### Deliverable 5 — CSS in `css/accord-nra.css`

Modal + badge + history-panel styles. **Accord palette tokens only** per Style Doctrine v1.8 §3.8. No Compass/Cadence/Pipeline borrowed tokens.

### Deliverable 6 — Phase 2 smoke

Component-level smoke (no surface wiring yet — that's Phase 3):

1. **Modal smoke:** open modal in each of 4 modes (declare/waive/defer/update); fields render correctly per mode; submit dispatches correct `API.rpc()` call (verify via console.log instrumentation since no surface wiring yet); close-on-ESC works; click-outside-to-close works
2. **Badge smoke:** render each of 8 variants in isolation (architect-internal test page or DOM injection); verify visual differentiation; verify color shifts correctly across deferred-aging thresholds (mock `deferred_at` values for ≤30d, 31-60d, 60d+)
3. **History panel smoke:** open panel with mock history data (3-row chain: declared → superseded → declared → resolved); verify timeline renders newest-first; verify supersession arrow appears
4. **`API.rpc()` smoke:** call `API.rpc('declare_nra', {...})` against the deployed substrate; verify response shape; verify error path (deliberately invalid input) returns expected error

### Deliverable 7 — Phase 2 close-out

Per established CMD pattern (matches NRA Substrate Phase 2 close-out shape):
1. Files created/modified (with line counts)
2. `API.rpc()` extension shape (signature, error-handling pattern, integration point)
3. Component smoke results (Deliverable 6)
4. Visual approval reference (architect provides badge variant rendering for operator review at close-out)
5. IR64 findings (any divergence from scaffolding)
6. Doctrine queue update
7. Open notes for Phase 3 (surface wiring at the two known call sites: `accord-capture.js:300` + `accord-ledger.js:923`)

---

## §3 — Files (anticipated)

**New:**
- `/mnt/user-data/outputs/js/accord-nra.js` — `AccordNRAModal`, `AccordNRABadge`, `AccordNRAHistoryPanel` components; substrate API dispatch via `API.rpc()`; CustomEvent dispatch on substrate mutations
- `/mnt/user-data/outputs/css/accord-nra.css` — modal + badge + history-panel styles (Accord palette only)

**Modified:**
- `/mnt/user-data/outputs/<API_module>.js` — `API.rpc()` extension. Filename TBD per Phase 1 IR72 survey of existing API module location
- `/mnt/user-data/outputs/accord.html` — script loader extended with `accord-nra.js`; modal markup added; history-panel anchor added

**No changes to:**
- `accord_nras` substrate (sealed)
- Existing surface modules (`accord-capture.js`, `accord-document.js`, etc.) — Phase 3 wires
- `version.js` (Phase 5 closure; IR65 fires there)

---

## §4 — Discipline (apply throughout)

- **IR36/37/40 §1** — terse hand-off; silent work-mode; halt on missing input
- **IR39** — Phase 2 is component code + API utility extension. No surface wiring (Phase 3); no briefing-pack work
- **IR64** — verify mental models against codebase. Critical verifications:
  - Existing API module location and convention for `API.rpc()` extension
  - Existing modal markup pattern (`#newMeetingModal`, `#rerenderConfirmModal`) for `AccordNRAModal` reuse
  - Existing right-rail panel pattern for `AccordNRAHistoryPanel` mounting
- **IR65** — does NOT fire this Phase. Component-side code; no Edge Function bytes change yet (Phase 5 fires when surface code reads NRAs into rendered output)
- **IR67** — 8-archetype walkthrough already passed in Phase 1 (with kickoff + board-update vocabulary gaps noted as follow-on candidates); Phase 2 implementation honors current vocabulary
- **IR68** — operator-private rendering enforced at surface. NRA history side panel is operator-private context
- **IR70** — substrate-derived intelligence flow (resolution-candidate badge variant signals candidate to operator; Phase 4 wires the Confirm/Not-yet flow on click)
- **IR71** — state-mutation-before-invalidation. Modal lifecycle vigilance (especially update/supersede mode): clone-replace FIRST, then bind state and listeners. Pass NRA ID + mode explicitly via arguments; do not rely on enclosing-scope state to carry through
- **IR72** — cross-module Phase 1 survey was completed in Phase 1; Phase 2 honors findings (modal pattern reuse from `#newMeetingModal`; CustomEvent pattern from `accord:meeting-filed`; PostgREST error-handling per existing convention)
- **Style Doctrine v1.8 §3.8** — Accord palette tokens only

---

## §5 — Halt-and-surface terms

End Phase 2 with structured close-out covering:

1. Files created/modified
2. `API.rpc()` extension specification (signature, error-handling, integration point with existing API module)
3. Component smoke results — modal, badge, history-panel
4. **Visual approval reference** — render each of the 8 badge variants in a test page; capture as inline reference for operator visual approval
5. IR64 findings (especially around API module structure or modal markup divergences)
6. Doctrine queue update (Style Doctrine v1.8 §3.8 reinforcement; any new candidates surfaced during component implementation)
7. Open notes for Phase 3 (surface wiring at `accord-capture.js:300` + `accord-ledger.js:923`)

**Phase 3 commissioning is architect's next move after operator reviews Phase 2.** Do not anticipate Phase 3 work.

**Operator visual approval gate:** Phase 2 close-out includes badge variant rendering for operator review. If operator vetoes badge aesthetic, Phase 2 iterates before Phase 3 commission. This is the visual-design pressure-test moment for the CMD.

---

## §6 — Doctrine queue update (commissioning Phase 2)

| Candidate | Pre-2 | Phase 2 watch |
|---|---|---|
| Verification-test `auth.uid()` in SQL editor | 3 (one-CMD origin; deferred Path 2) | Phase 2 may produce 4th data point if `API.rpc()` smoke uses pattern; advance to ratifiable cross-CMD if so |
| Style Doctrine v1.8 §3.8 module palette | RATIFIED | **Reinforced this Phase** (Accord palette discipline applied to NRA badge styling) |
| Substrate-API documentation matches codebase reality | 1 (new from NRA Surface Phase 1) | Watch for cross-CMD instance |
| `API.rpc()` extension required for substrate helper consumption | 1 (new from NRA Surface Phase 1) | Likely reinforced in CMD-ACCORD-NRA-BRIEFING-PACK-1 |
| Param-state / clone-replace antipattern | RATIFIED-via-IR71 | Watch — modal lifecycle (especially update mode) is exactly the pattern IR71 prevents |
| Optional-chaining silent-noop | 1 | Watch for instance during component implementation |
| F-P3-6 navigational-classification | 2 | No advance (NRA Surface doesn't introduce navigational classification) |
| F-P4-9 / IR73 | RATIFIED | No new RLS this CMD |

---

## §7 — Reference set (Phase 2)

- `phase-1-halt-surface-cmd-accord-nra-surface-1.md` — Phase 1 close-out
- `commission-cmd-accord-nra-surface-1-phase-1.md` — Phase 1 commission (informative)
- `brief-cmd-accord-nra-surface-1.md` — operator-ratified brief
- `scaffolding-cmd-accord-nra-surface-1.md` — architect scaffolding (component architecture detail)
- `Iron_Rule_73_Ratification.md` + `Iron_Rules_71-72_Ratifications.md` + `Iron_Rules_66-70_Ratifications.md` — doctrine canon
- `Style_Doctrine_v1_8.md` — module palette discipline
- All NRA Substrate close-outs (Phase 1-5) — substrate API surface this CMD consumes
- `aegis-MASTER-handoff-2026-05-08-late-evening.md` — full build state
- Existing API module file (Phase 1 identified location) — extension target for `API.rpc()`
- Existing modal markup files (`#newMeetingModal`, `#rerenderConfirmModal`) — reuse pattern for `AccordNRAModal`
- Existing CustomEvent dispatch sites — pattern reference for `accord:nra-*` events

---

*Commission CMD-ACCORD-NRA-SURFACE-1 · Phase 2 · Modal + badge components + API.rpc utility.*
