# Commission · X-27
## CMD-ACCORD-TRANSITIONS-COALESCE-FIX-1

**Track:** X — Ancillary defect fix
**Authored:** 2026-05-14
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Console-confirmed root cause — session 2026-05-14
**Predecessor:** CMD-ACCORD-MY-MEETINGS-2 sealed
**Successor:** Resume MY-MEETINGS-2 smoke tests 7–10
**IR66 in effect:** Root cause already confirmed via console — no further
diagnosis required before code change. Proceed directly to §4.
**IR67 in effect:** Version + date in every modified file header
**IR68 in effect:** One diagnostic at a time
**IR69 in effect:** Test instructions proactively, one step at a time
**Coding agent:** single file change; execute §4 in full, then §5

---

## §1 — Scope

Fix a coalescing queue accumulation bug in `accord-transitions.js` that
causes `AccordMeetingSetup.render` to be called multiple times in rapid
succession when navigating between meetings during a session.

**One file changes:** `accord-transitions.js`
**No substrate changes.** No other files touched.

---

## §2 — Root cause (already confirmed — no re-diagnosis required)

`_onLevelChanged` guards against in-flight transitions with `state.inFlight`.
When a second `accord:level-changed` event arrives while a transition is
already running, the current code schedules a re-fire via `setTimeout`:

```javascript
// CURRENT — BUGGY
if (state.inFlight) {
  setTimeout(() => _onLevelChanged(ev), TIMING.OUT_MS + TIMING.IN_MS + 16);
  return;
}
```

Each queued event schedules an **independent** re-fire. They do not replace
each other. If 5 events arrive during a single transition, 5 independent
`_onLevelChanged` calls are queued. All 5 execute after the transition
completes. Each calls `renderMeetingView` → `loadMeeting` →
`accord:meeting-loaded` → `AccordMeetingSetup.render` → filmstrip re-init.

**Confirmed via console diagnostic:** 5 rapid `accord:level-changed` events
→ 5 `render` calls. Expected after fix: exactly 1.

The fix replaces the accumulating `setTimeout` queue with a single
"latest event wins" slot: only the most recent pending event is retained.
All earlier queued events are discarded.

---

## §3 — No substrate changes

No SQL. No Supabase migrations. No Edge Functions. No other JS or CSS files.

---

## §4 — The fix (three changes in `accord-transitions.js`)

### §4.1 — Add `_pendingEvent` to state initializer

Find the `state` object (near line 37). It currently ends with:

```javascript
  const state = {
    centerHost:        null,
    constellationHost: null,
    viewHost:          null,
    inFlight:          false,
    lastSourceRect:    null,
  };
```

Add `_pendingEvent: null` as the last property:

```javascript
  const state = {
    centerHost:        null,
    constellationHost: null,
    viewHost:          null,
    inFlight:          false,
    lastSourceRect:    null,
    _pendingEvent:     null,    // X-27: latest-wins coalesce slot
  };
```

---

### §4.2 — Replace the coalescing block in `_onLevelChanged`

Find this block (near lines 94–100):

```javascript
    if (state.inFlight) {
      // Coalesce rapid changes — finish the current and re-fire after
      setTimeout(() => _onLevelChanged(ev), TIMING.OUT_MS + TIMING.IN_MS + 16);
      return;
    }
    state.inFlight = true;
```

Replace with:

```javascript
    if (state.inFlight) {
      state._pendingEvent = ev;   // X-27: keep only latest; discard earlier
      return;
    }
    state.inFlight = true;
    state._pendingEvent = null;
```

---

### §4.3 — Replace the finally block in `_onLevelChanged`

Find this block (near lines 110–113):

```javascript
    } finally {
      state.inFlight = false;
    }
```

Replace with:

```javascript
    } finally {
      state.inFlight = false;
      if (state._pendingEvent) {
        var pending = state._pendingEvent;
        state._pendingEvent = null;
        _onLevelChanged(pending);
      }
    }
```

---

### §4.4 — Update file header (IR67)

The file header currently reads:

```javascript
// ProjectHUD — accord-transitions.js
// CMD-ACCORD-CONSTELLATION-ENTRY-1 · Phase 4a
```

Update to include version and modification date:

```javascript
// ProjectHUD — accord-transitions.js
// CMD-ACCORD-CONSTELLATION-ENTRY-1 · Phase 4a
// X-27: coalescing queue fix — 2026-05-14
// Version: v20260514-X-27
// Modified: 2026-05-14
```

---

## §5 — Smoke tests

Agent must deliver these one step at a time after deploy, waiting for
operator result before proceeding to the next step.

| # | Test | Expected |
|---|---|---|
| 1 | Run console diagnostic (below) | Exactly 1 render call logged — not 5 |
| 2 | Navigate to a meeting from WORKSTREAMS tree | Setup shell loads once, filmstrip paints once and stops |
| 3 | Navigate to a second meeting without page refresh | Setup shell loads cleanly, no loop |
| 4 | Open MY MEETINGS tab, click an UPCOMING card | Navigates to meeting, setup shell loads once |
| 5 | Leave session open 5+ minutes, navigate between 3 meetings | No accumulation — each navigation produces exactly 1 render |

**Console diagnostic for Test 1:**

```javascript
var _diagCount = 0;
var _origRender = window.AccordMeetingSetup.render;
window.AccordMeetingSetup.render = function(host, meeting, workstreamId) {
  _diagCount++;
  console.log('[DIAG] render call #' + _diagCount,
    meeting && meeting.meeting_id);
  return _origRender.apply(this, arguments);
};

var _mid = window.Accord && Accord.state &&
  Accord.state.levelContext && Accord.state.levelContext.meetingId;
for (var i = 0; i < 5; i++) {
  window.dispatchEvent(new CustomEvent('accord:level-changed', {
    detail: { level: 'meeting', context: { meetingId: _mid } }
  }));
}
setTimeout(function() {
  console.log('[DIAG] total render calls:', _diagCount,
    _diagCount === 1 ? '✓ PASS' : '✗ FAIL — expected 1');
}, 3000);
```

Expected result: `total render calls: 1 ✓ PASS`

---

## §6 — Files manifest

| File | Change |
|---|---|
| `accord-transitions.js` | 3 surgical changes + header update (§4.1–4.4) |
| `version.js` | Operator-managed (IR65) |

---

## §7 — Discipline checklist

- IR66: root cause confirmed pre-commission — no console diagnosis needed
  before code change; proceed directly to §4
- IR67: file header updated with version string and date (§4.4)
- IR68: one diagnostic at a time in smoke tests
- IR69: smoke tests delivered one step at a time after deploy
- `var` only in the new finally block (no `let` or `const`)
- No other files touched — change is fully contained in `accord-transitions.js`
- `_pendingEvent` slot holds an event object reference — no serialization needed

---

**After smoke test 5 passes: X-27 seals. Resume MY-MEETINGS-2 smoke
tests 7–10 in the next session.**

---

*End Commission · X-27 · CMD-ACCORD-TRANSITIONS-COALESCE-FIX-1*
*Operator: Vaughn Staples · Architect: Claude (Pluto) · 2026-05-14*
