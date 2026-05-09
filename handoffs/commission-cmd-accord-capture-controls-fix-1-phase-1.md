# Commission · CMD-ACCORD-CAPTURE-CONTROLS-FIX-1 · Phase 1 (Investigation)

**Status:** Commissioned 2026-05-09 morning
**Scope:** Investigation only — root cause + fix proposal. Halt-and-surface.

---

## Reference set

- `brief-cmd-accord-capture-controls-fix-1.md` — operator-ratified brief
- `phase-4-closeout-cmd-accord-nra-surface-1.md` §4.4 — original defect report
- `commission-cmd-accord-ledger-nav-fix-1-phase-1.md` + `phase-1-halt-surface-cmd-accord-ledger-nav-fix-1.md` — analogous prior CMD (same defect class); reference for investigation pattern

---

## Phase 1 deliverables

1. **IR64 verification:** locate where `#captureInput` and `.tag-btn` enable/disable logic lives. Identify the gate function.

2. **Trace timing:** under what conditions are controls disabled despite meeting=running + thread bound + identity resolved? Likely candidates per brief §3:
   - State-check runs before context fully loads
   - Surface-host re-mount blasts away enabled state
   - Level-changed transition fires gate-check at wrong moment
   - Lifecycle hook placement issue

3. **Compare to ledger-nav-fix root cause:** that defect was `host.innerHTML = html` in `renderMeetingView()` destroying surface-host children before re-mount. Same class? If so, fix shape likely mirrors (`_detachSurfaceHost()` before destructive overwrite, OR similar lifecycle-ordering correction).

4. **Halt-and-surface** with root cause classification + proposed fix shape + Phase 2 readiness.

---

## Discipline

- IR36/37/40 §1 — terse; halt on missing input
- IR39 — investigation only; no fixes
- IR64 — verify against codebase
- IR65 — does NOT fire this Phase
- IR72 — exempt

---

## Halt-and-surface terms

Short document covering:
1. Root cause identified
2. Fix proposal with rationale
3. Comparison to ledger-nav-fix root cause (same class or different?)
4. Phase 2 readiness

---

*Commission CMD-ACCORD-CAPTURE-CONTROLS-FIX-1 · Phase 1.*
