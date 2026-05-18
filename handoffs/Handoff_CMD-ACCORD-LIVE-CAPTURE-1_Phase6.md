# HANDOFF — CMD-ACCORD-LIVE-CAPTURE-1 · Phase 6: End Meeting Flow + Status Bar

**Date:** 2026-05-18
**CMD:** L-01 · CMD-ACCORD-LIVE-CAPTURE-1
**Operator:** Vaughn Staples
**Phase:** 6 of 7 — End Meeting lifecycle closure. Status bar wired to live data.

---

## §0 — PRE-FLIGHT

Read `Brief_CMD-ACCORD-LIVE-CAPTURE-1.md` end-to-end before proceeding.
Read Phase 1 findings and all prior phase close-out findings in full.
Iron Rules 36, 40 §1, 47, 64, 71, 72, 73 apply.
Terse output discipline. Deliver in §6 file order, then §7 checklist verbatim. Stop.

---

## §1 — CARRY-FORWARD

**Phase 5 close-out findings (if any) carry forward.**

**Phase 4 carry-forward confirmed for this phase:**
- `accord_agenda_items.status` CHECK: `pending`, `in_progress`, `complete` only.
  `discussed` / `skipped` do not exist. Mapping: `complete` = discussed,
  `in_progress` = skipped. Do not add new constraint values.

**Phase 3 carry-forward:**
- `ac-live-filmstrip` is hidden during Live Capture via injected `<style>` tag
  (`ac-lc-filmstrip-hide`). Phase 6 replaces this with proper wired status bar
  content and removes the hide rule once the bar is populated.

**Phase 1 carry-forward:**
- `accord:level-changed` must still be dispatched after meeting state transition.
- `accord.agenda.changed` broadcast on agenda item status PATCH.
- `var` only — no `let`/`const`.

---

## §2 — INPUTS

Request the following files from the operator:

| File | Purpose |
|------|---------|
| `accord-live-capture.js` | Phase 5 output — extend with End Meeting + status bar |
| `accord-core.js` | Confirm `accord_meetings` PATCH pattern + state transition dispatch |
| `accord-views.js` | Confirm post-close routing (what renders after `state='closed'`) |

---

## §3 — DELIVERABLES

1. `accord-live-capture.js` — End Meeting flow + status bar wired
2. Operator review checkpoint before Phase 7

---

## §4 — BUILD SPEC

### 4.1 — End Meeting button

The END MEETING button was rendered but disabled in Phase 3. Enable it this phase.

Remove `disabled` attribute and `opacity:.35` / `pointer-events:none` from button.
Wire click handler.

**Click → confirmation modal:**

```
╔─────────────────────────────────╗
│  End this meeting?               │
│                                  │
│  All captured nodes will be      │
│  sealed. This cannot be undone.  │
│                                  │
│  [Cancel]    [End Meeting →]     │
╚─────────────────────────────────╝
```

- Modal: centered, `background: var(--raised)`, `border: 1px solid var(--b2)`,
  `border-radius: 10px`, `padding: 24px`, `width: 400px`
- Backdrop: `rgba(0,0,0,.7)` with `backdrop-filter: blur(3px)`
- Cancel: closes modal, no state change
- End Meeting: fires `_endMeeting()`

### 4.2 — `_endMeeting()` function

```javascript
function _endMeeting() {
  // 1. Disable button immediately to prevent double-fire
  var btn = document.getElementById('ac-lc-end-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Ending…'; }

  // 2. PATCH accord_meetings
  // SET state = 'closed', ended_at = now()
  // WHERE meeting_id = [current] AND state = 'running'  ← IR73
  API.patch('accord_meetings?meeting_id=eq.' + _meeting.meeting_id
    + '&state=eq.running',
    { state: 'closed', ended_at: new Date().toISOString() }
  ).then(function() {
    // 3. Update local state
    if (window.Accord && window.Accord.state && window.Accord.state.meeting) {
      window.Accord.state.meeting.state = 'closed';
    }
    // 4. Dispatch accord:level-changed to trigger re-render
    // accord-transitions.js will route to closed meeting view
    window.dispatchEvent(new CustomEvent('accord:level-changed', {
      detail: window.Accord && window.Accord.state && window.Accord.state.levelContext
        ? window.Accord.state.levelContext
        : {}
    }));
  }).catch(function(err) {
    console.error('[AccordLiveCapture] _endMeeting PATCH failed', err);
    if (btn) { btn.disabled = false; btn.textContent = 'END MEETING'; }
  });
}
```

**IR47:** Confirm `API.patch()` signature matches existing usage in `accord-core.js`
before writing. Surface finding in delivery.

**IR73:** WHERE clause must include `AND state=eq.running` to satisfy disjoint
per-transition RLS on `accord_meetings`.

**IR71:** Do not update local state before PATCH confirms. Button disabled
optimistically (prevents double-fire) but state update only fires in `.then()`.

### 4.3 — Post-close routing

After `accord:level-changed` dispatches, `accord-views.js:renderMeetingView()`
will re-enter and branch on `meeting.state = 'closed'` — routing to the existing
5-tab closed shell (Minutes tab).

Confirm this routing is correct by reading `accord-views.js` around line 394.
If the closed state routes somewhere unexpected, surface as a finding and halt.

The Live Capture shell's `destroy()` will be called automatically via the
`accord:level-changed` handler wired in Phase 3. Confirm this fires correctly —
the filmstrip hide style tag (`ac-lc-filmstrip-hide`) must be removed on destroy.

### 4.4 — Progress bar — final state

When End Meeting is confirmed (before PATCH completes):
- Mark all `in_progress` and `pending` agenda items as visually complete
  in the progress bar (all segments filled)
- This is visual only — do not PATCH agenda item statuses

### 4.5 — Status bar (workstream timeline)

The `ac-live-filmstrip` element is currently hidden by the injected style tag.
This phase populates it with real data and removes the hide rule.

**Load prior meetings:**
```javascript
// SELECT meeting_id, title, scheduled_for, state,
//        (SELECT COUNT(*) FROM accord_nodes WHERE meeting_id = m.meeting_id
//         AND tag = 'decision') as decision_count,
//        (SELECT COUNT(*) FROM accord_nodes WHERE meeting_id = m.meeting_id
//         AND tag = 'action') as action_count
// FROM accord_meetings m
// WHERE workstream_id = [current workstream_id]
//   AND state IN ('closed', 'sealed')
// ORDER BY scheduled_for DESC
// LIMIT 8
```

**Chip rendering:**
```
[May 17 · C-11 Smoke Test]   [Apr 30 · Action Review]   ...
```
- Each chip: `font-size: 11px`, `padding: 3px 10px`,
  `border-radius: 100px`, `background: var(--raised)`,
  `border: 1px solid var(--b0)`, `color: var(--md)`
- Current meeting chip: `border-color: var(--dec-bd)`,
  `color: var(--dec)`, `background: var(--dec-bg)`
- Decision count badge on chip when `decision_count > 0`:
  purple `var(--dcn)` pill
- Action count badge when `action_count > 0`:
  amber `var(--act)` pill

**After populating:** remove the `ac-lc-filmstrip-hide` style tag from
`document.head` so the bar becomes visible. If the meeting is still running,
the current meeting chip is highlighted. The bar is read-only this phase —
click behavior deferred to Phase 7 / CMD-ACCORD-MEETING-SETUP-1.

**Timing:** load status bar data after the shell renders, non-blocking.
Do not delay shell mount waiting for status bar data.

---

## §5 — IRON RULE REMINDERS

**IR47:**
1. Confirm `API.patch()` signature before use — surface finding.
2. Confirm `accord_meetings` state transition RLS allows `running → closed`
   PATCH from the client. If RLS blocks, a SECURITY DEFINER helper may be needed.
   Run:
   ```sql
   SELECT policyname, cmd, qual FROM pg_policies
   WHERE tablename = 'accord_meetings';
   ```
   Surface finding explicitly.

**IR71:** Meeting state update only in `.then()` — never before PATCH confirms.

**IR72:** `accord:level-changed` dispatch after close is the critical handoff
event. Confirm it reaches `accord-transitions.js` and triggers correct routing.

**IR73:** `PATCH accord_meetings WHERE meeting_id=eq.[id] AND state=eq.running`
— disjoint guard mandatory.

**`var` only** — no `let`/`const`.

---

## §6 — FILE ORDER

1. `accord-live-capture.js` — full file with End Meeting flow + status bar

Then: operator review note.
Then: §7 checklist verbatim. Stop.

---

## §7 — PHASE 6 CHECKLIST

- [ ] IR47: `API.patch()` signature confirmed and surfaced
- [ ] IR47: `accord_meetings` RLS policies confirmed for `running → closed`
- [ ] END MEETING button enabled (not disabled, not faded)
- [ ] Clicking END MEETING opens confirmation modal
- [ ] Cancel closes modal with no state change
- [ ] Confirm fires `_endMeeting()`
- [ ] Button disabled immediately on confirm (prevents double-fire)
- [ ] PATCH includes `AND state=eq.running` WHERE guard (IR73)
- [ ] Local state updated only in `.then()` (IR71)
- [ ] `accord:level-changed` dispatched after PATCH confirms
- [ ] Post-close routing verified — closed meeting view renders correctly
- [ ] `destroy()` fires on level-changed — filmstrip hide style tag removed
- [ ] Progress bar shows all segments filled on confirm (visual only)
- [ ] Status bar loaded with prior workstream meetings (non-blocking)
- [ ] Current meeting chip highlighted in status bar
- [ ] Decision/action count badges on chips where counts > 0
- [ ] `ac-lc-filmstrip-hide` style tag removed after bar populates
- [ ] Status bar chip click deferred (no handler this phase)
- [ ] PATCH failure: button re-enables, error logged
- [ ] `var` only — no `let`/`const` in new code

---

**Ship it.**
