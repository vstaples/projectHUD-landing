# Commission · CMD-ACCORD-NEWMEETING-ROUTING-FIX-1

**Type:** Defect fix (micro-CMD)
**Authored:** 2026-05-09
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Predecessor:** CMD-ACCORD-MEETING-SETUP-1 Phase 3 (sealed)
**Successor:** CMD-ACCORD-MEETING-SETUP-1 Phase 4 (blocked on this fix)
**Coding agent:** single engagement; halt-and-surface after §6

---

## §1 — Defect description

**Symptom:** Clicking `+ NEW MEETING` while a meeting is active (any state) renders the new meeting's Setup shell inside the current meeting's surface — Live Capture tab body or equivalent — without tearing down the existing surface. The outer breadcrumb and tab bar belong to the old meeting; the inner content belongs to the new one. Two meeting surfaces coexist in the DOM.

**Root cause:** The `+ NEW MEETING` post-create navigation bypasses `accord-transitions.js`. Instead of dispatching `accord:level-changed` (which triggers `_transitionToMeetingView` → proper mount/unmount), it calls a render path directly against whatever container is currently active. `_accordDetachSurfaceHost` never fires; the old surface is not torn down.

**Classification:** Lifecycle-ordering defect on the level-changed transition path (third data point across CMD-ACCORD-MEETING-SETUP-1 Phase 4, Phase 2 `loadMeeting()` gap, and this instance). Pattern promotes to doctrine candidate queue at 3 data points.

**Fix:** Post-create navigation must go through the transitions layer. After the new meeting row is inserted, call `Accord.setLevel('meeting', { meetingId: newId, workstreamId })` (or dispatch `accord:level-changed` directly if `setLevel` is not the right entry point — see §2).

---

## §2 — IR64 verification (do before writing any fix)

**V1 — Locate the `+ NEW MEETING` click handler.**

Search across all loaded JS files for the button wire-up. Likely candidates: `accord-core.js`, `accord-views.js`, or a meeting-header render function. Find:
- The function that fires on `+ NEW MEETING` click
- What it does after the POST/RPC to create the meeting (specifically: how it navigates to the new meeting)
- The exact container it renders into

Report file name + line number in close-out.

**V2 — Confirm `Accord.setLevel` signature.**

In `accord-core.js`, find `setLevel` (or equivalent). Confirm:
- Function name and arguments
- Whether it dispatches `accord:level-changed` internally
- Whether it requires `workstreamId` in the context payload

If `setLevel` does not exist or has a different shape, identify the correct dispatch pattern from the existing codebase (e.g., direct `window.dispatchEvent(new CustomEvent('accord:level-changed', { detail: { level: 'meeting', context: { meetingId, workstreamId } } }))` per accord-transitions.js line 88).

**V3 — Confirm `workstreamId` availability at the `+ NEW MEETING` call site.**

The new meeting's `workstream_id` must be passed into the navigation call. Confirm it is available in scope at the click handler (either from the current meeting object, from `Accord.state`, or from the new meeting's POST response).

Report all three findings before writing any fix code.

---

## §3 — Fix

One change only: the post-create navigation in the `+ NEW MEETING` handler.

**Before (current broken pattern — approximate):**
```javascript
// After meeting INSERT resolves:
AccordMeetingSetup.render(someContainer, newMeeting, workstreamId);
// — or some equivalent direct render call —
```

**After (correct pattern):**
```javascript
// After meeting INSERT resolves:
// newMeetingId = id from POST response
// workstreamId = from V3 finding (Accord.state, current meeting, or POST response)
Accord.setLevel('meeting', { meetingId: newMeetingId, workstreamId: workstreamId });
// — OR if setLevel dispatches differently per V2 finding:
window.dispatchEvent(new CustomEvent('accord:level-changed', {
  detail: {
    level:   'meeting',
    context: { meetingId: newMeetingId, workstreamId: workstreamId }
  }
}));
```

`accord-transitions.js::_transitionToMeetingView` then:
1. Calls `AccordViews.renderMeetingView(state.viewHost, meetingId, workstreamId)` — which state-branches to Setup shell (new meeting is `state='idle'`)
2. Handles the animation + host swap
3. Fires `_accordDetachSurfaceHost` if a surface is registered — tearing down the old meeting surface cleanly

**No changes to `accord-transitions.js`, `accord-meeting-setup.js`, or `accord-views.js` beyond the single handler fix.** If the fix requires more than replacing the post-create navigation call, halt and surface before proceeding.

---

## §4 — Scope guard

This CMD fixes the routing defect only. Do not:
- Change the meeting creation POST/RPC
- Change the `+ NEW MEETING` button's appearance or placement
- Add any new surface code
- Touch Phase 3 or Phase 4 agenda/briefing logic

---

## §5 — Discipline checklist

- `var` only — no `let`/`const`
- IR64 V1–V3 documented in close-out (file + line of handler; `setLevel` signature; `workstreamId` source)
- `accord-transitions.js` — not modified
- Version pin bump — operator-managed (IR65); surface navigation path changed

---

## §6 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Click `+ NEW MEETING` from **constellation** (baseline) | New meeting Setup shell renders cleanly in view host. No regression. |
| 2 | Click `+ NEW MEETING` from a **running meeting** (Live Capture active) | Old meeting surface tears down. New meeting Setup shell renders in view host. Breadcrumb updates to new meeting. No tab bar from old meeting visible. No console errors. |
| 3 | Click `+ NEW MEETING` from an **idle meeting** (Setup shell active) | Old Setup shell tears down (`_accordDetachSurfaceHost` fires). New meeting Setup shell renders. Autosave debounce from old shell cancelled (no stale PATCH). |
| 4 | Navigate back to constellation after Test 2 or 3 | Constellation renders cleanly. Old and new meeting Setup shells both gone. |
| 5 | Begin Meeting on the new meeting created in Test 2 | `startMeeting()` fires correctly (Accord.state.meeting populated); surface transitions to 5-tab shell. |

Test 3 specifically verifies the `_detachHandler` ownership guard from Phase 2 — the new Setup shell's detach hook must replace the old shell's hook, not stack.

---

## §7 — Close-out required fields

- IR64 findings: V1 (file + line), V2 (setLevel shape), V3 (workstreamId source)
- Doctrine queue note: lifecycle-ordering on level-changed transition path — 3rd data point. Candidate text: *"Post-create navigation (new meeting, new workstream, etc.) must route through `Accord.setLevel()` / `accord:level-changed` dispatch rather than calling render paths directly. Direct render calls bypass `accord-transitions.js`, leave the prior surface mounted, and suppress `_accordDetachSurfaceHost`. Surface creation is not the same as surface navigation."*
- All 5 smoke tests pass
- version.js bump confirmed (operator-managed)

---

**Halt-and-surface after §6. Phase 4 commission follows seal of this CMD.**

---

*End Commission · CMD-ACCORD-NEWMEETING-ROUTING-FIX-1.*
