# Commission · CMD-ACCORD-LEDGER-NAV-FIX-1 · Phase 1 (Investigation)

**Status:** Commissioned 2026-05-09 morning
**Operator:** Vaughn Staples
**Architect:** Claude (post-handoff)
**Scope this engagement:** Phase 1 only — investigate root cause of `_setMeetingHeader` defect, halt-and-surface

---

## §1 — Reference set

- `brief-cmd-accord-ledger-nav-fix-1.md` — operator-ratified brief
- `phase-3-closeout-cmd-accord-nra-surface-1.md` §3.7 — original defect report with stack trace
- `aegis-MASTER-handoff-2026-05-08-late-evening.md` — build state (informative)

---

## §2 — Phase 1 deliverables

Per brief §3 Phase 1, execute four deliverables. Investigation only — no code changes.

1. **IR64 verification of `accord-core.js`:** read lines 175-300 to understand `loadMeeting` → `_setMeetingHeader` flow. Identify the exact `getElementById` (or equivalent) call on or near line 294 that returns null

2. **Cross-reference with `accord.html`:** find the expected element ID/selector. Determine if:
   - (a) Element ID is wrong/typo'd in `accord-core.js`
   - (b) Element was renamed/removed in recent `accord.html` changes
   - (c) Element exists but is conditionally rendered and not present in current view-state
   - (d) Timing issue — element queried before render
   - (e) Something else

3. **Trace the level-changed transition path:** `_onLevelChanged` → `_transitionToMeetingView` → `renderMeetingView` → `loadMeeting` → `_setMeetingHeader`. Determine why this path produces a null target when other meeting-loading paths (legacy ledger nav) presumably worked before

4. **Halt-and-surface** with:
   - Root cause classification (a/b/c/d/e)
   - Proposed fix shape (null-guard / markup correction / lifecycle correction / other)
   - Phase 2 readiness statement

---

## §3 — Discipline

- **IR36/37/40 §1** — terse hand-off; silent work-mode; halt on missing input
- **IR39** — investigation only; no fixes, no scope creep
- **IR64** — verify mental models against codebase
- **IR65** — does NOT fire this Phase
- **IR72** — exempt (per brief §5)

---

## §4 — What Phase 1 does NOT do

- Does NOT author the fix
- Does NOT modify any files
- Does NOT investigate unrelated defects (queue separately if found)

---

## §5 — Halt-and-surface terms

Single short document covering:

1. Root cause identified (which DOM element, which classification)
2. Proposed fix shape with rationale
3. Any related defects observed during investigation (queue, do not fix)
4. Phase 2 readiness statement

---

*Commission CMD-ACCORD-LEDGER-NAV-FIX-1 · Phase 1 · Investigation.*
