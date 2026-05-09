# Phase 4 Close-out · CMD-ACCORD-NRA-SURFACE-1

**Status:** Phase 4 (display-surface wiring) shipped. All 9 smoke tests pass. Halt-and-surface for architect review before Phase 5 commission.
**Coding agent:** Claude (post-handoff, 2026-05-09 morning)
**Operator:** Vaughn Staples
**Verification gate:** Phase 4 commission §2 deliverables 1–8. All met (with one mid-Phase patch for resolved_mechanism vocabulary).

---

## §1 — Files manifest

### Modified

| File | Path | Phase 4 changes | Lines |
|---|---|---|---|
| `accord-nra.js` | `/js/` | Modal candidate-region (`_candidateRegionHtml` + Confirm/Update-instead handlers + `resolve_nra` RPC dispatch). New utilities: `fetchBadgeData(nodeIds)` batched lookup, `fetchOneBadgeData(nodeId)` single-node lookup, `wireBadgesIn(container, lookup)` per-surface helper. | ~915 (was ~687) |
| `accord-nra.css` | `/css/` | Candidate-region styles (banner + glyph + actions); `.accord-nra-badge-slot` row-injection styles. | ~370 (was ~270) |
| `accord-capture.js` | `/js/` | `_renderStream()` calls `wireBadgesIn` on `#captureStream` and `#threadHistoryStream`. | 641 (was 628) |
| `accord-document.js` | `/js/` | `_renderSpine()` calls `wireBadgesIn` on `#docStream` after spine paint. | 645 (was 638) |
| `accord-ledger.js` | `/js/` | `_renderList()` calls `wireBadgesIn` on `#ledgerList`; row-click guard added so badge clicks don't trigger decision-detail open. | 1153 (was 1141) |

### No changes to

- `api.js` (Phase 2 RPC stable)
- `accord.html` (Phase 2 anchors complete)
- `accord-minutes.js`, `accord-views.js`, `accord-rails.js` — verified not node-display surfaces (Phase 4 §2.1)
- `accord_nras` substrate (sealed)
- `version.js` — IR65 fires Phase 5

---

## §2 — Surface inventory

Per Phase 4 mid-engagement halt, IR64 verification reduced 5 candidates to **3 confirmed display surfaces**:

| Surface | Status | Render call site |
|---|---|---|
| `accord-capture.js` | wired | `_renderStream()` line 434 |
| `accord-document.js` | wired | `_renderSpine()` → `#docStream` line 284 |
| `accord-ledger.js` | wired | `_renderList()` → `#ledgerList` line 346 |
| `accord-minutes.js` | NOT a node-display surface — renders `accord_minutes_renders` rows (PDF render provenance per meeting); no `node_id` iteration | n/a |
| `accord-views.js` | NOT a node-display surface — renders workstream tree + meeting list rows; no `node_id` iteration | n/a |

---

## §3 — Smoke results

End-to-end against deployed substrate. CustomEvent listeners installed.

| Test | Path | Result |
|---|---|---|
| 1 | Capture stream badges render across 6 captured nodes (declared/waived/deferred variants from Phase 3) | PASS |
| 2 | Click waived badge → update modal opens pre-populated; ESC dismisses | PASS |
| 3 | Living Document spine: badges render next to each sealed node | PASS |
| 4 | Decision Ledger list: badges render on each decision row | PASS |
| 5 | Click "+ Add NRA" grandfathered → declare modal → submit → cross-surface badge re-render | PASS |
| 6 | Cross-surface reactivity: declare on one surface, badge updates on others | PASS |
| 7 | Update flow (supersede via badge click) → `nra-superseded` event + badge refreshes | PASS |
| 8 | History panel: timeline renders newest-first; ESC + X dismiss | PASS (programmatic open; see §4 Finding 2) |
| 9 | Resolution-candidate Confirm flow: `resolve_nra` RPC + `nra-resolved` event + substrate state='resolved' | PASS (post-patch — see §4 Finding 1) |

Substrate verification on Test 9 final state:
- `state='resolved'`
- `resolved_at` populated
- `resolved_mechanism='meeting_scheduled'`
- `resolved_by_resource_id` populated (`e1000001-...`)

---

## §4 — IR64 findings

### §4.1 — `resolved_mechanism` CHECK constraint vocabulary mismatch

**Surfaced:** Test 9 first attempt produced `400 Bad Request: violates check constraint accord_nras_resolved_mechanism_check`.

**Root cause:** I authored `resolve_nra` invocation passing `currentNRA.trigger_kind` directly as `p_mechanism`. The substrate `accord_nras_resolved_mechanism_check` constraint allows only `{manual, meeting_scheduled, meeting_sealed, action_resolved, decision_resolved}`. The `trigger_kind` enum uses different vocabulary (`meeting_scheduled_in_workstream`, `meeting_sealed_in_workstream`, etc.).

**Repair:** added explicit mapping table inside the Confirm-resolved handler:
- `meeting_scheduled_in_workstream` → `meeting_scheduled`
- `meeting_sealed_in_workstream` → `meeting_sealed`
- `action_resolved` → `action_resolved`
- `decision_resolved` → `decision_resolved`
- (anything else) → `manual`

**Doctrine candidate (1 data point):** *"Substrate has two related-but-distinct vocabularies: `trigger_kind` (when this NRA could be auto-resolved) and `resolved_mechanism` (how it was actually resolved). Surface code must explicitly map between them when invoking `resolve_nra`. The two enums look similar enough that the mapping is easy to miss; CHECK constraint catches it on the back end."* Watch for cross-CMD instance.

### §4.2 — History panel has no interactive entry point in current display surfaces

**Observation:** the history-only badge variant (`✓ NRA history (N)`) is the only entry point that opens `AccordNRA.HistoryPanel`. That variant only renders when a node has past NRAs but NO current NRA (i.e., `accord_nras_current` returns null but `accord_nras` count > 0).

This state arises naturally only when:
- An NRA was resolved (becomes non-current)
- An NRA was superseded with no replacement-current (rare; supersede_nra always inserts a new current row)

In all standard lifecycles (declare → defer → re-declare → resolve), the first three states keep a current NRA visible and the Update modal exposes the supersede path. **Operator never sees the history panel through normal UI flow** unless they specifically resolve an NRA.

**Disposition:** not a defect. History panel is present and works correctly when its variant renders. Future micro-CMD candidate: a "View history" affordance in the Update modal so operators can inspect history at any state, not just history-only state.

**Doctrine candidate (1 data point):** *"History panel access path is gated on a rare display state (history-only variant). Most operator interactions never expose it. Consider adding 'View history' affordance to the Update modal in a follow-on CMD."* Operator-prep flow consideration.

### §4.3 — Validator first-submit pattern surfaced again (Test 5 false alarm)

Operator initial Test 5 attempt produced `Waiver reason is required` error mid-test. Diagnostic confirmed: the modal opened with `mode='declare'` correctly; the prior console log (from a different test session) showed the validator catching a missing-reason in the `declare-at-creation` block. False alarm — not a Phase 4 defect.

This reinforces Phase 3 §4 finding: **the pre-flight validator is the v1 failure-coverage mechanism; alerts on missing fields are expected behavior, not defects.**

### §4.4 — Capture-controls disabled defect (out of scope, queued)

During initial Phase 4 smoke setup, operator hit a defect where tag buttons (`#accord-app .tag-btn`) and `#captureInput` were DOM-disabled despite meeting=running, thread bound, identity resolved. Force-enabling them via console workaround unblocked Phase 4 testing.

**Defect class:** lifecycle-ordering on the level-changed transition path (same shape as `_setMeetingHeader` defect from CMD-ACCORD-LEDGER-NAV-FIX-1).

**Disposition:** queued as `CMD-ACCORD-CAPTURE-CONTROLS-FIX-1` (architect-lean: standalone micro-CMD). Operator dispositioned Option 1: continue Phase 4 with force-enable workaround per session; queue fix between Phase 4 and Phase 5.

**Architectural note:** this is the **second** lifecycle-ordering defect surfaced on the level-changed transition path during Phase 4-5 of NRA Surface (first was `_setMeetingHeader`). Pattern emerging: the level-changed transition path has multiple latent defects related to surface-host re-mount + lifecycle-event timing.

**Doctrine candidate (2nd data point — promotes to 2):** *"Lifecycle-ordering defects on the level-changed transition path"* — pattern surfaced twice in two CMDs. Consider follow-on CMD to systematically audit the transition path for similar issues.

### §4.5 — None blocking

No defects in Phase 4 wiring itself. All 9 smoke tests pass. Out-of-scope defect (§4.4) does not affect Phase 4 deliverables.

---

## §5 — Doctrine queue update

| Candidate | Pre-Phase-4 | Phase 4 outcome | Notes |
|---|---|---|---|
| `API.rpc()` extension pattern | 2 (capture + ledger) | **Reinforced — 3 active uses** (capture, ledger, resolution-candidate Confirm) | Pattern proven across CMD; cross-CMD survival deferred to CMD-ACCORD-NRA-BRIEFING-PACK-1 |
| IR71 state-mutation-before-invalidation | RATIFIED | **Reinforced — `wireBadgesIn` uses event-delegation; badge re-render is naturally IR71-safe** | Solidly canonical |
| Style Doctrine v1.8 §3.8 module palette | RATIFIED | **Reinforced — candidate-region styles use only Accord palette tokens** | Solidly canonical |
| Verification-test `auth.uid()` in SQL editor | 3 (one-CMD origin; deferred Path 2) | No advance Phase 4 (no SQL editor verification) | Watch Phase 5 |
| Substrate-API documentation matches codebase reality | 1 | No advance | Watch |
| Optional-chaining silent-noop | 1 | No advance | Watch |
| Modal-on-modal close-and-open pattern | 1 | No advance Phase 4 | Watch |
| Out-of-scope defect surfaced via test navigation | 1 | **Reinforced — capture-controls defect surfaced via Phase 4 setup** | Watch (process pattern; 2nd data point) |
| Badge count reconciliation | 1 | No advance | Watch |
| **NEW: trigger_kind vs resolved_mechanism vocabulary mismatch** | (new) | 1 data point | Watch — substrate's two-vocabulary design is a class-of-defect candidate |
| **NEW: History panel access gated on rare display state** | (new) | 1 data point | Operator-prep flow consideration; future CMD candidate |
| **PROMOTES: Lifecycle-ordering defects on level-changed transition path** | 1 (from ledger-nav-fix CMD) | **2 data points** (this CMD's capture-controls defect is the 2nd instance) | Watch for 3rd cross-CMD instance; consider systematic audit CMD if pattern continues |

---

## §6 — Open notes for Phase 5 (closure)

### §6.1 — Phase 5 deliverables (per brief §4)

1. Full surface smoke: declare → defer → update → supersede → resolve, across multiple surfaces, observing reactivity
2. Resolution-candidate flow end-to-end (already validated in Phase 4 Test 9; can be re-run)
3. Grandfathered "+ Add NRA" on existing 47 nodes verified at scale
4. History panel verified for nodes with multi-row chains
5. 8-archetype walkthrough re-run on shipped product (per IR67)
6. Version pin bump (operator-managed)
7. CMD seal

### §6.2 — Capture-controls fix should land first

`CMD-ACCORD-CAPTURE-CONTROLS-FIX-1` should land before Phase 5 closure smoke so operator doesn't need force-enable workaround for full lifecycle testing.

### §6.3 — Open architectural notes

- Trigger_kind → resolved_mechanism mapping (§4.1) lives in `AccordNRA.Modal._submit` Confirm-resolved handler. If substrate adds new trigger_kind enum values, mapping must be extended. Consider extracting mapping to `AccordNRA.TRIGGER_TO_MECHANISM` constant for visibility.
- History panel access path (§4.2) — possible follow-on micro-CMD to add "View history" affordance to standard Update modal.

---

## §7 — Phase 5 readiness statement

Phase 4 deliverables 1–8 met. Three display surfaces wired; cross-surface reactivity verified; resolution-candidate flow validated; modal extension shipped within Phase 4 scope per Option 1 disposition.

### Required operator action before Phase 5 commits

1. Disposition on `CMD-ACCORD-CAPTURE-CONTROLS-FIX-1` queue order (Phase 5 prerequisite or post-CMD?)
2. Phase 5 commission

### No blockers for Phase 5

Phase 5 estimated scope (per brief §4): 2-3 hours. Lifecycle smoke + ratification calls + version pin (operator-managed) + CMD seal.

**Halt-and-surface ends the engagement.** Standing by for Phase 5 commission.

---

*End Phase 4 close-out · CMD-ACCORD-NRA-SURFACE-1.*
