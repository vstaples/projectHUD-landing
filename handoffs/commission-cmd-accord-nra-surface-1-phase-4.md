# Commission · CMD-ACCORD-NRA-SURFACE-1 · Phase 4 (Display-surface wiring)

**Status:** Phase 3 closed (CMD-ACCORD-LEDGER-NAV-FIX-1 unblocked Test 7); Phase 4 commissioned 2026-05-09 morning
**Operator:** Vaughn Staples
**Architect:** Claude (post-handoff)
**Scope this engagement:** Phase 4 only — wire `AccordNRA.Badge` across all node-displaying surfaces; install `accord:nra-*` event listeners; halt-and-surface

---

## §1 — Phase 3 + ledger-nav-fix acknowledgment

NRA Surface Phase 3 closed; ledger-nav-fix CMD shipped; NRA Surface Phase 3 Test 7 retried successfully. Capture-surface and ledger-surface NRA capture flows verified end-to-end. Ledger navigation defect resolved at root cause.

**Doctrine queue updates carried:**
- IR71 reinforced (modal-callback-context held cleanly through Phase 3)
- `API.rpc()` extension pattern reinforced (used across capture + ledger)
- Style Doctrine v1.8 §3.8 reinforced

**No operator decisions required for Phase 4.**

---

## §2 — Phase 4 deliverables

### Deliverable 1 — Surface inventory verification

Phase 1 §1.2 + Phase 2 §7.4 + Phase 3 §7.1 identified five candidate display surfaces. Phase 4 begins by **verifying each** via codebase read:

1. `accord-capture.js` — `_renderStream()` displays just-captured nodes. **Confirmed display surface.**
2. `accord-document.js` — `_renderNode(node)` line 440. **Confirmed display surface.**
3. `accord-ledger.js` — `_renderEvidence(node)` + `_renderDecisionRow`. **Confirmed display surface.**
4. `accord-minutes.js` — line 254 tag-styled rendering. **Verify Phase 4: does it render individual nodes (display surface) or only narrative summaries (not display surface)?** Halt and surface if ambiguous.
5. `accord-views.js` — possibly sub-list rows. **Verify Phase 4: do rows show individual node summaries (display surface) or only meeting-level rows (not display surface)?** Halt and surface if ambiguous.

For each confirmed display surface, proceed with badge wiring per Deliverables 2-3.

### Deliverable 2 — Badge rendering

For each confirmed display surface, render `AccordNRA.Badge.render(node, currentNRA, historyCount)` next to each rendered node.

**Pattern (per surface):**

```javascript
// Where node is rendered:
const nraBadgeData = await _fetchNRABadgeData(node.node_id);
// nraBadgeData: { current: <accord_nras_current row | null>, historyCount: <int> }
const badge = AccordNRA.Badge.render(node, nraBadgeData.current, nraBadgeData.historyCount);
nodeRow.appendChild(badge);
```

**`_fetchNRABadgeData` helper:** new utility (in `accord-nra.js` or per-surface module — agent picks based on existing convention) that:
- GETs `/rest/v1/accord_nras_current?node_id=eq.<id>` → currentNRA (or null)
- COUNTs `/rest/v1/accord_nras?node_id=eq.<id>&select=nra_id` (or equivalent count query) → historyCount
- Returns combined shape

**Performance consideration:** N+1 query on rendered lists. For v1, accept N+1 (clean, simple, matches existing patterns); optimize via batched read (e.g., `node_id=in.(...)` bulk fetch) only if Phase 5 closure smoke surfaces perceptible lag. Architect-lean: ship N+1 v1; queue optimization as follow-on if needed.

**Variant selection** (per Phase 2 spec; 10 variants):
- `currentNRA` is null + node has no history (`historyCount === 0`) → **grandfathered** variant ("+ Add NRA")
- `currentNRA` is null + history exists (`historyCount > 0`) → **history-only** variant
- `currentNRA.state === 'declared'` + `resolution_candidate_at IS NOT NULL` + `resolved_at IS NULL` → **resolution-candidate** variant
- `currentNRA.state === 'declared'` + owner_resource_id populated → **declared external** variant
- `currentNRA.state === 'declared'` + owner_event_type populated → **declared event-anchored** variant
- `currentNRA.state === 'declared'` + owner_is_operator → **declared operator** variant
- `currentNRA.state === 'waived'` → **waived** variant
- `currentNRA.state === 'deferred'` + age tier (≤30d / 31-60d / 60d+) → 3 deferred variants

`AccordNRA.Badge.render()` takes raw inputs; variant selection logic lives inside the component (already shipped Phase 2).

### Deliverable 3 — Click handlers

Per surface, wire click-to-edit:
- Click on **declared / candidate / waived / deferred** badge → opens `AccordNRA.Modal` in **'update'** mode pre-populated from currentNRA
- Click on **history-only** badge → opens `AccordNRA.HistoryPanel` for the node
- Click on **grandfathered "+ Add NRA"** badge → opens `AccordNRA.Modal` in **'declare'** mode (new NRA on existing node; no node creation)

**Pattern:**

```javascript
// Once per render container:
AccordNRA.Badge.wireClickHandlers(container, async (badgeEl) => {
  const nodeId = badgeEl.dataset.nodeId;
  const nraBadgeData = await _fetchNRABadgeData(nodeId);
  return { node: { node_id: nodeId, /* ... */ }, currentNRA: nraBadgeData.current, historyCount: nraBadgeData.historyCount };
});
```

`AccordNRA.Badge.wireClickHandlers` is Phase 2 component API; takes a container and a lookup function.

### Deliverable 4 — CustomEvent listeners

Per surface, install listeners for the six `accord:nra-*` events to trigger badge re-render on substrate mutations:

```javascript
const nraEventTypes = [
  'accord:nra-declared', 'accord:nra-waived', 'accord:nra-deferred',
  'accord:nra-resolved', 'accord:nra-superseded', 'accord:nra-candidate-flagged'
];
nraEventTypes.forEach(eventType => {
  window.addEventListener(eventType, async (e) => {
    const affectedNodeId = e.detail.node_id;
    // Re-render badge for affected node in this surface's container, if rendered
    await _refreshBadgeForNode(affectedNodeId);
  });
});
```

**`_refreshBadgeForNode` per surface:** locates the rendered badge for the given node_id (via `data-node-id` attribute or equivalent), refetches NRA data, re-renders. If node is not currently rendered in this surface, no-op.

**IR71 vigilance:** badge re-render replaces the badge DOM element. Ensure click handlers are re-bound on the new element (or use event delegation on the container, which is more robust). Phase 2 component shipped with `wireClickHandlers` taking a container — delegation pattern, naturally IR71-safe.

### Deliverable 5 — Update flow (supersede)

When operator clicks a declared/candidate/waived/deferred badge, the modal opens in update mode. On submit:
- Modal calls `API.rpc('supersede_nra', {p_old_nra_id, p_new_nra_data})` — Phase 2 modal handles
- Surface listens for `accord:nra-superseded` CustomEvent and re-renders badge

### Deliverable 6 — Resolution-candidate Confirm/Not-yet flow

When operator clicks a resolution-candidate badge:
- Modal opens in update mode (per Phase 2 spec)
- Modal shows two prominent options: **"Confirm resolved"** + **"Not yet"**
  - Confirm resolved → `API.rpc('resolve_nra', {p_nra_id, p_mechanism: <matching trigger>, p_resolved_event_id: <event id>})`
  - Not yet → direct PATCH to clear `resolution_candidate_at` (substrate stays declared)

**Architect IR64 verification flag:** Phase 2 modal may not yet have explicit Confirm/Not-yet UI for resolution-candidate state. Phase 4 may need to extend modal to render these options when current NRA has `resolution_candidate_at IS NOT NULL`. If Phase 2 component already supports this, no extension needed. Halt and surface if Phase 4 needs to extend `AccordNRA.Modal` UI.

### Deliverable 7 — Smoke

End-to-end smoke across all confirmed display surfaces:

1. Render badges on existing nodes — verify all 10 variants render correctly across surfaces (use existing 47 grandfathered nodes + Phase 3 newly-created NRA nodes)
2. Click each variant — verify correct modal/panel opens with correct mode
3. Update an NRA from one surface — verify badge re-renders on that surface AND on other surfaces displaying the same node (cross-surface reactivity via CustomEvents)
4. Resolve a resolution-candidate via Confirm — verify badge transitions correctly
5. Add NRA on a grandfathered node via "+ Add NRA" affordance — verify badge updates from grandfathered to declared variant
6. View history via history-only badge — verify side panel renders correctly

### Deliverable 8 — Phase 4 close-out

Per established CMD pattern.

---

## §3 — Files (anticipated)

**Modified (per surface):**
- `js/accord-capture.js` — `_renderStream()` extended with badge render + click wiring + event listeners
- `js/accord-document.js` — `_renderNode()` (line 440) same
- `js/accord-ledger.js` — `_renderEvidence()` + `_renderDecisionRow` same
- `js/accord-minutes.js` — IF Phase 1 deliverable verifies as display surface
- `js/accord-views.js` — IF Phase 1 deliverable verifies as display surface

**Possibly modified:**
- `js/accord-nra.js` — IF `_fetchNRABadgeData` is added here (vs per-surface); IF resolution-candidate Confirm/Not-yet UI extension is needed

**No changes to:**
- `accord_nras` substrate (sealed)
- `js/api.js` (RPC stable; PATCH paths use existing convention)
- `version.js` (operator handles manually per build convention; bumps at Phase 5)
- `accord.html` (Phase 2 anchors complete)

---

## §4 — Discipline

- **IR36/37/40 §1** — terse hand-off; halt on missing input
- **IR39** — display-surface wiring only. No new components (Phase 2 ships them); no substrate (sealed); no briefing-pack work
- **IR64** — verify mental models against codebase. Especially: Deliverable 1 surface verification; Deliverable 6 resolution-candidate UI capability check
- **IR65** — does NOT fire this Phase. Surface render output changes; version pin fires Phase 5
- **IR70** — substrate-derived intelligence flow (resolution-candidate Confirm/Not-yet honors substrate-proposes-operator-decides)
- **IR71** — state-mutation-before-invalidation. Badge re-render via event delegation on container is naturally IR71-safe; if any surface uses different pattern, ensure click handlers re-bind on new badge elements
- **IR72** — Phase 1 cross-module survey complete; Phase 4 honors findings
- **Style Doctrine v1.8 §3.8** — module palette discipline (no new CSS this Phase unless badge integration needs surface-specific tweaks)

**Operator note:** Version pin bump is **operator-managed** per build convention (carried through this CMD chain). Agent does NOT bump `version.js`; close-out flags when bump is needed (Phase 5 closure).

---

## §5 — Halt-and-surface terms

End Phase 4 with structured close-out covering:

1. Files modified (with line counts)
2. Surface inventory — which 5 candidates verified as display surfaces, which not
3. Badge rendering verification across all confirmed surfaces (10 variants × N surfaces matrix; "all pass" with exceptions called out is acceptable)
4. Click handler verification per variant
5. Cross-surface reactivity verification (Update on surface A, badge refreshes on surface B)
6. Resolution-candidate Confirm/Not-yet flow verification
7. Grandfathered "+ Add NRA" flow verification
8. History panel verification
9. Any IR64 findings (especially: surface inventory ambiguity; Phase 2 component capability gaps for resolution-candidate UI)
10. Doctrine queue update
11. Open notes for Phase 5 (closure: full lifecycle smoke + 8-archetype walkthrough on shipped product + ratification calls)

**Phase 5 commissioning is architect's next move after operator reviews Phase 4.**

---

## §6 — Reference set (Phase 4)

- `phase-3-closeout-cmd-accord-nra-surface-1.md` — Phase 3 close-out (informative; §7.1 surface inventory)
- `commission-cmd-accord-nra-surface-1-phase-3.md` — Phase 3 commission (informative)
- `brief-cmd-accord-nra-surface-1.md` — operator-ratified brief
- `Iron_Rules_71-72_Ratifications.md` + `Iron_Rule_73_Ratification.md` — relevant doctrine
- `Style_Doctrine_v1_8.md` — palette discipline
- `js/accord-nra.js` — Phase 2 component API consumed
- `js/api.js` — Phase 2 RPC + PATCH consumed
- All confirmed display-surface files — wiring targets

---

*Commission CMD-ACCORD-NRA-SURFACE-1 · Phase 4 · Display-surface wiring.*
