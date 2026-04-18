# Aegis · ProjectHUD Operations Command Surface
## Session Handoff — 2026-04-17 (full evening through late night)

**Milestone:** Dual-session scripted orchestration is working end-to-end.
`dual_session_test` has run to completion 3× successfully. This handoff
captures the journey from CMD45 (broken) to CMD53 (working) and the
architectural direction for the next session.

---

## Platform

| Key | Value |
|-----|-------|
| Stack | Supabase + Vercel |
| Domain | `projecthud.com` |
| Supabase URL | `https://dvbetgdzksatcgdfftbs.supabase.co` |
| Firm ID | `aaaaaaaa-0001-0001-0001-000000000001` |
| VS user_id | `57b93738-6a2a-4098-ba12-bfffd1f7dd07` |
| VS resource_id | `e1000001-0000-0000-0000-000000000001` |
| AK user_id | `0db33955-f6a0-49ae-ad4b-c5cdfacf34c8` |
| AK resource_id | `c40b70c7-71db-4238-82d1-0701e11ebe47` |

---

## Deliverables — Current State (CMD53, working)

| File | Version | Node | Status |
|------|---------|------|--------|
| `cmd-center.js` | v20260416-CMD53 | ✓ PASS | **DEPLOYED** |
| `aegis.html` | UI refresh (CMD53 cache-bust) | — | **DEPLOYED** |
| `sidebar.js` | cache-bust CMD53 | ✓ PASS | **DEPLOYED** |
| `compass.html` | cache-bust CMD53 | — | **DEPLOYED** |
| `dual_session_test.txt` | v1.1 | n/a | **DEPLOYED** |

Deploy paths:
- `cmd-center.js` → `/js/cmd-center.js`
- `sidebar.js` → `/js/sidebar.js`
- `aegis.html` → `/aegis.html`
- `compass.html` → `/compass.html`
- `dual_session_test.txt` → `/scripts/dual_session_test.txt`

---

## Fix Timeline: CMD45 → CMD53

Each of these was discovered sequentially while trying to get
`dual_session_test` to run end-to-end. Every one was a real bug with a
non-obvious root cause.

### CMD47 — Self-echo filter (critical)

**Symptom:** Every command dispatched to VS timed out after 30s. AK's acks
arrived fine. Looked like a VS-specific problem; was actually an
Aegis-specific problem.

**Root cause:** The realtime channel was created with `broadcast: { self: true }`.
The result handler had `if (d.from === _mySession.userId) return;` to skip
self-echoes. But Aegis and VS are the **same human in the same browser with
the same auth** — `_mySession.userId` on both tabs is Vaughn's auth uid. So
when VS's Compass tab acked a cmd, Aegis saw `d.from === _mySession.userId`
and discarded the ack as its own echo. AK worked because she has a different
auth uid.

**Fix:** Exempt Aegis from the self-echo skip. Aegis never executes commands
(guarded at the cmd handler), so any `result` arriving at Aegis is from a
different tab by definition, regardless of userId.

### CMD48 — UI refresh

Cosmetic changes to Aegis shell: larger logo, stacked "COMMAND SYSTEM" in
gold (#F5D033), removed redundant M1 module-header row, aqua left-nav icons,
aqua SESSIONS/SCRIPTS headers, white script names, white tab labels, beige
`#`-prefixed transcript lines (#E8DCC4), swapped RUN/STOP button positions,
white button text with subtle red hover on DELETE, removed pop-out buttons.

Yellow palette var added: `--yl:#F5D033`.
Beige not palette-var'd; used as literal `#E8DCC4` in `_appendLine`.

### CMD49 — `_wirePanel` null-dereference

**Symptom:** After deploying CMD48, clicking scripts in the sidebar did
nothing. Clicking tabs did nothing.

**Root cause:** I removed `#phr-pop-dot` from Aegis's tab bar in CMD48 but
`_wirePanel()` still did `p.querySelector('#phr-pop-dot').onclick = ...`.
`null.onclick = ...` threw, aborting `_wirePanel()` before it could wire up
tab switching or script-list clicks.

**Fix:** Guard all three top-right dots (close/min/pop) with `if (el)` null
checks in `_wirePanel()`. Anytime Aegis removes a UI element that
`cmd-center.js` references, the JS needs a null guard — `cmd-center.js`
serves both Aegis and the floating Compass panel.

### CMD50 — Pause elapsed-time display

**Feature:** Pause now captures start time and reports elapsed on resume:
```
⏸  Both sessions navigating to Compass — press Enter when both show LIVE
▶ resumed after 22.6s
```
Useful for tuning fixed `Wait` durations after measuring real-world timing.

### CMD51 — Form overlay check (critical)

**Symptom:** After `Form Open` succeeded, the next `Form Insert` immediately
aborted with "Form closed — script aborted at:".

**Root cause:** The form-command guard checked
`document.getElementById('myr-html-form-overlay')` on the local DOM. Works
fine on Compass where the overlay is in-DOM. But Aegis is the dispatcher,
not the executor — the overlay lives on VS's Compass tab, never on Aegis.
Every Form command after Form Open aborted because Aegis looked at its own
DOM, found no overlay, declared the form closed. Pre-existed; surfaced now
because execution moved from in-page CMD panel to a separate Aegis tab.

**Fix:** Exempt Aegis from the local overlay check
(`if (!window._aegisMode && parsed.verb.startsWith('Form ') ...)`).

### CMD52 — `$instance_id` propagation + work-queue auto-refresh

**Two fixes bundled:**

**(a) Remote `$instance_id` propagation.** Form Submit returned
`'submitted · instance 5a497ab3'` (truncated id, 8 chars). The dispatch loop
captured nothing into Aegis's `_storeVars`. Subsequent `Log
"Package live · $instance_id"` showed the literal `$instance_id`. Changed
Form Submit to return the full UUID in the ack; dispatch loop now parses
`'submitted · instance <uuid>'` and stashes into `_storeVars['instance_id']`.

**(b) Work-queue auto-refresh after self-route.** When Vaughn submits a form
that routes step-2 back to himself, the server creates the instance and
routes correctly (console confirms), but Vaughn's MY WORK tab doesn't
re-render — the router doesn't trigger a re-query. The `_mwResolveAndRoute`
intercept now detects when the local user IS the new assignee and calls
`window._mwLoadUserView()` after the 1.5-second notes-patch delay. Guarded
so it only fires in the exact self-route case.

### CMD53 — Variable substitution bugs (duplication + overwrite)

**Symptom:** `Log "Package live · $instance_id"` output
`Package live · Package live · $instance_id`.

**Root cause 1:** The substitution regex had
`return _storeVars[k] || a;` where `a` is the entire argument string. When
`_storeVars[k]` was falsy, it replaced `$instance_id` with the whole
sentence. Changed to return the literal `$name` token on miss.

**Root cause 2:** `Get Latest instance_id` unconditionally overwrote
`_storeVars['instance_id'] = window._lastSubmittedInstanceId || null`. On
Aegis, `window._lastSubmittedInstanceId` is undefined (form was submitted
on VS), so the already-captured remote value was clobbered with null.
Changed to prefer the window global, then fall back to existing
`_storeVars` value, and only write when we have a real id.

---

## Architectural Reference — POST/ACK Model

The operator (Vaughn, in a late-night conversation) asked "why can't the
system automatically pause & wait for an ack/nack instead of waiting for my
<CR>?" — and named the mental model as POST/GET. It's worth recording the
answer because it's foundational.

**The engine already does POST/ACK ("dispatch + ack"):**

1. Aegis broadcasts `{event: 'cmd', target: VS_userId, cmd: '...'}` over
   the Supabase realtime channel.
2. Aegis calls `await _waitForEvent('result:' + VS_userId, 30000)` —
   script execution halts until ack or 30s timeout.
3. VS's cmd handler runs `_executeCommand(cmd)`, then broadcasts
   `{event: 'result', from: VS_userId, result: <returnValue>}`.
4. Aegis's result handler resolves the pending promise. Script advances.

**Where the model succeeds:** Synchronous DOM ops — clicking, tab
switching, form field inserts. These complete when they complete; VS acks
when done.

**Where the model breaks down** (and why `Pause` lines are necessary today):

1. **Async work past the ack boundary.** `Set View "compass"` fires
   `window.location.href = '/compass.html'` and returns instantly. VS acks
   "navigating" before the new page is usable. Ack means "I started," not
   "destination is ready."

2. **Downstream effects.** `Form Submit` acks when the click lands. But
   the instance creation, routing logic, and work-queue re-render all
   happen server-side over the next 1-2 seconds.

3. **Cross-session effects.** `VS: Click "Approve"` routes to AK. VS acks
   instantly. But the observable effect — "item appeared in AK's queue" —
   is on AK's side.

**The fix isn't to "wait for better acks."** The acks are correct (the
command completed). The fix is to emit *additional* events that represent
the downstream state changes, and build `Wait ForEvent` commands that block
until those events fire.

---

## Work Remaining

### P0 — Event-driven Wait commands (next session's main work)

Replace most `Pause` lines with auto-continuing waits. Three event families
to wire:

**Location-ready events.** When Compass finishes loading (after
`_mwLoadUserView` returns), broadcast `location_ready: {userId, location}`.
Add `Wait ForLocation VS "compass"` script command that blocks until the
matching event arrives. This alone kills the 20+ second Compass-load Pause.

**Form lifecycle events.** Form Submit already internally waits for
`window._lastSubmittedInstanceId`. Have it broadcast
`form_submitted: {userId, instance_id, form_name}` on top of returning the
id. Add `Wait ForInstance $instance_id` to block until VS's queue contains
the new item. Add `Wait ForRoute $instance_id to AK` that listens for the
`_mwResolveAndRoute` intercept firing with matching params.

**Each addition is ~15 lines of broadcast + ~20 lines of Wait command.**
After implementation, the script reads:

```
VS: Set View "compass"
AK: Set View "compass"
Wait ForLocation VS "compass"
Wait ForLocation AK "compass"
# no more Pause here — fully automatic
```

Keep 1-2 strategic Pauses as human-verification checkpoints ("is this the
right form?"). Category 3 Pauses — where only a human can judge
correctness, not just presence — should remain.

### P1 — Latent `Set View` navigation-vs-ack race

Not causing observable failures right now, but still a race: VS does
`window.location.href = h` then the promise microtask queues the ack. If
the page tears down before the microtask flushes, ack is lost. Fix when
convenient:
```js
'Set View': async function(args){
  ...
  setTimeout(function(){ window.location.href = h; }, 150);
  return 'navigating to '+h;
}
```

### P2 — Unified script version management

`dual_session_test.txt` had a bad round where v1.0 and v1.1 got
concatenated in the editor (85 commands logged instead of 41). Root cause:
editor clicks replace content correctly, but manual paste-on-top doesn't.
Consider: (a) show a "dirty" marker in editor if content differs from
loaded script, (b) confirm before running if dirty, (c) auto-save server-
side changes back to `/scripts/` (currently only localStorage persists).

### P3 — Supabase self-host (carried from earlier handoff)

Deploy `/js/supabase.js` to eliminate Edge Tracking Prevention errors
that affected Angela's sessions. Unchanged from 2026-04-17 evening handoff.

### P4 — M4 Intelligence / P5 — Apr 15 carry-forward

Unchanged from prior handoffs. Not blocked by any CMD work.

---

## Iron Rules (carry-forward — do not violate)

Rules 1-14 unchanged from 2026-04-17 evening handoff. Adding:

**Rule 15.** `broadcast: { self: true }` + `d.from === _mySession.userId`
self-echo skips are fragile when one human runs multiple tabs under the
same auth. Any node that filters incoming broadcasts by userId-equality
must ask: *does this node itself emit this event type?* If no, the
self-skip is both unnecessary and actively harmful. (See CMD47.)

**Rule 16.** Anytime `aegis.html` removes a UI element that
`cmd-center.js` references, the corresponding `p.querySelector(...)`
in `cmd-center.js` needs an `if (el)` null guard. `cmd-center.js` serves
both Aegis and the floating Compass panel; an element absent on one but
present on the other must not cause `null.onclick = ...` to throw.
(See CMD49.)

**Rule 17.** Any DOM presence check in `_runScript` that looks at local
window state (`document.getElementById(...)`, `window._someFlag`) must be
guarded `!window._aegisMode`. Aegis is never the executor — the relevant
DOM lives on the target session. A local DOM check on Aegis is always
wrong and will always false-abort. (See CMD51.)

**Rule 18.** `Get Latest <var>` style commands must not overwrite
`_storeVars` with null. Prefer: local window global → existing
`_storeVars` value → null (return only, don't write). Values captured
from remote acks live in `_storeVars` before these commands run and
must be preserved. (See CMD53.)

**Rule 19.** Variable substitution on `$varname` misses must fall back
to the literal `$varname` token, not to the entire argument string.
Previous behavior caused duplication (`Log "Package live · $id"` →
`Package live · Package live · $id`). (See CMD53.)

---

## Architecture (unchanged; reference)

### aegis.html
- Loads `/js/cmd-center.js?v=20260416-CMD53` externally
- Sets `window._aegisMode = true` in UI script BEFORE the engine loads
- M1 Command, M2 Mission Control, M3 Forge UI intact
- M4 Intelligence, M5 Audit are stub overlays
- Command module header row (`Aegis · M1 / Command`) removed in CMD48;
  required element IDs (`phr-running-label`, `phr-status`, etc.) preserved
  in a hidden ghost div so `cmd-center.js` queries don't throw

### cmd-center.js (CMD53) — Dual-mode engine
Runs on every ProjectHUD page via `sidebar.js` injection, plus `aegis.html`
directly.

**On Aegis** (`window._aegisMode = true`):
- `_buildPanel()` wires to `#aegis-cmd-panel`
- `_channel.track()` sends `aegisObserver: true`
- Cmd broadcast handler returns immediately — Aegis dispatches, never executes
- Location heartbeat suppressed
- Result handler accepts own-userId acks (Rule 15)
- Form-overlay pre-check skipped (Rule 17)
- Dispatch loop captures Form Submit UUID into `_storeVars` (CMD52)

**On Compass/Dashboard** (`window._aegisMode` absent):
- Floating `#cmd-center-panel` div created; Ctrl+Shift+` toggles
- Full execution host
- Location heartbeat active
- `_mwResolveAndRoute` intercept auto-refreshes MY WORK on self-route (CMD52)

### sidebar.js
- Loads `cmd-center.js?v=v20260416-CMD53` on every page via `_loadCmdCenter()`
- Guards: skips if `window._cmdCenterLoaded` or `window._aegisMode`

### Cache-bust inventory (bump all three on every version change)

| File | Line | Pattern |
|------|------|---------|
| `sidebar.js` | 284 | `s.src = '/js/cmd-center.js?v=v20260416-CMDnn';` |
| `compass.html` | 1082 | `<script src="/js/cmd-center.js?v=v20260416-CMDnn"></script>` |
| `aegis.html` | 1307 | `<script src="/js/cmd-center.js?v=20260416-CMDnn"></script>` (single `v` prefix here) |

Pre-deploy:
```bash
node --check cmd-center.js
node --check sidebar.js
grep -c "if (window._cmdCenterLoaded) return" cmd-center.js   # must be 1
grep -c "rgba(255,255,255,\|#4e5a68\|#8a95a3\|#6d7888" cmd-center.js aegis.html  # must be 0
grep "CMD[0-9]" cmd-center.js sidebar.js compass.html aegis.html  # must all match target version
```

---

## Debug Helpers (available in any browser console)

```js
window._aegisSessions()                                  // List all known sessions
window._sendToSession('VS', 'Set View "compass"')        // Send a command
window._sendToSession('AK', 'Set Tab "MY WORK"')
```

---

## Console Diagnostics (expected on load after CMD53 deploy)

### Aegis
```
AEGIS v20260416-AE1
M1 Command · M2 Mission Control · M3 Forge
CMD Center v20260416-CMD53
cmd-center      v20260416-CMD53
[Aegis] auth session: 57b93738...
[Aegis] resource row by user_id: 1 Vaughn
[Aegis] identity resolved: Vaughn Staples
[CMD Center] initialized — Ctrl+Shift+` to toggle panel
[CMD Center] loaded N script(s) from /scripts/
[Aegis] presence sync — N exec session(s): ...
```

### Compass (Vaughn or Angela)
```
CMD Center v20260416-CMD53
[Compass] Identity: <Name> | email: ... | resource_id: ...
[CMD Center] initialized — Ctrl+Shift+` to toggle panel
[Aegis] presence sync — N exec session(s): ...
```

---

## File Version Reference

| File | Version | Node |
|------|---------|------|
| `cmd-center.js` | v20260416-CMD53 | ✓ |
| `aegis.html` | UI refresh (cache-bust CMD53) | — |
| `sidebar.js` | no version (cache-bust CMD53) | ✓ |
| `compass.html` | cache-bust CMD53 | — |
| `dual_session_test.txt` | v1.1 | n/a |

*Prior handoff: `aegis-handoff-2026-04-17-late.md`*
*This handoff supersedes all earlier 2026-04-17 handoffs.*
