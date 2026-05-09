# Commission · CMD-ACCORD-NRA-SURFACE-1 · Phase 3 (Node-creation surface wiring)

**Status:** Phase 2 closed; operator deployment verified; Phase 3 commissioned 2026-05-08 late evening
**Operator:** Vaughn Staples
**Architect:** Claude (post-handoff)
**Scope this engagement:** Phase 3 only — wire `AccordNRA.Modal` into `accord-capture.js:300` + `accord-ledger.js:923`, dispatch CustomEvents on success, halt-and-surface

---

## §1 — Phase 2 close-out acknowledgment

Phase 2 close-out received. Components shipped clean: modal + 10 badge variants + history panel + `API.rpc()` extension. Visual approval received; zero iteration cycles. Operator deployment verified (`typeof API.rpc === 'function'` returns true; console shows `[AccordNRA] CMD-ACCORD-NRA-SURFACE-1 Phase 2 loaded`).

**Doctrine queue updates (Phase 2):**
- Style Doctrine v1.8 §3.8 reinforced (10 variants all map to Accord palette tokens)
- IR71 reinforced (clone-replace-before-listener-bind discipline in modal lifecycle)
- `API.rpc()` extension pattern at 1 data point (Option 1 validated; thin wrapper around `query()`)
- Substrate-API documentation matches codebase reality candidate at 1 data point (no advance Phase 2)
- Badge count reconciliation candidate at 1 data point (process pattern)

**No operator decisions required for Phase 3 commissioning.**

---

## §2 — Phase 3 deliverables

Per brief §4 Phase 3, refined with Phase 2 forward-flags. Two surface call sites; pre-commit atomic modal pattern.

### Deliverable 1 — Wire `AccordNRA.Modal` into `accord-capture.js:300`

**Site:** `_doCommit(tag, text, dateExtras)` — primary 5-tag node creation (decisions, actions, risks, questions, open).

**Pattern: pre-commit atomic.**

Current flow (approximate):
```
_doCommit(tag, text, dateExtras):
  → POST /rest/v1/accord_nodes with {tag, text, ...}
  → on success: render in stream, dispatch existing events
```

New flow:
```
_doCommit(tag, text, dateExtras):
  → AccordNRA.Modal.open({mode: 'declare-at-creation', nodeContext: {tag, text}})
  → on modal submit:
     → POST /rest/v1/accord_nodes with {tag, text, ...}  // create node first
     → on success:
        → API.rpc('declare_nra' | 'waive_nra' | 'defer_nra', {p_node_id: <new_id>, ...modal_payload})
        → on RPC success: render in stream, dispatch accord:nra-declared/waived/deferred event
        → on RPC failure: leave node created without NRA; alert operator; offer "Retry NRA" affordance
     → on node-creation failure: close modal; alert operator; do NOT call RPC
  → on modal cancel: do NOT POST node; preserve operator's text input for retry
```

**Architect note on atomicity:** the brief's "atomic with node creation; no orphan-without-NRA state" is *operator-perceived* atomicity. At substrate level, node creation and NRA creation are two separate writes (different tables; no transaction wrapping). The pre-commit modal pattern means *operator commits to NRA addressing before node POST fires*; if RPC fails post-node-creation, the orphan state is recoverable via operator retry, not a permanent constraint violation. This is the right trade-off — substrate-level atomicity would require new helper functions for combined node+NRA creation, which is substrate scope creep.

**Modal mode:** `'declare-at-creation'` — same form as `'declare'` mode but submit calls the appropriate helper (`declare_nra` / `waive_nra` / `defer_nra`) with `p_node_id` populated post-creation.

**IR71 vigilance:** the modal callback receives `{newNodeId, modalPayload}`; do not rely on enclosing-scope state from `_doCommit` to "carry through" the modal lifecycle. Pass node-creation context explicitly into modal options; receive submit payload explicitly back.

### Deliverable 2 — Wire `AccordNRA.Modal` into `accord-ledger.js:923`

**Site:** dissent registration (single tag).

**Architect disposition (per Phase 2 §7.2):** **full-form default — same flow as `accord-capture.js`.** Dissent is a node tag, not a special NRA flow. Treating it differently would create surface inconsistency without architectural justification. If operator practice reveals dissent-specific NRA patterns (e.g., consistently waived because dissent is terminal), follow-on micro-CMD adjusts; v1 ships consistent.

Same pre-commit atomic pattern as Deliverable 1.

### Deliverable 3 — CustomEvent dispatch on success

After every successful RPC call, dispatch the appropriate event on `window`:

```javascript
window.dispatchEvent(new CustomEvent('accord:nra-declared', {
  detail: { node_id, nra_id, firm_id }
}));
```

Six events to wire (matching Phase 2 component spec):
- `accord:nra-declared` — fires after `declare_nra` success
- `accord:nra-waived` — fires after `waive_nra` success
- `accord:nra-deferred` — fires after `defer_nra` success

Three events not yet fired this Phase (deferred to Phase 4 display-surface work or future flows):
- `accord:nra-resolved` — fires after `resolve_nra` (Phase 4 wires Confirm/Not-yet flow)
- `accord:nra-superseded` — fires after `supersede_nra` (Phase 4 wires Update flow)
- `accord:nra-candidate-flagged` — fires from polling or trigger-driven cache invalidation (briefing-pack CMD scope)

### Deliverable 4 — Phase 3 smoke

End-to-end smoke against deployed substrate:

1. **Capture-surface declare path:** in Live Capture, type a decision, submit; modal opens; declare with type/date/owner/description; submit; verify:
   - Node appears in stream (POST /rest/v1/accord_nodes succeeded)
   - NRA exists per `SELECT * FROM accord_nras WHERE node_id = <new_id>` (declare_nra succeeded)
   - `accord_nras_current` view returns the row
   - CoC events present: `accord.node.captured` + `accord.nra.declared`
   - `accord:nra-declared` CustomEvent fired (verify via console listener instrumentation)

2. **Capture-surface waive path:** same, with Waive selection; verify substrate row state='waived' + waiver reason populated; CoC `accord.nra.waived`

3. **Capture-surface defer path:** same, with Defer selection; verify substrate row state='deferred' + deferred_at populated; CoC `accord.nra.deferred`

4. **Capture-surface cancel path:** open modal, cancel; verify no node created (no POST /rest/v1/accord_nodes fires); operator text input preserved for retry

5. **Capture-surface RPC failure recovery:** deliberately submit invalid declare payload (missing required field); verify node IS created but NRA RPC fails; operator sees alert; "Retry NRA" affordance offered (if implemented) OR operator manually triggers via display-surface badge in Phase 4

6. **Ledger-surface dissent declare path:** in Decision Ledger, register dissent; modal opens; declare; verify substrate + CoC + CustomEvent

7. **All 5 tag paths covered:** decision, action, risk, question, open — all flow through `_doCommit` and exercise the same modal path

### Deliverable 5 — Phase 3 close-out

Per established CMD pattern. Halt-and-surface terms in §5.

---

## §3 — Files (anticipated)

**Modified:**
- `js/accord-capture.js` — `_doCommit` rewired with pre-commit modal; CustomEvent dispatch on RPC success
- `js/accord-ledger.js` — line 923 dissent registration rewired with same pattern

**No changes to:**
- `js/accord-nra.js` (Phase 2 components ready)
- `css/accord-nra.css` (Phase 2 styles complete)
- `js/api.js` (Phase 2 RPC extension shipped)
- `accord.html` (Phase 2 anchors deployed)
- `accord_nras` substrate (sealed)
- `version.js` (Phase 5 closure; IR65 fires there)

---

## §4 — Discipline (apply throughout)

- **IR36/37/40 §1** — terse hand-off; silent work-mode; halt on missing input
- **IR39** — Phase 3 is creation-surface wiring only. No display-surface wiring (Phase 4); no briefing-pack work; no component changes
- **IR64** — verify mental models against codebase. Specifically:
  - `_doCommit` signature and current behavior at `accord-capture.js:300`
  - `accord-ledger.js:923` dissent-creation path
  - Existing CustomEvent dispatch patterns in adjacent code (match convention)
- **IR65** — does NOT fire this Phase. Surface JS edits do not change Edge Function bytes. Fires Phase 5 (version pin)
- **IR68** — operator-private rendering. Capture flow is operator-prep context; modal stays operator-only
- **IR70** — substrate-derived intelligence. Phase 3 wires capture (declarative); Phase 4 wires display + Confirm/Not-yet (substrate-coaching)
- **IR71** — state-mutation-before-invalidation. **Critical this Phase:** modal callback receives `{newNodeId, modalPayload}`; pass explicitly via callback args, do NOT rely on enclosing-scope `_doCommit` state to "carry through" the modal-open → modal-submit window. Apply Phase 4a D4 / Phase 4b D1 / Phase 5 D2 lessons from CMD-ACCORD-CONSTELLATION-ENTRY-1
- **IR72** — Phase 1 cross-module survey already complete; Phase 3 honors findings
- **IR73** — does NOT add new RLS this CMD; surface code respects existing UPDATE policy gates
- **Style Doctrine v1.8 §3.8** — module palette discipline (no new CSS this Phase)

---

## §5 — Halt-and-surface terms

End Phase 3 with structured close-out covering:

1. Files modified (with line counts of additions/deletions)
2. Wiring approach taken at each call site (how `_doCommit` was restructured; how dissent path was restructured)
3. CustomEvent dispatch verification (3 events fire correctly: declared/waived/deferred)
4. Smoke results for 7 test paths per Deliverable 4
5. **RPC failure recovery behavior** — what does the operator see when node-creation succeeds but NRA RPC fails? Implementation choice: blocking alert + retry affordance, OR non-blocking notification + grandfathered-style "+ Add NRA" affordance on the orphan node. Architect-lean: non-blocking notification (matches IR68 light-touch operator-prep style; avoids modal-on-modal disruption)
6. IR64 findings (any divergence from Phase 2 expectations or scaffolding assumptions)
7. Doctrine queue update (IR71 reinforcement; CustomEvent pattern reinforcement)
8. Open notes for Phase 4 (display-surface wiring at 5+ surfaces; CustomEvent listener wiring)

**Phase 4 commissioning is architect's next move after operator reviews Phase 3.** Do not anticipate Phase 4 work.

---

## §6 — Doctrine queue update (commissioning Phase 3)

| Candidate | Pre-3 | Phase 3 watch |
|---|---|---|
| Verification-test `auth.uid()` in SQL editor | 3 (one-CMD origin; deferred Path 2) | No advance Phase 3 (no SQL editor verification) |
| Style Doctrine v1.8 §3.8 module palette | RATIFIED | No advance (no CSS this Phase) |
| Substrate-API documentation matches codebase reality | 1 | Watch — Phase 3 actually consumes the API; second data point opportunity if divergence found |
| `API.rpc()` extension pattern | 1 | **Reinforced — Phase 3 actively uses extension across both surfaces** |
| IR71 state-mutation-before-invalidation | RATIFIED | **Critical watch — modal-callback-context is the exact shape IR71 prevents.** Pass explicitly via args; do not rely on enclosing-scope mutations |
| Optional-chaining silent-noop | 1 | Watch (modal callback wiring is exactly the kind of place this could manifest) |
| Badge count reconciliation candidate | 1 | No advance (no new variants this Phase) |
| F-P3-6 / F-P4-9 / IR73 | RATIFIED / RATIFIED | No new RLS this CMD |

---

## §7 — Reference set (Phase 3)

- `phase-2-closeout-cmd-accord-nra-surface-1.md` — Phase 2 close-out (informative)
- `commission-cmd-accord-nra-surface-1-phase-2.md` — Phase 2 commission (informative)
- `phase-1-halt-surface-cmd-accord-nra-surface-1.md` — Phase 1 close-out (especially Finding 1 with line references)
- `brief-cmd-accord-nra-surface-1.md` — operator-ratified brief
- `scaffolding-cmd-accord-nra-surface-1.md` — architect scaffolding
- `Iron_Rule_73_Ratification.md` + `Iron_Rules_71-72_Ratifications.md` + `Iron_Rules_66-70_Ratifications.md` — doctrine canon
- `Style_Doctrine_v1_8.md` — module palette discipline
- `aegis-MASTER-handoff-2026-05-08-late-evening.md` — full build state
- `js/accord-nra.js` — Phase 2 components consumed by Phase 3 wiring
- `js/api.js` — Phase 2 `API.rpc()` consumed by Phase 3 wiring
- `js/accord-capture.js` (line 300) and `js/accord-ledger.js` (line 923) — wiring targets

---

*Commission CMD-ACCORD-NRA-SURFACE-1 · Phase 3 · Node-creation surface wiring.*
