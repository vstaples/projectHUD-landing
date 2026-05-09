# Commission · CMD-ACCORD-LEDGER-NAV-FIX-1 · Phase 2 (Fix)

**Status:** Phase 1 closed; Phase 2 commissioned 2026-05-09 morning
**Operator:** Vaughn Staples
**Architect:** Claude (post-handoff)
**Scope this engagement:** Phase 2 only — apply Option A fix, verify, halt-and-surface

---

## §1 — Phase 1 close-out acknowledgment

Phase 1 root cause analysis confirmed: `host.innerHTML = html` in `renderMeetingView()` destroys `#ac-meeting-surface-host` (and its children including `#cap-title`) when the surface host has been DOM-relocated into `#ac-meeting-tab-body` by a prior render. `_setMeetingHeader` then queries `getElementById('cap-title')` and gets null.

**Operator disposition: Option A** — detach surface host BEFORE `host.innerHTML = html` overwrite. Architect-lean confirmed.

---

## §2 — Phase 2 deliverables

1. **Apply Option A fix** in `js/accord-views.js`'s `renderMeetingView()`:

   ```javascript
   // First line of renderMeetingView() body, BEFORE host.innerHTML = html:
   _detachSurfaceHost();
   ```

   Single-line addition. Parks `#ac-meeting-surface-host` back at `document.body` before the `host.innerHTML = html` blast destroys it. `_mountSurfaceHostInTabBody()` later in the same function re-mounts cleanly.

2. **Verification smoke** — the trigger condition Phase 1 §1 identified:
   - Hard-refresh `accord.html`
   - Navigate directly to a meeting (first meeting-view; should not throw pre-fix or post-fix)
   - Ascend to constellation
   - Descend to a different meeting (this descent throws pre-fix; should NOT throw post-fix)
   - Verify console shows no `_setMeetingHeader` errors
   - Verify meeting header text renders correctly (`#cap-title` populated with meeting title)

3. **Regression check** — verify other navigation paths still work:
   - First-ever meeting-view from constellation (was working pre-fix)
   - Direct meeting-view via URL (if applicable to current build)
   - Tab switches within meeting view (capture / document / ledger / digest / minutes)

4. **Phase 2 close-out** per established CMD pattern.

---

## §3 — Files (anticipated)

**Modified:**
- `js/accord-views.js` — single-line `_detachSurfaceHost()` call added at top of `renderMeetingView()`

**No changes to:**
- `accord-core.js` (defect lives at line 294; root cause fix is upstream)
- `accord.html` (markup is correct; no element rename needed)
- `version.js` (Phase 3 closure)

---

## §4 — Discipline

- **IR36/37/40 §1** — terse hand-off; silent work-mode; halt on missing input
- **IR39** — single-line fix; no related defects fixed (Phase 1 §3 candidates queued, not in scope)
- **IR64** — verify the fix by exercising the trigger condition Phase 1 identified
- **IR65** — does NOT fire this Phase (Phase 3 closure)

---

## §5 — Halt-and-surface terms

End Phase 2 with short close-out:

1. File modified (one line in one file)
2. Smoke results (trigger condition no longer throws; no regression in other paths)
3. Phase 3 readiness statement

Phase 3 (closure + version pin + CMD seal) commissions after operator reviews Phase 2.

---

*Commission CMD-ACCORD-LEDGER-NAV-FIX-1 · Phase 2 · Fix.*
