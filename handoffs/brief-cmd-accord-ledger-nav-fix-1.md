# Brief · CMD-ACCORD-LEDGER-NAV-FIX-1

**Status:** Brief draft, 2026-05-09 morning. Awaiting operator ratification.
**Architect:** Claude (post-handoff)
**Operator:** Vaughn Staples
**Type:** Defect-fix micro-CMD (3 phases anticipated; 1-2 hours total)
**Predecessor:** Defect surfaced during CMD-ACCORD-NRA-SURFACE-1 Phase 3 smoke (Test 7 deferred)

---

## §1 — Objective

Resolve the `_setMeetingHeader` null-textContent defect in `accord-core.js:294` that blocks ledger-tab navigation through the level-changed transition path. Specifically, the runtime error:

```
[Accord] loadMeeting failed TypeError: Cannot set properties of null (setting 'textContent')
    at _setMeetingHeader (accord-core.js:294:32)
    at Object.loadMeeting (accord-core.js:175:7)
    at async Object.renderMeetingView (accord-views.js:451:13)
    at async _transitionToMeetingView (accord-transitions.js:179:7)
    at async _onLevelChanged (accord-transitions.js:105:9)
```

This CMD investigates the defect (which DOM element is null and under what view-state), authors a fix, ships, verifies. CMD-ACCORD-NRA-SURFACE-1 Phase 4 commissions cleanly afterward.

---

## §2 — Why this CMD now

Three reasons:

1. **Blocks NRA Surface Phase 4 verification.** Phase 4 includes Decision Ledger badge rendering; can't fully verify display-surface wiring without working ledger nav
2. **Defect predates NRA work.** Phase 3 smoke surfaced it; the defect existed before this CMD chain. Standalone fix is honest accounting
3. **Bounded scope.** Single function in single file; defect is concrete with stack trace; no architectural questions

---

## §3 — Phase plan

### Phase 1 — Investigation (30-45 min)

1. **IR64 verification:** read `accord-core.js` lines 175-300 to understand `loadMeeting` → `_setMeetingHeader` flow
2. **Trace null DOM target:** identify which `getElementById` (or equivalent) call on line 294 returns null. Cross-reference with `accord.html` markup to find the missing or renamed element
3. **Determine root cause class:** is the element (a) renamed in recent HTML changes, (b) loaded conditionally and not present in current view-state, (c) timing issue (queried before render), or (d) something else?
4. **IR72 cross-module Phase 1 survey** — applicable to this CMD? **No.** Per IR72: "Phase 1 of any CMD that introduces or modifies a customer-facing surface, a shared client-side convention, or a navigation pattern must include an explicit cross-module survey." This CMD modifies a single function in a single file to fix a defect; it does not introduce or modify shared conventions. IR72 exempt
5. **Halt-and-surface** with root cause, proposed fix, and Phase 2 readiness

### Phase 2 — Fix (15-30 min)

1. Author fix per Phase 1 disposition. Likely shapes:
   - Null-guard (`if (el) el.textContent = ...`) if defensive-only fix is right
   - Markup correction if element ID is wrong/missing
   - Lifecycle correction if timing issue
2. Verify fix unblocks the level-changed → ledger-tab navigation path
3. Phase 2 close-out

### Phase 3 — Closure (15 min)

1. Smoke: navigate to ledger tab via `_onLevelChanged` → `_transitionToMeetingView` path; verify no console errors
2. **Optionally retry NRA Surface Phase 3 Test 7** if convenient (dissent registration with NRA modal); not required scope of this CMD
3. Version pin bump (IR65 fires — surface code change affecting Edge Function rendering)
4. CMD seal

**Total estimated effort:** 1-2 hours.

---

## §4 — File inventory (anticipated)

**Modified:**
- `js/accord-core.js` — `_setMeetingHeader` function, possibly surrounding helpers
- Possibly `accord.html` — if root cause is missing/renamed element
- `js/version.js` — Phase 3 single-pin bump

**No changes to:**
- Any NRA-related files (this CMD is unrelated to NRA work)
- Any other surface modules

---

## §5 — Discipline

- **IR36/37/40 §1** — terse hand-off; silent work-mode; halt on missing input
- **IR39** — defect-fix scope only. No surface improvements; no code-quality refactors; no related-bug fixes (queue separately if found)
- **IR64** — verify mental models against codebase
- **IR65** — fires Phase 3 (single-pin bump)
- **IR72** — exempt (no shared convention introduced or modified)

---

## §6 — Verification gates

### Phase 1 verification
- Root cause identified and documented
- Fix proposal stated explicitly

### Phase 2 verification
- Fix authored; navigation path no longer throws
- No regression in other navigation paths

### Phase 3 closure verification
- Ledger-tab navigation works via `_onLevelChanged` → `_transitionToMeetingView`
- Version pin bumped
- No console errors in core navigation flows

### Final acceptance
- Operator confirms ledger-tab navigation works
- Operator confirms readiness for CMD-ACCORD-NRA-SURFACE-1 Phase 4 commission

---

## §7 — Success criteria

The CMD succeeds when:

1. `_setMeetingHeader` no longer throws null-textContent error on the level-changed → ledger-tab navigation path
2. NRA Surface Phase 3 Test 7 (deferred) is now runnable
3. No regression in other meeting-loading paths
4. CMD seals cleanly with version pin

---

## §8 — Ratification

**Operator:** if this brief is acceptable as commissioned scope, please respond with explicit ratification statement:

> "I ratify CMD-ACCORD-LEDGER-NAV-FIX-1 as commissioned."

Or specify amendments before ratification.

After ratification, architect commissions Phase 1 with the coding agent.

---

*End brief · CMD-ACCORD-LEDGER-NAV-FIX-1.*
