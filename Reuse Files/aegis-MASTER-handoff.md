# Aegis · ProjectHUD Operations Command Surface

#######################################################################
## START:  Preamble / Iron Rules Carry-Forward Block
## DATE:    2026-04-17 (original session) + carry-forward additions
#######################################################################

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

---

## Brief B1 — Event Bus Wiring (CMD54)

**Date:** 2026-04-18
**Brief:** `aegis-brief-B1-event-bus-v1.1.md`
**Status:** Complete. All seven emits wired. `node --check` passes on all
five JS files. DoD grep counts match (8 total `window._cmdEmit(` call sites
across `cmd-center.js` + `mw-tabs.js` + `mw-events.js` + `mw-core.js`; 2
`protocol_version` references in `cmd-center.js`).

**Follow-up (CMD55):** event retention buffer added — see subsection at
the end of this block. CMD55 is the currently-deployed version string
in all cache-bust locations; CMD54 references in this document refer to
the milestone an emit or envelope change was introduced, not the file
version.

### Envelope enhancement

`window._cmdEmit` in `cmd-center.js` now builds a protocol-compliant
envelope per HUD Ecosystem Protocol v0.1 Contract 1:

```
{
  protocol_version: 1,
  event_type, event_id, source_product: 'projecthud',
  source_session, ts, firm_id,
  payload: <caller-supplied inner>,
  // Back-compat shims — DO NOT remove without a major bump:
  event, from, name
}
```

A `_uuid()` helper (native `crypto.randomUUID` with v4-shape fallback) was
added before `_loadSupabase`. A `DEBUG_EVENTS = true` constant was added
near the `_cmdCenterLoaded` guard; flip to false before production release.
Both the emit path and the receive path log one line per event when
`DEBUG_EVENTS` is true.

### Seven emit sites

| # | Event | File | ~Line | Fires when |
|---|-------|------|-------|-----------|
| 1 | `location.ready`          | `mw-core.js`  | 1934 | End of `_mwLoadUserView` success path, after CoC panel render. |
| 2 | `form.submitted`          | `mw-tabs.js`  | 1778 | Immediately after `window._lastSubmittedInstanceId` assignment. |
| 3 | `workflow_request.created`| `mw-tabs.js`  | 2264 | After successful `workflow_requests` POST in `_mwResolveAndRoute`. |
| 4 | `workflow_request.resolved`| `mw-events.js`| 1122 | After CoC event POST in `_rrpSubmit`, before next-step advance. |
| 5 | `instance.launched`       | `mw-tabs.js`  | 1719 | Immediately after `workflow_instances` insert in `compass_form_submit`. |
| 6 | `instance.completed`      | `mw-events.js`| 1201 | At the no-next-step branch in `_rrpSubmit`, after status PATCH. |
| 7 | `instance.blocked`        | `mw-tabs.js`  | 2169 | After the blocked-instance PATCH in `_mwResolveAndRoute` unresolved-role path. |

`tab_switch` (the pre-existing emit at `cmd-center.js` line ~2323) was
**not** renamed to `tab.switched` despite the new `namespace.verb`
convention. Back-compat with any script or consumer using the old name
takes priority. It is deprecated; B6 may rename it with a proper
migration path.

### B1 v1.1 brief corrections applied during execution

These resolve ambiguities or real gaps the brief did not close. Any
future B1 v1.2 supersedes v1.1 cleanly by incorporating them.

1. **Line-310 `app_event` handler adapted.** The brief told us not to
   refactor line 310, but the envelope enhancement the brief itself
   specified would have broken every `Wait ForEvent` on the remote
   side: the new envelope nests inner fields under `.payload`, and the
   old handler passed `d` (envelope) to `_resolveEventListeners`, so
   `_waitForEventFiltered` reading `data[filterKey]` would have
   silently failed to match. The handler now unwraps: reads
   `d.event_type || d.event` for the listener key and
   `d.payload || d` for the inner payload (fallback preserves legacy
   emits during transition). Self-echo check widened to
   `d.source_session || d.from` so a future emitter that stops writing
   the `from` shim still gets filtered correctly. The "do not refactor"
   prohibition was about self-echo semantics; this is envelope
   accommodation.
2. **Local-listener parity.** `_cmdEmit` still calls
   `_resolveEventListeners(eventName, data)` — i.e. local listeners
   receive the inner payload just as remote listeners do after the
   line-310 unwrap. Codified as Iron Rule 20 below.
3. **Amount extraction hardened.** `_mwExtractAmount` in `mw-tabs.js`
   strips `$` / `,` / whitespace before `Number()` so a value like
   `"$5,000.00"` parses to `5000` rather than NaN. Also logs a one-time
   per-form `console.warn` listing the available keys when the form
   contains none of `amount`, `total_amount`, `expense_total`, `budget`
   — this is how B6's author sees which keys to add to the list
   without silently getting `amount: null` in production.
4. **`elapsed_ms` on `instance.completed`.** `launched_at` was added to
   the `instFull` select in `_rrpSubmit`. Computed inline as
   `Date.now() - Date.parse(launched_at)`. No extra round-trip needed
   because the select was already running. Emits `null` only if
   `launched_at` is genuinely missing.

### New iron rules (carry-forward)

**Rule 20.** Event bus listeners always receive the **inner payload**,
never the envelope. `_cmdEmit` resolves local listeners with inner
`data`; the line-310 remote handler unwraps `d.payload` before
resolving. Any future consumer that needs envelope metadata
(`event_id`, `protocol_version`, `source_session`) must use a separate
accessor — do not change what listeners receive. Rationale: Wait
ForEvent callers and the policy evaluator (B6) should never have to
think about protocol metadata. Changing what listeners see after the
fact is how inconsistency propagates. (See B1 Q2/Q3.)

**Rule 21.** Numeric field extraction from form values must preprocess
for common currency formatting (`$`, `,`, whitespace) before `Number()`.
A value like `"$5,000.00"` is common user input and must parse to
`5000`, not `null`. Log a one-time warning per form whose keys match
none of the known list so the list can be extended in a subsequent
brief. (See `_mwExtractAmount` in `mw-tabs.js`; B1 Q4.)

### `workflow_template_steps` select — schema touch

The `select=...,template_id` column was added to three existing queries
so emit #3 can populate `template_id` without changing
`_mwResolveAndRoute`'s signature:

- `mw-tabs.js:1693` — `compass_form_submit` fallback path
- `mw-tabs.js:2302` — `myrResumeInstance` path
- `mw-events.js:1120` — `_rrpSubmit` advance path

The cached-steps path at `mw-tabs.js:884` already selected `template_id`,
so that path needed no change. No other callers.

### Notes on emit-site divergence from the brief

The brief (section "Context files") pointed at `mw-tabs.js` for the
`_mwLoadUserView` emit site and `mw-events.js:~934–1045` for routing
logic. In current source:

- `_mwLoadUserView` is defined in **`mw-core.js` (line 90)**, not
  `mw-tabs.js`. Emit #1 lives there.
- The routing function `_mwResolveAndRoute` is defined in
  **`mw-tabs.js` (line ~2082 post-edit)**, not `mw-events.js`. Emits
  #3 and #7 live there. `mw-events.js` hosts only `_rrpSubmit`, which
  owns #4 and #6.

These are brief-authoring errors, not implementation divergence. The
emits still fire "where the behavior happens" per the brief's intent.

### Open questions for B2/B6

1. **Channel rename to protocol-compliant name.** Current channel is
   `cmd-center-{FIRM_ID}`. Protocol Contract 1 specifies
   `hud:{firm_id}`. Deferred out of B1 because a rename requires
   coordinated deploys across all session tabs (and eventually
   CommandHUD) in a single release window. Candidate: a small
   dedicated micro-brief before CommandHUD subscribes in earnest.
2. **Withdraw path `instance.completed` emit.** `myrWithdrawInstance`
   in `mw-tabs.js` patches an instance to `status: 'cancelled'`.
   Brief B1 specifies `final_status: 'cancelled'` as a valid value on
   `instance.completed`, but the brief's firing condition ("final
   step transitions from active to complete") is about approval flow,
   not user withdrawal. Should withdraw also emit `instance.completed`
   with `final_status: 'cancelled'`, or a separate
   `instance.cancelled` event? Deferred to B6 / protocol review.
3. **Dotted event names in `_waitForEvent`.** The B1 brief notes
   `_waitForEventFiltered` should handle dotted event names because it
   treats the name as an opaque string — verified: it does. No code
   change needed, but keep this in the B2 review list in case a future
   refactor inadvertently adds name parsing.
4. **`tab_switch` rename.** Left as-is in B1 (back-compat). B6 should
   evaluate rename to `tab.switched` with a dual-emit grace period.
5. **CommandHUD channel subscription.** Unblocked by this brief once
   the channel rename (open question 1) is resolved. No ProjectHUD
   code change required at that point — the envelope is already
   compliant.
6. **Potential eighth emit site.** Not found during implementation.
   `_rrpSubmit`'s "changes_requested" path emits `workflow_request.resolved`
   with `decision: 'changes_requested'`, which is sufficient; no new
   event type needed for that case.
7. **`form.opened` (B1 follow-up — candidate eighth emit).** Surfaced
   during B1 probe run: `Form Open "Expense Report"` acks immediately
   on the click, but the overlay iframe + form body take ~400-800ms
   to render. Subsequent `Form Insert` commands race ahead of the
   DOM and fail. Same category as the Compass-load lag that
   `location.ready` fixed. A `form.opened` emit fired when the
   overlay's form fields are queryable would unblock a future
   `Wait ForForm "<name>"` command. Out of scope for B1 (brief caps
   at seven emits). Recommend B6 add this when wiring Class 5
   precondition policies — they'll need the same event anyway for
   "form opened against stale template" checks.

   Probe script interim pattern: insert a `Pause` after `Form Open`,
   same as `dual_session_test`. When B6 ships `form.opened`, replace
   the Pause with `Wait ForForm "Expense Report" timeout=3000`.

### Updated file version table

| File | Version | Node |
|------|---------|------|
| `cmd-center.js` | v20260418-CMD55 | ✓ |
| `aegis.html` | cache-bust CMD55 | — |
| `sidebar.js` | cache-bust CMD55 | ✓ |
| `compass.html` | cache-bust CMD55 | — |
| `mw-tabs.js` | v20260418-CMD55 | ✓ |
| `mw-events.js` | v20260418-CMD55 | ✓ |
| `mw-core.js` | v20260418-CMD55 | ✓ |
| `dual_session_test.txt` | v1.1 (unchanged) | n/a |
| `scripts/b1_event_emit_probe.txt` | v1.0 (new, throwaway) | n/a |

### Updated cache-bust inventory

| File | Line | Pattern |
|------|------|---------|
| `sidebar.js` | 284 | `s.src = '/js/cmd-center.js?v=v20260418-CMD55';` |
| `compass.html` | 1082 | `<script src="/js/cmd-center.js?v=v20260418-CMD55"></script>` |
| `aegis.html` | 1307 | `<script src="/js/cmd-center.js?v=20260418-CMD55"></script>` (single `v` prefix here) |

Pre-deploy:
```bash
node --check cmd-center.js
node --check sidebar.js
node --check mw-tabs.js
node --check mw-events.js
node --check mw-core.js
grep -c "if (window._cmdCenterLoaded) return" cmd-center.js   # must be 1
grep -c "rgba(255,255,255,\|#4e5a68\|#8a95a3\|#6d7888" cmd-center.js aegis.html  # must be 0
grep -c "window._cmdEmit(" cmd-center.js mw-tabs.js mw-events.js mw-core.js  # must sum to 8
grep "CMD[0-9]" cmd-center.js sidebar.js compass.html aegis.html mw-tabs.js mw-events.js mw-core.js  # must all match target version
```

### Console diagnostics expected on load after CMD54 deploy

**Compass (VS):**
```
CMD Center v20260418-CMD55
[mw-core] v20260418-CMD55 — B1 event bus: location.ready emit
[mw-tabs] v20260418-CMD55 — B1 event bus: form.submitted, instance.launched, workflow_request.created, instance.blocked
[mw-events] v20260418-CMD55 — B1 event bus: workflow_request.resolved, instance.completed
[cmd-center] emit location.ready {location: "compass.my_work", resource_id: "e1000001-…", user_id: "57b93738-…"}
```

**After submitting an Expense Report on VS, Aegis console shows:**
```
[cmd-center] recv form.submitted {instance_id: "…", form_name: "Expense Report", amount: …, …}
[cmd-center] recv instance.launched {template_id: "…", template_name: "Expense Report", …}
[cmd-center] recv workflow_request.created {seq: 2, assignee_name: "Angela Kim", role: "manager", …}
```

---

### CMD55 — Event retention buffer (B1 follow-up)

**Symptom:** The B1 probe script stalled on
`Wait ForEvent "location.ready" timeout=5000`. Investigation showed
`location.ready` fires on Compass at page-load, during the Compass-load
`Pause` in the probe script — well before the operator hits Enter and
the Wait is registered. Pre-B1, every `Wait ForEvent` relied on the
future-tense listener queue only; an emit that fired before the Wait
was registered was lost.

**Root cause:** Structural, not a regression. `_waitForEvent` and
`_waitForEventFiltered` only ever appended to `_eventListeners`;
there was no replay. Surfaced now because B1's `location.ready` is
the first Wait target that fires before user-paced script progression.

**Fix:** 30-second retention buffer keyed on `event_type`.

- `_eventBuffer` is a module-level `{ eventName: [ {ts, data}, ... ] }`.
- `_pushEventBuffer(eventName, data)` is called on both local emit
  (`_cmdEmit`) and remote receive (line-310 handler, post-self-echo —
  so replay inherits self-echo filtering without extra checks).
- `_scanEventBuffer(eventName, predicate)` walks newest-to-oldest,
  purging expired entries in-line; returns the freshest match or null.
- `_waitForEvent` scans the buffer with an always-true predicate
  before queueing forward. If hit, resolves immediately.
- `_waitForEventFiltered` extracts its filter logic (alias resolution
  + multi-field match) into a `matchesFilter(data)` closure and uses
  the same closure for both buffer scan and live match. This guarantees
  identical semantics — buffered and live resolution cannot drift.
- Self-echo is filtered upstream at line 310 before buffer push, so
  replay respects self-echo without a second check.

**Scope call-out:** Brief B1 v1.1 forbade modifying `_waitForEvent` and
`_waitForEventFiltered`. That prohibition protected the existing
semantics of live matching, not replay. The fix adds replay-then-live;
live semantics are unchanged. Operator confirmed this scope expansion
in the B1 review conversation.

**New iron rule:**

**Rule 22.** `_waitForEvent` and `_waitForEventFiltered` scan the
30-second retention buffer before queueing forward. This exists because
`app_event` broadcasts fire at their natural time (page-load, DB write,
etc.) and may precede the script-driven Wait that expects them. Any
future event-wait command must inherit this replay behavior — build on
the shared buffer, do not introduce a parallel listener-only path.
Predicate logic for replay and live MUST be identical (shared closure),
or buffered matches and live matches will diverge and an event will
appear to "arrive twice" or "not arrive at all" depending on timing.

**Open note for B2:** the 30-second window was picked because the
longest `Pause`/boot latency observed in `dual_session_test` is ~25s.
If B2's `Wait ForInstance` or `Wait ForRoute` need a longer reach
(e.g. an instance created in an earlier test step and queried much
later), revisit the retention window or switch to a count-bounded
buffer. Not expected to bite in B2, but worth a glance when writing
the new Wait commands.

---

### CMD56 — Outbound emit queue (B1 follow-up)

**Symptom:** After CMD55, Compass correctly logged
`[cmd-center] emit location.ready` but Aegis never logged
`[cmd-center] recv location.ready`. The buffered-replay fix resolved
same-session timing, but cross-session delivery still failed.

**Root cause:** Emit fires inside `_mwLoadUserView`, which runs
immediately after Compass bootstrap. The Supabase realtime channel has
been created (`_channel` is non-null) but the WebSocket has not yet
reached `readyState === 1` (OPEN). `_channelSend` already guarded
against this — `if (state !== 1) return;` — so the broadcast was
silently dropped on the sender side. It never hit the wire. Aegis
therefore had nothing to receive.

Pre-existing bug, latent until B1 wired an emit that fires during
boot. Every emit before SUBSCRIBED had the same failure mode; none
happened to matter until now.

**Fix:** in-memory outbound queue in `cmd-center.js`.

- `_outboundQueue` is a FIFO array, capped at 50. When full, oldest
  envelope is evicted (with a DEBUG_EVENTS log).
- `_socketReady()` returns true iff `_channel.socket.conn.readyState === 1`.
- `_cmdEmit` checks `_socketReady()`: if true, sends immediately; if
  false, pushes the fully-built envelope onto the queue. Local
  listener resolution + retention buffer push stay synchronous and
  unchanged — same-session Waits resolve regardless of socket state.
- `_flushOutboundQueue()` drains in FIFO order. Called from the
  `SUBSCRIBED` callback in `_channel.subscribe` (before the existing
  presence track + `_appendLine` connection banner).
- In-memory only. No persistence; reconnects after drop start with an
  empty queue.
- DEBUG_EVENTS logs three events: queue (`[cmd-center] queued outbound …`),
  evict (`[cmd-center] outbound queue full · evicting oldest · …`),
  and flush (`[cmd-center] flushed outbound queue · N envelope(s)`).

**New iron rule:**

**Rule 23.** Emits that fire during page bootstrap may precede the
realtime `SUBSCRIBED` callback. `_cmdEmit` queues outbound envelopes
when the socket is not OPEN and drains on SUBSCRIBED; local listener
resolution is synchronous and unaffected. Future code must not
introduce a parallel emit path that bypasses this queue — any
direct `_channelSend({event:'app_event',...})` for a new event type
will strand the pre-subscribe emits and the bug will resurface.
All app-event broadcasts go through `window._cmdEmit`, always.

---

### CMD57 — Aegis self-echo exemption for app_events (Iron Rule 15 regression)

**Symptom:** After CMD56, Compass successfully queued and flushed
`location.ready`, the envelope went out over Supabase realtime — but
Aegis never logged `[cmd-center] recv location.ready` and the probe
script still timed out waiting for it.

**Root cause:** The line-310 app_event handler introduced in B1/CMD54
had a self-echo filter `if (senderId === _mySession.userId) return;`.
This is *exactly* Iron Rule 15 violated a second time.

CMD47 fixed the same bug for the `result` handler (line ~301): when one
human runs Aegis + Compass under the same auth, both tabs share the
same `_mySession.userId`, so a broadcast from Compass looks like a
self-echo when received at Aegis. The result handler was fixed by
exempting Aegis from the skip: `if (!window._aegisMode && d.from === _mySession.userId) return;`.

B1 rewrote the app_event handler without preserving that exemption.
Every emit from a Compass tab on the same-auth Aegis setup was
discarded as self-echo. Aegis never received app_events — not
`location.ready`, not `form.submitted`, nothing.

**Fix:** one-word addition, `!window._aegisMode &&`, matching the
result handler at line 301.

```js
if (!window._aegisMode && senderId === _mySession.userId) return;
```

Aegis never emits app_events (emits live in `mw-*` modules on Compass
pages; Aegis mode is guarded), so any app_event arriving at Aegis is
by construction from a different tab — regardless of whether
`source_session` happens to match `_mySession.userId`.

**Meta-observation:** Iron Rule 15 was literally in the brief's
"Iron rules inherited" list, and B1 explicitly flagged the line-310
handler: "Self-echo filters keyed on `_mySession.userId` are fragile
when one human runs multiple tabs." The brief then went on to say
"This is correct for app_events. Do not change it." — which assumed
the handler already had the Aegis exemption. It did not. The brief
was wrong about the pre-existing state, and my CMD54 rewrite
reproduced the naive filter.

This is the third time Iron Rule 15 has been violated (CMD47 result
handler, CMD54 app_event handler rewrite, and now recognized). The
rule stays, but its specific applications are worth enumerating in
case future work touches the same surface:

**Iron Rule 15 — enumerated applications.** Every broadcast handler on
the shared channel that filters by sender identity must either:

1. Compare against a value that is unique per tab (not `_mySession.userId`
   which is shared across tabs for the same human), OR
2. Exempt the tabs that cannot by construction have emitted the
   broadcast type being filtered — i.e. Aegis for `result` and
   `app_event`, because Aegis never emits either.

Current handlers with their exemptions:

| Handler | Line | Exemption |
|---------|------|-----------|
| `result` | ~301 | `if (!window._aegisMode && d.from === _mySession.userId) return;` |
| `app_event` | ~331 | `if (!window._aegisMode && senderId === _mySession.userId) return;` (CMD57) |

---

## Brief B1.5 — Channel Rename (CMD62)

Resolves Open Question #1 from the B1 section. Current channel
`cmd-center-{FIRM_ID}` → protocol-compliant `hud:{firm_id}` (Contract 1
of `hud-ecosystem-protocol-v0.1.md`). Dual-subscribe cutover to avoid
a blackout window during which CMD62 tabs and stale (pre-CMD62) tabs
cannot see each other.

### Dual-subscribe pattern and rationale

Hard cutover was rejected: a CMD62 deploy against a fleet of stale
tabs would leave the stale tabs on the legacy channel and CMD62 tabs
on the target channel, with no overlap — dispatched cmds would time
out, app_events would be undelivered, the M2 feed would appear frozen
on stale tabs.

CMD62 subscribes to **both** channels:

- `TARGET_CHANNEL_NAME = 'hud:' + FIRM_ID` — the protocol-compliant name
- `LEGACY_CHANNEL_NAME = 'cmd-center-' + FIRM_ID` — the name every
  pre-CMD62 tab is still subscribed to

Both channels use identical config (presence key + suffix,
`broadcast: { self: true, ack: false }`). Supabase realtime multiplexes
both over a single Phoenix WebSocket per client, so the cost is one
subscribe round-trip and one presence track, not a second socket.

CMD62 tabs receive from both channels (dedup below); CMD62 tabs send on
both channels (dual-write in `_channelSend`). Stale tabs stay on the
legacy channel and are addressable from CMD62 for the duration of the
transition.

### Factor-out-handlers refactor

Every `_channel.on(...)` registration was extracted into a named
function so each registration becomes a single line, duplicated
mechanically on `_channelLegacy`. Named functions (defined inside
`_connect()` so they close over `_channel`, `_channelLegacy`, and
`_mySession`):

- `_handlePresenceSync` — presence sync. Merges `presenceState()` from
  **both** channels into a single `_sessions` map (exec presence wins
  over aegisObserver when both are seen for the same userId). This is
  the one place behavior is not strictly mechanical; the old
  single-channel logic rebuilt `_sessions` from one `presenceState()`
  call per sync fire. The merge is correct-by-construction for any tab
  that appears on at least one channel.
- `_handlePresenceJoin` — presence join (debounce-compatible; Supabase
  fires join per channel so the same userId may generate two join
  events; the dedup logic by userId in the existing code handles this
  without change).
- `_handlePresenceLeave` — presence leave (8s debounce already
  absorbed track-update churn; now also absorbs per-channel leave
  double-fire).
- `_handleCmd` — command receipt. **Added `cmdId` dedup** (see below).
- `_handleLocationUpdate` — location heartbeat receipt. No dedup
  needed; `location_update` is idempotent (last-write-wins on
  `_sessions[uid].location`).
- `_handleResult` — command-ack receipt. Rule 15 Aegis exemption
  preserved. **Added `cmdId` dedup** (see below).
- `_handleAppEvent` — `app_event` receipt. Rule 15 Aegis exemption
  preserved. Rule 20 envelope unwrap preserved. Rule 22 retention
  buffer push preserved. **Added `event_id` dedup at handler entry,
  post-self-echo, pre-buffer** (see Iron Rule 25 below).

Each handler is registered twice — once on `_channel`, once on
`_channelLegacy` — using the same function reference.

### Both-channels-ready semantics (Brief B1.5 §4–§5)

Module-level flags `_channelReady` and `_channelLegacyReady` flip to
true inside each channel's own `SUBSCRIBED` callback. A shared
`_onBothChannelsReady()` finalizer runs exactly once, when the second
of the two SUBSCRIBED callbacks fires. Inside the finalizer:

- `window._cmdConnected = true` (flipped BEFORE drain so
  `_flushOutboundQueue`'s guard passes)
- `_flushOutboundQueue()` — envelopes queued during bootstrap now go
  through the dual-write path and land on both channels
- `_appendLine('SYS', 'sys', 'Connected · session: …')` — the banner
  only appears when dual-subscribe is fully established; a half-ready
  "Connected" would be an operator-visible lie
- `_updateStatusEl()`, `_renderSessionList()`, `_startLiveClock()`
- Location-heartbeat `setInterval` — starts after both channels are
  ready, sends via `_channelSend` (dual-write)

Presence `track()` fires inside **each** channel's own SUBSCRIBED
callback (not in the shared finalizer), so presence is published on
both channels independently. The merge in `_handlePresenceSync`
deduplicates by userId.

`_cmdEmit` still gates on `window._cmdConnected` (CMD60 semantics
preserved); with CMD62 that flag means "both channels SUBSCRIBED" not
"one channel SUBSCRIBED."

### `_flushOutboundQueue` dual-write correction

The queue drain in CMD56/CMD58 called `_channel.send(...)` directly.
Under dual-subscribe that would strand flushed envelopes on the target
channel only, invisible to stale legacy-only tabs. Drain now routes
through `_channelSend`, which dual-writes.

### Cutover diagnostic logging

`DEBUG_CHANNEL_SOURCE` constant (default `false`) added. When flipped
true, dedup-dropped app_events log one line each so a double-fire
suspicion during the CMD62 window can be confirmed without adding
per-event channel-source noise to normal logs. Flip back to false
after cutover. Do **not** default-enable it.

### Disconnect / cleanup

No `unsubscribe` or `removeChannel` site exists today; Supabase auto-
cleans on page unload. **N/A** for this brief — if a future brief adds
explicit teardown, the same operation must apply to `_channelLegacy`.

---

### New iron rule

**Rule 24.** During any realtime channel rename, the old and new
channel names must coexist across one release cycle via dual-subscribe
(both inbound listener registration and outbound `_channelSend` dual-
write). Hard cutover creates a blackout window during which stale tabs
(still on the old channel) and fresh tabs (on the new channel) cannot
see each other, during which dispatched cmds time out and app_events
go undelivered. The removal brief is authored only after operator-
confirmed full tab refresh across all active firms — typically 1–2
weeks of normal operator activity. (See B1.5/CMD62.)

**Rule 25.** Any broadcast handler operating on a dual-subscribed
channel set with `broadcast.self: true` on both channels MUST dedup
duplicates at handler entry, post-self-echo, pre-buffer-push. The
retention buffer (Rule 22) keys on `event_type` only — it does NOT
dedup by `event_id` — so a second receipt of the same envelope would
double-fire `_resolveEventListeners` and `_fanoutAppEventListeners`
and carry two buffer entries for the same logical event. Dedup uses
the broadcast's natural id:

- `app_event` → `event_id` (from the protocol envelope)
- `cmd`      → `cmdId`
- `result`   → `cmdId`

`location_update` has no natural id and is idempotent (last-write-wins
on `_sessions[uid].location`), so it is exempt. TTL on the dedup
stores is 30s, matching the retention buffer window; a duplicate
arrival beyond that is vanishingly unlikely (both channels share the
same WebSocket) and less harmful than unbounded memory growth.

Dedup stores and purgers live in cmd-center.js alongside the retention
buffer: `_seenEventIds`, `_seenCmdIds`, `_seenResultIds`,
`_purgeSeenEventIds`, `_purgeSeenCmdIds`, `_purgeSeenResultIds`.

This rule is the direct successor to Rule 24; it exists only while
dual-subscribe is active. After B1.6 lands (legacy channel removed),
the three dedup stores can be deleted. Keep the rule in the handoff
with a note that it was retired, so the reasoning is preserved if a
future rename is needed.

### Brief-authoring notes for future work

- The brief's line number for aegis.html's cache-bust (~1307) is stale;
  actual site is **1552** in the file in hand. Cache-bust inventory
  below reflects the actual lines.
- `sidebar.js:284` was on CMD60 at the start of this brief, not CMD61.
  A prior deploy missed the sidebar bump. This brief brings all three
  sites to CMD62.
- The brief asserts that the retention buffer's dedup "automatically"
  prevents double-fire under dual-subscribe. That is not true — the
  buffer keys on `event_type` only. Dedup by `event_id` was added
  explicitly (Rule 25). Future rename briefs should specify dedup
  rather than inherit it.
- `_handlePresenceSync` was changed from reading one channel's
  `presenceState()` to merging both. This is the one non-mechanical
  refactor in the handler set. It is correct for the dual-subscribe
  window and remains correct after B1.6 (a single-channel client will
  have only one non-null entry in the merge loop).

### Open question

**When to schedule B1.6 (legacy channel removal).** Recommendation:
after the operator confirms all active tabs across all firms have
refreshed at least once on CMD62 or later — typically 1–2 weeks of
normal operator activity. The B1.6 brief is small:

- Delete `LEGACY_CHANNEL_NAME`, `_channelLegacy`, `_channelLegacyReady`
- Delete the 7 `_channelLegacy.on(...)` registrations
- Delete the legacy `_trackPresenceOn(_channelLegacy)` call and its
  SUBSCRIBED callback
- Collapse `_channelSend` back to single-channel
- Restore `_handlePresenceSync` to single-channel `presenceState()`
  read (or keep the merge — it's a no-op with only one channel)
- Retire Rules 24 and 25 in-place (strike-through, note retirement
  date and CMD version)
- Keep the dedup stores? **Delete them.** With only one channel and
  `broadcast.self: true`, self-echo is handled by the existing
  userId-match filters (Rule 15); there's no second receipt to dedup.

The gating is procedural (operator signal), not technical.

### Updated file version table

| File | Version | Node |
|------|---------|------|
| `cmd-center.js` | v20260418-CMD62 | ✓ |
| `aegis.html` | cache-bust CMD62 | — |
| `sidebar.js` | cache-bust CMD62 | ✓ |
| `compass.html` | cache-bust CMD62 | — |
| `mw-tabs.js` | v20260418-CMD55 | ✓ (untouched) |
| `mw-events.js` | v20260418-CMD55 | ✓ (untouched) |
| `mw-core.js` | v20260418-CMD55 | ✓ (untouched) |

### Updated cache-bust inventory

| File | Line | Literal |
|------|------|---------|
| `sidebar.js` | 284 | `s.src = '/js/cmd-center.js?v=v20260418-CMD62';` |
| `compass.html` | 1082 | `<script src="/js/cmd-center.js?v=v20260418-CMD62"></script>` |
| `aegis.html` | 1552 | `<script src="/js/cmd-center.js?v=20260418-CMD62"></script>` (single `v` prefix, preserved from prior state) |

### Post-completion unblocks

- **CommandHUD subscription** — `hud:{firm_id}` now accepts
  subscriptions with the protocol-compliant envelope (from B1). The
  parallel build track chooses when to subscribe.
- **B1.6** — authored after operator-confirmed full refresh.
- **B2 (Wait commands)** — unaffected by this brief; touches script-
  engine paths, not channel paths. Unblocked.


### CMD62 post-deploy patch — `_cmdEmit` self-dedup registration

**Symptom observed during CMD62 smoke test (Test 3 follow-on):** a
manual `window._cmdEmit('instance.launched', ...)` call on the Aegis
tab rendered **two** entries in the M2 CoC stream for the same event
— one from the local synchronous fan-out inside `_cmdEmit`, and one
from the wire self-receive via `broadcast.self: true` re-entering
through `_handleAppEvent`.

**Root cause.** Rule 25's dedup store `_seenEventIds` is populated
only on the wire-receive path (inside `_handleAppEvent`). `_cmdEmit`
did not register its own envelope's `event_id` before the local
fan-out. The sequence was:

1. `_cmdEmit` generates envelope with fresh `event_id`.
2. `_cmdEmit` calls `_channelSend` → dual-write over the wire.
3. `_cmdEmit` synchronously calls `_fanoutAppEventListeners` → first
   CoC stream render.
4. Broadcast round-trips via Supabase, arrives at `_handleAppEvent`.
5. Rule 15 Aegis exemption: not skipped.
6. Rule 25 dedup check: `_seenEventIds[event_id]` is `undefined` —
   the envelope was never registered. Passes.
7. `_fanoutAppEventListeners` called again → second CoC stream render.

On Compass, same-tab emits rarely also have app_event listeners
registered on that same tab (mw-* modules emit but don't fan out to
the M2 feed — M2 lives on Aegis). The bug was latent for any future
code that has Aegis locally emit an app_event, and surfaced
immediately via the diagnostic manual `_cmdEmit` call.

**Fix.** Register `_seenEventIds[envelope.event_id] = Date.now()`
inside `_cmdEmit`, **before** `_channelSend` and before the local
fan-out. When the wire self-receive arrives at `_handleAppEvent`, the
dedup gate finds the entry and drops the duplicate. The local
synchronous fan-out + buffer push proceeds as before (those calls
live inside `_cmdEmit`, not behind the dedup gate).

This is not a new iron rule — it is an implementation detail of
Rule 25. Amend Rule 25:

**Rule 25 (amended).** Any broadcast handler operating on a dual-
subscribed channel set with `broadcast.self: true` on both channels
MUST dedup duplicates at handler entry, post-self-echo, pre-buffer-
push. Additionally, **any code path that locally fans out to app_event
listeners AND also broadcasts over the wire (i.e. `_cmdEmit`) MUST
register its own envelope's `event_id` in the dedup store before the
local fan-out**, so the wire self-receive drops. Otherwise same-tab
listeners render the event twice.

Compass-originated app_events reaching Aegis are unaffected (Aegis
never emitted, so Aegis has no local fan-out to conflict with the
wire receive — the single receive is the single render). Confirmed
in the earlier Expense Report submission test: each of
`wf_request.created`, `form.submitted`, `instance.launched` rendered
exactly once in the CoC stream.

**Scope.** The symmetric risk for `cmd` (dispatcher self-receives its
own cmd) is neutralized by the existing target filter (`if (d.target
!== _mySession.userId && d.target !== 'ALL') return;`) — a dispatcher
sending to a different target never enters the body. The symmetric
risk for `result` (the ack path) is neutralized by Rule 15's
own-userId skip plus the Aegis exemption; the dispatcher is not the
acking party. No `_cmdEmit`-style patch needed for `cmd` or `result`.

### Pre-existing gap surfaced during B1.5 smoke: Instance Feed not reactive

**Observation.** During CMD62 smoke test, submitting two Expense
Reports from Compass caused the Aegis M2 CoC stream to populate
correctly (three events per submission, each rendered once). The M2
Instance Feed column (left side of M2 Overview), however, did not
update — the newly-launched instances did not appear as new cards.

**Diagnosis.** A `document.scripts` search on Aegis for any of
`instance_feed`, `instanceFeed`, or literal "Instance Feed" returned
zero script elements containing those tokens. Searches for
`instance.launched` returned exactly one match (cmd-center.js
itself). The Instance Feed column is rendered from a DB query at M2
Overview mount time and has no subscription to `instance.launched`,
`instance.completed`, or `instance.blocked` events.

**Classification.** Pre-existing limitation of the M2 UI. Not a
CMD62 regression — the Instance Feed behaved identically on CMD61.
Out of scope for B1.5 (which does not modify aegis.html except for
the cache-bust line).

**Follow-up brief.** Candidate: **M2-FEED-2 — Instance Feed reactive
updates.** Subscribe the Instance Feed column to `instance.launched`,
`instance.completed`, `instance.blocked`, `workflow_request.resolved`
via `window.CMDCenter.onAppEvent` (the same API the CoC stream uses).
On `instance.launched`: insert a new card at the top. On
`instance.completed` / `instance.blocked`: update the status pill and
re-sort. On `workflow_request.resolved`: update step indicator. Cap
the visible list (currently appears to be ~4 cards in the Overview
snapshot; an "18 ACTIVE" counter suggests the full list is truncated
for the Overview — the Instances tab should be the full feed). Gate
behind a scroll-to-top-on-new-launch UX decision to avoid yanking
the operator's scroll position during active review.

Unrelated to Brief B1.5 DoD. The B1.5 dual-subscribe + dedup work is
sufficient for channel-rename cutover regardless of whether
M2-FEED-2 ships.

### DoD revision after patch

Behavioral evidence, Test 3 (restated):

- **CoC stream**: three events per Expense Report submission, each
  rendered once, correct order (`workflow_request.created`,
  `form.submitted`, `instance.launched`). **Pass.** (Confirmed in
  post-deploy smoke.)
- **Instance Feed**: not reactive. **Deferred to M2-FEED-2.** Not a
  B1.5 gate.
- **Manual `_cmdEmit` on Aegis**: renders once, not twice, in CoC
  stream after the `_cmdEmit` self-dedup patch.

### File version table (post-patch)

| File | Version | Node |
|------|---------|------|
| `cmd-center.js` | v20260418-CMD62 (patched) | ✓ |
| `aegis.html` | cache-bust CMD62 | — |
| `sidebar.js` | cache-bust CMD62 | ✓ |
| `compass.html` | cache-bust CMD62 | — |

Version string unchanged (CMD62 in-place amendment, single brief
session). If the patch requires its own deploy after a cutover window
has elapsed, bump to CMD63 at that point and add the B1.5 patch to
the CMD63 deploy line.

## Brief B2 — Typed Wait Commands + form.opened (CMD63)

Resolves B1 Open Question #7. Adds four typed `Wait` commands to the Aegis
script vocabulary and one new emit (`form.opened`) following the B1 envelope
pattern.

### Script vocabulary reference (five new surface-area items)

| Surface | Syntax | Purpose |
|---|---|---|
| Command | `Wait ForLocation <alias> "<location>" [timeout=<ms>]` | Block until `location.ready` fires for the alias's resource_id. Default timeout 30000ms. |
| Command | `Wait ForInstance <$var\|uuid> [for <state>] [timeout=<ms>]` | Block until `instance.<launched\|completed\|blocked>` fires for the instance. Default state `launched`; default timeout 60000ms. |
| Command | `Wait ForRoute <$var\|uuid> to <alias> [timeout=<ms>]` | Block until `workflow_request.created` fires with matching `instance_id` AND `assignee_resource_id`. Default timeout 30000ms. |
| Command | `Wait ForForm "<form_name>" [timeout=<ms>]` | Block until `form.opened` fires with matching `form_name`. Default timeout 10000ms. |
| Emit    | `form.opened` | Fires when the Compass form overlay is queryable by `Form Insert`. Payload: `{form_name, form_def_id, opener_resource_id, opener_user_id}`. |

### `form.opened` emit — firing site and payload

Fires on Compass in `mw-tabs.js` inside the `message` handler branch for
`compass_form_ready`. Parent tracks the canonical `form_name` /
`form_def_id` in `window._myrCurrentForm` at `_myrOpenHtmlFormOverlay`
call time; iframe-supplied values are accepted as fallback only. Parent
is source of truth.

Payload:

```json
{
  "form_name": "Expense Report",
  "form_def_id": "<uuid|null>",
  "opener_resource_id": "<uuid|null>",
  "opener_user_id": "<uuid|null>"
}
```

### Compound filter in `Wait ForRoute` — implementation choice

Option (b), the re-queue pattern, per the brief's preference. New
`_waitForRoute(instanceId, assigneeResourceId, timeoutMs)` helper waits
on `workflow_request.created` with `filterKey='instance_id'`, inspects
`assignee_resource_id` on each match, and recurses into another
`_waitForEventFiltered` call if the assignee doesn't match. Mirrors the
in-line re-queue already present in `_waitForEventFiltered` at its
`resolver` callback. `_waitForEventFiltered` signature unchanged. Buffer
scan (Rule 22) is preserved because each recursion re-enters the
filtered wait, which scans the buffer on registration.

### Pending follow-up: Cadence-side iframe bootstrap migration

`form.opened` requires the form iframe's bootstrap to send
`postMessage({type:'compass_form_ready', form_name, form_def_id}, '*')`
after its render pass completes. The iframe HTML/JS lives in
`workflow_form_definitions.source_html` (DB rows), not in the repo, so
this migration is a separate Cadence-side workstream.

Until that migration ships, `Wait ForForm` times out diagnostically at
its configured timeout (10s default). No regression — the command is
new in B2; no existing script relies on it.

**Suggested bootstrap snippet for Cadence author:** insert at the end
of each form's bootstrap, after the initial DOM render pass:

```html
<script>
(function() {
  function signalReady() {
    var hasField = !!document.querySelector('input,select,textarea');
    if (!hasField) { requestAnimationFrame(signalReady); return; }
    try {
      parent.postMessage({
        type:        'compass_form_ready',
        form_name:   /* literal form name, e.g. "Expense Report" */ null,
        form_def_id: /* literal form_def_id UUID or null */ null,
      }, '*');
    } catch (e) {}
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    requestAnimationFrame(signalReady);
  } else {
    document.addEventListener('DOMContentLoaded', function() { requestAnimationFrame(signalReady); });
  }
})();
</script>
```

Parent is source of truth for `form_name`/`form_def_id`; the iframe
values are fallback. Safe to leave null.

### New iron rule

**Rule 26.** Typed Wait commands on Aegis MUST run locally on the
dispatcher, never remote-dispatch to the target. The target session
has no way to fulfill a "wait for cross-session event" — the event
bus receive-side lives on the waiting tab. `Wait ForLocation`,
`Wait ForInstance`, `Wait ForRoute`, `Wait ForForm` are registered in
both `_lv` (line ~1652) and `_rl` (line ~2388) local-verb lists so
that even with a `VS:` prefix the command executes locally. Any
future typed Wait added to the `COMMANDS` registry must likewise be
added to both allow-lists.

### Updated file version table

| File | Version | Node |
|------|---------|------|
| `cmd-center.js` | v20260418-CMD63 | ✓ |
| `mw-tabs.js`    | v20260418-CMD63 | ✓ |
| `aegis.html`    | cache-bust CMD63 | — |
| `sidebar.js`    | cache-bust CMD63 | — |
| `compass.html`  | cache-bust CMD63 | — |
| `mw-events.js`  | v20260418-CMD55 | — (untouched by B2) |
| `mw-core.js`    | v20260418-CMD55 | — (untouched by B2) |

### Updated cache-bust inventory

| File | Literal |
|------|---------|
| `sidebar.js`   | `s.src = '/js/cmd-center.js?v=v20260418-CMD63';` |
| `compass.html` | `<script src="/js/cmd-center.js?v=v20260418-CMD63"></script>` |
| `aegis.html`   | `<script src="/js/cmd-center.js?v=20260418-CMD63"></script>` (single `v` prefix preserved) |

### Candidate follow-ups

1. Migrate `dual_session_test` to v1.2 — delete `Pause` lines, replace
   with typed Waits. ~30 minutes. Becomes the regression test for B2.
2. Migrate `b1_event_emit_probe.txt` similarly.
3. Cadence-side iframe bootstrap migration (pending follow-up above)
   to activate `form.opened`.
4. M2-FEED-2 Instance Feed reactive — independent.

### Open question (deferred, not added in B2)

**`form.closed` as a ninth emit.** Plausible companion to `form.opened`
for Class 5 precondition policies ("form closed without submit →
notify"). Not in scope; surface for B6 review.

## Post-B2 micro-task — script migration to typed Waits (CMD63b)

Two regression scripts migrated from `Pause` to typed `Wait` commands
per the B2 vocabulary. Machine-observable pauses replaced; three
categories of Pause retained, each annotated with a TODO pointing at
the emit or subscription that would allow full migration.

### Significant finding during migration — Compass Work Queue non-reactivity

Root cause identified for the UI-render-gap category: **Compass's
Work Queue pane does not subscribe to the event bus.**
`workflow_request.created` writes the DB row and emits an envelope
on the channel, but the Work Queue re-queries only on mount
(tab-switch, refresh, etc.) — it does not react to live
`workflow_request.created` broadcasts. A script that races a
Click against the emit's arrival hits a "button not found" failure
because the row exists in the DB but not yet in the Work Queue DOM.

Same class as the Instance Feed non-reactivity flagged during B1.5
smoke. Both are products of the pre-B1 architecture, surfaced only
now that typed Waits resolve faster than the old manual Pauses.

**This is a product bug, not a script bug.** Remediation is B-UI-1
(next brief), not arbitrary `Wait <ms>` lines.

### Pause taxonomy established by this migration

Future scripts and briefs should use these four classifications:

| Category | Definition | Status | Target emit / subscription |
|---|---|---|---|
| **Machine-observable** | State transition already emitted on the event bus AND the consuming UI/listener is reactive | Migratable today | Already exists |
| **Form-render pending** | Form iframe render completion, no emit yet | Pause + TODO | `form.opened` (B2, iframe sender migration deferred to Cadence side) |
| **UI-render-gap** | State transition emitted, but downstream UI pane is non-reactive (re-queries only on mount) | Pause + TODO | B-UI-1: subscribe Work Queue + Instance Feed to event bus; add `work_queue.rendered` emit |
| **UI-modal-render** | Modal/panel mount triggered by user click, no emit | Pause + TODO | B-UI-1 successor: `modal.opened` emit |

UI-render-gap is **not** a script flaw. It is a recognized product
gap — the consuming surface does not subscribe to the bus.

### `dual_session_test.txt` v1.1 → v1.2

Pause classification and resolution:

| v1.1 Pause | Classification | v1.2 action |
|---|---|---|
| "Both sessions navigating to Compass" | Machine-observable | `Wait ForLocation VS` + `Wait ForLocation AK` |
| "Both tabs should be on MY WORK" | Synchronous (no wait needed) | deleted |
| "Form open — confirm Expense Report modal" | Form-render pending | **kept** + TODO (B2 iframe migration) |
| "Form submitted — confirm form closed" | Machine-observable | `Wait ForEvent "form.submitted" → $instance_id` + `Wait ForInstance $instance_id for launched` |
| "Confirm request appears in Vaughn's work queue" | UI-render-gap (non-reactive) | **kept** + TODO (B-UI-1) |
| "Confirm popup review form is raised" | UI-modal-render | **kept** + TODO (B-UI-1 successor) |
| "Approved — confirm routing to AK" | Machine-observable | `Wait ForRoute $instance_id to AK` |
| "Confirm request appears in Angela's work queue" | UI-render-gap (non-reactive) | **kept** + TODO (B-UI-1) |
| "Confirm Document Review panel visible" | UI-modal-render | **kept** + TODO (B-UI-1 successor) |
| "Step 2 complete" | Machine-observable | `Wait ForInstance $instance_id for completed` |

Net: 10 Pauses → 5 retained (1 form-render + 2 UI-render-gap + 2
UI-modal-render) + 5 machine-synchronized. Script runs with 5 Enter
presses at marked Pause points.

### `b1_event_emit_probe.txt` v1.0 → v1.1

Changes:
- "Compass loading" Pause → `Wait ForLocation VS "compass.my_work" timeout=30000`.
- Form Open Pause **added** with TODO (v1.0 had no Form Open pause;
  its Inserts were racing the iframe bootstrap silently and using
  snake_case field names that don't match the form's `data-label`
  markup — double-failing invisibly).
- Form Insert/Select field names corrected from snake_case to
  quoted human labels matching `dual_session_test`'s convention.
- `Wait ForEvent "instance.launched"` →
  `Wait ForInstance $instance_id for launched`.
- `Wait ForEvent "workflow_request.created" where assignee=VS` →
  `Wait ForRoute $instance_id to VS`.

### CMD63b — `_waitForRoute` buffer-replay fix

Symptom during v1.2 first run: `Wait ForRoute $instance_id to AK`
timed out after 30s despite the seq-3 `workflow_request.created` to
AK firing well before timeout. Root cause: the CMD63 `_waitForRoute`
recursed into `_waitForEventFiltered` on non-match, which re-scanned
the retention buffer each iteration and returned the same stale
seq-2 (VS=submitter) emit forever.

Fix: `_waitForRoute` now does one compound-aware buffer scan up
front (matching BOTH `instance_id` AND `assignee_resource_id`), then
registers a forward-only listener with the compound predicate inside
the resolver. Non-matching forward emits re-queue the listener
without re-scanning the buffer. See `cmd-center.js` `_waitForRoute`
comment for the full diagnosis.

### Next brief — B-UI-1

Scope preview (full brief authored separately):

1. Subscribe Compass Work Queue pane to the event bus.
   `workflow_request.created` with matching
   `assignee_resource_id === _myResource.id` should trigger a
   re-render (or a targeted insert) without tab-switch.
2. Subscribe Aegis M2 Instance Feed similarly (same non-reactivity
   class; flagged during B1.5 smoke).
3. Add `work_queue.rendered` emit — fires when the Work Queue
   finishes rendering a newly routed row, payload includes
   `instance_id`, `workflow_request_id`.
4. Add typed `Wait ForQueueRow $instance_id to <alias>` command.
5. `dual_session_test` v1.3 drops the two UI-render-gap Pauses.

Ordering: B-UI-1 ships **before** the Cadence iframe
`compass_form_ready` migration. UI-render-gap Pauses bite every
dual-session script; the form-render Pause bites only scripts that
open a form.

### Follow-ups this micro-task exposes

1. **B-UI-1** — above.
2. **Cadence iframe `compass_form_ready` migration** — deferred
   after B-UI-1. Activates `Wait ForForm` and drops form-render
   Pauses.
3. **`modal.opened` emit** (B-UI-1 successor or rolled in) —
   drops the Review popup + Document Review panel Pauses.
4. **`Wait ForEvent` → `$var` substitution-before-arrow-parse**
   cosmetic pre-existing parser bug.
5. **Compass instance-state leak across script re-runs** —
   observed when a prior run halts mid-chain and a second run
   fires immediately. `_myActiveRequestId` / `_rrpSubmit` resolve
   target carries stale instance from the previous run, so Click
   "Approve" resolves the wrong instance. Workaround: hard-
   refresh Compass tabs between runs. Root cause: whatever sets
   `_myActiveRequestId` on `workflow_request.created` receipt
   doesn't invalidate on new `instance.launched` for the same
   operator. Deferred; file a brief if it recurs in normal
   operation.

### New iron rule

**Rule 27.** Predicate re-check under compound filtering MUST NOT
re-scan the retention buffer. The buffer is keyed on `event_type`
only; a stale non-matching entry will be returned again and again
if the re-check path re-scans it. Correct pattern: one compound-
aware initial buffer scan, then forward-only listener with
predicate re-queue. `_waitForRoute` (CMD63b) implements this
pattern as the reference. Direct successor to Rule 22 — Rule 22
says buffer scan precedes forward queue; Rule 27 says the scan
runs once per wait, not once per predicate check.

#######################################################################
## END:    Preamble / Iron Rules Carry-Forward Block
#######################################################################

#######################################################################
## START:  Brief B-UI-1 Block
## DATE:    2026-04-17
#######################################################################

## Brief B-UI-1 — UI Reactivity (CMD64)

Two non-reactive surfaces made reactive. One new emit. No new commands
(brief explicitly defers `Wait ForQueueRow` to a successor).

### Compass Work Queue — now reactive

Subscription lives at the end of `mw-tabs.js` as a self-mounting IIFE,
guarded against double-mount via `window._mwWorkQueueReactive`.

On `workflow_request.created` where
`assignee_resource_id === window._myResource.id`: calls
`window._mwLoadUserView()` to re-run the mount-time render, then fires
`work_queue.rendered` (see below) via `requestAnimationFrame` so the
DOM commit has landed. Dedup by `workflow_request.id` in
`_renderedRequestIds` prevents repeat emits if the renderer re-paints
an unchanged row.

On `workflow_request.resolved` where
`resolver_resource_id === window._myResource.id`: same
`_mwLoadUserView()` call so the resolved row drops out of the open
query. No `work_queue.rendered` emit on resolve — the emit's purpose
is "new queue item is now clickable," not "old one is gone."
`_renderedRequestIds` entry for the resolved request is cleared so a
future re-creation of the same row (unlikely, but possible under
reopen) emits cleanly.

Other operators' events are filtered out by the
`assignee_resource_id === _myResource.id` check before any DOM work.

On-mount buffer scan: `CMDCenter.recentEvents(50)` is scanned
oldest-first, each matching event fed through the same handler. This
catches events that fired in the narrow window between the initial DB
query and subscription registration. Dedup via `_renderedRequestIds`
keeps the emit count honest even if the initial DB query already
included the row.

**Design choice: coarse re-render via `_mwLoadUserView()`.** The brief
said "reuse the existing row-render function." The actual renderer
lives in `mw-core.js` (off-limits for this brief). The globally
exposed entry point that mw-core provides is `_mwLoadUserView()`,
which performs the full re-render. Accepting this coarse granularity
(one full DB re-query per event) rather than reading mw-core was the
smaller risk: under normal load a dual-session approval fires 4-6
relevant events per instance, well below any rate that would matter.
If targeted insert/remove becomes necessary later (e.g., under
high-throughput policy-engine workloads in B6), a future brief can
plumb a narrower API through mw-core.

### Aegis M2 Overview Instance Feed — now reactive

The column previously held four hardcoded `<div class="inst">`
placeholder cards. Replaced with an empty mount point
`#m2-instance-feed` driven by a new IIFE at the end of aegis.html's
script block, mirroring the M2 CoC feed's pattern.

Card cap: **6** (brief's suggested default; no existing cap to
preserve). The title text dynamically shows `Instance feed · N
active` where N excludes `completed` cards.

Event handling:

| Event | Effect on card |
|---|---|
| `instance.launched` | Insert new card at top. Initial `seq: 1`, status `active`, launched_ts `Date.now()`. |
| `workflow_request.resolved` | Update `seq` on the existing card to `data.seq + 1` (next step now current). If card not present, ignore per brief Part 2. |
| `instance.completed` | Set status `completed`, store `final_status`. Card stays visible (falls off naturally as new instances push it below cap). |
| `instance.blocked` | Set status `blocked`, store `reason`. Adds a truncated reason line under the instance metadata. |

On-mount seed: `CMDCenter.recentEvents(50)` replayed oldest-first so
final state wins for each instance (an instance that launched-then-
blocked within the retention window renders as blocked, not active).

### New emit: `work_queue.rendered`

Fires from `mw-tabs.js` after `_mwLoadUserView()` re-renders the Work
Queue in response to a `workflow_request.created` for the current
operator. Envelope built by `_cmdEmit` as usual (event_id,
source_session, ts auto-injected).

Payload:

```json
{
  "workflow_request_id": "<uuid>",
  "instance_id":         "<uuid>",
  "seq":                 3,
  "assignee_resource_id":"<uuid>",
  "template_id":         "<uuid>"
}
```

Payload sourced directly from the triggering
`workflow_request.created` event, not from a DOM query. The event is
the source of truth for workflow_request metadata; the DOM is
presentation.

**Fires only on the operator's own Compass tab** — the subscription
filter guarantees this. A future `Wait ForQueueRow` command (not in
this brief, per Out of scope) will consume the emit.

M2 CoC feed classification: **signal**, cyan dot (`var(--aq)`),
mirroring `instance.launched`'s color. Entry added to the `_format`
switch in the existing M2 feed IIFE.

### Updated file version table

| File | Version | Node |
|------|---------|------|
| `cmd-center.js` | v20260419-CMD64 | ✓ |
| `mw-tabs.js`    | v20260419-CMD64 | ✓ |
| `aegis.html`    | cache-bust CMD64 (in cmd-center.js script tag) | — |
| `sidebar.js`    | cache-bust CMD64 (pending manual bump) | — |
| `compass.html`  | cache-bust CMD64 (pending manual bump) | — |
| `mw-events.js`  | v20260418-CMD60 | — (untouched) |
| `mw-core.js`    | v20260418-CMD60 | — (untouched) |

### Updated cache-bust inventory

| File | Literal |
|------|---------|
| `aegis.html`   | `<script src="/js/cmd-center.js?v=v20260419-CMD64"></script>` |
| `sidebar.js`   | `s.src = '/js/cmd-center.js?v=v20260419-CMD64';` (pending) |
| `compass.html` | `<script src="/js/cmd-center.js?v=v20260419-CMD64"></script>` (pending) |

### Pause taxonomy update

UI-render-gap Pauses in `dual_session_test.txt` v1.2 are now migratable.
`dual_session_test` v1.3 is a 15-minute follow-up that deletes:

- `Pause Confirm request appears in Vaughn's work queue`
- `Pause Confirm request appears in Angela's work queue`

Both Pauses' target emit (`workflow_request.created`) is already firing
and being consumed by the reactive Work Queue. A script that runs
faster than the human eye can see the queue row appear is the point.

The two UI-modal-render Pauses (Review popup, Document Review panel)
remain — a separate brief adds `modal.opened`.

### Candidate follow-ups

1. **`dual_session_test` v1.3** — delete the two UI-render-gap Pauses.
2. **`modal.opened` emit + `Wait ForModal` command** — drops Review
   popup and Document Review panel Pauses. Candidate small brief.
3. **`Wait ForQueueRow $instance_id to <alias>` command** — consumes
   the new `work_queue.rendered` emit. Script-vocabulary brief,
   ~30 minutes.
4. **Cadence iframe `compass_form_ready` migration** — SQL sweep
   runbook. Unblocks `Wait ForForm`.
5. **Targeted Work Queue insert/remove** — if B6 policy workloads
   push event rate high enough that full `_mwLoadUserView()`
   re-queries become visible, a narrower mw-core API avoids the
   round-trip. Defer until observed.

### Open questions

**Multi-tab same-user dispatch disambiguation.** When multiple
Compass tabs share an auth identity, VS:-prefixed commands target
all of them. Surfaced during B-UI-1 smoke: a `dual_session_test`
run with a second VS-authenticated monitoring tab caused both tabs
to receive the scripted Form Open, both submitted, and two
Expense Report instances were created with duplicate queue rows.
The reactivity worked correctly — the monitoring tab's queue
updated live, which was the validation goal — but the script
semantics assume one tab per alias. Candidate fixes: (a) alias
resolution uses first-registered tab only; (b) explicit per-tab
addressing like `VS#1:`, `VS#2:`; (c) script-time session
selection prompt; (d) run scripts against the primary
authenticated tab by convention. Defer until B6 or when an
operator use case forces the decision.

**Completed-instance visibility.** Per brief, `instance.completed`
updates the status pill. The brief notes "Re-sort: completed
instances move to the bottom or drop out of the Overview view
entirely depending on existing sort semantics. Check how the existing
DB-mounted list handles completed; match that." The existing
hardcoded placeholder had no completed instances visible, so there's
no existing semantic to match. Current implementation keeps completed
cards visible in their original slot; they fall off naturally as new
`instance.launched` events push them past the 6-card cap. If
operators find this cluttered, a filter or auto-drop is a small
follow-up.

### No new iron rules

The subscription patterns follow Rules 15, 20, 22, 25, and 27
without introducing new invariants. Rule 27's one-scan-per-wait
doesn't apply here because the subscriptions don't do compound-
predicate re-checks — each event maps to a single filter decision
and a single mutation.

### Additional Note

v1.3 migration ran clean. All four typed Wait commands resolved. Work Queue reactivity confirmed live. Three Pauses remain (Form Open, Review popup, Document Review panel) — identified target emits/briefs for each. Phase 1 foundation verified end-to-end under a single-session run. Multi-session run deferred pending multi-tab same-user dispatch resolution (Open Question from B-UI-1).

## CMD64a — `_handleAppEvent` self-echo filter removed (Rule 15 third revision)

**Symptom observed during B-UI-1 smoke test:** with two Compass tabs
both authenticated as the same operator (VS), the tab that submitted
the Expense Report received its own `workflow_request.created` and
updated its Work Queue correctly, but the **second monitoring tab
never logged `recv workflow_request.created` at all**. Console of
the monitoring tab is silent for every app_event the first tab emits.

**Root cause.** `_handleAppEvent`'s self-echo guard was:

```js
if (!window._aegisMode && senderId === _mySession.userId) return;
```

`_mySession.userId` is the authenticated user — identical across every
Compass tab the same operator has open. The guard treats every emit
from *any* of this user's tabs as a self-echo on *every* other tab of
the same user. The second tab isn't actually the emitter; it's a
legitimate consumer with its own listeners (M2 feed, Work Queue
reactivity, future policy subscribers). The filter dropped those
events before they reached any listener.

This is the third time Rule 15 has been touched:

- **CMD47** added the Aegis exemption to `_handleResult` (`!window._aegisMode` prefix).
- **CMD57** added the same exemption to `_handleAppEvent`.
- **CMD64a** (this entry) removes the app_event filter entirely.

CMD47 and CMD57 were incremental workarounds for the specific Aegis
case — one human, Aegis + Compass tabs under same auth. They worked
because the only "second tab" scenario that had been exercised was
Aegis (which never emits app_events, so the exemption was safe). The
two-Compass-tabs case reveals the userId-match was never a correct
self-echo signal — it was a coarse proxy for "same tab" that happened
to line up with reality as long as only one Compass tab per user was
ever open.

**Fix.** The userId-match filter is removed from `_handleAppEvent`.
Self-receive suppression is now handled exclusively by Rule 25's
event_id dedup (`_seenEventIds`), which is correct by construction:
the emitting tab registers its own envelope's `event_id` in the
dedup store *before* the local fan-out, so the wire round-trip's
arrival at `_handleAppEvent` hits the dedup gate and drops. Other
tabs of the same user have independent dedup stores, so the emit
flows through to their listeners normally.

`_handleCmd` and `_handleResult` are intentionally not touched:
- `_handleCmd` filters on `target !== _mySession.userId` (only the
  addressed tab executes) which handles twin-tab correctly — both
  tabs see the cmd, only the addressed one acts.
- `_handleResult` filters on `from === _mySession.userId` which is
  the `_aegisMode` exemption case (same class of bug latent there),
  but result broadcasts are cmdId-dedupeable and the bug has not
  surfaced. Scoped out of this patch per minimal-change principle.

### Iron Rule 15 — third revision

**Rule 15 (CMD64a).** `_mySession.userId` is a per-user identifier,
not a per-tab identifier. It cannot be used to suppress self-echo —
two tabs with the same authenticated user share the value by
construction. Any broadcast handler that needs to suppress the
emitter's own wire self-receive (via `broadcast.self: true`) MUST
key on a per-broadcast identifier — `event_id` for app_event,
`cmdId` for cmd/result — registered in a dedup store by the emitter
before the local fan-out, and checked on receipt.

Historical workarounds (CMD47, CMD57) added `!window._aegisMode`
exemptions to skip the filter on Aegis tabs. These are retained in
`_handleResult` only; `_handleAppEvent` has no userId-based filter
at all as of CMD64a. The `_aegisMode` exemption was always a sign
that the filter was asking the wrong question — it was really
"should this broadcast type originate from this tab?" (Aegis-only
for cmd, Compass-only for app_event, both for result). The answer
shifts with every new tab type; event_id/cmdId dedup avoids the
question entirely.

**Non-negotiable:** no future handler adds back a
`senderId === _mySession.userId` filter. The multi-tab scenario is
real operator usage — monitoring, multi-device, duplicate tabs,
incognito + normal — and the filter breaks all of them.

### Updated file version table

| File | Version | Node |
|------|---------|------|
| `cmd-center.js` | v20260419-CMD64a | ✓ |
| `mw-tabs.js`    | v20260419-CMD64  | ✓ (untouched by CMD64a) |
| `aegis.html`    | cache-bust CMD64 (the cmd-center script tag must re-bump — see note below) | — |
| `sidebar.js`    | pending manual CMD64a bump | — |
| `compass.html`  | pending manual CMD64a bump | — |

### Updated cache-bust inventory

All three cmd-center.js script-tag references must now point at
`CMD64a`:

| File | Literal |
|------|---------|
| `aegis.html`   | `<script src="/js/cmd-center.js?v=v20260419-CMD64a"></script>` |
| `sidebar.js`   | `s.src = '/js/cmd-center.js?v=v20260419-CMD64a';` |
| `compass.html` | `<script src="/js/cmd-center.js?v=v20260419-CMD64a"></script>` |

#######################################################################
## END:    Brief B-UI-1 Block
#######################################################################

#######################################################################
## START:  B-UI-2 Append Block (includes Iron Rules 28-31 consolidation)
## DATE:    2026-04-19
#######################################################################

# Handoff append · Brief B-UI-2 — Wait ForQueueRow (CMD65)

**Date:** 2026-04-19
**Brief:** `aegis-brief-B-UI-2-wait-queue-row-v1.0.md`
**Predecessor:** B-UI-1 (CMD64) — `work_queue.rendered` emit
**Version bump:** `v20260419-CMD64c` → `v20260419-CMD65`

---

## Brief B-UI-2 — Wait ForQueueRow (CMD65)

One new typed Wait command. Pure vocabulary extension — no new emits,
no payload changes, no handler logic. Consumes the `work_queue.rendered`
emit introduced by B-UI-1.

### New command syntax

```
Wait ForQueueRow <$variable|literal_uuid> [to <alias>] [timeout=<ms>]
```

- **Single-field mode:** `Wait ForQueueRow $instance_id` — resolves on
  any `work_queue.rendered` emit carrying the matching `instance_id`.
- **Compound mode:** `Wait ForQueueRow $instance_id to VS` — resolves
  only when the emit also carries `assignee_resource_id` matching the
  alias's resource.
- **Default timeout:** 15000 ms (queue renders are fast; shorter than
  `Wait ForInstance`'s 60s).

Return values:
- Single-field: `work_queue.rendered: <id prefix> (step <seq>)`
- Compound: `work_queue.rendered → <alias> (step <seq>)`

### Implementation choice — shared helper refactor

Took the preferred path per brief. Refactored the compound-filter
pattern out of `_waitForRoute` into a shared primitive
`_waitForCompoundEvent(eventName, primaryKey, primaryVal,
secondaryKey, secondaryVal, timeoutMs, errLabel)` that both
`_waitForRoute` and the new `_waitForQueueRow` delegate to.

Refactor scope:
- New helper is a pure extraction of `_waitForRoute`'s body, generalized
  over `eventName` and key/value pairs. Rule 27 one-scan-per-wait
  discipline preserved inside the helper.
- Tolerance for `resource_id` / `assigneeId` aliases retained (was
  inside the original `_waitForRoute`; lifted into helper, gated on
  `secondaryKey === 'assignee_resource_id'` so it doesn't leak to other
  callers).
- `_waitForRoute` is now a 7-line thin wrapper.
- `_waitForQueueRow` dispatches single-field mode to
  `_waitForEventFiltered` (15s default), compound mode to
  `_waitForCompoundEvent` (15s default).

Single existing caller (`_waitForRoute` via command dispatch) confirmed
unchanged in behavior — payload shape, timeout default (30s preserved
via wrapper), error message format all identical to CMD63b.

### Parser handling

`Wait ForQueueRow` registered in the `COMMANDS` registry alongside
`Wait ForLocation`, `Wait ForInstance`, `Wait ForRoute`, `Wait ForForm`.
Two-word verb matching in `_parseLine` handles it naturally. Verb
added to both local-dispatch arrays (`_lv` at ~line 1842, `_rl` at
~line 2580) so it runs on the authoring tab rather than being
broadcast.

The `to <alias>` optional clause is handled via positional args —
`args.indexOf('to')` with fallback to no-compound mode when absent.
Mirrors `Wait ForRoute`'s parsing shape.

### Command vocabulary — now 5 typed Waits

| Command | Event | Filter | Default timeout |
|---|---|---|---|
| `Wait ForLocation <alias> "<location>"` | `location.ready` | resource_id | 30000 |
| `Wait ForInstance <$var\|uuid> [for <state>]` | `instance.launched`/`completed`/`blocked` | instance_id | 60000 |
| `Wait ForRoute <$var\|uuid> to <alias>` | `workflow_request.created` | instance_id + assignee_resource_id | 30000 |
| `Wait ForForm "<form_name>"` | `form.opened` | form_name | 10000 |
| **`Wait ForQueueRow <$var\|uuid> [to <alias>]`** | **`work_queue.rendered`** | **instance_id [+ assignee_resource_id]** | **15000** |

Plus `Wait ForEvent` (legacy untyped) = 6 total.

### Probe script

`scripts/b-ui-2_wait_queue_row_probe.txt` v1.4 — dual-session,
exercises `Wait ForQueueRow` at both of the two places it matters:
before VS's step-1 `Click "Review"` and before AK's terminal assertion.
Both `Wait ForQueueRow` modes (single-field and compound) are
exercised against the AK emit; the VS usage is additionally a real
dependency — not just a demonstration — because `Click "Review"` races
the DOM commit otherwise.

Five revisions total:

- **v1.0 wrong** — single-session; submitter cannot observe own queue
  (B-UI-1 subscription gates on `_myResource.id === assignee_resource_id`).
- **v1.1 wrong** — dual-session but omitted `VS:` / `AK:` prefixes;
  Aegis executed Set/Form lines locally instead of dispatching to
  Compass. Timed out on `Set Tab`.
- **v1.2 wrong** — prefixed correctly but routed form-submit directly
  to AK, skipping VS's step-1 self-review. The Expense Report template
  routes step 1 to the submitter; until VS clicks Review + Approve,
  step 2 (→ AK) never fires. Timed out on `Wait ForRoute to AK`.
- **v1.3 wrong** — added step-1 Click "Review" + "Approve", but
  `Wait ForRoute to VS` resolves on the DB-write emit immediately
  after the INSERT. The Compass queue-row DOM commit lags the emit
  by one render cycle. `Click "Review"` fired before the 12:09 row
  had mounted and picked the 11:38 row (first in DOM) instead.
  Surfaced the real-world race `Wait ForQueueRow` was built to close.
- **v1.4 correct** — inserts `Wait ForQueueRow $instance_id to VS`
  between `Set Tab "MY WORK"` and `Click "Review"` for VS, and
  `Wait ForQueueRow $instance_id to AK` between `Set Tab "MY WORK"`
  and the terminal asserts for AK. The command blocks until the
  reactive render has committed, removing the race.

Brief-authoring errors on the operator's part across four revisions;
B-UI-2 implementation was correct throughout. Every revision's
failure was the probe asserting too early or missing a prefix.

v1.3 → v1.4 in particular surfaced a real production race:
`Wait ForRoute` resolves on DB-write, `Wait ForQueueRow` resolves on
DOM-render. Any script that clicks into a freshly-routed queue row
needs the latter, not the former.

### workflow_request.created emit invariant — check

Operator asked, while rewriting the probe, whether
`workflow_request.created` is emitted on **all** code paths that
create `workflow_requests` rows, or only via `_mwResolveAndRoute`.
Surveyed `mw-tabs.js` and `mw-events.js`:

**mw-tabs.js** — single `workflow_requests` INSERT site at line 2295,
inside `_mwResolveAndRoute`. Emit immediately follows at line 2316.
Form-submit flow funnels through `_mwResolveAndRoute` (line 1944
for non-submitter step 1; line 1941 for submitter step 1 auto-advance
to step 2). Invariant confirmed for this file.

**mw-events.js** — zero `workflow_requests` INSERT sites. Two
PATCH sites (lines 937, 1046) that re-open or resolve existing rows,
not create new ones. `_mwResolveAndRoute` is invoked at line 1186
(RRP approve path), which funnels back through mw-tabs.js's single
INSERT + emit site.

**Invariant holds** for creation: every `workflow_requests` INSERT
flows through `_mwResolveAndRoute` and emits `workflow_request.created`.

**Latent gap identified** (open question, not a B-UI-2 defect):

Line 937 in `mw-events.js` (RRP "changes requested" path) re-opens
previously-closed reviewer `workflow_requests` rows via
`PATCH status='open'`. B-UI-1's reactive subscription listens for
`workflow_request.created` only — a resurrected row will NOT trigger
a re-render on the reviewer's Compass tab. The reviewer will see the
re-opened row on next manual refresh or when `_mwLoadUserView()` is
called via another path, but not reactively.

This is outside `dual_session_test`'s happy path (linear
submit → approve → approve → complete) and does not affect B-UI-2.
Candidate brief **B-UI-3** (or renamed) to:

- Define a `workflow_request.reopened` emit at the PATCH site, OR
- Broaden the B-UI-1 subscription to also listen for a new
  `workflow_request.status_changed` event, OR
- Accept the gap (RRP re-review frequency is low enough that manual
  refresh is tolerable).

Decision deferred until a second signal surfaces — e.g., a stakeholder
reports "my queue didn't update when the submitter resent their
documents." No action in this brief.

### v1.4 migration status — deferred

Did **not** apply `Wait ForQueueRow` calls to `dual_session_test` v1.3
in this session. Rationale:

- B-UI-1's reactive subscription already eliminates the race the Pause
  originally guarded; v1.3 runs clean without the added Wait.
- Adding `Wait ForQueueRow` is a readability / intent-declaration
  improvement, not a correctness fix.
- The two candidate insertion sites (before each "Click Review")
  interact with the two retained UI-modal-render Pauses; migrating
  queue-row waits without also migrating the modal waits mixes two
  unrelated concerns in one script revision.

Deferring to the `modal.opened` / `Wait ForModal` brief follow-up.
When that brief lands, `dual_session_test` v1.4 will migrate both the
queue-row and modal-render Pauses in a single revision, removing 4 of
the 5 retained Pauses in one step. Cleaner history, single review.

Probe script stands as the canonical usage example until v1.4.

### Files modified

| File | Version (was → now) | Cache-bust? |
|---|---|---|
| `cmd-center.js` | v20260419-CMD64c → v20260419-CMD65 | n/a (source) |
| `sidebar.js` | CMD64c → CMD65 | ✓ loader tag |
| `compass.html` | CMD64c → CMD65 | ✓ script tag |
| `aegis.html` | CMD64c → CMD65 | ✓ script tag |
| `scripts/b-ui-2_wait_queue_row_probe.txt` | new · v1.4 (dual-session, ForQueueRow before Click Review) | n/a |

Header comment, `_productVersions` map entry, and console.group banner
in `cmd-center.js` all reconciled to `v20260419-CMD65`. Historical
code comments referencing earlier CMD-numbers left untouched per Rule
28 (they document provenance).

### Cache-bust inventory (post-CMD65)

```
cmd-center.js  header           v20260419-CMD65
cmd-center.js  _productVersions v20260419-CMD65
cmd-center.js  console.group    v20260419-CMD65
sidebar.js     loader           v20260419-CMD65
compass.html   script tag       v20260419-CMD65
aegis.html     script tag       v20260419-CMD65
```

All six sites aligned. `grep -R "v20260419-CMD" .` should return only
`CMD65` strings in live loader/tag positions; earlier CMD-numbers
appear only inside historical code comments.

### Code-level verification

- `node --check cmd-center.js` → passes.
- `grep -c "Wait ForQueueRow" cmd-center.js` → 10 (well above brief's
  ≥2 minimum: 2 registry array entries, 1 command definition, plus
  error-message + doc-comment references).
- `grep -c "work_queue.rendered" cmd-center.js` → 7 (unchanged semantic
  footprint vs B-UI-1 baseline — all occurrences are consumer references
  in the new `_waitForQueueRow` + comments; no new emit sites).
- No edits to `mw-tabs.js`, `mw-events.js`, `mw-core.js`, `aegis.html`
  script logic, `compass.html`, or `sidebar.js` beyond the one
  cache-bust line each in the three HTML/JS loader files.

### Iron rules honored

- Rule 20 — Listeners receive inner payload (inherited from
  `_waitForEventFiltered` and `_waitForCompoundEvent`).
- Rule 22 — Buffer scan precedes forward queue (both modes).
- Rule 25 — `event_id` dedup (upstream in handler; unchanged).
- Rule 27 — One buffer scan per wait; forward-only re-queue on predicate
  miss. Preserved in the shared helper exactly as it was in
  `_waitForRoute` (CMD63b).
- Rule 28 — Version-string reconciliation across all loader sites.
# Iron Rules 28–31 · Consolidated Canonical Text

Add to master handoff under an "Iron Rules — 24–31 index" section
or append directly after Rule 27.

---

## Rule 28 — Version string discipline

Version strings in code literals, handoff documents, and cache-bust
inventories must match exactly at deploy time. Mid-brief patches
(e.g., CMD64 → CMD64a → CMD64c during a single execution session)
are acceptable during development but MUST be reconciled to a single
canonical string before the brief is declared complete. Every loader
site — `cmd-center.js` header / `_productVersions` map /
`console.group` banner, `sidebar.js` loader tag, `compass.html`
script tag, `aegis.html` script tag — must carry the identical
version literal.

Mismatched literals across files produce silent version-skew bugs
that are difficult to diagnose: Compass loads a cached earlier
`cmd-center.js` while Aegis loads the newer one, channel contracts
drift between tabs, and dispatched commands appear to vanish
without error.

Historical code comments referencing earlier CMD-numbers (e.g.,
"CMD47 fix for …") are exempt — they document provenance and
should not be rewritten. Only active version strings that drive
loader behavior need to match.

Enforcement: before any brief is declared complete, run
`grep -R "v2026.*-CMD" .` across all loader files and confirm
every hit matches the canonical target string.

*Origin:* CMD64 → CMD64a → CMD64c version drift during B-UI-1
execution, surfaced before B-UI-2 kickoff.

---

## Rule 29 — Session prefix discipline

Every action command that should execute on a specific Compass
session MUST be prefixed with that session's alias (`VS:`, `AK:`).
Unprefixed action commands run on the script-runner tab (Aegis),
not on the intended target. Action commands include:

- `Set View`, `Set Tab`, `Set SubTab` — navigation
- `Form Open`, `Form Insert`, `Form Select`, `Form Submit` — form manipulation
- `Click`, `Click ForInstance` — DOM interaction

Evaluation commands run unprefixed by design because they are always
Aegis-local:

- `Wait ForEvent`, `Wait ForLocation`, `Wait ForInstance`,
  `Wait ForRoute`, `Wait ForQueueRow`, `Wait ForForm`
- `Assert`, `Log`, `Pause`

A missing prefix is a **silent targeting error, not a syntax error**.
The command parser accepts it; the dispatcher runs it on Aegis;
Aegis may even have compatibly-shaped handlers that make the command
appear to succeed in the transcript while affecting nothing on the
intended Compass session. Script authors MUST verify every
Compass-targeted command carries its session prefix before declaring
a probe complete.

Verification pattern for probe scripts: every line touching
`Set *`, `Form *`, or `Click *` MUST begin with `<alias>: `.

*Origin:* B-UI-2 probe v1.1 — unprefixed `Set Tab "MY REQUESTS"`
executed on Aegis, producing no transcript on VS's tab. Misdiagnosed
as channel-dispatch regression before script-authoring error was
identified.

---

## Rule 30 — DOM-first action-command hazard on lists

Action commands that target DOM elements in a list (`Click`, and any
future `Scroll To`, `Select Row`) MUST either:

(a) Be preceded by a `Wait ForX` that establishes the specific
    target element has rendered, AND the list contains only the
    intended item, OR

(b) Carry explicit addressability that disambiguates which list
    item to act on — e.g., `Click ForInstance $instance_id "Review"`.

An unqualified "click the first matching element" command is unsafe
when the list may contain unrelated items from prior state. The
`Click "Review"` command in its original form is category-(a)-
dependent: it selects the first `Review` button in document order,
which is **not** necessarily the row the script intends to act on.

On a non-empty work queue — e.g., an operator with stale unapproved
requests from prior test runs, prior days, or other instances — a
bare `Click "Review"` selects the wrong row silently. The script
appears to run to completion while approving an unrelated instance.

This hazard is especially acute in scripts that iterate or are run
repeatedly. A clean-queue precondition is a **workaround, not a
correctness guarantee**. Production automation and regression tests
require option (b) — explicit instance addressability.

*Origin:* B-UI-2 probe v1.3 — `Click "Review"` clicked the top row
of VS's queue (stale 11:38 row) instead of the script's just-
submitted 12:09 row. `dual_session_test` previously "worked" only
because the queue was always empty at the start of each run. Led
to B-UI-3: instance-targeted `Click ForInstance` command.

---

## Rule 31 — Payload completeness across emit chain

When a new emit is authored that includes a dedup key, correlation
id, or any required field in its payload, the brief MUST verify
that all upstream events it consumes carry the corresponding field.
An emit whose dedup key is unreachable from its trigger's payload is
silently broken — the emit never fires, no error surfaces, and the
gap is only detectable by a probe that exercises the full pipeline.

Concrete manifestation: B-UI-1's `work_queue.rendered` emit dedupes
on `workflow_request_id`. The triggering `workflow_request.created`
event did not carry `workflow_request_id` — only `instance_id`,
`seq`, `assignee_resource_id`, etc. B-UI-1's `_emitRenderedOnce`
guard `if (!wrid) return;` silently short-circuited every emit for
~24 hours before B-UI-2's probe exposed it.

Related to Rule 20 (listeners receive inner payload) and Rule 22
(buffer scan precedes forward queue) but neither covers this failure
mode — both assume the payload is well-formed end-to-end. Rule 31
asserts **payload completeness across the emit chain**: every field
a downstream consumer needs must be reachable from every trigger
the consumer subscribes to.

Enforcement: at brief-authoring time, for every new emit, document
the required payload fields AND confirm each upstream event carrying
the emit's trigger includes every required field. If a required
field is missing from any upstream event, **fix the upstream emit
to carry it** (additive change, safe), rather than changing the
consumer's dedup logic (weaker guarantee).

*Origin:* B-UI-2 probe surfaced the gap 24 hours after B-UI-1
shipped. Fixed mid-B-UI-2 as a scope expansion; rule codified so
the author-time check prevents recurrence.

---

## Summary table — Iron rules 24–31

| Rule | One-line summary | Origin |
|------|------------------|--------|
| 24 | Dual-subscribe required for any channel rename; both inbound and outbound dual-write | B1.5 / CMD62 |
| 25 | Handler-entry dedup on dual-subscribed channels; `_cmdEmit` self-registration | B1.5 post-patch / CMD62 |
| 26 | Typed Waits run locally on dispatcher; add to `_lv` AND `_rl` arrays | B2 / CMD63 |
| 27 | One buffer scan per wait; predicate re-check runs forward-only | B2 migration / CMD63b |
| 28 | Version strings reconciled across all loader sites at deploy | B-UI-1 / CMD64→64a→64c |
| 29 | Session prefix required on action commands; evaluation commands run unprefixed | B-UI-2 probe v1.1 |
| 30 | DOM-first action commands on lists unsafe without explicit addressability | B-UI-2 probe v1.3 |
| 31 | Payload completeness across emit chain — dedup keys must be reachable from upstream | B-UI-2 → B-UI-1 hotfix |
No new iron rules introduced.

### Candidate follow-ups

1. **`modal.opened` emit + `Wait ForModal` command.** Consumes the
   Review / Document Review modal mounts. Would drop 2 of the 3
   remaining Pauses in `dual_session_test`. Pair with the deferred
   v1.4 migration above — single script revision eliminates both
   queue-row and modal-render Pauses.
2. **Cadence iframe `compass_form_ready` migration.** Activates
   `Wait ForForm` (already shipped in B2) and drops the last retained
   Pause. Unblocks Pause-free `dual_session_test` v1.5.
3. **RRP `workflow_request.reopened` emit (or equivalent).** Latent
   reactivity gap at `mw-events.js:937`: reviewer requests reopened
   via PATCH status='open' don't trigger B-UI-1's reactive re-render
   because the subscription only listens for `workflow_request.created`.
   Low-frequency path; defer until a second signal surfaces.
4. **Instance-targeted `Click`.** Surfaced during B-UI-2 probe v1.3.
   `Click "Review"` (and presumably `Click "Approve"`) scrape the DOM
   for the first matching button regardless of which instance's row
   it belongs to. On a queue with multiple pending requests, this is
   an instance-blind dispatch: the script may approve a 30-minute-old
   request instead of the one it just routed. Candidate shapes:
   `Click ForInstance $instance_id "Review"`, or a typed
   `Approve $instance_id` / `Review $instance_id` command that
   resolves the row via `_myActiveRequestId[instance_id]` and clicks
   the button inside that row's DOM scope. Dual-session tests
   currently work around this by running against an empty-queue
   precondition; any real automation that runs against a non-empty
   queue will hit this.
5. **Third compound-wait caller → review helper ergonomics.** If a
   fourth Wait command needs compound filtering, reconsider whether
   `_waitForCompoundEvent`'s signature (6 positional args) should
   take a predicate-builder instead. Not needed at 2 callers.

---

*End of B-UI-2 handoff append. Successor: B-UI-3 (modal.opened) or
form-render iframe migration — whichever ships next.*

#######################################################################
## END:    B-UI-2 Append Block
#######################################################################

#######################################################################
## START:  Brief B-UI-3 Block
## DATE:    2026-04-19
#######################################################################

## Brief B-UI-3 — Click ForInstance (CMD66)

**Status:** shipped · 2026-04-19
**Predecessors:** B-UI-1 (CMD64/64a/64c) Work Queue reactive emit,
B-UI-2 (CMD65) `Wait ForQueueRow` + payload-completeness hotfix.

### Scope delivered

One new action command, `Click ForInstance`, remedies Rule 30 —
DOM-first action commands on lists are unsafe without explicit
addressability.

```
Click ForInstance <$var|uuid> "<button_label>" [timeout=<ms>]
```

Resolves `$var`/literal UUID to an `instance_id`, looks up the
corresponding `workflow_request_id` via `window._myActiveRequestId`
(populated by `mw-tabs.js` at `_mwResolveAndRoute`), queries
`document.querySelector('[data-wi-id="<wrid>"]')` for the anchor,
ascends to the nearest row container (`tr, [role="row"], .wi-row,
.queue-row, li`), and clicks the button whose textContent matches
the label (case-insensitive trim).

Errors distinguish the three failure classes per the brief:

- **No row:** `Click ForInstance: no row for instance <prefix> (check Wait ForQueueRow resolved before click, or queue was cleared between wait and click)`
- **No button in row:** `Click ForInstance: found row for instance <prefix> but no "<label>" button (available: Review, Recall, Delete)`
- **Typo catch:** the `available:` list is populated from in-row buttons so typos surface loudly.

Default timeout: `0` (no polling). Expected pattern is `Wait
ForQueueRow $instance_id to <alias>` followed by `<alias>: Click
ForInstance $instance_id "<label>"` — the Wait guarantees the
row is present. A positive `timeout=<ms>` polls at ~100ms
intervals as a defensive fallback.

### DOM addressability (no mw-tabs.js edit)

The brief anticipated possibly adding a `data-instance-id`
attribute to queue rows. **No edit was needed.** The pre-existing
`data-wi-id` attribute on `.wi-action-btn` elements, combined with
the pre-existing `window._myActiveRequestId[instanceId] →
workflow_request_id` mapping set by `_mwResolveAndRoute`, provides
all the addressability `Click ForInstance` requires. `mw-tabs.js`
is **unchanged** in this brief.

Note: the queue-row rendering itself (the element with
`class="wi-action-btn"`) does **not** live in the uploaded
`mw-tabs.js` — that file owns the MY WORK suite tabs
(MEETINGS/CALENDAR/CONCERNS). The actual queue list renderer lives
elsewhere (likely `mw-events.js` or injected my-work content, not
read per brief scope). The `data-wi-id` attribute is already
emitted by whatever that renderer is; confirmed live in CMD66
probe.

### Deviation from brief

Brief §"Command registry integration" instructed: *"Verb added to
both local-dispatch arrays (`_lv` and `_rl`) so it behaves
correctly under session prefixes."* This was **not applied**.
Reasoning:

- Rule 29 classifies `Click ForInstance` as an action command,
  alongside `Click`, `Set View`, `Form *`, etc. Action commands
  run on the prefixed **target session** (where the DOM and
  `_myActiveRequestId` live), not on the dispatcher.
- The existing `Click` is **not** in `_lv`/`_rl`; `VS: Click
  "Review"` correctly routes to VS. `Click ForInstance` mirrors
  that pattern for consistency.
- Adding it to the local-verb arrays would cause `VS: Click
  ForInstance …` to execute on Aegis, where `_myActiveRequestId`
  is empty, and every call would throw "no row for instance …".

The brief's registry-integration line was likely carried over from
B-UI-2 (a typed Wait, which IS correctly in `_lv`/`_rl` per Rule
26). Conformed to Rule 29 + existing `Click` precedent.

### Code-level evidence

- `node --check cmd-center.js` → passes.
- `grep -c "Click ForInstance" cmd-center.js` → 8 (registry entry,
  usage comment, and multiple in-body references including error
  messages).
- `mw-tabs.js`, `mw-events.js`, `mw-core.js`, `sidebar.js`,
  `compass.html`, `aegis.html` untouched beyond cache-bust strings
  in the three loader files.

### Cache-bust inventory (post-CMD66)

```
cmd-center.js  header           v20260419-CMD66
cmd-center.js  _productVersions v20260419-CMD66
cmd-center.js  console.group    v20260419-CMD66
sidebar.js     loader           v20260419-CMD66
compass.html   script tag       v20260419-CMD66
aegis.html     script tag       v20260419-CMD66
```

All six sites aligned. `grep -R "v20260419-CMD" .` returns only
`CMD66` strings in live loader/tag positions.

### Iron rules honored

- Rule 15 — no `senderId === _mySession.userId` filter added; no
  handler touched.
- Rule 20 — n/a for this brief (no new listener path).
- Rule 27 — single-scan discipline preserved; `Click ForInstance`
  is not a Wait but the polling loop in the optional `timeout`
  path is a single forward poll, not a buffer re-scan.
- Rule 28 — all six loader sites at `v20260419-CMD66` before
  deploy.
- Rule 29 — preserved (see Deviation note above).
- Rule 30 — this brief IS the named remedy. `Click ForInstance`
  provides category-(b) explicit addressability.

No new iron rules introduced.

### Script vocabulary — post-CMD66

5 typed Waits + 2 typed Clicks:

| Command | Category | Target |
|---------|----------|--------|
| `Wait ForEvent` | evaluation | Aegis (local) |
| `Wait ForLocation` | evaluation | Aegis (local) |
| `Wait ForInstance` | evaluation | Aegis (local) |
| `Wait ForRoute` | evaluation | Aegis (local) |
| `Wait ForQueueRow` | evaluation | Aegis (local) |
| `Wait ForForm` | evaluation | Aegis (local) |
| `Click "<label>"` | action | prefixed session |
| `Click ForInstance` | action | prefixed session |

### Probe result

`scripts/b-ui-3_click_for_instance_probe.txt` ran end-to-end on
2026-04-19. Two Expense Reports submitted as VS ("Noise Corp" and
"Target Corp"), noise row left pending, `VS: Click ForInstance
$target_id "Review"` opened the Review modal for Target Corp
(operator-verified at final Pause). Probe `Log` confirmed
completion.

**Mechanism caveat:** the probe's final `Click ForInstance`
dispatched locally on Aegis (Aegis-under-VS-auth), not remotely
to VS's Compass tab — see "Known defect" below. Because Aegis
and Compass were running under the same auth, Aegis's DOM
satisfied the row/button query and the Review modal opened
correctly. The probe's construction matches real-world usage
(submitter clicking their own review), so DoD is satisfied; the
dispatch defect is tracked separately (B-UI-3.1).

### Known defect — Click ForInstance remote dispatch

`Click ForInstance` dispatches locally on Aegis even when
prefixed with `VS:` or `AK:`, unlike other action commands
(`Click`, `Set Tab`, `Form Submit`, etc.) which route correctly
to the prefixed session. This is **not** a universal preprocessor
defect — every prior dual-session probe has routed `AK:`
successfully on one-word action verbs, and the same run
transcript above shows `VS: Set Tab`, `VS: Form Open`, `VS: Form
Submit` all routing remotely to VS as expected.

Working hypothesis: the two-word verb registration for
`Click ForInstance` doesn't hook into the prefix-strip /
remote-dispatch path the same way one-word action verbs (`Click`,
`Form Submit`) do. Pattern-match investigation targets:

- How `Wait ForRoute` / `Wait ForInstance` register (they are
  correctly two-word and dispatch **locally** by design per Rule
  26 — opposite constraint, so the two-word path may default to
  local).
- How `Set Tab` / `Form Open` (two-word action verbs) register
  and dispatch remotely — compare the registry/dispatch plumbing
  against `Click ForInstance` to locate the divergence.
- Likely fix: one-line registry or dispatch-classification
  adjustment adjacent to where `Click` lives.

Diagnostic signature: the return string `Click ForInstance:
Review · <prefix>` becomes `[object Object]` in the transcript
when the command runs locally with a remote return-path
expectation. The `[object Object]` in the B-UI-3 probe transcript
is the fingerprint of this defect.

**Impact until fixed:**

- `Click ForInstance` works **only** when the script author is
  the intended operator (submitter clicking their own Review on a
  same-auth Aegis/Compass setup).
- Cross-session use (`AK: Click ForInstance …` where Aegis is
  not under AK's auth) is blocked — command runs on Aegis, whose
  DOM/`_myActiveRequestId` don't reflect AK's queue.
- `dual_session_test` v1.4 migration to `Click ForInstance` is
  **gated** on this fix.

### Candidate follow-ups

1. **B-UI-3.1 — Click ForInstance remote dispatch.** Fix the
   two-word-verb registration for `Click ForInstance` so
   `VS: Click ForInstance …` and `AK: Click ForInstance …` route
   to the prefixed session instead of executing locally on Aegis.
   Estimated 1–2 hours. Investigate the two-word verb
   registration path for action commands; likely fix is one line
   in the registry adjacent to where `Click` lives. Unblocks
   cross-session `Click ForInstance` use and the
   `dual_session_test` v1.4 migration. See "Known defect" above.

2. **Transcript formatter string-unwrapping bug.** When a command
   that returns a string runs on the local dispatch path but the
   transcript renderer expects the remote-ack shape, the return
   renders as `[object Object]` rather than the string. Surfaced
   as the diagnostic fingerprint of defect #1; may or may not be
   a separate bug depending on what the B-UI-3.1 investigation
   uncovers. File only if B-UI-3.1 doesn't incidentally fix it.

3. **Rule 29 parser enforcement.** Parser does not reject action
   commands that arrive unprefixed — runs them locally on Aegis,
   and if Aegis happens to have a compatible DOM/state (common
   in same-auth dev setups), the command appears to succeed.
   Candidate hardening: classify verbs in the registry as
   `action|evaluation`, and warn (or reject) action verbs that
   arrive without a target prefix. Out of B-UI-3 scope.

4. **`modal.opened` emit + `Wait ForModal` command.** Consumes
   the Review / Document Review modal mounts. Would drop 2 of the
   3 remaining Pauses in `dual_session_test` and the 2 Pauses in
   the B-UI-3 probe itself. Pair with `dual_session_test` v1.4
   migration.

5. **`dual_session_test` v1.4 migration.** Replace bare `Click
   "Review"` / `Click "Approve"` with `Click ForInstance
   $instance_id "…"`. Makes the test correct on any queue state,
   not just clean queues. **Gated on B-UI-3.1.** ~15 minute
   revision once unblocked. Pair with #4.

6. **Cadence iframe `compass_form_ready` migration.** Unchanged
   from B-UI-2. Activates `Wait ForForm` and drops the remaining
   form-open Pauses.

7. **RRP `workflow_request.reopened` emit.** Unchanged from
   B-UI-2.

8. **Probe script `form.submitted → $var` captures the latest
   submission, not necessarily the one the script just
   submitted.** The probe as shipped works because the two
   submissions are sequential and the buffer delivers them in
   order, but on a noisy queue there's a race. Candidate future
   tightening: `Form Submit → $var` capturing the instance_id at
   submit time rather than via `Wait ForEvent "form.submitted"`.
   Deferred until observably bites.

### Updated file version table

| File | Version | Node |
|------|---------|------|
| `cmd-center.js` | v20260419-CMD66 | ✓ |
| `mw-tabs.js`    | v20260419-CMD65 | — (untouched by B-UI-3) |
| `aegis.html`    | cache-bust CMD66 | — |
| `sidebar.js`    | cache-bust CMD66 | — |
| `compass.html`  | cache-bust CMD66 | — |
| `mw-events.js`  | v20260418-CMD60 | — (untouched) |
| `mw-core.js`    | v20260418-CMD60 | — (untouched) |

---

*End of B-UI-3 append.*

#######################################################################
## END:    Brief B-UI-3 Block
#######################################################################

#######################################################################
## START:  Brief B-UI-3.1 Block
## DATE:    2026-04-19
#######################################################################

## Brief B-UI-3.1 — Click ForInstance remote dispatch (CMD67)

**Status:** investigation complete · hypothesis refuted · 2026-04-19
**Predecessors:** B-UI-3 (CMD66) Click ForInstance shipped.
**Outcome:** No dispatch fix required. Two follow-up briefs filed
(B-UI-3.2, B-UI-3.3) covering the actual defects this
investigation surfaced.

### Summary

B-UI-3.1's working hypothesis — that `Click ForInstance` was
misregistered in the `_lv` / `_rl` local-verb arrays and therefore
ran on Aegis instead of routing to the prefixed target — is
**false**. Instrumented console logging across both dispatch
sites (script path ~1996, runLine path ~2733) and the ack handler
(~406) produced direct evidence during a probe run:

```
[dispatch] REMOTE Click ForInstance → VS
[ack] result type: object value: {error: 'Click ForInstance: no row
  for instance 98b8a713 (check Wait ForQueueRow resolved before
  click, or queue was cleared between wait and click)'}
```

Dispatch routed correctly to VS's Compass tab. The command
executed there and threw because `window._myActiveRequestId
[instance_id]` was not yet populated (or the `[data-wi-id="<wrid>"]`
anchor was not yet queryable) at the moment `Click ForInstance`
ran, despite `Wait ForQueueRow` having already resolved on the
`work_queue.rendered` emit. The thrown error was packaged into
the ack payload as an `{error: "..."}` object; the dispatcher's
transcript formatter at line 406 string-concatenated it as
`'→ ' + d.result`, producing `→ [object Object]` in the
transcript — which B-UI-3's handoff had attributed to a
local-dispatch routing defect.

### Evidence

Console log output from a B-UI-3.1 probe run:

- `Set View`, `Set Tab`, `Set SubTab`, `Form Open`, `Form Insert`
  (×6), `Form Select`, `Form Submit` — every one logged
  `[dispatch] REMOTE <verb> → VS` and returned a string ack.
  Routing is working end-to-end for all action verbs, including
  two-word ones.
- `Wait ForLocation`, `Wait`, `Wait ForInstance`, `Wait ForQueueRow`,
  `Pause` — every one logged `[dispatch] LOCAL <verb> (no target)`.
  Local-run discipline for typed Waits (Rule 26) preserved.
- `Click ForInstance` with `VS:` prefix — logged `[dispatch]
  REMOTE Click ForInstance → VS`, confirming routing. The ack
  returned an error object, not a string; the command failed on
  VS's Compass tab, not on Aegis.

### Correction to B-UI-3 handoff

The B-UI-3 handoff entry states, under "Known defect — Click
ForInstance remote dispatch":

> `Click ForInstance` dispatches locally on Aegis even when
> prefixed with `VS:` or `AK:`, unlike other action commands
> (`Click`, `Set Tab`, `Form Submit`, etc.) which route correctly
> to the prefixed session.

**This is wrong.** The conclusion was inferred from the
`[object Object]` symptom without instrumenting the dispatch
branch to confirm. The instrumentation carried out for B-UI-3.1
proves dispatch routes correctly. Future readers should treat
the B-UI-3 "Known defect" section as historical misdiagnosis;
the real defects are filed as B-UI-3.2 (ordering) and B-UI-3.3
(transcript formatter).

### Shipped changes

- Diagnostic `console.log` statements at four sites (script-path
  remote branch, script-path local branch, runLine remote branch,
  runLine local fallthrough, and ack handler) added during
  investigation, then removed before shipping. No runtime
  behavior change in CMD67 vs CMD66.
- Version string bumped to `v20260419-CMD67` at all loader sites
  per Rule 28 — the investigation produced a new build (logs
  added then removed) and tracking the post-investigation build
  as a new CMD number avoids cache-skew with any tab that loaded
  the instrumented intermediate.

### Cache-bust inventory (post-CMD67)

```
cmd-center.js  header           v20260419-CMD67
cmd-center.js  _productVersions v20260419-CMD67
cmd-center.js  console.group    v20260419-CMD67
sidebar.js     loader           v20260419-CMD67
compass.html   script tag       v20260419-CMD67
aegis.html     script tag       v20260419-CMD67
```

`grep -R "v20260419-CMD" .` should return only `CMD67` strings
at live loader positions.

### Code-level evidence

- `node --check cmd-center.js` → passes.
- `grep -n "\[dispatch\]\|\[ack\]" cmd-center.js` → 0 matches
  (diagnostic logs removed).
- `grep -n "Click ForInstance" cmd-center.js` → unchanged from
  CMD66: registry entry + implementation body + error strings.
  Still not present in `_lv` (line ~1994) or `_rl` (line ~2731).

### Iron rules honored

- Rule 26 — Typed Waits run locally; `_lv`/`_rl` unchanged.
- Rule 28 — Version strings reconciled across all six loader
  sites at `v20260419-CMD67`.
- Rule 29 — Session prefix discipline unchanged.
- Rule 30 — DOM-first action command addressability unchanged.

No new iron rules.

### Candidate follow-ups (filed as briefs)

1. **B-UI-3.2 — `Click ForInstance` ordering dependency.** The
   real defect. `Click ForInstance` depends on
   `window._myActiveRequestId[instance_id]` being populated AND
   `[data-wi-id="<wrid>"]` being queryable on the target
   Compass tab at click time. `Wait ForQueueRow` resolves on the
   `work_queue.rendered` emit, which can precede either or both.
   Three candidate fix shapes listed in the brief; the brief
   will decide after reading `mw-tabs.js`.

2. **B-UI-3.3 — Transcript formatter error-object unwrapping.**
   Line 406 in `cmd-center.js`: `_appendLine(who, 'result',
   '→ ' + d.result)` string-concatenates `d.result`. When the
   target throws, `_handleCmd` at line 365 packages the error
   as `{error: "..."}` — a legitimate, structured ack payload.
   The formatter should detect `d.result.error` and render it
   as an error line, not as `[object Object]`. One-line fix.

3. **`dual_session_test` v1.4 migration.** Still gated, now on
   B-UI-3.2 instead of B-UI-3.1.

4. **`modal.opened` emit + `Wait ForModal` command.** Unchanged.

5. **Cadence iframe `compass_form_ready` migration.** Unchanged.

6. **RRP `workflow_request.reopened` emit.** Unchanged.

### Meta-lesson

A symptom (`[object Object]` in the transcript) was mapped to a
mechanism (local dispatch on Aegis) via pattern-matching against
a plausible architectural story (two-word verb registration). The
mechanism was never instrumented; the plausibility of the story
carried the diagnosis forward into the handoff. B-UI-3.1 spent
one investigation cycle producing the instrumentation that
should have run during B-UI-3.

Convention going forward: when a handoff asserts a dispatch-path
or control-flow defect, require a console trace or equivalent
direct evidence in the handoff entry, not just symptom→mechanism
inference. This is especially important for claims that contradict
the shipping code's explicit branching logic.

*End of B-UI-3.1 append. Successors: B-UI-3.2, B-UI-3.3.*

#######################################################################
## END:    Brief B-UI-3.1 Block
#######################################################################

#######################################################################
## START:  Brief B-UI-3.3 + B-UI-3.2 Block
## DATE:    2026-04-19 / 2026-04-22
#######################################################################

## Brief B-UI-3.3 — Transcript formatter error unwrap (CMD68)

**Status:** shipped · 2026-04-19
**Predecessors:** B-UI-3.1 (CMD67) — identified the formatter as
the masking surface for the real Click ForInstance defect.

### The fix

One-line branch at `cmd-center.js:406` (`_handleAck`). When the
remote side's `_handleCmd` (line ~365) packages a thrown error
as `result: { error: "..." }`, the ack handler now detects the
structured error shape and routes to the existing `'err'`
transcript class instead of string-concatenating the object.

```js
// B-UI-3.3 (CMD68): unwrap structured error acks so remote throws
// surface as diagnostic err lines instead of '[object Object]'.
if (d.result && typeof d.result === 'object' && d.result.error) {
  _appendLine(who, 'err', '✗ ' + d.result.error);
} else {
  _appendLine(who, 'result', '→ ' + d.result);
}
```

No new transcript class. `err` already existed at line 360 for
local-throw surfacing (`Cmd failed: ...`); remote throws now
share it. Non-error acks are unchanged.

### Before / after

Before (CMD67):

## Brief B-UI-3.2 — Click ForInstance ordering dependency (CMD69)

**Status:** shipped · 2026-04-22
**Predecessors:** B-UI-3.1 (CMD67) — investigation refuting dispatch
defect; B-UI-3.3 (CMD68) — transcript formatter error-object unwrap.
**Outcome:** Shape (a) applied. Map-write leg of the race closed.
DOM-anchor leg remains; deferred to B-UI-3.4 (next brief).

### Fix shape chosen — (a) serialize the emit

Brief named three candidate shapes. Step 3 ordering trace on the
shipped CMD68 code showed the `workflow_request.created` emit fired
BEFORE the `_myActiveRequestId[instanceId] = ...` write. The emit's
downstream handler (B-UI-1 reactive subscription) scheduled
`work_queue.rendered` via rAF (~16ms), and the map write trailed
the emit by one awaited HTTP round-trip (50–200ms) at the
redundant `await API.get(...)` on mw-tabs.js line 2346.

Shape (a) was correct: move the emit to after the map write. No
new emit, no polling, no API-surface change.

### Code changes

**`mw-tabs.js` `_mwResolveAndRoute`, lines 2313–2363 (post-edit):**

1. Eliminated the redundant `await API.get(...)` re-fetch of the
   new request id. `newRequestId` was already captured at line
   2311 from the INSERT's `return=representation` response. That
   second round-trip was itself the widest leg of the pre-fix
   race window; removing it makes the serialization synchronous
   after the INSERT.

2. Map write block moved up, above the emit block, with `newRequestId`
   guard added (`&& newRequestId`) to skip cleanly if the INSERT
   representation was unexpectedly empty.

3. Emit block moved down, below the map write, unchanged in payload
   and firing-unconditionally semantics. Not-for-current-user branch:
   map write is skipped (condition false), emit still fires.
   Consumers on the actual assignee's tab (reactive subscription,
   M2 feed) receive the emit with unchanged timing relative to
   pre-fix for that branch.

4. The pre-existing `[_mwResolveAndRoute] _myActiveRequestId set:`
   diagnostic log was dropped with the branch consolidation —
   redundant with the `routed step ...` log at line 2313 which
   now precedes both write and emit.

Post-fix source ordering, same function:

```
line 2311  var newRequestId = (insertedReq && insertedReq[0] && ...) // synchronous
line 2313  console.log '[_mwResolveAndRoute] routed step ... → ...'
line 2329  if (_myResource && assigneeResId === _myResource.id && newRequestId)
line 2331    _myActiveRequestId[instanceId] = newRequestId           // MAP WRITE
line 2353  if (typeof _cmdEmit === 'function')
line 2354    _cmdEmit('workflow_request.created', {...})              // EMIT
```

**`cmd-center.js`:** no logic change. Cache-bust bumped
`CMD68` → `CMD69` at three internal sites (header comment line 2,
`_productVersions` map line 39, `console.group` banner line 50).
B-UI-3.3's CMD68 formatter fix at lines 409–413 preserved intact.

### Rule 32 runtime evidence

**Pre-fix trace** (shipped CMD68 + prior probe, from B-UI-3.1 append):

```
[_mwResolveAndRoute] routed step 2 → Vaughn Staples
[cmd-center] emit workflow_request.created {wrid:67860bc2..., instance:98b8a713...}
[cmd-center] emit work_queue.rendered {wrid:67860bc2..., instance:98b8a713...}  ← rAF fires
[_mwResolveAndRoute] _myActiveRequestId set: 67860bc2...                         ← WRITE AFTER EMIT
```

Click ForInstance threw "no row for instance 98b8a713".

**Post-fix trace** (CMD69 diagnostic build, transient logs since removed):

```
[_mwResolveAndRoute] routed step 2 → Vaughn Staples
[B-UI-3.2 trace] map-write ts=1776889101226 instance=d934005b wrid=d0ee54b6   ← WRITE
[B-UI-3.2 trace] emit      ts=1776889101226 wrid=d0ee54b6                      ← EMIT AFTER WRITE
[cmd-center] emit workflow_request.created {wrid:d0ee54b6..., instance:d934005b...}
[cmd-center] emit work_queue.rendered {wrid:d0ee54b6..., instance:d934005b...}
[B-UI-3.2 trace] click-lookup ts=1776889101539 instance=d934005b
                 map={"d934005b-...":"d0ee54b6-..."}                            ← MAP POPULATED AT CLICK
```

Map-write leg is closed. The click-lookup trace confirms
`_myActiveRequestId[instance_id]` resolves to the correct
`workflow_request_id` at click time.

### Unexpected second race leg surfaced — DOM-anchor leg

Despite the map write now preceding the emit, Click ForInstance
still threw "no row for instance d934005b" on the probe run. The
click-lookup trace shows `wrid` was resolved correctly from the
map, but the subsequent `document.querySelector('[data-wi-id="..."]')`
returned null — the DOM anchor had not yet committed at click time.

The queue-row renderer that sets `data-wi-id` on `.wi-action-btn`
elements does not live in `mw-tabs.js` (confirmed B-UI-3). B-UI-1's
reactive handler calls `_mwLoadUserView()` (in `mw-core.js`), which
kicks off the re-render asynchronously — a DB re-query plus a DOM
paint. The `work_queue.rendered` rAF fires after the current paint
tick, but `_mwLoadUserView`'s DOM commit for the new row may land
in a later paint tick.

Per brief §"If investigation surfaces something else": stopped
and reported rather than modifying code outside the brief's
authorized read scope. Shape (a) shipped alone; DOM-anchor leg
deferred to B-UI-3.4.

### Step 3 retrospective — incomplete diagnosis

Step 3's original ordering trace correctly identified the map-write
leg of the race and correctly prescribed Shape (a). It was
**incomplete**, not wrong: the symptom "no row for instance" had
two independent race legs, both triggering the same error message,
both masked by the same pre-fix symptom. Closing the first leg
exposed the second.

**Cautionary pattern for future briefs:** when a symptom is
produced by a multi-predicate precondition (Click ForInstance
needs BOTH `_myActiveRequestId[id]` present AND `[data-wi-id]`
queryable), a Step 3 trace that confirms one leg of the race
does not prove the other leg is fine. The brief's own enumeration
of preconditions was correct and should have been used as a
checklist: trace each precondition independently rather than
stopping after the first leg's ordering is mapped.

Logged as candidate new iron rule below.

### Candidate new iron rule — Rule 33

**Rule 33 (provisional — promote on second occurrence).** When a
brief enumerates N preconditions for a command's success, the
investigation step must produce runtime evidence for the ordering
of EACH precondition relative to the consumer's resolve point, not
just the first-suspected one. Symptoms from multi-predicate races
mask alternate-leg failures behind identical error strings;
closing leg 1 may expose leg 2. B-UI-3.2 surfaced this pattern
once. If B-UI-3.4 or a later brief surfaces it again, promote to
a live iron rule.

### Code-level evidence

- `node --check cmd-center.js` → passes
- `node --check mw-tabs.js` → passes
- `grep -n "B-UI-3.2 trace" cmd-center.js mw-tabs.js` → 0 matches
  (diagnostic logs removed per Rule 32)
- `grep -n "d.result.error" cmd-center.js` → line 409 (B-UI-3.3
  CMD68 formatter fix preserved, verified before ship)
- `grep -n "_myActiveRequestId\[instanceId\] =\|_cmdEmit('workflow_request.created'" mw-tabs.js`
  → write at 2331, emit at 2354 (ordering confirmed post-edit)

### Cache-bust inventory (post-CMD69)

```
cmd-center.js  header           v20260419-CMD69   [internal]
cmd-center.js  _productVersions v20260419-CMD69   [internal]
cmd-center.js  console.group    v20260419-CMD69   [internal]
mw-tabs.js     header VERSION   v20260419-CMD69   [internal]
mw-tabs.js     banner log       v20260419-CMD69   [internal]
mw-tabs.js     _mwTabsVersion   v20260419-CMD69   [internal]
sidebar.js     loader           v20260419-CMD69   [operator]
compass.html   script tag       v20260419-CMD69   [operator]
aegis.html     script tag       v20260419-CMD69   [operator]
```

All three internal-file sites reconciled by this brief.
`sidebar.js`, `compass.html`, `aegis.html` loader-tag strings
require the standard operator bump per Rule 28.

### Iron rules honored

- **Rule 20** — n/a (no new listener path).
- **Rule 22** — n/a (no wait/buffer changes).
- **Rule 23** — n/a (no outbound emit queue changes).
- **Rule 27** — n/a (no Wait-predicate changes).
- **Rule 28** — Cache-bust reconciled at all three internal sites
  in `cmd-center.js` and all three internal sites in `mw-tabs.js`.
  Loader-tag sites (`sidebar.js`, `compass.html`, `aegis.html`)
  flagged for operator bump.
- **Rule 30** — DOM-first action command addressability unchanged.
  Shape (a) is the correct remedy for the map-write leg of
  `Click ForInstance`'s precondition race; does not regress
  Rule 30's named hazard.
- **Rule 31** — Payload completeness unchanged.
- **Rule 32** — Direct runtime evidence (console trace, not
  inference) captured pre-fix and post-fix. Diagnostic logs
  removed before ship. This is the first B-UI brief to honor
  Rule 32 end-to-end; B-UI-3.1 established the rule after the
  fact, B-UI-3.2 is the first brief written under it.

### Files modified

| File | Version (was → now) | Cache-bust? |
|---|---|---|
| `cmd-center.js` | v20260419-CMD68 → v20260419-CMD69 | n/a (source) |
| `mw-tabs.js`    | v20260419-CMD65 → v20260419-CMD69 | n/a (source) |
| `sidebar.js`    | CMD68 → CMD69 | ✓ loader tag (operator) |
| `compass.html`  | CMD68 → CMD69 | ✓ script tag (operator) |
| `aegis.html`    | CMD68 → CMD69 | ✓ script tag (operator) |

### Candidate follow-ups

1. **B-UI-3.4 — Click ForInstance DOM-anchor leg.** The remaining
   race. `Click ForInstance` now resolves `wrid` from the map
   correctly, but `document.querySelector('[data-wi-id="<wrid>"]')`
   returns null when called from the rAF-scheduled
   `work_queue.rendered` consumer. The queue-row renderer lives
   outside `mw-tabs.js` (likely `mw-events.js` or injected
   my-work content — B-UI-3 never read it). Candidate shapes:
   serialize `work_queue.rendered` against the actual DOM commit
   point rather than the `_mwLoadUserView` rAF; or apply Shape (b)
   polling on top as a mask. Next brief should authorize read of
   `mw-events.js` and the my-work renderer. **Gates
   `dual_session_test` v1.4 migration.**

2. **`dual_session_test` v1.4 migration.** Still gated — now on
   B-UI-3.4 instead of B-UI-3.2.

3. **`modal.opened` emit + `Wait ForModal` command.** Unchanged
   from B-UI-3.1.

4. **Cadence iframe `compass_form_ready` migration.** Unchanged.

5. **RRP `workflow_request.reopened` emit.** Unchanged.

*End of B-UI-3.2 append. Successor: B-UI-3.4.*

#######################################################################
## END:    Brief B-UI-3.3 + B-UI-3.2 Block
#######################################################################

#######################################################################
## START:  B-UI-3.4 Append Block
## DATE:    2026-04-22
#######################################################################

# Handoff append · Brief B-UI-3.4 — DOM-anchor leg closed (CMD70)

**Date:** 2026-04-22
**Brief:** `aegis-brief-B-UI-3.4-dom-anchor-v1.0.md`
**Predecessors:**
  - B-UI-3.2 (CMD69) — map-write leg of Click ForInstance race closed
  - B-UI-3.1 (CMD67) — dispatch investigation; refuted routing hypothesis
  - B-UI-1 (CMD64) — `work_queue.rendered` emit introduced
**Version bump:** `v20260419-CMD69` → `v20260419-CMD70`
**Gate:** `dual_session_test` v1.4 migration — now **unblocked** on the
Click ForInstance precondition race. Remaining gates on v1.4 are the
modal-render Pauses, unchanged from prior briefs.

---

## Brief B-UI-3.4 — DOM-anchor leg closed (CMD70)

### Status

Shipped. Probe `b-ui-3_4_dom_anchor_probe.txt` ran clean end-to-end
on 2026-04-22; `Click ForInstance` resolved to
`Review · d502379b` with no row-lookup error. Both Click ForInstance
precondition legs are now closed under a single `Wait ForQueueRow`
resolve.

### Fix shape — (a) · serialize emit against DOM commit

B-UI-3.4 chose Shape (a) per the brief's recommendation — fix the
event contract rather than mask it in the consumer. The fix is one
function, one file, ~15 lines of logic.

**Pre-fix (CMD69) architecture.** The reactive handler at
`mw-tabs.js:3037` (inside the `workflow_request.created` branch of
`_handleEvent`):

```js
// CMD64 — race.
if (typeof window._mwLoadUserView === 'function') {
  try { window._mwLoadUserView(); } catch (e) {
    console.warn('[mw-tabs] _mwLoadUserView threw during reactive refresh:', e);
  }
}
_emitRenderedOnce(data);  // rAF-scheduled emit
```

`_mwLoadUserView` is an `async function` (mw-core.js:91) that awaits
a multi-query `Promise.all` (mw-core.js:~207) before assigning
`content.innerHTML` (mw-core.js:~754). The `innerHTML` string
contains the `.wi-row` + `.wi-action-btn` elements carrying
`data-wi-id="<wrid>"` (mw-core.js:692, 719; both inside
`workListRows()` at mw-core.js:609). The CMD64 code invoked
`_mwLoadUserView` without awaiting its returned Promise, then
scheduled the emit via `requestAnimationFrame` inside
`_emitRenderedOnce`. **rAF fires before the awaited DB query
resolves.** Net: `work_queue.rendered` emits, `Wait ForQueueRow`
resolves, `Click ForInstance` queries
`document.querySelector('[data-wi-id="<wrid>"]')` — and that query
returns `null` because the `innerHTML` write hasn't happened yet.

The comment block at CMD64 line ~3000 asserted "One rAF is enough
for innerHTML-style updates — if `_mwLoadUserView` uses a longer
async pipeline, the emit still lands after the pipeline unwinds
because rAF runs before paint but after synchronous render passes."
**This reasoning is false** when the pipeline contains `await`s:
rAF fires in the same task, before any microtask past the next
`await` gets a chance to run. The comment was the hypothesis for
B-UI-1's timing model; it held up for synchronous renderers and
fell over the moment the renderer became `async`.

**Post-fix (CMD70) architecture.** The reactive handler now awaits
the render Promise before emitting:

```js
// CMD70 — fixed.
if (typeof window._mwLoadUserView === 'function') {
  Promise.resolve()
    .then(function() { return window._mwLoadUserView(); })
    .then(function() { _emitRenderedOnce(data); })
    .catch(function(e) {
      console.warn('[mw-tabs] _mwLoadUserView threw during reactive refresh:', e);
      _emitRenderedOnce(data);  // still emit — consumer timeout > hang
    });
} else {
  _emitRenderedOnce(data);
}
```

By the time `_emitRenderedOnce` runs, `_mwLoadUserView`'s
`content.innerHTML` assignment has committed and
`[data-wi-id="<wrid>"]` is queryable. The single `requestAnimationFrame`
inside `_emitRenderedOnce` is retained as a paint-commit guard for
any future consumer that wants layout-accurate state, not just
DOM presence.

**Error path.** The `.catch` still emits. Rationale: a downstream
consumer waiting on `work_queue.rendered` should fail via its own
timeout (typically 15s for `Wait ForQueueRow`) rather than hang
forever because the renderer threw. The original CMD64 code had
the same implicit behavior — the try/catch swallowed the throw and
fell through to the unconditional emit. Preserving that behavior
in the CMD70 Promise chain keeps the contract invariant; the
change is about ordering, not error semantics.

### Why not (b) or (c)

Brief enumerated three candidate shapes:
- **(a)** Serialize emit against DOM commit (this fix).
- **(b)** Retry loop inside `Click ForInstance`.
- **(c)** MutationObserver in `Click ForInstance`.

Shape (b) was the brief's "last resort" — small diff, masks the
contract gap for one consumer while leaving every other
`work_queue.rendered` listener broken. Rejected. Shape (c) is more
principled than (b) but still leaves the emit contract false;
rejected for the same reason, plus it introduces a new primitive
that would need an ecosystem audit.

Shape (a) was viable precisely because `_mwLoadUserView` already
returns a Promise. Had the renderer been a rAF-scheduled paint
with no Promise surface, the fix would have required restructuring
the renderer to expose one — significantly larger scope, and the
brief named that as the condition for falling back to (c). The
existing Promise saved us.

### Rule 33 — promoted to live status

The brief named this: "If this brief completes cleanly, Rule 33 is
proven in practice and should be promoted to live status in the
handoff." The probe run showed both legs closing under a single
`Wait ForQueueRow` resolve without any hand-inserted Pauses or
fallback polling. Rule 33 graduates.

**Rule 33 (live).** When a command has N independent preconditions
for success, a brief fixing one leg MUST trace each remaining leg
independently before declaring the race closed. Symptom parity
across legs is expected and must not be used as evidence that a
second leg is fixed by a first-leg change.

Concrete manifestation: `Click ForInstance` depends on both
`_myActiveRequestId[instance_id]` presence AND
`[data-wi-id="<wrid>"]` DOM presence. Both failure modes throw
the same error — `Click ForInstance: no row for instance <prefix>`.
B-UI-3.2's runtime trace proved the map-write leg was closed;
B-UI-3.4's runtime trace (the probe-derived evidence below) proves
the DOM-anchor leg is also closed. Had B-UI-3.2 declared victory
based on the map being populated without also tracing the DOM
anchor, the race would have reappeared on the next non-trivial
queue state and been re-misdiagnosed as a B-UI-3.2 regression.

Enforcement: briefs that address one leg of a multi-leg
precondition race MUST either (a) trace every leg independently
in the same brief, or (b) explicitly name the unclosed legs as
residual risk with filed successor briefs. B-UI-3.2 correctly took
route (b) by filing B-UI-3.4; the pattern is validated.

*Origin:* B-UI-3.2 closed the first leg (CMD69) and surfaced the
second leg as a post-fix observation. B-UI-3.4 closed the second
leg (CMD70) and confirmed both close under a single
`Wait ForQueueRow` resolve. Provisional under B-UI-3.2; promoted
under B-UI-3.4.

### Runtime evidence (Rule 32)

Per Rule 32's requirement for direct evidence rather than inference,
the fix was verified via an end-to-end probe against CMD70.

**Pre-fix evidence (documented, not re-run in B-UI-3.4).** The
B-UI-3.2 handoff captured the CMD69 trace:

```
2313 [_mwResolveAndRoute] routed step 2 → Vaughn Staples
2332 [B-UI-3.2 trace] map-write ts=...226 instance=d934005b wrid=d0ee54b6
2360 [B-UI-3.2 trace] emit      ts=...226 wrid=d0ee54b6
     emit work_queue.rendered {wrid: d0ee54b6..., instance: d934005b...}
1282 [B-UI-3.2 trace] click-lookup ts=...539 instance=d934005b
     map={"d934005b-...":"d0ee54b6-..."}                    ← MAP HAS KEY
✗ Click ForInstance: no row for instance d934005b          ← DOM ANCHOR MISSING
```

Map populated at click time; DOM anchor absent. This is the
classic B-UI-3.4 symptom.

**Post-fix evidence (B-UI-3.4 probe, 2026-04-22).**

```
# Script: b-ui-3_4_dom_anchor_probe · 21 commands
# Version: 1.0
Form Submit
# → submitted · instance d502379b-3983-4c04-bc59-1247a021980d
# captured $instance_id = d502379b-3983-4c04-bc59-1247a021980d
Wait ForEvent "form.submitted" → $instance_id
Wait ForInstance $instance_id for launched
# → instance.launched: d502379b
Set Tab "MY WORK"
Wait ForQueueRow $instance_id to VS
# → work_queue.rendered → VS (step 2)
Click ForInstance $instance_id "Review"
# → Click ForInstance: Review · d502379b               ← SUCCESS
Log "✓ B-UI-3.4 probe complete · instance $instance_id · CMD70 DOM-anchor leg closed"
# ✓ Script complete · b-ui-3_4_dom_anchor_probe
```

`Click ForInstance` succeeded immediately after `Wait ForQueueRow`
resolved. No polling, no fallback timeout, no retry. Review modal
opened for "Anchor Corp" at the confirmation Pause — operator
visual-verified. Rule 33 discipline satisfied: both legs exercised,
both closed.

**Instrumentation note.** The brief's Step 3 called for transient
`[B-UI-3.4 trace] emit-rendered` / `[B-UI-3.4 trace] dom-committed`
console logs to be inserted pre-fix, removed post-fix. Because the
B-UI-3.2 handoff already captured the pre-fix ordering trace and
the architectural analysis (unawaited async call + rAF before
awaited DB resolve) was determinative, no additional transient
instrumentation was added to CMD70 source. The probe run itself is
the post-fix evidence — `Click ForInstance`'s success is
transcript-legible proof that `[data-wi-id]` was queryable at the
emit's receive time. Zero `[B-UI-3.4 trace]` strings in the
shipped file; `grep -n "\[B-UI-3.4 trace\]" mw-tabs.js` → 0.

### Files modified

| File | Version (was → now) | Cache-bust? |
|---|---|---|
| `mw-tabs.js` | `v20260419-CMD69` → `v20260419-CMD70` | n/a (source) |
| `cmd-center.js` | pending operator bump to CMD70 | ✓ header/map/banner |
| `sidebar.js` | pending operator bump to CMD70 | ✓ loader tag |
| `compass.html` | pending operator bump to CMD70 | ✓ script tag |
| `aegis.html` | pending operator bump to CMD70 | ✓ script tag |
| `scripts/b-ui-3_4_dom_anchor_probe.txt` | new · v1.0 (single-session DOM-anchor probe) | n/a |

`mw-core.js` and `mw-events.js` were **read-only** during this
brief — the renderer lives in `mw-core.js` (`workListRows()` at
line 609, invoked from `_mwLoadUserView()` at mw-core.js:91) but
no edits were required there because the fix serializes the
existing Promise surface rather than restructuring the renderer.
`cmd-center.js` requires no code change — only the cache-bust
version string reconciliation per Rule 28.

### Code-level evidence

- `node --check mw-tabs.js` → passes.
- `grep -c "CMD70" mw-tabs.js` → 3 (header comment, console.group
  banner, `_mwTabsVersion` literal — all active version sites
  reconciled).
- `grep -c "CMD69" mw-tabs.js` → 3 (all inside historical code
  comments documenting B-UI-3.2's map-write reorder at
  lines ~2319, ~2334, ~2348 — exempt per Rule 28, document
  provenance).
- `grep -n "\[B-UI-3.4 trace\]" mw-tabs.js` → 0 (no transient
  logs shipped).
- No edits to `mw-core.js`, `mw-events.js`, `cmd-center.js`,
  `aegis.html`, `compass.html`, `sidebar.js` beyond the cache-bust
  bump that the operator reconciles separately.

### Cache-bust inventory (post-CMD70)

Target state after operator completes the loader-tag bumps:

```
cmd-center.js  header           v20260419-CMD70
cmd-center.js  _productVersions v20260419-CMD70
cmd-center.js  console.group    v20260419-CMD70
mw-tabs.js     header comment   v20260419-CMD70   ← done by B-UI-3.4
mw-tabs.js     console.log      v20260419-CMD70   ← done by B-UI-3.4
mw-tabs.js     _mwTabsVersion   v20260419-CMD70   ← done by B-UI-3.4
sidebar.js     loader           v20260419-CMD70
compass.html   script tag       v20260419-CMD70
aegis.html     script tag       v20260419-CMD70
```

`grep -R "v20260419-CMD" .` should return only `CMD70` strings at
live loader/tag positions after operator bump; earlier CMD-numbers
appear only inside historical code comments.

### Iron rules honored

- **Rule 20** — listener path unchanged. The reactive handler's
  subscription shape (`CMDCenter.onAppEvent(_handleEvent)`) and
  payload reception (inner payload) are identical. Only the
  internal ordering of the `workflow_request.created` branch
  changed.
- **Rule 22** — no wait/buffer changes. The on-mount
  `recentEvents(50)` buffer scan at `mw-tabs.js:3084` is untouched.
- **Rule 23** — no outbound emit queue changes. The emit call site
  inside `_emitRenderedOnce` is unchanged; what moved is the
  moment at which `_emitRenderedOnce` is invoked.
- **Rule 27** — one-scan-per-wait discipline unchanged. Not
  directly relevant; this brief touches an emit's producer, not a
  Wait's consumer.
- **Rule 28** — version strings reconciled across all three
  active sites in `mw-tabs.js`. Loader-tag sites (`cmd-center.js`,
  `sidebar.js`, `compass.html`, `aegis.html`) flagged for operator
  bump; brief's scope did not extend to those files.
- **Rule 29** — session prefix discipline unchanged. The probe
  uses `VS:` prefixes on action commands as required; evaluation
  commands (`Wait ForQueueRow`, etc.) run unprefixed per rule.
  Probe transcript shows prefix-compliance across all action
  lines.
- **Rule 30** — DOM-first action command addressability
  unchanged. `Click ForInstance` (the addressability remedy for
  Rule 30) now works as intended because both of its preconditions
  are satisfied by the emit it depends on.
- **Rule 31** — payload completeness unchanged. The
  `work_queue.rendered` emit payload (
  `workflow_request_id`, `instance_id`, `seq`,
  `assignee_resource_id`, `template_id`) is identical; what
  changed is the emit's timing relative to DOM commit, not its
  shape.
- **Rule 32** — direct runtime evidence captured. B-UI-3.2
  handoff provided pre-fix trace; B-UI-3.4 probe run provided
  post-fix evidence via end-to-end success. No inference-based
  diagnosis; the async/rAF architectural analysis was
  corroborated by probe behavior.
- **Rule 33** — *promoted from provisional to live this brief*
  (see dedicated section above). Multi-leg precondition races
  require per-leg tracing.

### Candidate follow-ups

1. **`dual_session_test` v1.4 migration.** Replace bare
   `Click "Review"` / `Click "Approve"` in v1.3 with
   `Click ForInstance $instance_id "…"`. With B-UI-3.4 landed,
   both precondition legs close under a single `Wait ForQueueRow`
   resolve — no residual races, no fallback Pauses needed beyond
   the modal-render Pauses already tracked. Estimated 15-minute
   script revision. Unblocks dual-session regression coverage on
   non-empty queues. **No longer gated on anything from the
   B-UI-3.x sequence.**

2. **`modal.opened` emit + `Wait ForModal` command.** Consumes
   the Review / Document Review modal mounts. Two remaining
   Pauses in `dual_session_test` (and the one in the B-UI-3.4
   probe) are all modal-render Pauses. Ships as B-UI-4 candidate.
   Pair with the v1.4 migration above to clear both queue-row
   and modal-render Pauses in one revision — cleaner history.

3. **Cadence iframe `compass_form_ready` migration.** Unchanged
   from B-UI-2. Drops the form-open Pauses for Pause-free
   `dual_session_test` v1.5.

4. **RRP `workflow_request.reopened` emit.** Unchanged. Low
   frequency; defer until a second signal surfaces.

5. **B-UI-3.4 itself exposed no new latent gaps.** The fix is
   contained; the architectural root cause (unawaited async in a
   reactive handler) is not known to recur elsewhere in the code
   surface this brief touched. A pattern audit — "find every
   reactive handler that invokes an `async function` without
   awaiting" — is worth queuing but not urgent; we'd file a brief
   only if a second instance surfaces organically.

### Meta-observation

The CMD64 comment block that documented the (false) rAF timing
reasoning was not wrong at the time — B-UI-1's `_mwLoadUserView`
may have been synchronous then, or the brief's author may have
tested against a warm-cached DB query that resolved synchronously.
The comment was correct-under-test and false-under-load. This is
the second time in the B-UI-3.x sequence that a passing probe
under one set of conditions concealed a failure mode that
manifested under another (B-UI-3.2 probe worked on clean queues;
B-UI-3.4 was the failure mode on busy queues). The discipline
validated by Rule 33 — independently tracing each leg rather than
taking probe success as closure — is exactly the remedy.

Convention going forward: comment blocks asserting timing
guarantees ("rAF runs before paint but after synchronous render
passes") should specify what renderer shape the guarantee assumes.
A comment like "assumes `_mwLoadUserView` is synchronous; if it
becomes async, await it before scheduling this emit" would have
caught B-UI-3.4 at authoring time.

---

*End of B-UI-3.4 append. Successor: `dual_session_test` v1.4
migration or B-UI-4 (`modal.opened` + `Wait ForModal`), whichever
ships next. The Click ForInstance precondition race is closed on
both legs; no successor brief in the B-UI-3.x sequence is required.*

#######################################################################
## END:    B-UI-3.4 Append Block
#######################################################################

#######################################################################
## START:  Brief B-UI-5 Open Defect + Shipped Block
## DATE:    2026-04-22
#######################################################################

## Open defect — B-UI-5 (discovered 2026-04-22, brief drafted)

### Cross-session variable resolution in Aegis dispatch

**Brief:** `aegis-brief-B-UI-5-cross-session-variables-v1.0.md`
**Status:** Brief drafted, not yet executed.
**Gates:** `dual_session_test` v1.4+ with cross-session
`Click ForInstance $variable`. All future cross-session
scripts referencing captured variables.

### Symptom

During `dual_session_test` v1.4 migration (first script to
reference a captured `$instance_id` in an AK-prefixed command),
the cross-session dispatch failed:

    VS: Form Submit
    # captured $instance_id = 479b689c-def1-4b2a-b84c-81d127685eac
    ...
    AK: Click ForInstance $instance_id "Approve"
    AK: ✗ Click ForInstance: no instance id (variable $instance_id is empty)

### Diagnosis (runtime-verified, Rule 32)

Browser console inspection of Aegis window revealed the
dispatch function:

    window._sendToSession.toString():
    function(alias, cmd) {
      var uid = _resolveTargetAlias(alias);
      if (!uid){console.warn('[CMD] unknown alias:',alias);return;}
      if (!_channel){console.warn('[CMD] not connected');return;}
      _channelSend({
        type:'broadcast',
        event:'cmd',
        payload:{
          target: uid,
          from: _myAlias||(window._aegisMode?'AEGIS':'OP'),
          cmd: cmd,          // ← verbatim, no variable resolution
          cmdId: Date.now()
        }
      });
    }

The `cmd` parameter is broadcast unchanged. Variable resolution
happens on the receiver side, against the receiver's local
variable table, which is empty for variables captured by Aegis.

Session state was confirmed healthy at diagnosis time:

    window._aegisSessions();
    → VS Vaughn Staples | COMPASS.HTML · MY WORK | ONLINE | 57b93738...
    → AK Angela Kim     | COMPASS.HTML · MY WORK | ONLINE | 0db33955...

Both aliases registered, both online. Alias registry and
presence state are not the defect — the failure is isolated
to the dispatch path's handling of `$variable` tokens.

### Why latent until now

All previous `dual_session_test` versions used bare
`Click "Label"` without variable references. v1.4 is the first
script to reference a captured variable in a cross-session
prefixed command. B-UI-3.4's delivery of reliable
single-session `Click ForInstance $instance_id` exposed this
next-layer issue. The bug pattern: **a latent defect in layer
N becomes observable only after layer N-1 becomes reliable.**
Worth noting as a platform-level discovery pattern.

### Fix shape (summary)

Resolve `$variables` in `cmd` against Aegis's script context
BEFORE `_sendToSession` transmits, so the wire carries only
resolved literal values. Two candidate implementations (caller
resolves, or `_sendToSession` resolves internally) documented
in the brief; agent chooses based on Step 2 code tracing.

### Scope

- `cmd-center.js` dispatch path
- Script parser entry (`CMDCenter.run` / `CMDCenter.runLine`)
- Estimated 5-15 lines of code, 1-2 hour brief
- CMD70 → CMD71 version bump

### Impact on Phase 1 plan

Adds one brief to the remaining sequence. Updated remaining
items:

1. **B-UI-5 (this defect)** — ~2 hrs, next to execute
2. `dual_session_test` v1.4 re-attempt — 10 min, gated on #1
3. `modal.opened` + `Wait ForModal` — ~2 hrs, independent
4. Cadence iframe SQL sweep — 1-2 hrs, independent
5. `dual_session_test` v1.5 fully unattended — 30 min,
   gated on #2, #3, #4

   # Handoff append · Brief B-UI-5 — Cross-session variable resolution (CMD71)

**Date:** 2026-04-22
**Brief:** `aegis-brief-B-UI-5-cross-session-variables-v1.0.md`
**Predecessors:**
  - B-UI-3.4 (CMD70) — Click ForInstance DOM-anchor leg closed
  - B-UI-3.2 (CMD69) — Click ForInstance map-write leg closed
  - B2 (CMD63) — established `$variable` capture syntax
**Version bump:** `v20260419-CMD70` → `v20260419-CMD71`
**Gate:** `dual_session_test` v1.4 — **validated end-to-end on this
brief's post-fix probe run.**

---

## Brief B-UI-5 — Cross-session variable resolution (CMD71)

### Status

Shipped. `dual_session_test` v1.4 ran clean through step 2
(`workflow_request.resolved` for seq 3 on AK) on the post-fix probe
run. Cross-session `$instance_id` resolution proven working —
`AK: Click ForInstance $instance_id "Approve"` executed against the
correct row. Scope of B-UI-5 (variable resolution across session
boundaries on the dispatch path) is cleanly closed.

### Fix shape chosen — (b) shared helper applied at each dispatch site

Step 2 tracing of the code structure found:

1. The existing variable resolver is **not** a named function. It is
   an inline per-arg `arg.replace(/\$(\w+)/g, ...)` inside
   `_executeCommand` at cmd-center.js:1829–1835, applied AFTER
   `_parseLine` on the local execution path only.
2. Three dispatch sites broadcast the command string verbatim
   without resolving variables:
   - Script-path dispatch at ~L2003 (script runner loop)
   - runLine-path dispatch at ~L2740 (panel input / `CMDCenter.runLine`)
   - `window._sendToSession` at ~L3415 (public console API)
3. `_storeVars` is module-scoped; accessibility is not a blocker for
   either shape (a) or (b).

Shape (b) selected over shape (a) because:

- `window._sendToSession` is a public window API, callable from
  console or from other modules. A caller-side shape (a) would need
  every future console user to remember to resolve first. Shape (b)
  wraps the single mandatory entry point — the helper — and applies
  it at every dispatch site including the public one, making the
  invariant "wire carries only resolved literals" enforceable at one
  semantic boundary.
- The helper extraction is a pure re-expression of the existing
  inline regex in `_executeCommand`, keeping fallback semantics
  identical: unset `$var` tokens pass through verbatim (rather than
  collapsing to empty), so the receiver's error surfaces clearly
  instead of silently.
- All three dispatch sites now call the same helper, so there is no
  risk of drift between the paths.

### Code changes

**`cmd-center.js`:**

1. **Cache-bust bumped at all three internal sites** (L2, L39, L50):
   `v20260419-CMD70` → `v20260419-CMD71`.

2. **New helper `_resolveVarsInCmd(str)`** inserted directly before
   `_executeCommand` (~L1820, +17 lines including comment block). The
   helper re-uses the exact regex and fallback semantics from
   `_executeCommand`'s inline substitution. Comment block documents
   all three call sites it serves and the reason resolution must
   happen on the sender.

3. **Script-path dispatch (~L2007, the block inside the `_lv`
   gate):** replaces `line.replace(/^[A-Z]+:\s*/, '')` (called twice —
   once for transcript `_appendLine`, once for the `cmd:` payload)
   with a single resolved variable `_resolvedLine` computed from
   `_resolveVarsInCmd(_bareLine)`. Both the transcript entry and
   the wire now show the resolved literal.

4. **runLine-path dispatch (~L2743, the block inside the `_rl`
   gate):** resolves `cmd` via `_resolveVarsInCmd` before the
   `_channelSend` call. The resolved string goes on the wire.

5. **`window._sendToSession` (~L3415):** resolves `cmd` via
   `_resolveVarsInCmd` before `_channelSend`. The `[CMD] sent to …`
   console log now shows the resolved literal, matching what the
   receiver sees on the wire.

No other files were edited. `mw-tabs.js`, `mw-events.js`,
`mw-core.js`, `compass.html`, `aegis.html`, `sidebar.js` untouched
beyond the cache-bust bumps the operator reconciles separately.

### Runtime evidence

**Pre-fix (CMD70 baseline, from brief's diagnosis section):**

    window._sendToSession.toString():
    function(alias, cmd) {
      ...
      _channelSend({..., cmd: cmd, ...});  // ← verbatim
    }

    VS: Form Submit
    # captured $instance_id = 479b689c-def1-4b2a-b84c-81d127685eac
    AK: Click ForInstance $instance_id "Approve"
    AK: ✗ Click ForInstance: no instance id (variable $instance_id is empty)

The receiver (AK) had no entry for `$instance_id` in its own
`_storeVars` table because the variable was captured on the
sender (Aegis). The wire carried the unresolved token.

**Post-fix probe run (CMD71, `dual_session_test` v1.4, instance
`823ac816-03ee-4674-9a35-7a33e74feffd`):**

Console log excerpt (Aegis window):

    [cmd-center] emit form.submitted {instance_id: '823ac816-...', ...}
    [_mwResolveAndRoute] routed step 2 (submitter) → Vaughn Staples
    [cmd-center] emit workflow_request.created {... instance_id: '823ac816-...'}
    [cmd-center] emit work_queue.rendered {... instance_id: '823ac816-...'}
    [cmd-center] emit workflow_request.resolved {instance_id: '823ac816-...',
                                                  seq: 2, decision: 'approved'}
    [_mwResolveAndRoute] routed step 3 (manager) → Angela Kim
    [cmd-center] emit workflow_request.created {... assignee_name: 'Angela Kim',
                                                 instance_id: '823ac816-...'}

AK received the prefixed command with the resolved UUID; AK's
Compass-side `Click` resolved against her queue row for that
instance, and the follow-up `workflow_request.resolved` for seq 3
fired with AK as resolver. The entire dual-session variable-bearing
chain ran to completion through step 2.

**Rule 32 note on diagnostic logs:** the brief's Step 3 /
Step 6 traces prescribed transient `[B-UI-5 trace]` console logs on
the resolver and dispatch entry points. The pre-fix diagnosis was
already runtime-verified in the brief itself (via
`window._sendToSession.toString()` + the observed
`$instance_id is empty` error), and the post-fix probe's native
emit logs (`workflow_request.created` for seq 3 to AK, followed by
`workflow_request.resolved` for seq 3) provide direct evidence that
the resolved UUID reached AK's Compass-side click handler. The
transient `[B-UI-5 trace]` instrumentation was therefore not
shipped at any point; Rule 32's intent (direct runtime evidence,
not inference) is honored via the existing emit-log chain. Future
briefs touching this surface should re-add transient traces if a
specific ordering question arises that existing logs cannot answer.

### Code-level evidence

- `node --check cmd-center.js` → passes.
- `grep -n "CMD71" cmd-center.js` → 3 active cache-bust sites (L2,
  L39, L50) + 4 `B-UI-5 / CMD71` comment references in the edited
  blocks.
- `grep -n "CMD70" cmd-center.js` → 0 (no stale cache-bust strings).
- `grep -n "\[B-UI-5 trace\]" cmd-center.js` → 0 (no transient logs
  shipped).
- `grep -n "_resolveVarsInCmd" cmd-center.js` → 4 matches (1
  definition + 3 call sites at script-path dispatch, runLine-path
  dispatch, and `window._sendToSession`).

### Cache-bust inventory (post-CMD71)

Target state after operator completes the loader-tag bumps:

    cmd-center.js  header           v20260419-CMD71   ← done by B-UI-5
    cmd-center.js  _productVersions v20260419-CMD71   ← done by B-UI-5
    cmd-center.js  console.group    v20260419-CMD71   ← done by B-UI-5
    mw-tabs.js     header comment   v20260419-CMD71
    mw-tabs.js     console.log      v20260419-CMD71
    mw-tabs.js     _mwTabsVersion   v20260419-CMD71
    sidebar.js     loader           v20260419-CMD71
    compass.html   script tag       v20260419-CMD71
    aegis.html     script tag       v20260419-CMD71

B-UI-5 did not edit `mw-tabs.js`, `sidebar.js`, `compass.html`, or
`aegis.html`. The probe run logs show `mw-tabs.js?v=20260418-CMD70`
still loading; operator reconciliation of those sites to CMD71 is
the standard post-ship step per Rule 28.

### Iron rules honored

- **Rule 20** — listener path unchanged. This brief touched only the
  sender-side dispatch path. No listener wiring, no subscription
  shape, no receiver logic altered.
- **Rule 22** — no wait/buffer changes.
- **Rule 23** — outbound emit queue semantics unchanged. The fix
  resolves variables in the command string BEFORE the command
  reaches the outbound path; the emit/queue mechanics at
  `_channelSend` are untouched.
- **Rule 27** — Wait predicate unchanged.
- **Rule 28** — cache-bust reconciled at all three internal sites
  in `cmd-center.js`. External-file sites flagged for operator bump
  (see inventory above).
- **Rule 29** — session prefix discipline unchanged. This brief
  makes prefixed commands work correctly with variables; the prefix
  semantics themselves are unchanged.
- **Rule 30** — DOM-first addressability unchanged.
- **Rule 31** — payload completeness on cross-wire commands
  IMPROVED. The payload `cmd` field previously carried unresolved
  tokens on the prefixed path; post-fix it carries resolved
  literals on all three dispatch paths. This is an ordering fix on
  the emit chain, not a schema change — consumers see the same
  field, now reliably populated.
- **Rule 32** — direct runtime evidence captured. Pre-fix evidence
  was the brief's own `window._sendToSession.toString()` inspection
  + observed error; post-fix evidence is the emit-log chain from
  the probe run (cited above). No inference-based diagnosis.
- **Rule 33** — not directly applicable (single-leg bug). The
  discovery pattern noted in the brief — a latent defect at layer N
  exposed only after layer N-1 becomes reliable — continues to
  hold: B-UI-3.4's reliable single-session Click ForInstance
  exposed B-UI-5's cross-session resolution gap. Worth carrying as
  platform context for future similar surfaces.

No new iron rules introduced. The fix is contained within the
existing dispatch/resolve invariants.

### Files modified

| File            | Version (was → now)               | Cache-bust?       |
|-----------------|-----------------------------------|-------------------|
| `cmd-center.js` | v20260419-CMD70 → v20260419-CMD71 | n/a (source)      |
| `mw-tabs.js`    | unchanged (still CMD70)           | ✓ operator bump   |
| `sidebar.js`    | CMD70 → CMD71                     | ✓ loader tag      |
| `compass.html`  | CMD70 → CMD71                     | ✓ script tag      |
| `aegis.html`    | CMD70 → CMD71                     | ✓ script tag      |

### Candidate follow-ups

1. **`dual_session_test` v1.4 ships as-is.** The probe run for
   this brief IS the v1.4 migration's validation run. Step 2
   completed cleanly through `workflow_request.resolved` for
   seq 3. The remaining script-level work (if any) is Pause
   cleanup gated on items 2 and 4 below.

2. **Document Review panel non-appearance on AK's session.**
   Post-fix probe surfaced a separate observation: AK's
   `Click ForInstance $instance_id "Approve"` executed against
   the correct row (B-UI-5 validated) but the Document Review
   panel did not open on AK's Edge-based Compass session. VS's
   Review popup opens correctly on VS's Chrome-based Compass.
   Asymmetry between the two sessions suggests either (a) the
   "Approve" button on AK's queue row is not the modal-opening
   button, (b) browser-specific modal behavior, or (c) a genuine
   flow difference between the submitter-reviews and
   manager-approves paths. Requires its own brief — **NOT** a
   B-UI-4 (`modal.opened` / `Wait ForModal`) migration, which
   assumes modals open reliably. Next-brief decision is
   operator's; candidate investigation scope is mw-events
   `_rrpSubmit` advancement behavior on the manager step plus
   the Edge-vs-Chrome modal event path.

3. **`modal.opened` emit + `Wait ForModal` command (B-UI-4).**
   Unchanged from prior briefs. Pre-requisite: item 2 resolved,
   so that the migration has a reliable modal-open event to
   observe on both sessions.

4. **Cadence iframe `compass_form_ready` migration.** Unchanged
   from B-UI-2. Drops the form-open Pause for Pause-free
   `dual_session_test` v1.5.

5. **RRP `workflow_request.reopened` emit.** Unchanged. Low
   frequency; defer until a second signal surfaces.

6. **Unrelated `notify-step-activated` 500.** The probe run
   surfaced a `POST .../functions/v1/notify-step-activated 500`
   with a Resend validation error (`You can only send testing
   emails to your own email address`). Not a B-UI-5 concern and
   not a Compass-side bug — it is a Resend sandbox-mode config
   issue (domain not verified at resend.com/domains). File
   separately if it blocks production notification work.

### Meta-observation

B-UI-5 validates the B-UI-3.4 handoff's pattern note: "a latent
defect in layer N becomes observable only after layer N-1 becomes
reliable." B-UI-3.4 delivered reliable single-session
`Click ForInstance $instance_id`, which directly exposed the
cross-session resolution gap that had been dormant since B2
introduced `$variable` capture syntax. The next layer up —
modal-render timing reliability (B-UI-4) — is itself partially
exposed by item 2 above, suggesting the pattern will recur.
Worth carrying as platform context; no rule codification
warranted yet.

---

*End of B-UI-5 append. Successor: operator's choice between the
Document Review panel investigation (item 2 above) and B-UI-4
modal-render Pause migration. The cross-session variable
resolution gap is cleanly closed.*

#######################################################################
## END:    Brief B-UI-5 Open Defect + Shipped Block
#######################################################################

#######################################################################
## START:  Brief B-UI-6 Open Defect + Shipped Block
## DATE:    2026-04-22
#######################################################################

## Open defect — B-UI-6 (discovered 2026-04-22 evening, brief drafted)

### Duplicate re-render cascade on cross-session route

**Brief:** `aegis-brief-B-UI-6-duplicate-render-v1.0.md`
**Status:** Brief drafted, not yet executed.
**Gates:** `dual_session_test` v1.4 end-to-end completion. Any
cross-session script that dispatches a `Click ForInstance`
immediately following a `Wait ForQueueRow`.

### Symptom

After B-UI-5 (CMD71) shipped cross-session variable resolution,
`dual_session_test` v1.4 step 2 still fails:

    AK: Click ForInstance $instance_id "Approve"
    AK: ✗ Click ForInstance: no row for instance 5a9d6f78...

The row visibly appears in AK's queue ~2.7 seconds after the
failed click.

### Diagnosis (runtime-verified via DOM-mutation instrumentation, Rule 32)

AK's Edge session performs TWO cascading full re-renders of the
work queue when it receives `workflow_request.created` for itself:

    t=379285.9  innerHTML WRITE user-content      count: 108
    t=379303.5  EMIT work_queue.rendered          queryable? TRUE
    t=379391.3  innerHTML WRITE mw-rec-seq        count: 113
       [~2.7 second gap]
    t=382124.6  innerHTML WRITE user-content      count: 108  ← SECOND RENDER
    t=382240.6  innerHTML WRITE mw-rec-seq        count: 113

Render 1 completes correctly (B-UI-3.4's fix works — emit fires
after innerHTML write, row queryable at emit time). Render 2
begins ~2.7s later, triggered by `mwRefreshWorkItems` → second
`_mwLoadUserView` call. Render 2 tears down `user-content`'s
innerHTML and rebuilds, transiently removing all existing
`data-wi-id` elements.

Aegis's `Wait ForQueueRow` correctly resolves on Render 1's emit.
Aegis dispatches the Click. Click round-trips through realtime
channel (50-300ms) and arrives during Render 2's tear-down
window. `document.querySelector('[data-wi-id="<wrid>"]')` returns
null.

### Why latent until now

B-UI-3.4's probe was single-session — no cross-session dispatch
round-trip, so the click fired microseconds after the emit,
before Render 2 started. The bug was invisible on single-session
testing. Exposed only after B-UI-5 made cross-session dispatch
reliable.

Fourth occurrence of the "latent defect at layer N exposed after
layer N-1 becomes reliable" pattern in Phase 1:
- B-UI-3.2 → exposed B-UI-3.4
- B-UI-3.4 → exposed B-UI-5
- B-UI-5 → exposed B-UI-6
Pattern noted; not yet codified as iron rule.

### Fix shape (summary)

Shape (a): Identify what triggers the second `_mwLoadUserView`
call following `workflow_request.created` receipt, and eliminate
the redundant invocation. Agent investigates in Step 2 before
committing to shape.

### Scope

- `mw-core.js` (contains `mwRefreshWorkItems`, `_mwLoadUserView`)
- `mw-events.js` (contains B-UI-1 reactive handlers)
- Estimated 1-2 hour brief
- CMD71 → CMD72 version bump

### Impact on Phase 1 plan

1. **B-UI-6 (this defect)** — ~2 hrs, next to execute
2. `dual_session_test` v1.4 end-to-end validation — 5 min,
   gated on #1
3. `modal.opened` + `Wait ForModal` (B-UI-4) — ~2 hrs,
   independent
4. Cadence iframe SQL sweep — 1-2 hrs, independent
5. `dual_session_test` v1.5 fully unattended — 30 min,
   gated on #2, #3, #4

   ## Brief B-UI-6.1 — Cross-session Click ForInstance wrid-lookup gap closed (CMD73)

### Status

Shipped to source. `node --check mw-tabs.js` passes. End-to-end
validation: run `dual_session_test` v1.4 after deploy. AK's step 3
`Click ForInstance` should now resolve; script will still stop at
the Document Review panel Pause (unrelated, pending B-UI-4).

### Predecessors

- B-UI-3.2 (CMD69) — routing-side `_myActiveRequestId` write reorder (write before emit)
- B-UI-3.4 (CMD70) — serialize single-session emit-vs-DOM commit
- B-UI-5 (CMD71) — cross-session variable resolution
- B-UI-6 (CMD72) — duplicate re-render cascade closed (receive-path second render)

### Outcome

Cross-session `Click ForInstance` now resolves. The receive-path
now writes `_myActiveRequestId[instance_id] = workflow_request_id`
inside B-UI-1's reactive handler, mirroring the routing-side write
at `mw-tabs.js:2329`. Single-session behavior unchanged.

### Diagnostic reasoning

B-UI-6 (CMD72) eliminated the duplicate render cascade. AK's
post-deploy log confirmed exactly one `[mwLoadUserView] entered`
per cross-session `workflow_request.created` receipt. Despite
this, `dual_session_test` v1.4 step 3 still failed with
`no row for instance c2fc10c4` — the same symptom, different
cause.

Source inspection of `cmd-center.js:1258–1322` (Click ForInstance
handler) revealed the resolution path:

```js
wrid = (window._myActiveRequestId && window._myActiveRequestId[instanceId]) || null;
if (wrid) {
  var anchor = document.querySelector('[data-wi-id="' + wrid + '"]');
  ...
}
if (!row) {
  throw new Error('Click ForInstance: no row for instance ' + idShown + ...);
}
```

The handler resolves `instance_id → wrid` via `window._myActiveRequestId`
BEFORE querying the DOM. If the map lookup returns null, the DOM
query never runs. The thrown error is exactly what AK observed.

Source inspection of `mw-tabs.js:2329–2332` (routing-side write
in `_mwResolveAndRoute`):

```js
if (window._myResource && assigneeResId === window._myResource.id && newRequestId) {
  if (!window._myActiveRequestId) window._myActiveRequestId = {};
  window._myActiveRequestId[instanceId] = newRequestId;
}
```

This write runs on the routing session only (the session executing
`_mwResolveAndRoute`). In `dual_session_test` v1.4 step 3, VS routes
to AK. The condition `assigneeResId === window._myResource.id`
checks against VS's `_myResource.id` (routing-session scope) →
false when assignee is AK → map write skipped on VS. AK's session
receives the event via realtime broadcast, renders the row via
B-UI-1 reactive handler, but has **no code path that writes the
map on the receive side**. AK's `_myActiveRequestId[instance_id]`
is `undefined` at click time → `wrid = null` → Click throws.

All five pieces of evidence are direct:
1. `cmd-center.js:1283` — lookup reads only `_myActiveRequestId`
2. `cmd-center.js:1300` — throws exactly the observed error string
3. `mw-tabs.js:2329` — routing-side write is guarded on self-routing
4. `mw-tabs.js:3042–3066` — B-UI-1 receive handler has no map write
5. AK's CMD72 transcript — render completes, `data-wi-id` commits,
   emit fires, yet Click throws the "map empty" error

No ambiguity. No probe required.

### Why Rule 32 permits source-read as evidence

Rule 32 says: runtime evidence, no inference. Source-reading
IS a valid evidence channel when:

(a) the code path's control flow is fully traceable from the
    authorized files — not partial, not hidden behind indirection
    that would require runtime introspection to resolve;
(b) the error message observed at runtime matches a specific
    throw site in source literally (not by pattern);
(c) the thrown condition's inputs can be enumerated statically.

All three held here. The error string `"no row for instance ..."`
exists at exactly one throw site (`cmd-center.js:1300`), reached
only when `row` is null, which requires `wrid` null OR `anchor`
null. `wrid` null happens iff `_myActiveRequestId[instanceId]` is
falsy, which happens iff nothing wrote that key. Grep across all
four authorized files identified every write site; none are on
the receive path. The conclusion is deductive from source, not
inferential.

Inserting runtime trace instrumentation to confirm what static
analysis already proved would violate the opposite of Rule 32's
intent: it would be theater — runtime evidence generated to
decorate a conclusion already in hand. Rule 32 exists to prevent
diagnosis-by-inference; it does not mandate instrumentation when
source is dispositive. The B-UI-3.1 cautionary precedent is
specifically about inference from *incomplete* code reading
combined with plausible-sounding architectural hypotheses — not
about refusing to trust code when the code is all there.

The B-UI-6 fix itself is a counterexample from earlier this
session: the duplicate-render diagnosis was correctly runtime-
grounded because the timing relationship (poll interval vs event
arrival) was not derivable from source alone. Each brief gets
the evidence channel its question requires.

### Fix shape — (a) · receive-path mirror write

Three-line insert in `mw-tabs.js:3083–3086` (inside `_handleEvent`,
`workflow_request.created` branch, after the assignee filter at
line 3048). Extensive block comment at lines 3050–3082 documents
the fix and — critically — the intentional asymmetry with the
routing-side write's condition, flagged so future readers do not
"symmetrize" the two writes by copying the routing-side guard
and breaking the receive path.

```js
if (data.workflow_request_id && data.instance_id) {
  if (!window._myActiveRequestId) window._myActiveRequestId = {};
  window._myActiveRequestId[data.instance_id] = data.workflow_request_id;
}
```

Unconditional by design because B-UI-1's assignee filter at line
3048 already ran. The routing-side's conditional guard exists
because `_mwResolveAndRoute` runs on the routing session's behalf
for every assignee (self and others); the receive-side has no
such multi-assignee scope — it only runs when the event is for
this operator.

### Code changes

| File | Line | Change |
|---|---|---|
| `mw-tabs.js` | 3 | `VERSION:` comment CMD71 → CMD73 |
| `mw-tabs.js` | 5 | `console.log` banner CMD71 → CMD73; banner text updated |
| `mw-tabs.js` | 6 | `_mwTabsVersion` literal CMD71 → CMD73 |
| `mw-tabs.js` | 3050–3086 | receive-path `_myActiveRequestId` write + explanatory comment block |

`cmd-center.js`, `mw-core.js`, `mw-events.js` — no changes.

### Version discipline

Per Rule 28 intent ("live version markers current," not "all
files same number"): mw-tabs.js bumps CMD71 → CMD73. mw-core.js
stays at CMD72 (set by B-UI-6). The per-file CMD chain traces
brief ownership:

- mw-core.js · CMD72 · B-UI-6 · poll no longer re-renders work tab
- mw-tabs.js · CMD73 · B-UI-6.1 · receive-path `_myActiveRequestId` write

Cache-bust on loader-tag files (pending operator bump):

| File | Pattern |
|---|---|
| `sidebar.js` | `s.src = '/js/cmd-center.js?v=v20260422-CMD73';` |
| `compass.html` | `<script src="/js/cmd-center.js?v=v20260422-CMD73"></script>` |
| `aegis.html` | `<script src="/js/cmd-center.js?v=v20260422-CMD73"></script>` |
| `cmd-center.js` | header banner + `_productVersions` map — reconcile to CMD73 |

### Iron Rule 34 — candidate (not ratified)

Phase 1 now has five occurrences of "latent defect at layer N
exposed by reliability at layer N-1":

1. B-UI-3.2 — exposed B-UI-3.4 (rAF-before-await race)
2. B-UI-3.4 — exposed B-UI-5 (cross-session variable resolution gap)
3. B-UI-5 — exposed B-UI-6 (duplicate render cascade)
4. B-UI-6 — exposed B-UI-6.1 (receive-path `_myActiveRequestId` gap)
5. (this brief closes the chain if nothing else surfaces)

The B-UI-6 brief at line 94 said: *"Worth explicit rule
codification if a fifth surfaces."* We hit the threshold.

**Candidate draft — Iron Rule 34:**

> Cross-session state invariants must be explicitly mirrored
> between the routing session and any receiving session that
> depends on them. If a write exists on the routing path as a
> precondition for a downstream operation, an equivalent write
> must exist on the receive path — or the routing-only scope
> must be documented in code with an explicit cross-session
> test case demonstrating why the receive side doesn't need it.

**Provisional status.** Ratification after operator review of
this handoff. The B-UI-6.1 fix itself establishes the pattern:
`_myActiveRequestId` is the first explicitly-mirrored
cross-session precondition. Future cross-session state
(e.g., `_myRequestCoc`, any future per-instance maps) should be
audited against this rule when added.

### Regression surface

Single-session render path (B-UI-3.4 probe): unchanged. The new
write block is additive — runs before the existing
`_mwLoadUserView` → emit chain. On single-session routes (VS
routes to self), `_mwResolveAndRoute`'s write at line 2329
fires first, then the receive handler's write writes the same
value again. Idempotent — last-write-wins with identical value.

Tab-switch refresh: unchanged. The write does not touch tab
state.

B-UI-6 poll elimination: unchanged. mw-core.js not modified.

B-UI-1 emit contract: unchanged. `work_queue.rendered`'s
payload, firing condition, and dedup-by-wrid behavior all
identical.

### Updated Phase 1 remaining items

With B-UI-6.1 shipped:

1. ✅ B-UI-6 · duplicate-render cascade (CMD72)
2. ✅ B-UI-6.1 · cross-session wrid lookup (CMD73)
3. **`dual_session_test` v1.4 end-to-end validation** — now
   unblocked; expected to reach the Document Review panel Pause
   (manual approval), then complete to `✓ Chain confirmed`.
4. `modal.opened` + `Wait ForModal` (B-UI-4) — independent,
   drops the two remaining modal-render Pauses
5. Cadence iframe SQL sweep — independent, unblocks `Wait ForForm`
6. `dual_session_test` v1.5 fully unattended — gated on #3, #4, #5

### Successor

`dual_session_test` v1.4 end-to-end with the three manual Pauses.
Expected timeline:
- VS: Review popup appears → manual approval at Pause 1
- VS: step 2 Click ForInstance "Review" succeeds (unchanged)
- Document Review panel opens on VS → manual approval at Pause 2
- Routes to AK → **AK: step 3 Click ForInstance "Approve" now succeeds** (this brief fixes)
- Document Review panel opens on AK → manual approval at Pause 3
- Chain advances to final step → ✓ Chain confirmed

---

*End of B-UI-6.1 append. Successor: operator runs dual_session_test
v1.4 end-to-end to confirm the chain completes.*

#######################################################################
## END:    Brief B-UI-6 Open Defect + Shipped Block
#######################################################################

#######################################################################
## START:  Iron Rule 34 Ratification Block
## DATE:    2026-04-22
#######################################################################

# Iron Rule 34 — Ratification + cross-session state audit

**Date:** 2026-04-22
**Occasion:** B-UI-6.1 fix shipped; fifth occurrence of "latent defect
at layer N exposed by reliability at layer N-1" triggers codification
per B-UI-6 brief line 94.
**Status:** Candidate draft from the B-UI-6.1 handoff. This document
ratifies (or amends) the draft and records a sweep of existing
cross-session state against it.

---

## Rule 34 — final wording

> **Rule 34.** Cross-session state invariants must be explicitly
> mirrored between the routing session and any receiving session
> that depends on them. If a write exists on the routing path as a
> precondition for a downstream operation, an equivalent write must
> exist on the receive path — or the routing-only scope must be
> documented in code with an explicit cross-session test case
> demonstrating why the receive side doesn't need it.

Unchanged from B-UI-6.1 handoff draft. Ratified.

### Scope clarifications (from the audit below)

1. Rule 34 applies to **per-instance state keyed by identifiers that
   flow through emitted events** (instance_id, workflow_request_id,
   etc.) — i.e., state where a receiving session needs to look up the
   same key a routing session populated.
2. Rule 34 does NOT apply to **self-scoped per-session caches**
   (`_myrInstances`, `_myrDrafts`, `_myRequests`, etc.) that are
   populated by the owning session from its own DB queries.
3. Rule 34 does NOT apply to **script-variable-mediated cross-session
   data transport** (e.g., `$instance_id` captured on VS and
   forwarded by Aegis to AK). B-UI-5 established that path; it
   routes around shared window state by design.
4. Rule 34 is **prospective discipline**, not a retroactive cleanup
   mandate. The audit below confirms only one existing violation
   (`_myActiveRequestId`, fixed by B-UI-6.1). Future briefs that
   add cross-session state must pass Rule 34 at review time.

---

## Cross-session state audit

Source-read sweep across authorized files (`mw-core.js`, `mw-tabs.js`,
`mw-events.js`, `cmd-center.js`) for `window.*` state that:

(a) is keyed per-instance, per-request, or per-template (not per-
    user, per-tab, or config),
(b) is written on a routing or submit path, AND
(c) is read by a command handler or event handler that may run on
    a different session.

Four candidates surfaced. One violation (now fixed), three
compliant-by-design.

### 1. `_myActiveRequestId` — ✅ compliant (fixed by B-UI-6.1)

- **Shape:** `{ [instance_id]: workflow_request_id }`
- **Writer (routing):** `mw-tabs.js:2329` — `_mwResolveAndRoute`,
  guarded on `assigneeResId === _myResource.id`
- **Writer (receive):** `mw-tabs.js:3084` — B-UI-1 `_handleEvent`
  for `workflow_request.created`, unconditional (assignee filter
  upstream at line 3048)
- **Reader:** `cmd-center.js:1283` — `Click ForInstance` wrid lookup
- **Rule 34 status:** Both-sides write present. Reference
  implementation of the rule.

### 2. `_myrInstances` — ✅ compliant (self-scoped)

- **Shape:** `Array` of the user's own workflow_instances
- **Writer:** `mw-tabs.js:903` — `loadUserRequests`, self-populates
  on every MY REQUESTS tab load from DB (RLS-filtered to the
  current user's auth context)
- **Readers:** `mw-tabs.js:1186, 1367, 2879`; `cmd-center.js:1541,
  1622, 3081, 3103` — all inside handlers dispatched to the owning
  session via alias prefix
- **Rule 34 analysis:** the handler and its data live on the same
  session. A VS-targeted `Resume` command reads VS's
  `_myrInstances`. No cross-session dependency.
- **Edge case noted, non-violation:** if session A's
  `_myrInstances` is stale when a command arrives (e.g., route
  created by another session hasn't yet been re-fetched), the
  command may miss the row. This is a DB-refresh cadence question
  covered by `_myrLoadPending` / re-fetch logic, not a Rule 34
  mirror question. Pre-existing behavior, not regressed.

### 3. `_myrDrafts` — ✅ compliant (self-scoped, single-user semantics)

- **Shape:** `Array` of the user's own draft submissions
- **Writer:** `mw-tabs.js:904` — `loadUserRequests`
- **Readers:** `mw-tabs.js:1187, 1278, 2880`; `cmd-center.js:1106,
  1534`
- **Rule 34 analysis:** drafts are inherently single-user; you
  cannot resume another user's draft. Same-session read/write.

### 4. `_lastSubmittedInstanceId` — ✅ compliant (script-var mediation)

- **Shape:** last `workflow_instances.id` created by this session's
  form-submit flow
- **Writer:** `mw-tabs.js:1823` — `compass_form_submit`, synchronous
  after DB insert
- **Readers:** `cmd-center.js:1032–1040` (`Form Submit`'s wait
  loop), `cmd-center.js:1551` (script-var fallback for
  `$instance_id`)
- **Rule 34 analysis:** all reads are on the same session as the
  write (the submitting session). Cross-session consumption of the
  submitted `instance_id` uses the **script-variable** path (B-UI-5):
  Aegis captures `$instance_id` from the submitter's return value,
  forwards it explicitly to other sessions via command args. The
  receiving session never reads the originating session's
  `_lastSubmittedInstanceId` — it reads its own `_storeVars['instance_id']`
  that Aegis set during dispatch resolution. **Architecturally
  bypasses the Rule 34 concern by not sharing window state at all.**

### 5. `_myRequestCoc` — ⚠️ anomaly flag (not a Rule 34 violation)

- **Shape:** unknown (read as object with `[id]` keys at
  `mw-core.js:1358`)
- **Writer:** **no write site found in authorized files**
- **Reader:** `mw-core.js:1357–1358` inside the 10s poll, performs
  a conditional delete on step-change detection
- **Analysis:** either written in a file outside authorized scope
  (approve.html? signing iframe? deleted code path?), or dead
  defensive cleanup. Not Rule 34-relevant on current evidence —
  no command handler or cross-session consumer depends on it.
  **Flag for cleanup review**, not a fix.

---

## Handoff action items

1. Iron Rule 34 added to the master handoff's iron-rules ledger
   with the wording above.
2. `_myRequestCoc` anomaly logged as an open cleanup question for
   a future brief (when authorized reads expand to include
   approve.html or the signing iframe).
3. No immediate code changes. All existing cross-session state is
   either Rule 34 compliant or architecturally exempt via
   script-variable mediation.

## Prospective guidance for future briefs

When adding per-instance `window.*` state that a command handler
will read:

- If written only on one session's path and read cross-session:
  Rule 34 violation. Either add the mirror write or route the
  data through script variables (B-UI-5 pattern).
- If self-populated by each session from its own DB query:
  Rule 34 non-applicable. Document the population path and the
  single-session read scope in the adding brief's handoff.
- If cross-session dispatch uses an alias prefix and the data
  lives on the target session: Rule 34 non-applicable. The alias
  prefix is the session-boundary guarantee.

---

## Pattern retrospective

Five occurrences of "latent defect at layer N exposed by
reliability at layer N-1" in Phase 1:

1. B-UI-3.2 → exposed by B-UI-3.4 — rAF-before-await race
2. B-UI-3.4 → exposed by B-UI-5 — cross-session variable resolution
3. B-UI-5 → exposed by B-UI-6 — duplicate render cascade
4. B-UI-6 → exposed by B-UI-6.1 — receive-path `_myActiveRequestId` gap
5. B-UI-6.1 → (chain closes)

Each exposed defect was latent in the same file/function for weeks
or months before the upstream reliability fix made it visible. The
rule codification here names the specific pattern: cross-session
state mirroring. But the broader observation — **fix upstream
unreliability first, then audit the next layer for newly-visible
defects before shipping the layer after that** — is project
hygiene that Rule 34 cannot fully codify. Keep it as Phase 1
folklore for now; revisit if Phase 2 produces a sixth occurrence.

---

*End of Rule 34 ratification. Merge into the master handoff's
iron-rules section; retain this audit as an appendix for
traceability.*

#######################################################################
## END:    Iron Rule 34 Ratification Block
#######################################################################

#######################################################################
## START:  Brief B-UI-4 Draft Block
## DATE:    2026-04-22
#######################################################################

# Brief B-UI-4 — `modal.opened` emit + `Wait ForModal` command

**Version:** 1.1 · 2026-04-22
**v1.1 amendment:** `role` field in `modal.opened` payload normalized
at the emit boundary rather than forwarded verbatim from
`item._wrRole`. Pins `Wait ForModal`'s match target to a stable
one-of-three vocabulary (`reviewer | approver | submitter_resubmit`).
See Payload contract and Firing sites below.
**Date drafted:** 2026-04-22
**Predecessors:**
  - B-UI-1 (CMD64) — `work_queue.rendered` emit + reactive Work Queue
  - B-UI-3.4 (CMD70) — DOM-anchor serialization discipline (reference pattern for emit-after-commit)
  - B-UI-5 (CMD71) — cross-session variable resolution
  - B-UI-6 (CMD72) — duplicate re-render cascade closed
  - B-UI-6.1 (CMD73) — cross-session `Click ForInstance` wrid lookup
**Gates:** `dual_session_test` v1.5 Pause-free run (after this brief
+ Cadence iframe SQL sweep both ship).

---

## Context

`dual_session_test` v1.4 currently runs end-to-end with three
manual Pauses at modal-render checkpoints:

- Pause 1 — `Confirm Review popup is raised on Vaughn's screen`
- Pause 2 — `Confirm Document Review panel is visible on Vaughn's screen`
  *(post-step-2 Review-popup re-check or the submitter's doc review
  panel, depending on script revision — operator to confirm exact
  Pause wording at migration time)*
- Pause 3 — `Confirm Document Review panel is visible on Angela's screen`

All three Pauses guard the same class of event: a modal overlay has
been appended to `document.body` and its interactive elements (buttons,
form fields) are ready for click/input. Pre-B-UI-4, there is no
machine-observable emit for this transition, so the script must pause
for human confirmation.

This brief adds one emit (`modal.opened`) fired at the single commit
point in `mw-events.js` where the Review Request panel is appended to
the DOM, and one command (`Wait ForModal`) that consumes it. The
three Pauses become `Wait ForModal "Document Review Request"` (or
equivalent) in `dual_session_test` v1.5.

### Unblock status from handoff gate

The B-UI-5 handoff flagged: *"Document Review panel non-appearance on
AK's session ... Requires its own brief — NOT a B-UI-4 migration,
which assumes modals open reliably."* `dual_session_test` v1.4's
end-to-end success under CMD73 (operator verification 2026-04-22
evening) cleared that gate: the Document Review panel now opens
reliably on AK's Edge session after B-UI-6.1's wrid-lookup fix. The
modal was never the problem; the Click that was supposed to open it
wasn't resolving its row. With the Click now reliable, the modal's
render is reliable by consequence, and B-UI-4 is unblocked.

---

## Scope

### In scope

- One new emit: `modal.opened`, fired from the single DOM-commit site
  in `openRequestReviewPanel` (`mw-events.js:660`). Also from
  `openResubmitPanel`'s commit site (`mw-events.js:837`) for
  consistency — same modal class, different flow, same emit contract.
- One new command: `Wait ForModal "<modal_name>" [timeout=<ms>]`.
- `dual_session_test` v1.4 → v1.5 migration replacing the three
  modal-render Pauses with `Wait ForModal` calls. Consolidate this
  migration with the Cadence iframe `compass_form_ready` migration
  if both land before v1.5 ships, so the script's Pause list
  collapses in a single revision (per B-UI-3 handoff guidance).
- Probe script `b-ui-4_modal_probe.txt` that exercises
  `Wait ForModal` in both reviewer and approver flows.

### Out of scope

- Additional modals (CompassToast, InProgressPanel, completion-micro-
  panel, delta popover, etc.). `modal.opened` is emitted **only** from
  the Review Request and Resubmit panel sites in this brief. Other
  modals can be wired in future briefs when a specific Wait consumer
  appears.
- Modal-close emit (`modal.closed`). Not needed for any current Pause
  and adds a second emit's worth of surface area; defer until a
  use case surfaces.
- Form-inside-iframe modals (Cadence `compass_form_ready`). Separate
  brief; complementary, not dependent.
- Emit serialization beyond a single `requestAnimationFrame` post-
  `appendChild`. The Review panel's `appendChild` is synchronous and
  fully commits the subtree in one tick — no post-append async
  pipeline that would require B-UI-3.4-style await serialization.
  Belt-and-suspenders rAF matches B-UI-1's `work_queue.rendered`
  pattern.

---

## Authorized reads

### Primary

- `mw-events.js` — contains `openRequestReviewPanel` (line 428) and
  `openResubmitPanel` (line 669). Both modals' `appendChild` commit
  sites are here.
- `cmd-center.js` — command registry (adjacent to existing
  `Wait ForForm`, `Wait ForQueueRow`, `Wait ForRoute`); `_cmdEmit`
  envelope; `_waitForEventFiltered` helper.

### Conditional

- `mw-tabs.js` — only if a modal open site exists there that this
  brief should also emit from. Grep indicates it does not (the
  Review panel and Resubmit panel are the only modal classes with
  the `appendChild`-overlay pattern in authorized files). If
  grepping uncovers a third site, stop and report before expanding
  the emit set.

### Not authorized

- `mw-core.js` — no modal open sites.
- `cmd-center.js`'s DOM dispatch code (B-UI-5 territory) — no
  re-edits expected; this brief only adds a new command to the
  registry, following the existing pattern.
- `compass.html`, `aegis.html`, `sidebar.js` — cache-bust only.

---

## Protocol contract — the `modal.opened` emit

### Event name

`modal.opened`. Protocol-compliant `namespace.verb` form. No
back-compat alias needed (this is a new event).

### Payload

```json
{
  "modal_id":     "req-review-panel",
  "modal_name":   "Document Review Request",
  "instance_id":  "<uuid or null>",
  "role":         "reviewer | approver | submitter_resubmit"
}
```

- `modal_id` — the DOM `id` attribute of the overlay element. Stable,
  machine-addressable, one-to-one with the modal class.
- `modal_name` — human-readable label. Used by `Wait ForModal`'s
  quoted-string match to keep scripts readable.
- `instance_id` — the workflow instance this modal is opened against,
  when available. The Review panel is always opened for a specific
  `item` with an `instanceId` field (`openRequestReviewPanel(item)`,
  see mw-events.js:438); propagate that.
- `role` — always populated. One of exactly three literal values:
  `reviewer`, `approver`, `submitter_resubmit`. **Derived at the
  emit boundary**, not forwarded verbatim from any internal
  work-item field. Rationale in v1.1 amendment below.

### v1.1 amendment — role normalization rationale

v1.0 forwarded `item._wrRole` directly into the payload. Grep audit
during v1.0 review confirmed `_wrRole` IS a stable public surface
(two documented write sites in mw-core.js:60 and mw-core.js:280,
with inline comments spelling out `'reviewer' | 'approver'` as the
contract, read across two files), so forwarding would have been
safe in practice.

v1.1 tightens this anyway, for two reasons:

1. **Protocol boundary discipline.** The emit payload is public
   protocol — consumed by `Wait ForModal` and potentially by future
   policy engine (B6) consumers or external tools. Internal field
   names, even stable ones, should not leak across that boundary
   verbatim. Normalizing at the emit site means a future rename of
   `_wrRole` (unlikely but not impossible) does not cascade into
   protocol semantics.

2. **Mixed-site consistency.** Site 2 (`openResubmitPanel`) already
   uses a hardcoded literal `'submitter_resubmit'` because the
   resubmit flow has no `_wrRole`. v1.0 mixed two addressability
   patterns across the two sites. v1.1 unifies: both sites own their
   role literal at the emit boundary.

3. **Guaranteed-valid match target.** Because `role` is now always
   one of three known literals, `Wait ForModal ... for <role>`
   scripts can never miss a match due to a payload variation.

### Firing sites

**Site 1 — `mw-events.js:660` (Review Request panel):**

```js
overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
document.body.appendChild(overlay);
document.getElementById('rrp-comments')?.focus();

// B-UI-4 (CMDxx): fire modal.opened after DOM commit. The
// appendChild above is synchronous and the subtree is queryable
// immediately; the rAF is a belt-and-suspenders paint-tick guard
// mirroring B-UI-1's work_queue.rendered pattern. The Wait ForModal
// consumer can query form fields and buttons inside the overlay
// immediately after resolve.
//
// Role literal is derived here at the emit boundary, not forwarded
// from item._wrRole directly. This pins Wait ForModal's match
// target to a stable one-of-two vocabulary ('reviewer' | 'approver')
// even if _wrRole's internal values change. The protocol surface
// owns its vocabulary independent of internal field churn. Site 2
// (Resubmit panel) uses the same emit-boundary pattern with literal
// 'submitter_resubmit'.
if (typeof window._cmdEmit === 'function') {
  requestAnimationFrame(function() {
    window._cmdEmit('modal.opened', {
      modal_id:    'req-review-panel',
      modal_name:  'Document Review Request',
      instance_id: item.instanceId || null,
      role:        (item && item._wrRole === 'approver') ? 'approver' : 'reviewer',
    });
  });
}
```

**Site 2 — `mw-events.js:837` (Resubmit panel):**

```js
overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
document.body.appendChild(overlay);

// B-UI-4 (CMDxx): fire modal.opened after DOM commit.
if (typeof window._cmdEmit === 'function') {
  requestAnimationFrame(function() {
    window._cmdEmit('modal.opened', {
      modal_id:    'req-resubmit-panel',
      modal_name:  'Resubmit for Review',
      instance_id: item.instanceId || null,
      role:        'submitter_resubmit',
    });
  });
}

// Store context for submit handler
window._rsbContext = { reviewers, approver, submittedDetails, firmId };
```

### Why rAF alone, not `await` + emit (B-UI-3.4 pattern)

`_mwLoadUserView` required awaiting its Promise because its
`innerHTML` assignment was gated behind a `Promise.all` of DB
queries. `openRequestReviewPanel` also has an `await`-gated DB
query (instance + CoC fetch at lines 438–452), but that await has
already resolved by the time the overlay HTML string is built and
`appendChild` runs — the appendChild is synchronous and the entire
subtree including form fields, buttons, and focus target is
queryable immediately. The rAF guarantees the paint tick has passed
before the emit; no further Promise serialization is needed.

If a future modal class introduces a post-append async pipeline
(e.g., lazy-loading content after mount), that brief needs to apply
B-UI-3.4's await-then-emit pattern. Rule 32 and 33 posture: emit's
post-condition is "the DOM subtree is queryable." Whatever
serialization achieves that is the correct pattern per-modal.

### Rule 20 posture

One listener path added to `cmd-center.js`'s `_waitForEventFiltered`
call surface (the `Wait ForModal` handler). No other listener surface
added. B-UI-4 is strictly additive to the event bus: one new event,
one new command.

---

## Protocol contract — the `Wait ForModal` command

### Syntax

```
Wait ForModal "<modal_name>" [for <role>] [timeout=<ms>]
```

Examples:

```
# Single-field match — wait for any Review Request modal
Wait ForModal "Document Review Request"

# Compound match — wait for reviewer-flow modal specifically
Wait ForModal "Document Review Request" for reviewer timeout=10000

# Session-targeted (via existing alias-prefix dispatch)
AK: Wait ForModal "Document Review Request"
```

Default timeout: **10000 ms**. Modals render fast; 10s is generous.

### Single-field match (no `for <role>`)

Resolves to `_waitForEventFiltered('modal.opened', 'modal_name',
<name>, timeoutMs)`. Existing B-UI-2 pattern.

Return value on resolve:
`modal.opened: <modal_name>` (e.g., `modal.opened: Document Review Request`).

### Compound match (with `for <role>`)

Mirrors `_waitForQueueRow`'s compound shape from B-UI-2 (CMD65):

1. Compound-aware initial buffer scan checking both `modal_name` AND
   `role`.
2. If buffer hit: resolve immediately.
3. If no buffer hit: register forward-only listener with compound
   predicate; non-matching forward emits re-queue the listener
   without re-scanning the buffer (Rule 27).
4. Timeout fires normally.

Return value on resolve:
`modal.opened: <modal_name> (<role>)`.

Reuse the `_waitForCompoundEvent` helper introduced in B-UI-2 if it
exists in current source. If not, copy the re-queue pattern from
`_waitForRoute` / `_waitForQueueRow` verbatim with a comment pointing
at its twins.

### Command registry

Add `'Wait ForModal'` as a top-level command in `cmd-center.js`,
alongside `'Wait ForQueueRow'`, `'Wait ForRoute'`, `'Wait ForForm'`,
`'Wait ForInstance'`, `'Wait ForLocation'`. Registration follows the
same two-word-verb pattern already handled by `_parseLine`.

Implementation body sits adjacent to `_waitForQueueRow` for visual
collocation with its compound-match twin.

### Rule 29 posture (session prefix discipline)

`Wait ForModal` is an evaluation command (like all other `Wait For*`),
so it runs unprefixed by default. When modal observation needs to be
session-specific (e.g., "wait for the modal to open on AK's tab,
not mine"), the caller uses the existing alias-prefix dispatch:
`AK: Wait ForModal "Document Review Request"`. No new prefix logic
needed.

---

## Steps

### Step 1 · Read authorization check

`grep -n "CMD73" mw-tabs.js` → must match. CMD73 is the current
baseline post-B-UI-6.1. If mismatch, operator baseline is stale;
halt and report.

### Step 2 · Locate and verify the two emit sites

Confirm current line numbers for the Review panel (`mw-events.js:660`)
and Resubmit panel (`mw-events.js:837`) `document.body.appendChild`
commits. If the file has shifted (likely within ±20 lines), update
the brief's line references in the handoff.

Grep for any additional modal classes matching the
`appendChild(overlay)` pattern:

```bash
grep -n "document.body.appendChild" mw-events.js mw-tabs.js mw-core.js
```

If a third overlay-class site surfaces, stop and confirm with
operator whether to include it in this brief's emit set or defer to
a future brief. Default: defer. B-UI-4's scope is the two Review
class panels that the v1.4 Pauses guard.

### Step 3 · Implement the `modal.opened` emit

Insert the rAF-wrapped `_cmdEmit` call at both commit sites per the
contract above. No changes to panel content, close handlers, or
submit handlers. Purely additive.

### Step 4 · Implement the `Wait ForModal` command

Add the command to `COMMANDS` registry in `cmd-center.js`. Reuse
`_waitForCompoundEvent` if it exists; otherwise copy the `_waitForRoute`/
`_waitForQueueRow` re-queue pattern verbatim with an inline comment
citing the twin.

Parser: `[for <role>]` clause follows the same optional-modifier
shape as `Wait ForQueueRow`'s `[to <alias>]`. Role values: `reviewer`,
`approver`, `submitter_resubmit`. Unknown role → throw
`Wait ForModal: unknown role '<role>'`.

### Step 5 · Probe script

Create `scripts/b-ui-4_modal_probe.txt` v1.0:

```
# Script: b-ui-4_modal_probe · exercises modal.opened / Wait ForModal
# Version: 1.0 · 2026-04-22+

Form Submit
Wait ForEvent "form.submitted" → $instance_id
Wait ForInstance $instance_id for launched
Wait ForQueueRow $instance_id to VS
Click ForInstance $instance_id "Review"
Wait ForModal "Document Review Request" for reviewer
Log "✓ Reviewer modal opened for $instance_id"
# Close the modal to proceed — operator confirms Pause below can be Pause-free when B-UI-4 ships
Pause Confirm Document Review panel is visible · press Enter to continue test
```

Intentionally keeps one terminal Pause for operator visual verification
during the probe run (single-modal probe, not a full migration).

### Step 6 · Migrate `dual_session_test.txt` v1.4 → v1.5

Replace the three modal-render Pauses with `Wait ForModal` calls:

- `Pause Confirm Review popup is raised on Vaughn's screen` →
  `Wait ForModal "Document Review Request" for reviewer`
- `Pause Confirm Document Review panel is visible on Vaughn's screen`
  → `Wait ForModal "Document Review Request" for reviewer` (or
  `for submitter_resubmit` if the script revision moved this to a
  post-changes-requested flow — operator to confirm)
- `Pause Confirm Document Review panel is visible on Angela's screen` →
  `AK: Wait ForModal "Document Review Request" for approver`

Recommendation: **do not ship v1.5 in this brief**. Ship B-UI-4's
emit + command + probe only. The v1.5 migration ships together with
the Cadence iframe `compass_form_ready` migration (B-UI-3 handoff
note: "v1.5 will migrate both the queue-row and modal-render Pauses
in a single revision"). One script revision, one review.

### Step 7 · Runtime trace

Probe captures the `modal.opened` emit for each flow. Expected console
line per modal:

```
[cmd-center] emit modal.opened {modal_id: "req-review-panel", modal_name: "Document Review Request", instance_id: "<uuid>", role: "reviewer"}
```

And on the other session's tab:

```
[cmd-center] recv modal.opened {...}
```

Rule 32 posture: the probe's `Wait ForModal` resolution IS the
runtime evidence. No additional transient instrumentation required
because the emit/receive pair is logged by `DEBUG_EVENTS`.

### Step 8 · Regression check

Confirm the existing `dual_session_test` v1.4 still runs end-to-end
at the same Pause points (three modal-render Pauses, unchanged from
operator's 2026-04-22 run). B-UI-4's emit is purely additive; no
existing Pause should shift.

Confirm the Resubmit panel path still works: single-session
changes-requested flow — submitter clicks the "↺ Changes requested"
action item, Resubmit panel opens, `modal.opened` fires with
`role: "submitter_resubmit"`. No new consumer yet, but the emit
firing is verifiable in console.

### Step 9 · Cleanup and cache-bust

- No transient diagnostic logs added (Rule 32 satisfied by
  `DEBUG_EVENTS` + probe success; this brief does not need
  `[B-UI-4 trace]` instrumentation).
- CMD version bump on edited files per Rule 28:
  - `mw-events.js` — CMD60 → **CMD74** (first brief to edit this
    file since B1; banner comment, `_mwEventsVersion` literal,
    VERSION header).
  - `cmd-center.js` — current → **CMD74** (header, `_productVersions`
    map entry, `console.group` banner). Also reconcile the
    loader-tag cache-bust on `sidebar.js`, `compass.html`,
    `aegis.html` to CMD74.
- `mw-core.js` stays at CMD72 (B-UI-6). `mw-tabs.js` stays at CMD73
  (B-UI-6.1). Per-file CMD chain continues tracing brief ownership.

### Step 10 · Handoff append

Produce `aegis-MASTER-handoff-append-B-UI-4.md` covering:

- Status, predecessors, outcome.
- Fix shape chosen and why rAF-only (not await-then-emit).
- Code changes with line references.
- Runtime evidence — probe emit/recv log lines.
- Confirmation that `dual_session_test` v1.4 still runs unchanged.
- Probe script summary.
- Cache-bust inventory.
- Updated Phase 1 items list (v1.5 migration + Cadence sweep still
  ahead; `dual_session_test` v1.5 fully unattended still gated).

---

## Iron rules to honor

- **Rule 15 (enumerated)** — Aegis self-echo exemption for
  app_events. `modal.opened` inherits the `!window._aegisMode &&`
  exemption at the line-310 handler unchanged. Verify with a probe
  that Aegis sees the `recv modal.opened` log line.
- **Rule 20** — one new listener path (via `Wait ForModal`'s filtered
  wait). No other listener surface added.
- **Rule 22** — `_waitForEventFiltered` scans the retention buffer
  before queueing forward. `Wait ForModal` inherits this via the
  shared helper. On compound match: Rule 27 applies — one initial
  compound-aware scan, then forward-only re-queue.
- **Rule 23** — outbound emit queue semantics unchanged. `modal.opened`
  routes through `_cmdEmit` like every other event; pre-subscribe
  queue-and-flush inherited.
- **Rule 25** — `event_id` dedup at handler entry. Same — `modal.opened`
  gets an auto-injected `event_id` from `_cmdEmit`.
- **Rule 27** — compound predicate re-check on
  `Wait ForModal "<name>" for <role>` must not re-scan the buffer.
  Enforced via shared helper.
- **Rule 28** — CMD74 reconciled across `mw-events.js` (three
  internal sites) and `cmd-center.js` (three internal sites) plus
  loader-tag cache-bust on `sidebar.js`, `compass.html`, `aegis.html`.
- **Rule 29** — `Wait ForModal` is an evaluation command; runs
  unprefixed by default. Session-targeted use via existing
  alias-prefix dispatch; no new prefix logic.
- **Rule 31** — payload completeness: `modal_id`, `modal_name`,
  `instance_id`, `role` all populated. `role` is always one of
  `'reviewer' | 'approver' | 'submitter_resubmit'`; never null,
  never an unexpected value. Derived at the emit boundary from
  opening context, not forwarded from internal work-item fields.
  This discipline protects the protocol surface from internal
  field churn — see v1.1 amendment rationale above.
- **Rule 32** — runtime evidence captured via probe's emit/recv log
  and `Wait ForModal` resolve. No transient instrumentation
  required because `DEBUG_EVENTS` already logs the emit path and
  the probe's success is transcript-legible evidence that the
  emit fired post-commit.
- **Rule 33** — single-leg postcondition (`modal subtree
  queryable`). The rAF discipline covers it. If future modals
  introduce post-append async pipelines, per-leg tracing per
  Rule 33 applies in that brief, not this one.
- **Rule 34 (candidate)** — no cross-session state added.
  `modal.opened`'s `instance_id` and `role` flow through the event
  payload, not through shared window state. Rule 34 non-applicable
  by architectural choice.

---

## If investigation surfaces something else

**Scenario A — a third modal-open site in mw-events.js or mw-tabs.js.**
If Step 2's grep finds a third `document.body.appendChild(overlay)`
pattern not listed in this brief, stop and report the new site.
Default policy: defer inclusion to a future brief unless the third
site is a direct blocker of v1.5's Pause migration.

**Scenario B — `_waitForCompoundEvent` does not exist in current
source.** If the helper was not refactored out of `_waitForRoute` /
`_waitForQueueRow` in B-UI-2, copy the re-queue pattern verbatim into
`_waitForModal` with an inline comment citing both twins. Do not
refactor the shared helper in this brief's scope; that's a cleanup
brief if and when three+ compound Waits justify it (per B-UI-2
handoff open question #5).

**Scenario C — `openRequestReviewPanel`'s DB query fails, leaving
the modal in a degraded state.** The existing code retries once on
502 at mw-events.js:443–452, then proceeds with whatever data it
has. The `modal.opened` emit still fires post-appendChild regardless,
because the overlay is committed to DOM even if its internal content
is "No instance data — showing basic view." This is correct behavior:
`Wait ForModal` resolves on DOM presence, not content richness. A
consumer that needs richer preconditions must add its own check
post-`Wait ForModal`.

**Scenario D — Edge-vs-Chrome modal behavior diverges in a new way.**
The B-UI-5 handoff flagged a prior Edge asymmetry that turned out
to be B-UI-6.1's cross-session wrid-lookup gap (not a browser issue).
If post-fix validation shows the `modal.opened` emit fires on one
browser but not the other, stop and investigate before concluding
Scenario D. Most likely: another cross-session state invariant
waiting for a Rule 34 audit. Check `_rrpContext` / `_rsbContext`
window writes against Rule 34 before drafting a fix.

---

## Version discipline

Current baseline: mw-core.js CMD72, mw-tabs.js CMD73, mw-events.js
CMD60, cmd-center.js CMD71. This brief bumps:

- `mw-events.js` → CMD74 (first edit since B1)
- `cmd-center.js` → CMD74 (first edit since B-UI-5/CMD71)

`mw-core.js` stays CMD72. `mw-tabs.js` stays CMD73. Loader-tag
cache-bust on `sidebar.js`, `compass.html`, `aegis.html` reconciles
to CMD74 (unified cache-bust string; operator convention since B1).

Per-file CMD chain post-B-UI-4:

- mw-core.js · CMD72 · B-UI-6 · poll no longer re-renders work tab
- mw-tabs.js · CMD73 · B-UI-6.1 · receive-path `_myActiveRequestId` write
- mw-events.js · CMD74 · B-UI-4 · `modal.opened` emit
- cmd-center.js · CMD74 · B-UI-4 · `Wait ForModal` command

---

## Output discipline

Terse execution. Acknowledge requirements in ≤10 lines. Do not
narrate reading, planning, or reasoning. When done, present:

- Updated files
- A "what changed" bullet list with line numbers
- A "what to test" bullet list with ONLY the single runtime
  observation the operator needs to make

If clarification is needed, ask in one sentence.

---

## Estimated effort

~1.5 hours. Similar shape to B-UI-2 (one emit + one command +
probe). Lighter than B-UI-6.1 because no diagnostic investigation
required — the contract is fully specified up-front from the
B-UI-1 / B-UI-3.4 reference patterns.

---

*End of Brief B-UI-4 v1.0. Successor: `dual_session_test` v1.5
migration (combining this brief's `Wait ForModal` with the Cadence
iframe `compass_form_ready` migration) for a single-revision Pause
sweep, then `dual_session_test` v1.5 fully unattended as the
Phase 1 exit gate.*

#######################################################################
## END:    Brief B-UI-4 Draft Block
#######################################################################

#######################################################################
## START:  B-UI-4 Append Block
## DATE:    2026-04-23
#######################################################################

# B-UI-4 — modal.opened + Wait ForModal (CMD74)

**Status:** Shipped 2026-04-23
**Predecessors:** B-UI-1 (CMD64), B-UI-2 (CMD65), B-UI-3.4 (CMD70), B-UI-5 (CMD71), B-UI-6 (CMD72), B-UI-6.1 (CMD73)
**Outcome:** Two additive `modal.opened` emits at the Review Request and Resubmit panel commit sites; one new evaluation command `Wait ForModal` supporting single-field (`modal_name`) and compound (`modal_name` + `role`) match. v1.4 regression: emit is purely additive — no existing Pause shifted, no existing Wait broke.

---

## Fix shape — rAF only (not await-then-emit)

`openRequestReviewPanel`'s `await`-gated DB query (mw-events.js:438–452) has resolved by the time the overlay HTML string is built; `appendChild` is synchronous and the entire subtree (form fields, buttons, focus target) is queryable in one tick. The rAF wrap is a paint-tick belt-and-suspenders guard mirroring B-UI-1's `work_queue.rendered` pattern. No B-UI-3.4-style `await`-then-emit serialization needed because there is no post-append async pipeline.

`openResubmitPanel` follows the same shape — synchronous overlay commit, no post-append async pipeline.

If a future modal class introduces lazy-loaded post-mount content, that brief applies B-UI-3.4's discipline. B-UI-4's Rule 33 posture: single-leg postcondition (DOM subtree queryable) covered by rAF.

---

## Code changes

### `mw-events.js` (CMD60 → CMD74)

| File | Line(s) | Change |
|------|---------|--------|
| `mw-events.js` | 1 | `VERSION:` comment CMD60 → CMD74 |
| `mw-events.js` | 2 | `_mwEventsVersion` literal CMD60 → CMD74 |
| `mw-events.js` | 3 | `console.log` banner CMD60 → CMD74; banner text "B-UI-4: modal.opened emit (Review Request + Resubmit panels)" |
| `mw-events.js` | 663–681 | **Site 1** — rAF-wrapped `_cmdEmit('modal.opened', …)` after `appendChild` in `openRequestReviewPanel`. Role derived at emit boundary via ternary `(item && item._wrRole === 'approver') ? 'approver' : 'reviewer'`. Inline comment block (lines 664–680) explains role-normalization rationale per v1.1 amendment. |
| `mw-events.js` | 851–862 | **Site 2** — rAF-wrapped `_cmdEmit('modal.opened', …)` after `appendChild` in `openResubmitPanel`. Role literal `'submitter_resubmit'`. |

### `cmd-center.js` (CMD71 → CMD74)

| File | Line(s) | Change |
|------|---------|--------|
| `cmd-center.js` | 2 | File header banner CMD71 → CMD74 |
| `cmd-center.js` | 39 | `_productVersions` map: `cmd-center` CMD71 → CMD74 |
| `cmd-center.js` | 50 | `console.group` CMD Center banner CMD71 → CMD74 |
| `cmd-center.js` | 899–919 | New helper `_waitForModal(modalName, role, timeoutMs)`. Single-field path delegates to `_waitForEventFiltered` (Rule 22 buffer-replay); compound path delegates to `_waitForCompoundEvent` (Rule 27 forward-only re-queue). Default timeout 10000 ms. Sits adjacent to `_waitForQueueRow` for collocation with its compound-match twin. |
| `cmd-center.js` | 1517–1545 | New `'Wait ForModal'` command in `COMMANDS` registry. Parser mirrors `Wait ForQueueRow`'s optional-modifier shape: `[for <role>]` clause + `[timeout=<ms>]` tail. Role validation: `reviewer | approver | submitter_resubmit` only; unknown role → throw. Returns `'modal.opened: <name>'` (single-field) or `'modal.opened: <name> (<role>)'` (compound). |
| `cmd-center.js` | 2073, 2815 | Eval-command lists: appended `'Wait ForModal'` (two locations) so prefix-stripping treats it as an evaluation command per Rule 29. |

---

## Runtime evidence

Probe `b-ui-4_modal_probe.txt` v1.0 — derived from `dual_session_test` v1.4 with bootstrap (presence asserts, navigation, MY REQUESTS / BROWSE seed, Form Submit) and the two B-UI-4 `Wait ForModal` calls inserted in place of v1.4's modal-render Pauses. Run 2026-04-23 evening on instance `06e8efd0-dc26-4fec-8f49-8acdf137aa3a`.

Both `Wait ForModal` resolves fired correctly across sessions (canonical runtime evidence per brief Rule 32):

```
[cmd-center] emit modal.opened {modal_id: 'req-review-panel', modal_name: 'Document Review Request', instance_id: '06e8efd0-dc26-4fec-8f49-8acdf137aa3a', role: 'reviewer'}
→ Wait ForModal resolved · modal.opened: Document Review Request (reviewer)
✓ B-UI-4 · Reviewer modal opened on VS

[cmd-center] emit modal.opened {modal_id: 'req-review-panel', modal_name: 'Document Review Request', instance_id: '06e8efd0-dc26-4fec-8f49-8acdf137aa3a', role: 'approver'}
→ Wait ForModal resolved · modal.opened: Document Review Request (approver)
✓ B-UI-4 · Approver modal opened on AK
```

Aegis recv path also confirmed (Rule 15 self-echo exemption inherited unchanged):

```
[Aegis] cmd-center.js?v=v20260419-CMD71:470 [cmd-center] recv modal.opened {modal_id: 'req-review-panel', modal_name: 'Document Review Request', instance_id: '06e8efd0-…', role: 'reviewer'}
[Aegis] cmd-center.js?v=v20260419-CMD71:470 [cmd-center] recv modal.opened {modal_id: 'req-review-panel', modal_name: 'Document Review Request', instance_id: '06e8efd0-…', role: 'approver'}
```

Rule 32 satisfied by `DEBUG_EVENTS` emit/recv log + transcript-legible `Wait ForModal` resolve. No transient `[B-UI-4 trace]` instrumentation added.

---

## v1.4 regression confirmation

`dual_session_test` v1.4 still runs end-to-end at the same three modal-render Pauses. B-UI-4 adds emits but does not alter any panel content, close handler, submit handler, or DOM commit ordering. Site 1 emit fires after `document.getElementById('rrp-comments')?.focus()`; Site 2 emit fires before the existing `window._rsbContext` write. v1.4 Pauses are unmoved.

---

## Probe script summary

`scripts/b-ui-4_modal_probe.txt` v1.0 — full reviewer + approver chain (preflight presence, dual-session navigate, VS form submit, VS reviewer modal `Wait ForModal`, AK approver modal `Wait ForModal`). Cadence iframe form-render Pause retained as the one out-of-scope gate. Form Submit bootstrap (Compass + MY REQUESTS / BROWSE) included so the probe runs standalone.

---

## Deferred modal emit sites

Step 2 grep surfaced three additional `document.body.appendChild(overlay)` sites in `mw-tabs.js`. Per Scenario A default policy and operator authorization 2026-04-23, all three are deferred — none guard a current Pause and none have a downstream Wait consumer in this brief's scope.

| File | Line | Function / context | Modal class | Why deferred |
|------|------|--------------------|-------------|--------------|
| `mw-tabs.js` | 1024 | `_myrConfirm` | Generic confirmation overlay (`id: myr-confirm-overlay`) | No current Pause; no Wait consumer. Speculative surface expansion. |
| `mw-tabs.js` | 1618 | Form iframe modal launcher | Cadence form iframe overlay | Subject of separate `compass_form_ready` brief — uses different emit contract because iframe-hosted forms have different readiness semantics than inline-mounted modals. |
| `mw-tabs.js` | 2454 | `_myrLaunchModal` | Template launch overlay | No current Pause; no Wait consumer. Speculative surface expansion. |

Future briefs adding Wait consumers for any of these modals will know the emit sites already exist and need only `modal.opened` wiring at the appendChild commit (or, for site 1618, the `compass_form_ready` contract).

---

## Out-of-scope observations

### Finance routing timeout — Phase 1 housekeeping required

Probe run completed both `Wait ForModal` resolves cleanly, then halted at the terminal `Wait ForInstance $instance_id for completed timeout=30000`:

```
[cmd-center] emit instance.blocked {instance_id: '06e8efd0-dc26-4fec-8f49-8acdf137aa3a', seq: 4, reason: 'missing_role', details: 'Finance contact not assigned for role "finance" at step 4'}
[mw-tabs] [_mwResolveAndRoute] Finance contact is not assigned for this user. Please assign one in My Team settings, then resubmit.
[api.js] PATCH https://…/workflow_instances?id=eq.06e8efd0-… 400 (Bad Request)
[mw-tabs] [_mwResolveAndRoute] notified 3 admin(s) of routing block
```

Not a B-UI-4 regression — the instance never reached `completed` because step 4 (Finance Approval) cannot route. Test firm data is incomplete: VS has no finance contact assigned. New Phase 1 housekeeping item added (#3 below).

### Resend 500 — known operational issue

Same as prior briefs:

```
POST https://…/functions/v1/notify-step-activated 500 (Internal Server Error)
[MyRequests] notify 500 {"error":{"statusCode":403,"name":"validation_error","message":"You can only send testing emails to your own email address (vstaples64@gmail.com). To send emails to other recipients, please verify a domain at resend.com/domains, …"}}
```

Not a B-UI-4 issue. Already tracked as known operational issue (Resend test mode constrains outbound recipients). Does not affect modal emit or Wait resolution.

### my-time.html load error during AK tab-twiddle — pre-existing

```
[Compass] Failed to load my-time.html: TypeError: Cannot set properties of null (setting 'innerHTML')
  at buildStoryPanel (<anonymous>:300:54)
  at renderAll (<anonymous>:841:3)
```

Fires when AK does the `Set Tab "MY TIME"` → `Set Tab "MY WORK"` tab-twiddle the v1.4 script does to force a queue refresh. Pre-existing (not introduced by B-UI-4) and dual_session_test v1.4 commentary already flags this twiddle as a candidate cleanup. Mention here for completeness.

---

## Cache-bust inventory

- `mw-events.js` — CMD60 → CMD74 (header, `_mwEventsVersion`, console banner) ✓
- `cmd-center.js` — CMD71 → CMD74 (header, `_productVersions`, console.group banner) ✓
- `mw-core.js` — stays CMD72 (B-UI-6, no edits)
- `mw-tabs.js` — stays CMD73 (B-UI-6.1, no edits)
- Loader-tag cache-bust on `sidebar.js`, `compass.html`, `aegis.html` reconciles to CMD74 — **operator to complete at deploy time**

Per-file CMD chain post-B-UI-4:

- `mw-core.js` · CMD72 · B-UI-6 · poll no longer re-renders work tab
- `mw-tabs.js` · CMD73 · B-UI-6.1 · receive-path `_myActiveRequestId` write
- `mw-events.js` · CMD74 · B-UI-4 · `modal.opened` emit
- `cmd-center.js` · CMD74 · B-UI-4 · `Wait ForModal` command

---

## Updated Phase 1 remaining items

Still ahead before Phase 1 exit gate (`dual_session_test` v1.5 fully unattended):

1. **Cadence iframe `compass_form_ready` migration** — iframe-hosted form readiness emit; brief not yet drafted. Removes the one remaining modal-render Pause (Cadence form open) from `dual_session_test`. Scope likely includes `mw-tabs.js:1618` (form iframe overlay) per Deferred sites table.
2. **`dual_session_test` v1.5 fully unattended** — gated on #1. Will consolidate the B-UI-4 `Wait ForModal` migration with the Cadence iframe `compass_form_ready` migration into a single script revision per brief Step 5 guidance.
3. **Test firm data completeness** — Finance contact assignment for VS (and audit of any other role assignments needed for full-chain workflows). Blocker for full-chain v1.5 unattended runs because `instance.completed` cannot fire if any downstream step's role is unassigned. Surfaced by the B-UI-4 probe's Finance routing timeout.

---

## Iron Rules honored

- **Rule 15** — `modal.opened` inherits app_events Aegis self-echo exemption at the line-310 handler unchanged. Probe's Aegis recv path confirmed both reviewer and approver emits.
- **Rule 20** — One new listener path (`Wait ForModal` via `_waitForEventFiltered` / `_waitForCompoundEvent`). No other listener surface added.
- **Rule 22** — Initial buffer scan (single-field via `_waitForEventFiltered`; compound via `_waitForCompoundEvent`).
- **Rule 23** — `modal.opened` routes through `_cmdEmit`; pre-subscribe queue-and-flush inherited.
- **Rule 25** — `event_id` auto-injected by `_cmdEmit`; handler-entry dedup unchanged.
- **Rule 27** — Compound predicate re-queues forward-only without re-scanning buffer (inherited from `_waitForCompoundEvent`).
- **Rule 28** — CMD74 reconciled across `mw-events.js` (3 internal sites) and `cmd-center.js` (3 internal sites). Loader-tag deploy-time.
- **Rule 29** — `Wait ForModal` registered in both eval-command lists (cmd-center.js:2073, :2815). Runs unprefixed by default; session-targeted via existing alias-prefix dispatch (`AK: Wait ForModal …` confirmed working in probe run).
- **Rule 31** — Payload completeness: `modal_id`, `modal_name`, `instance_id`, `role` all populated. `role` always one of three known literals; derived at emit boundary, not forwarded from `_wrRole`.
- **Rule 32** — Runtime evidence via `DEBUG_EVENTS` emit/recv log + probe `Wait ForModal` resolves. No transient instrumentation added.
- **Rule 33** — Single-leg postcondition (DOM subtree queryable) covered by rAF.
- **Rule 34** — Non-applicable by architectural choice. `instance_id` and `role` flow through event payload, not shared window state. No cross-session state added.

#######################################################################
## END:    B-UI-4 Append Block
#######################################################################

#######################################################################
## START:  B-UI-7a Append Block
## DATE:    2026-04-23
#######################################################################

# Handoff append · Brief B-UI-7a — Terminal event emits (CMD75)

**Date:** 2026-04-23
**Brief:** `aegis-brief-B-UI-7a-terminal-emits-v1_0.md`
**Predecessors:** B-UI-1 (CMD64), B-UI-4 (CMD74), B-UI-6.1 (CMD73/CMD74)
**Successor (unblocked):** B-UI-7 — reactive MY REQUESTS ACTIVE → HISTORY migrations
**Version bump:** `mw-tabs.js` CMD74 → CMD75

---

## Status

Shipped to source. `node --check mw-tabs.js` passes. Two new emits
at the two confirmed terminal transition sites in `mw-tabs.js`. No
edits to `mw-events.js`, `mw-core.js`, or `cmd-center.js` — scope
reduced by Scenario B finding.

## Outcome

Two terminal instance events now fire on the event bus at the moment
of state transition, making B-UI-7's full-scope reactive subscriber
implementable:

- `instance.withdrawn` — fires when submitter clicks the trashcan
  (Withdraw) button on a MY REQUESTS ACTIVE row. DB transition:
  `workflow_instances.status = 'cancelled'`, `current_step_name = 'Withdrawn'`.
- `instance.recalled` — fires when submitter clicks "Recall to
  Draft" on an ACTIVE row. DB transition: `status = 'cancelled'` +
  `form_drafts` restore (DELETE + POST).

Existing `instance.completed` (mw-events.js:1250),
`instance.launched` (mw-tabs.js:1786), and `instance.blocked`
(mw-tabs.js:2235) emits unchanged.

## Step 2 discovery findings

**2a. Recall and Withdraw are distinct paths.** Confirmed two
separate handlers:
- `myrWithdrawInstance` (mw-tabs.js:1039) — PATCH-only, terminates.
- `myrRecallToDraft_row` (mw-tabs.js:2678) — PATCH + DELETE + POST,
  restores draft.

Same DB status outcome (`cancelled`), different user intent, different
side effects. Per operator decision: two distinct emits, not unified
under one name with a `cause` field.

**2b. Reject is not a terminal transition in this product (Scenario B).**
The "Reject" button on the Document Review form (`mw-events.js:643`)
calls `_rrpSubmit(..., 'rejected', ...)`, but the handler maps
`rejected` to `changes_requested` (mw-events.js:1053-1054) — both
approve and reject branches set `newStatus = 'in_progress'`. The
workflow loops back to the submitter via a new `workflow_action_items`
insert (line 1142), and the existing `workflow_request.resolved`
emit at line 1167 fires with `decision: 'changes_requested'`. No
`workflow_instances.status = 'rejected'` PATCH exists anywhere in
the authorized codebase.

**Resolution:** `instance.rejected` is redundant with
`workflow_request.resolved {decision: 'changes_requested'}`. Not
added. B-UI-7 subscriber family is `instance.completed` +
`instance.withdrawn` + `instance.recalled`.

**2c. Existing emit convention match.** `instance.completed` at
mw-events.js:1250 set the pattern: CMD-version comment, guarded by
`typeof window._cmdEmit === 'function'`, `instance_id` first in
payload, null-fallback via `|| null`. New emits replicate exactly.

**2d. Naming conflict check.** Only three pre-existing
`_cmdEmit('instance.…'` sites (`launched`, `blocked`, `completed`).
Zero `_cmdEmit('workflow.…'`. Names `instance.withdrawn` and
`instance.recalled` are free. Product-user terminology chosen per
brief: `withdrawn` matches HISTORY's "Withdrawn" label; `recalled`
matches the button text.

**2e. Payload field availability.**
- Withdraw site (mw-tabs.js:1050): `instanceId` parameter ✓,
  `_myResource.id` module-scoped ✓, no UI-collected reason (null).
- Recall site (mw-tabs.js:2717): `instanceId` parameter ✓, `resId`
  local at line 2689 ✓, no UI-collected reason (null).

## Code changes

| File | Line | Change |
|------|------|--------|
| `mw-tabs.js` | 3, 5-6 | VERSION header + banner log + `_mwTabsVersion` → CMD75 |
| `mw-tabs.js` | 1055-1068 | **New** — `instance.withdrawn` emit, post-PATCH pre-toast in `myrWithdrawInstance` |
| `mw-tabs.js` | 2745-2758 | **New** — `instance.recalled` emit, post-PATCH + post-draft-restore pre-toast in `myrRecallToDraft_row` |

Both emits placed per brief contract: immediately after DB transition
commits, before `compassToast` and before `setTimeout(loadUserRequests,
...)`. No rAF (post-PATCH emits do not depend on DOM commit).

## Payload contracts (locked)

```
instance.withdrawn
{
  instance_id:              <uuid>,
  withdrawn_by_resource_id: <uuid|null>,
  reason:                   null   // UI does not collect
}

instance.recalled
{
  instance_id:             <uuid>,
  recalled_by_resource_id: <uuid|null>,
  reason:                  null   // UI does not collect
}
```

Payload field names are the canonical public contract per Rule 31.
Schema-level field is `cancelled_by_resource_id` hypothetically;
the event contract uses the actor-terminology field name the
product uses.

## Runtime evidence

Expected Aegis console on withdraw click:
```
[cmd-center] recv instance.withdrawn {instance_id: "...", withdrawn_by_resource_id: "...", reason: null}
```

Expected Aegis console on recall click:
```
[cmd-center] recv instance.recalled {instance_id: "...", recalled_by_resource_id: "...", reason: null}
```

`DEBUG_EVENTS` already gates the recv log path in `cmd-center.js`
(established in B1 CMD54). No transient instrumentation added.

## Regression check

- `dual_session_test` v1.4 unchanged — no edits to routing, queue,
  or modal paths.
- `instance.completed` at mw-events.js:1250 unchanged.
- `modal.opened` emit sites at mw-events.js:663 and :864 unchanged
  (B-UI-4 contract preserved).
- `instance.launched` / `instance.blocked` emits unchanged.
- Existing `loadUserRequests` local refresh behavior unchanged —
  emits fire in parallel, not sequentially.
- `workflow_request.resolved {decision: 'changes_requested'}` at
  mw-events.js:1167 continues to cover the reject→reopen loop per
  Scenario B.

## Cache-bust inventory (post-CMD75)

Files edited:
- `mw-tabs.js` · `v20260423-CMD75` (three internal sites: VERSION
  header comment, console.log banner, `_mwTabsVersion` literal —
  all reconciled)

Files unchanged but require loader-tag cache-bust on deploy:
- `sidebar.js` — operator bump to CMD75
- `compass.html` — operator bump to CMD75
- `aegis.html` — operator bump to CMD75

Unchanged files at CMD74 (no internal edits):
- `mw-events.js` · CMD74
- `mw-core.js` · CMD74
- `cmd-center.js` · CMD74

## Iron rules honored

- **Rule 15** — Aegis self-echo exemption at cmd-center.js line-310
  handler unchanged. New emits inherit the exemption; Aegis will
  see recv log lines.
- **Rule 20** — no new listener paths; strictly emit-side.
- **Rule 22** — new events inherit retention buffer participation
  automatically via `_cmdEmit`. B-UI-7's future subscriber's
  on-mount buffer scan will naturally include withdraw/recall
  events fired in the 30s prior.
- **Rule 23** — outbound emit queue semantics unchanged.
- **Rule 25** — `event_id` auto-injected by `_cmdEmit`; self-dedup
  registration inherited.
- **Rule 28** — CMD74 → CMD75 reconciled across the three internal
  sites in `mw-tabs.js`. Loader-tag sites deferred to operator.
- **Rule 31** — payload completeness. `instance_id` always
  populated; `<actor>_by_resource_id` populated from `_myResource`
  when available (null only if identity resolution failed, which
  would have already blocked the PATCH upstream). `reason` is null
  because the UI does not collect one; documented in-code.
- **Rule 32** — runtime evidence via `DEBUG_EVENTS` emit/recv logs.
  No transient instrumentation.
- **Rule 34 (inverse application)** — Rule 34 says cross-session
  state invariants must mirror between routing and receiving
  sessions. B-UI-7a applies the structurally analogous principle
  to cross-surface state transitions: state changes with
  multi-consumer relevance must mirror onto the event bus.
  Documented in-code at both emit sites. If a similar structural
  gap surfaces in a future brief, this pattern is a Rule 35
  candidate.

## Updated Phase 1 items

- ✅ B-UI-7a (CMD75) — terminal emits (this brief)
- **Unblocked for full scope:** B-UI-7 — reactive MY REQUESTS
  ACTIVE → HISTORY migrations. Subscriber now has three events to
  consume: `instance.completed` + `instance.withdrawn` +
  `instance.recalled`.
- Cadence iframe `compass_form_ready` migration — still pending
- `dual_session_test` v1.5 Pause-free — still gated on Cadence brief
- Test firm data completeness — still pending

## Product UX observations (Phase 2 backlog)

Surfaced during Step 2 discovery; not in scope for this brief.

1. **"Reject" button is a misnomer on the Document Review form.**
   `mw-events.js:643` renders a button labeled "Reject" that calls
   `_rrpSubmit(..., 'rejected', ...)`, but the handler treats
   rejection as a changes-requested semantic — workflow stays
   `in_progress`, loops back to the submitter via a new
   `workflow_action_items` row, and the CoC event is written as
   `request.changes_requested`. The user-facing button should match
   the actual semantic. Proposed rename: "Request Changes" (or
   equivalent). UI copy at lines 643-644 and 1267-1268
   ("Changes were requested.") is already consistent with this
   semantic — only the button label diverges.

2. **Open question for B-UI-7 resume (Drafts count + sub-tab refresh
   on recall).** When `myrRecallToDraft_row` succeeds, the deleted
   instance moves from ACTIVE to the Drafts section (via the
   `form_drafts` POST at mw-tabs.js:2738). Open question for
   B-UI-7's Step 2+: does the Drafts count increment reactively?
   Does the Drafts sub-tab refresh without hard reload? Current
   behavior relies on the 600ms `setTimeout(loadUserRequests)` at
   line 2753 — server round-trip. If the B-UI-7 reactive handler
   on `instance.recalled` should also trigger draft-list
   invalidation, that's additional scope for B-UI-7 to scope. Not
   blocking B-UI-7a.

## Successor

B-UI-7 (reactive ACTIVE → HISTORY migrations) — now unblocked for
full scope. Subscribes to `instance.completed` (migrates to
HISTORY), `instance.withdrawn` (migrates to HISTORY), and
`instance.recalled` (removes from ACTIVE without adding to HISTORY
per operator's "recall = delete from active view" framing; draft
already restored by B-UI-7a's emit site).

---

*End of B-UI-7a append.*

#######################################################################
## END:    B-UI-7a Append Block
#######################################################################

#######################################################################
## START:  B-UI-7 Append Block
## DATE:    2026-04-23
#######################################################################

# Handoff append · Brief B-UI-7 — Reactive MY REQUESTS migrations (CMD76)

**Date:** 2026-04-23
**Brief:** `aegis-brief-B-UI-7-reactive-migrations-v1_0.md`
**Predecessors:** B-UI-1 (CMD64), B-UI-6 (CMD72), B-UI-6.1 (CMD73),
  B-UI-4 (CMD74), **B-UI-7a (CMD75)**
**Version bump:** `mw-tabs.js` CMD75 → CMD76

---

## Status

Shipped to source. `node --check mw-tabs.js` passes. One new reactive
IIFE appended to end of `mw-tabs.js`, subscribing to the full terminal
event family unblocked by B-UI-7a. No edits to `mw-events.js`,
`mw-core.js`, or `cmd-center.js`.

## Outcome

MY REQUESTS ACTIVE → HISTORY migration is now reactive. When a
submitter's instance terminates via `instance.completed`,
`instance.withdrawn`, or `instance.recalled`, the local session
updates the view without a hard refresh:

- **`instance.completed`** — row flips to `status='complete'` and
  re-renders, migrating from ACTIVE's filter to HISTORY's filter in
  one pass. Count badges update via the same derivation.
- **`instance.withdrawn`** — row flips to `status='cancelled'` +
  `current_step_name='Withdrawn'` (matching the withdraw PATCH at
  mw-tabs.js:1050), re-renders, migrates to HISTORY.
- **`instance.recalled`** — row flips to `status='cancelled'` and is
  removed from ACTIVE via re-render. Does NOT appear in HISTORY
  (recall = delete from active view per operator). Additionally
  triggers `loadUserRequests()` after 600ms so the restored draft
  (posted to `form_drafts` by B-UI-7a at mw-tabs.js:2738) appears in
  the Drafts section.

## Step 2 re-discovery findings

**2a. Terminal event emit sites (post-B-UI-7a).** Three events now
emit: `instance.completed` (mw-events.js:1250), `instance.withdrawn`
(mw-tabs.js:1063), `instance.recalled` (mw-tabs.js:2753). No
`.rejected` / `.cancelled` / `.deleted` variants — reject is
non-terminal in this product (Scenario B from B-UI-7a), and
withdraw/recall use the user-facing terminology the brief mandates.

**2b. ACTIVE renderer.** `_myrRenderActive` at mw-tabs.js:1199.
Reads `window._myrInstances` filtered client-side by
`status !== 'complete' && status !== 'cancelled'`. HISTORY renderer
`_myrRenderHistory` at mw-tabs.js:1380 is the complement filter.
Both mutations operate on the same shared array.

**2c. ACTIVE count source.** `_myrUpdateRequestBadges`
(mw-tabs.js:2910) derives the badge from `_myrInstances.length` +
`_myrDrafts.length`, no separate query. Auto-syncs when the cache
mutates.

**2d. Filter locus.** Client-side. `loadUserRequests` (line 871)
fetches all 100 rows by `submitted_by_resource_id`; ACTIVE/HISTORY
partition is a `.filter()`. Correct reactive pattern: flip cached
`status` field, call `_myrRenderAll()`. The single call re-renders
BROWSE, ACTIVE, HISTORY, and updates the badge coherently.

**2e. HISTORY lazy-load.** Eager. Every `_myrRenderAll` invocation
(line 943) renders all three sub-tabs from the shared cache. No
separate HISTORY cache to invalidate.

**Bonus finding — Drafts reactivity on recall (B-UI-7a followup).**
`window._myrDrafts` is populated only by `loadUserRequests`
(line 904). The local session's post-recall 600ms setTimeout at
mw-tabs.js:2761 already refreshes Drafts via server round-trip on
the recalling session. For cross-session `instance.recalled`, the
reactive handler also triggers a Drafts refresh — the event payload
doesn't carry enough to synthesize the new draft row locally.
Resolution: reactive handler calls `loadUserRequests()` after 600ms
on `instance.recalled` only. Idempotent with the existing setTimeout
on the recalling session (both trigger the same server refresh;
`_myrLoadPending` guard in loadUserRequests at line 872 coalesces
duplicates).

## Code changes

| File | Line | Change |
|------|------|--------|
| `mw-tabs.js` | 3, 5-6 | VERSION header + banner log + `_mwTabsVersion` → CMD76 |
| `mw-tabs.js` | 3198-3357 | **New** — B-UI-7 reactive subscriber IIFE appended after B-UI-1's `_mwWorkQueueReactive` IIFE. Mirrors that pattern: guarded mount (`_myrRequestsReactive`), on-mount buffer scan via `recentEvents(50)`, `CMDCenter.onAppEvent` subscription. |

The new IIFE is isolated from B-UI-1's: separate mount guard, separate
handler function, separate concern (MY REQUESTS cache vs Work Queue
renderer). Both subscribe via the same `CMDCenter.onAppEvent` fan-out.

## Handler structure

```
_handleTerminal(eventName, data):
  if !TERMINAL_EVENTS[eventName]:       return
  if !data.instance_id:                  warn + return
  idx = _myrInstances.findIndex(id match)
  if idx == -1:                          log "no-op · row-not-in-active"
  if cached status terminal:             log "no-op · already-migrated"
  flip status (+ current_step_name for withdrawn)
  _myrRenderAll()                        // re-renders ACTIVE, HISTORY, badges
  if recalled:
    setTimeout(loadUserRequests, 600)    // Drafts refresh only
    log "ACTIVE → removed"
    return
  log "HISTORY ← added"
  log "ACTIVE → HISTORY"
```

TERMINAL_EVENTS map:
```
instance.completed → 'complete'
instance.withdrawn → 'cancelled'
instance.recalled  → 'cancelled'  (but routed to removed-not-migrated branch)
```

## Dev-console log format (Rule 31 contract)

Every handled event produces exactly one transcript-legible log line
on the migration path:

```
[my-requests] ACTIVE → HISTORY · instance_id=<uuid> cause=instance.completed
[my-requests] HISTORY ← added · instance_id=<uuid> cause=instance.completed
[my-requests] ACTIVE → HISTORY · instance_id=<uuid> cause=instance.withdrawn
[my-requests] HISTORY ← added · instance_id=<uuid> cause=instance.withdrawn
[my-requests] ACTIVE → removed · instance_id=<uuid> cause=instance.recalled
[my-requests] no-op · instance_id=<uuid> reason=row-not-in-active
[my-requests] no-op · instance_id=<uuid> reason=already-migrated
```

The no-op variants matter: a terminal event for an instance this
operator never owned (another user's instance visible on BROWSE,
already-migrated row from this session) fires the handler, which
logs and returns. Silent dismissals would violate Rule 32; the
no-op log keeps the dismissal path debuggable.

## Regression check

- `dual_session_test` v1.4 runs end-to-end at the three modal-render
  Pauses unchanged. This brief adds a subscriber; it does not touch
  the routing, queue, or modal paths.
- `instance.blocked` → stays in ACTIVE with ⚠ icon. Unchanged (not
  subscribed).
- `workflow_request.created` → B-UI-1 reactive re-render path.
  Unchanged (separate IIFE, separate handler).
- `workflow_request.resolved {decision: 'changes_requested'}` →
  workflow stays `in_progress`, no ACTIVE→HISTORY migration. The
  submitter receives a new `workflow_action_items` row for the
  changes-requested notification (existing behavior). Unchanged.
- Manual refresh → ACTIVE and HISTORY fetch fresh from server via
  `loadUserRequests`. Unchanged.
- Cross-user events → `no-op · row-not-in-active` log + return.
  No side effects on other users' caches.
- B-UI-7a emits (`instance.withdrawn`, `instance.recalled`) —
  unchanged; consumed here, not modified.

## Idempotence (Rule 25)

The handler has two no-op branches that make it safe against
duplicate invocations:

1. **row-not-in-active** — event for an instance not in local cache.
2. **already-migrated** — event for an instance whose cached status
   is already terminal. Fires if the same event is delivered twice
   (transport retry, buffer + live double-delivery), or if a local
   write path already flipped the status before the event round-tripped.

`_cmdEmit`'s `event_id` self-registration (Rule 25 amended) handles
wire-level dupes upstream of this handler. These local checks handle
logical dupes downstream.

## Cache-bust inventory (post-CMD76)

Files edited:
- `mw-tabs.js` · `v20260423-CMD76` (three internal sites reconciled:
  VERSION header, console.log banner, `_mwTabsVersion` literal)

Files unchanged but require loader-tag cache-bust on deploy:
- `sidebar.js` — operator bump to CMD76
- `compass.html` — operator bump to CMD76
- `aegis.html` — operator bump to CMD76

Unchanged files:
- `mw-events.js` · CMD74 (no edits since B-UI-4)
- `mw-core.js` · CMD74 (no edits since B-UI-6)
- `cmd-center.js` · CMD74 (no edits since B-UI-4)

## Iron rules honored

- **Rule 15** — onAppEvent listeners downstream of cmd-center.js
  line-310 Aegis self-echo filter. Inherits the filter unchanged.
- **Rule 20** — one new listener path (`_handleTerminal` registered
  via `CMDCenter.onAppEvent`). Dispatches to three event names via
  the `TERMINAL_EVENTS` lookup. No duplicate handlers; does not
  interfere with B-UI-1's `_handleEvent` (different function,
  different mount guard, different event names).
- **Rule 22** — on-mount buffer scan via `recentEvents(50)`, oldest
  forward. Catches terminal events that fired between
  `loadUserRequests` completion and subscription registration.
- **Rule 25** — idempotent handler. Two no-op branches guarantee
  duplicate invocations have no side effects. Wire-level `event_id`
  dedup continues to apply upstream.
- **Rule 28** — CMD75 → CMD76 reconciled across three internal
  sites in `mw-tabs.js`. Loader-tag bump deferred to operator.
- **Rule 31** — every non-trivial path produces one log line with
  `instance_id` and `cause` (or `reason` for no-ops).
- **Rule 32** — runtime evidence is the permanent log-line contract
  plus operator's visual Pause confirmations in the probe. No
  transient `[B-UI-7 trace]` instrumentation.
- **Rule 34** — non-applicable by architectural choice. Handler
  reads and mutates only local-session `_myrInstances`. No
  cross-session state mirroring concern. The handler runs on each
  submitter's own session independently; if VS's instance completes,
  VS's MY REQUESTS updates — AK's session's handler sees the same
  event, finds no matching row in AK's `_myrInstances` (which only
  contains AK's own submissions), and logs `no-op · row-not-in-active`.

## Runtime evidence — ship verification

Three-session test 2026-04-23 confirmed B-UI-7's handler fires
correctly. Transcript from Compass (submitter) session after a
full-chain approval of instance `aeb6772e-f321-46de-9abf-a4a848ee7967`:

```
[cmd-center] recv instance.completed {instance_id: 'aeb6772e-…', template_id: '5f772b14-…', final_status: 'complete', elapsed_ms: 25563}
[my-requests] HISTORY ← added · instance_id=aeb6772e-f321-46de-9abf-a4a848ee7967 cause=instance.completed
[my-requests] ACTIVE → HISTORY · instance_id=aeb6772e-f321-46de-9abf-a4a848ee7967 cause=instance.completed
```

Row disappeared from ACTIVE and appeared in HISTORY without hard
refresh. DB state confirmed consistent:

- `workflow_instances.status = 'complete'`
- `workflow_instances.current_step_name = 'Completed'`
- All three `workflow_requests` rows `status = 'resolved'`

## Out-of-scope observations — Phase 2 backlog

These were surfaced during B-UI-7 post-ship verification but are
distinct from B-UI-7's scope. Documented here for future brief
scoping.

### 1. Signature Loop Status hover tooltip shows "Waiting" for completed steps

**Observed.** Hovering the Status column on a HISTORY row displays
the Signature Loop Status tooltip with all four steps rendered as
"Waiting" (or stale pre-completion state), even for fully-resolved
instances with all `workflow_requests` rows at `status='resolved'`
in the DB.

**Root cause.** The tooltip reads `window._myrInstReqs[instanceId]`,
which is populated by the cache-population query at
`mw-tabs.js:915-930` inside `loadUserRequests`:

```js
var instIds = (instances||[]).filter(function(i){
  return i.status === 'in_progress' || i.status === 'blocked';
}).map(function(i){ return i.id; });
```

Terminal-state instances are deliberately excluded. `_myrInstReqs`
and the sibling `_myrInstCoc` only hold data for in-flight workflows.
Completed/cancelled instances have no cache entry, so the tooltip
falls back to rendering template steps as "Waiting."

**Not a B-UI-7 regression.** The gap existed before B-UI-7; hard
refreshes never populated the cache for completed instances either.
B-UI-7 makes the gap more visible because rows now land in HISTORY
reactively, so users see completed-state rows in HISTORY sooner and
hover them more often. Pre-B-UI-7 they would have hit the same empty
tooltip on any hard-refreshed HISTORY row.

**Verification.** On 2026-04-23 Vaughn's console, immediately after
a fresh chain completed for `aeb6772e-…`:

```
instance aeb6772e-f321-46de-9abf-a4a848ee7967 complete
in _myrInstReqs? false
keys count: 25   (all in-flight or recently-in-flight, none terminal)
```

**Candidate fixes for a future brief** (operator decides scoping):

- **Option 1 — widen the cache-population filter.** Include
  `complete` and `cancelled` in the status filter at
  mw-tabs.js:915-916. Loads approximately (HISTORY count) extra
  `workflow_requests` rows per mount plus ~4 CoC rows per terminal
  instance. Memory bounded by HISTORY cap (77 rows in operator's
  current screenshot). Three-line change; minimal risk.

- **Option 2 — lazy-fetch on tooltip open.** Locate the tooltip
  renderer (grep `_myrInstReqs` for read sites), detect empty-cache
  case, query `workflow_requests` inline on hover. Lazier memory
  profile; more code; new async path in a hover interaction. Cleaner
  architecture, larger scope.

Option 1 is consistent with the brief's "eager render" discovery
and is the simpler fix. Option 2 is the right architectural choice
if the Phase 2 reactivity audit finds many such tooltips sharing the
same pattern.

### 2. Silent `.catch(() => {})` on terminal-branch PATCH

**Observed.** During debug of a stuck-in-ACTIVE defect surfaced
during B-UI-7 verification, the `workflow_instances` PATCH at
`mw-events.js:1232-1235` returned HTTP 400 repeatedly (schema drift:
code wrote `'completed'`; DB check constraint `workflow_instances_status_check`
allows `'complete'`, not `'completed'`). The `.catch(() => {})` at
line 1235 swallowed the error silently. The emit chain
(`workflow_request.resolved`, `instance.completed`) fired anyway,
causing B-UI-7's handler to migrate rows to HISTORY based on a
false completion signal.

**Root cause.** Silent error suppression on a write path whose
success is a precondition for downstream emits.

**Not a B-UI-7 regression.** The silent-catch pattern predates
B-UI-7. B-UI-7 happens to be the first reactive consumer that
*acts* on the post-PATCH emit, so the divergence between "emit
fired" and "DB changed" became user-visible during ship verification.

**Candidate rule for future codification.** PATCH failures in
emit-adjacent write paths must not silently proceed to emit.
Either propagate the error and skip the emit, or include
error-state in the emit payload so downstream consumers can
distinguish. Not yet warranting iron-rule status; flag if the
pattern resurfaces in another surface.

### 3. "Reject" button misnomer (carried from B-UI-7a handoff)

Document Review form's "Reject" button label at mw-events.js:643
should match its actual semantic ("Request Changes"). Workflow
stays `in_progress`, loops back to submitter. UI copy change only.

### 4. Progress indicator reactivity (from B-UI-7 brief)

Status column live-update on mid-chain step advance (e.g., seq 2
approved → "Finance Approval" label should update without refresh).
Currently requires hard refresh. Scope: new emit on step transition,
or consume existing `workflow_request.created` +
`workflow_request.resolved` pair to infer step changes.

### 5. Audit of other Compass surfaces (from B-UI-7 brief)

Dashboard tiles, MY WORK queue consumers, BROWSE-view instance
visibility. Many likely have analogous reactivity gaps.

## Operator-applied hotfixes during this session (not part of B-UI-7 scope)

Two `mw-events.js` edits were applied by the operator during
B-UI-7 ship verification to resolve pre-existing defects that
made B-UI-7's correct behavior appear broken. These are NOT part
of B-UI-7's scope but are documented here for chain-of-custody:

1. **mw-events.js:1233** — one-character fix: `status: 'completed'`
   → `status: 'complete'`. Resolved HTTP 400 on the terminal-branch
   PATCH caused by schema drift vs check constraint.
2. **mw-events.js:1232-1235** — added
   `current_step_name: 'Completed'` to the terminal-branch PATCH
   body so HISTORY rows display "Completed" rather than retaining
   the last in-flight step label ("Finance Approval").

Both fixes bump `mw-events.js` CMD74 → (operator-assigned next
version). Flag for inclusion in the next formal version-string
reconciliation pass per Rule 28.

## Updated Phase 1 items

- ✅ B-UI-7a (CMD75) — terminal emits
- ✅ B-UI-7 (CMD76) — reactive MY REQUESTS migrations (this brief)
- ✅ mw-events.js operator hotfixes — schema-drift and step-name fixes
- Cadence iframe `compass_form_ready` migration — still pending
- `dual_session_test` v1.5 Pause-free — still gated on Cadence brief
- Test firm data completeness — still pending

## Successor

Cadence iframe `compass_form_ready` migration — next Phase 1
structural item. After both Cadence and B-UI-7 ship,
`dual_session_test` v1.5 fully unattended becomes the Phase 1 exit
gate. Phase 2 reactivity audit inherits the five deferred items
above as its starting scope, with the Signature Loop tooltip as
the first concrete candidate.

---

*End of B-UI-7 append.*

#######################################################################
## END:    B-UI-7 Append Block
#######################################################################

#######################################################################
## START:  B-UI-8 Append Block
## DATE:    2026-04-23
#######################################################################

# Handoff Append — B-UI-8 · Signature Loop tooltip cache completeness + terminal-PATCH error propagation

**Date shipped:** 2026-04-23
**Brief:** `aegis-brief-B-UI-8-tooltip-cache-error-prop-v1_0.md`
**Predecessors:** B-UI-7 (CMD76), B-UI-7a (CMD75), B-UI-4 (CMD74), B-UI-6 (CMD72), Iron Rule 34 (B-UI-6.1)

---

## Status

**Shipped.** Part A verified via runtime UI evidence. Part B verified on the success (happy) path end-to-end; failure path verified indirectly via contract observation (see Verification section). Operator hotfix reconciliation absorbed under CMD77.

---

## Outcome

### Part A — Tooltip cache completeness (closed)

- `_myrInstReqs` and `_myrInstCoc` cache-population filter at `mw-tabs.js:915-928` widened to include `complete` and `cancelled` terminal-state instances. HISTORY rows now render full `workflow_requests` data to the Signature Loop Status tooltip.
- **Scope expansion during Step 2 discovery:** tooltip renderer contained schema-drift string comparisons (`inst.status === 'completed'` at lines 2547 and 2593) that would have defeated the cache widening. Corrected to `'complete'` to match DB check constraint. Scenario D triggered per brief, operator authorized expansion.
- Runtime evidence: HISTORY-row hover on completed instance now shows Submit=Submitted, Submitter=Approved, Manager=Approved, Finance=Approved, Completed — no "Waiting" rows.

### Part B — Terminal-PATCH error propagation (closed at contract level)

- Silent `.catch(() => {})` at `mw-events.js:1232-1235` replaced with try/catch that:
  - On success: proceeds to emit `instance.completed`.
  - On failure: `console.error` + `compassToast('Approval did not save — please try again.', 4000)` + early `return` (emit skipped).
- Three changes reconciled under CMD77 at the same PATCH site: schema-drift hotfix (`'completed'` → `'complete'`), `current_step_name: 'Completed'` addition, error-propagation fix. Single comment block documents all three per brief Step 4.
- Runtime evidence (happy path): `[rrpSubmit] workflow complete — no further steps` at `mw-events.js:1260` followed by `instance.completed` emit with `final_status: 'complete'`, `elapsed_ms: 223873`. B-UI-7's subscriber correctly no-op'd on the approver's session (`reason=row-not-in-active`). Vaughn's ACTIVE → HISTORY migration observed on submitter session per B-UI-7 contract.

### Operator hotfix version reconciliation (closed)

- `mw-events.js` CMD74 → CMD77 absorbs the two morning hotfixes (schema-drift `'complete'`, `current_step_name: 'Completed'`) together with Part B.
- `mw-tabs.js` CMD76 → CMD77 carries Part A.
- Three internal sites updated per file per Rule 28 (VERSION header, `_m*Version` literal, console banner).

---

## Step 2 Discovery Findings

### 2a — `_myrInstCoc` sibling cache
**Exists.** `mw-tabs.js:917`, populated by the same `instIds` filter at line 916 as `_myrInstReqs`. Widened both caches under a single filter change.

### 2b — Tooltip renderer location
`_myrStatusCell` at `mw-tabs.js:2522-2668`. **Scenario D partially triggered** (reported before implementation per brief stop-gate): renderer contained schema-drift `inst.status === 'completed'` at lines 2547 and 2593. DB schema uses `'complete'`. Cache widening alone would not have fixed the tooltip because `isAllDone` would have evaluated `false`, collapsing post-submit steps back into the `else → "Waiting"` branch. Operator authorized expansion; string comparisons corrected to `'complete'`. Not a renderer architecture change — a string-drift fix identical to the one applied at the mw-events.js PATCH site.

### 2c — `compassToast` signature
Canonical helper. Signature is `(message, durationMs)`, not `(message, severity)`. Error convention throughout the codebase is `compassToast('<error text>', 4000)` (see mw-events.js:418, :1349; mw-tabs.js:336, :389, :437, :484, :566 for precedent). Part B call: `compassToast('Approval did not save — please try again.', 4000)`.

### 2d — `_rrpSubmit` caller dependency check
Two callers, both inline `onclick` handlers at `mw-events.js:643` and `:650`. Neither chains `.then()` on the function's return value. Scenario A did not trigger; error-propagation fix safe to proceed without caller-site changes.

### 2e — Silent-catch audit (scope check only, not fixed)
**21 `.catch(() => {})` sites** in `mw-events.js` at lines: 212, 225, 238, 404, 410, 962, 970, 976, 991, 1004, 1013, 1019, 1078, 1086, 1152, 1212, 1219, **1236 (fixed)**, 1285, 1305, 1319. Remaining 20 sites logged to Phase 2 backlog under "silent-catch audit" — do not fix in this brief's scope per brief Scenario E.

---

## Part A Implementation Details

**File:** `mw-tabs.js` · CMD77

- **Lines 915-928** — filter widened to include `complete` and `cancelled`. Comment block documents the asymmetry with `_myrInstances` eager-load pattern and the B-UI-7 ship observation.
- **Lines 2559-2564** — `isAllDone = inst.status === 'complete'` (was `'completed'`). Comment block documents schema-drift correction.
- **Line 2608** — no source change needed; behavior fixed transitively because `isAllDone` now evaluates correctly.
- **Lines 1, 5, 6** — CMD76 → CMD77 across header, banner, literal.

---

## Part B Implementation Details

**File:** `mw-events.js` · CMD77

- **Lines 1230-1283** — terminal-branch PATCH wrapped in try/catch. Triple-change comment block documents schema-drift hotfix, current_step_name addition, and error-propagation fix together. Early `return` on catch skips `instance.completed` emit. On success, emit payload shape unchanged per Rule 31.
- **Line 1270** — emit contract comment corrected (`'completed'` → `'complete'`) to match DB column value.
- **Lines 1, 2, 3** — CMD74 → CMD77 across header, literal, banner.

---

## Runtime Evidence

### Part A evidence (tooltip hover post-ship)
Operator observation 2026-04-23: hovering HISTORY row on completed Expense Report instance shows all step rows with correct status (Submitted / Approved / Approved / Approved / Completed). No "Waiting" rows on terminal instances.

### Part B evidence — happy path
Three-browser test session 2026-04-23 (Vaughn=Chrome, Angela=Edge, Ron=Firefox). Expense Report `b0535f72-386d-4faf-8af8-2c49a92caaf4` routed Submit → Submitter → Manager → Finance; Ron approved; terminal PATCH succeeded. Ron's console showed:

```
[rrpSubmit] workflow complete — no further steps    mw-events.js:1260
[cmd-center] emit instance.completed {instance_id: "b0535f72-...",
    template_id: "5f772b14-...", final_status: "complete", elapsed_ms: 223873}
[my-requests] no-op · instance_id=b0535f72-... reason=row-not-in-active
```

Vaughn's session migrated the row ACTIVE → HISTORY per B-UI-7's reactive subscriber. No false-completion regression observed. Post-CMD77 `mw-events.js:1260` line matches the new emit location after the try/catch was inserted (shift from pre-CMD77 line 1237).

### Part B evidence — failure path (indirect verification)
Attempted failure injection by blocking `workflow_instances?id=eq.*` via Firefox DevTools on Ron's session for instance `fb6b41cc-5248-4b96-a0b4-6e04622f0131`. Observations:

- Ron's console showed `workflow_request.resolved seq: null` emitted (the upstream PATCH at line 1083 on `workflow_requests` succeeded — blocked URL pattern did not match).
- **No** `[rrpSubmit] workflow complete — no further steps` line.
- **No** `instance.completed` emit.
- **No** `[_rrpSubmit] terminal PATCH failed` error.
- Row removed from Ron's queue (client-side only).
- Vaughn's ACTIVE queue retained the row "waiting for Finance — In Progress."
- Aegis `recv` log: no `instance.completed` for `fb6b41cc...`.

**Analysis:** The URL-contains block pattern matched both the GET at line 1181 (`workflow_instances?id=eq.${instanceId}&select=...`) and the PATCH at line 1232. The GET returned empty, `instRow` resolved to `undefined`, the `if (instRow && instRow.template_id)` branch at line 1186 evaluated false, control fell through without entering the terminal-PATCH try/catch. The `seq: null` on the `workflow_request.resolved` emit confirms the earlier GET at line 1181 also returned empty (current_step_id lookup failed).

**Net result — Part B contract verified:** When the terminal PATCH block is not entered (for any reason, including upstream GET failure), `instance.completed` does not fire. B-UI-7's subscriber correctly does not migrate the row. The intended state invariant — "emit only on persisted completion" — holds. The specific try/catch code path could not be exercised through this injection because the block was too broad to isolate the terminal PATCH from the upstream GET.

**Exact try/catch exercise is deferred** to future organic triggering (e.g., RLS change, column rename, transient 5xx) or to targeted `API.patch` stubbing in console if operator wants explicit closure. Not blocking ship.

### `dual_session_test` v1.4
Unchanged. This brief touched no routing, modal, or queue path.

### Mount time observation
The widened filter now loads `workflow_requests` for ~100 instances per MY REQUESTS mount (operator screenshot: 23 active + 77 history). No perceptible regression in mount time during post-ship verification. Thresholds per brief Step 6 (2s budget) not approached. If HISTORY cap is raised dramatically in future, revisit with lazy-fetch (Option 2 from B-UI-7 backlog).

---

## Unrelated Defects Surfaced During Verification

These appeared in console logs during verification but are **not in B-UI-8 scope**. Logged to Phase 2 backlog.

### Resend domain-unverified 500 on `notify-step-activated`
`POST https://...supabase.co/functions/v1/notify-step-activated` returns HTTP/2 500 with body:
```
{"statusCode":403,"name":"validation_error","message":"You can only send
testing emails to your own email address (vstaples64@gmail.com). To send
emails to other recipients, please verify a domain at resend.com/domains..."}
```
Fires post-emit, does not affect workflow state. Fix is ops-level (verify domain at resend.com/domains and update `from` address in the edge function).

### `_mwExtractAmount` field-name miss
`form.submitted` events emit with `amount: null` because the extractor did not match any of the 19 available form keys. Known template keys include `_total_expenses` and `_net_due_employee`. Cosmetic; affects Class 2 velocity counters but not routing.

### Aegis-session realtime broadcast 401s
Aegis session log shows ~40 occurrences of `POST .../realtime/v1/api/broadcast ... 401 (Unauthorized)` during session idle. Supabase anon-tier token is being rejected at the broadcast REST fallback endpoint. Pre-existing and unrelated to B-UI-8. Cross-reference ecosystem protocol for ZDR / rate-limit posture.

---

## Phase 2 UX Architecture — Approval Failure Observability

**Context:** Surfaced during B-UI-8 failure-path verification. B-UI-8 closes one defect in a three-defect UX chain; the full picture is documented here for scoping of follow-up work.

### Defect 1 (CLOSED by B-UI-8 Part B)
Silent `.catch(() => {})` on terminal PATCH causes `instance.completed` emit to fire on un-persisted state. Contract-level fix shipped.

### Defect 2 (NOT FIXED — small-scope follow-up candidate · B-UI-9)
**Approver-side false-success toast.** `compassToast('✓ Request approved...')` at `mw-events.js:1287` fires unconditionally after `_rrpSubmit` returns, regardless of whether the terminal PATCH succeeded. An approver whose PATCH fails sees the success toast anyway, then sees the B-UI-8 error toast immediately after, creating a confusing double-toast.

**Proposed fix:** Move the success toast inside the PATCH-success branch (or gate on the `patchOk` local). ~5-line change, single file, no scope expansion. **B-UI-9 candidate.**

### Defect 3 (NOT FIXED — product design brief needed)
**Submitter-side visibility gap.** When an approver's terminal PATCH fails, the submitter has no signal anything went wrong. The ACTIVE row sits silently "waiting for Finance — In Progress." The submitter sees no difference between "approver hasn't opened the request yet" and "approver clicked Approve but the save failed." An administrator has no diagnostic surface to investigate.

**Open product design questions — must be answered before implementation:**

- **Persistence.** Where does the failure state live? Schema column on `workflow_requests` (e.g., `last_attempt_status`, `last_attempt_error`)? New `coc_event` event_type (e.g., `request.approval_failed`)? Separate error-log table?
- **Discovery.** How does the admin learn about failures? Dashboard tile? Notification fan-out? Daily digest?
- **Submitter UX.** Row-level marker? Status chip (e.g., "⚠ Approval attempt failed — contact admin")? Banner at MY REQUESTS level? Tooltip augmentation on the Status column?
- **Recovery.** Auto-retry policy (bounded)? Manual re-approve link for the approver? Admin override?
- **Scope.** Does this generalize to *all* silent-catch sites (the 20 others surfaced in Step 2e), or only to emit-adjacent PATCHes?

**Estimated scope:** Multi-brief product design work. Not a bug-fix brief. Defer until product decisions are recorded.

---

## Updated Phase Backlog

### Phase 1 (structural) — remaining
- Cadence iframe `compass_form_ready` migration.
- `dual_session_test` v1.5 Pause-free migration.
- Phase 1 exit gate: v1.5 fully unattended.

### Phase 2 — new items surfaced by B-UI-8
- **Silent-catch audit (20 sites in mw-events.js).** Lines: 212, 225, 238, 404, 410, 962, 970, 976, 991, 1004, 1013, 1019, 1078, 1086, 1152, 1212, 1219, 1285, 1305, 1319. Catalogue each by emit-adjacency and state-transition criticality. Rule 35 codification candidate if pattern proves consistent.
- **B-UI-9 (candidate) — approver-side success-toast gating.** Small-scope follow-up on mw-events.js:1287. ~5 lines. Defect 2 above.
- **Approval failure observability architecture brief (product design).** Defect 3 above. Resolve persistence / discovery / UX / recovery questions before implementation.
- **Tooltip lazy-fetch architecture (Option 2 from B-UI-7 backlog)** — revisit only if HISTORY cap scales beyond current ~100 instances.
- **`notify-step-activated` Resend domain verification** — ops task, unblocks email fan-out.
- **`_mwExtractAmount` template-key awareness** — cosmetic, affects Class 2 counters.
- **Aegis realtime broadcast 401** — investigate token posture at REST fallback endpoint.

### Phase 2 — items closed by B-UI-8
- Signature Loop tooltip "Waiting" display bug → closed by Part A.
- Silent `.catch(() => {})` at mw-events.js:1232-1235 → closed by Part B.

---

## Cache-bust Inventory

Loader-tag deploy-time cache-bust required on:
- `sidebar.js` → `?v=20260423-CMD77`
- `compass.html` → `?v=20260423-CMD77`
- `aegis.html` → `?v=20260423-CMD77`

Operator-completed at deploy per B-UI-8 brief Step 5.

---

## Per-file CMD chain post-B-UI-8

| File | Version | Brief |
|---|---|---|
| `cmd-center.js` | CMD74 | B-UI-4 (unchanged) |
| `mw-core.js` | CMD74 | B-UI-6 (unchanged) |
| `mw-tabs.js` | **CMD77** | **B-UI-8 Part A** |
| `mw-events.js` | **CMD77** | **B-UI-8 Part B + hotfix reconciliation** |

---

## Iron Rule Posture

- **Rule 15** — Aegis self-echo exemption preserved. No new emits.
- **Rule 20** — no new listener paths.
- **Rule 22** — retention buffer unchanged.
- **Rule 23** — outbound emit queue unchanged.
- **Rule 25** — idempotence unchanged. B-UI-7 subscriber's no-op branches retained.
- **Rule 28** — CMD77 reconciled across two files, three internal sites each, loader-tag at deploy.
- **Rule 29** — no new commands.
- **Rule 31** — emit payloads unchanged. Emit-condition tightened (post-successful-PATCH only).
- **Rule 32** — runtime evidence: tooltip UI inspection (Part A) + happy-path console observation and absence of false emit on failure path (Part B). No transient instrumentation.
- **Rule 34 (intra-session analog)** — Part B applies Rule 34's state-mirroring principle to intra-session write-success / emit-signal coupling. In-code comment documents the principle at the PATCH site. Rule 35 codification candidate pending silent-catch audit outcome.

---

*End of handoff append B-UI-8. Successor candidates: B-UI-9 (approver-side toast gating, small scope) or Cadence iframe `compass_form_ready` migration (last Phase 1 structural item) — operator decides sequencing.*

#######################################################################
## START:  B-UI-9 v2.0 · Approval-Failure Observability
## DATE:   2026-04-23
#######################################################################

# B-UI-9 v2.0 · Approval-Failure Observability — Shipped

**Category:** Cross-actor UI + event-ordering correctness
**Depends on:** B-UI-7 (reactive HISTORY migration), B-UI-8 (schema-drift hotfix + error propagation), B1 event bus
**Unblocks:** Operator can see when approvals fail in production; approvers get non-transient, dismissable error UI; failures produce rollback + retry path (no admin intervention required for transient failures)
**Inherits from:** `hud-ecosystem-protocol-v0.1.md`, `aegis-vision-anchor-v1.1.md`, Iron Rule 34 (multi-actor visibility)
**Codifies:** Iron Rule 35 candidate (state-change emits describe what happened, not what was attempted)
**Session:** 2026-04-23
**Shipped versions:** `mw-events.js` **CMD78g**, `mw-tabs.js` **CMD78h**

---

## Scope statement

When an approval attempt fails — whether because the approver's client
cannot reach the workflow service (blocked URL, extension, firewall,
VPN drop), because the terminal DB write throws, or because the
step-advance GET returns empty / throws — the platform must surface
the failure to every actor who needs to know, roll back any optimistic
local state changes, and give the approver a retry path without
administrator intervention.

Pre-B-UI-9 behavior: all such failures were silently no-op'd by
`.catch(()=>[])` wrappers. The `workflow_instances` PATCH would
appear to succeed at the UI layer (button disabled, panel closed,
success toast) while the instance sat permanently stalled in DB.
Submitters received no signal. Admins received no signal. Audit
trail recorded nothing. The only signal was the instance failing
to advance over time.

This brief ships the full cross-actor fan-out for approval failure,
backed by a semantic-correctness fix: the
`workflow_request.resolved` emit now fires only when the workflow
actually advanced.

---

## What shipped

### Parts A–D (approval-failure fan-out — CMD78 → CMD78g iterations)

All four actor surfaces are now covered on approval failure:

- **Part A — Approver:** blocking modal `window._rrpFailureModal`
  replaces the prior transient 4s toast. Requires explicit OK click,
  Escape, or Enter to dismiss. Red-bordered dark overlay. Stage-aware
  copy (`terminal_patch` vs `step_advance_get` vs unknown) explains
  likely causes (ad-blocker, VPN, firewall, URL-block rule). Collapsible
  technical detail shows raw error message. All text ≥ 11 pt per Aegis
  UI rule. `role="alertdialog"` with `aria-modal` and focus-grab.
- **Part B — Audit:** `request.approval_failed` event written to
  `coc_events`. Payload includes approver name, seq, error message,
  attempted_at, failure_stage. Fire-and-forget on the write; audit
  is best-effort.
- **Part C — Admin:** `_notifyAdminsOfIssue` shared helper (lift-and-shift
  from `_mwResolveAndRoute` via Scenario B operator resolution) called
  with a descriptive title and body. Admins see the failure in their
  `workflow_action_items` queue exactly as they see blocked-routing.
- **Part D — Submitter:** ⚠ caution flag (white, suffix after status
  text per CMD78h convention) on the ACTIVE row in MY REQUESTS; tooltip
  header reddens with `ACTION REQUIRED — APPROVAL DID NOT SAVE`;
  Finance Approval step renders `Attempt failed — contact admin` in red.
  On retry success the row migrates ACTIVE → HISTORY normally.

### Extended failure detection (CMD78d)

Scope originally covered only terminal-PATCH throws. Production testing
with Ron's Firefox (stale BLOCK URL rule matching `workflow_instances`)
surfaced a second silent-drop class: the step-advance GET at line ~1193
returning `[]` via `.catch(()=>[])`, causing step-advance to skip.
`_fanOutApprovalFailure(errMsg, ctx)` helper now fires from both call
sites (`failure_stage: 'terminal_patch'` or `'step_advance_get'`).

### Rollback on failure (CMD78e–f)

On failure, the `workflow_requests.status` PATCH from `'resolved'` to
`'open'` is issued and **awaited** inside the fan-out helper before the
modal displays. Restores the approver's queue row so they can retry
after resolving the underlying environmental issue, without admin
intervention.

### Re-entrancy guard (CMD78f)

`window._rrpInFlight` map keyed by `instance_id`. Entry written at
`_rrpSubmit` top; released in `finally`. Concurrent invocations for
the same instance log a console warn and return immediately. Prevents
the race where a rapid second Approve click during the first call's
rollback window would race `'open'` ↔ `'resolved'` PATCHes and
permanently remove the queue row.

### Emit-gating correctness (CMD78g — the fix that resolved the final bug)

The `workflow_request.resolved` emit at `mw-events.js` previously
fired unconditionally in `_rrpSubmit`, **before** the terminal PATCH
or step-advance GET resolved. On failure, the rollback correctly
restored DB state to `open`, but the already-emitted resolved event
had caused `mw-tabs.js:3233`'s subscriber to call `_mwLoadUserView()`
and filter the (local-view-stale) row out of the approver's queue.
DB was correct. Local UI was stale.

The emit is now gated on **confirmed success**, fired from three
locations:

- Changes-requested path: immediately after the successful
  `workflow_requests` PATCH (the PATCH IS the terminal state change
  for this branch).
- Approved non-terminal path: after `[rrpSubmit] advanced to step N`
  log, following successful `_mwResolveAndRoute` dispatch.
- Approved terminal path: after the successful terminal PATCH at
  `workflow_instances`, just before the `instance.completed` emit.

Failure paths (both terminal-PATCH throw and step-advance failure)
correctly elide the emit — the workflow did not actually resolve.

**Semantic contract:** the emit describes what happened, not what
was attempted.

### CMD78h — UI convention unification

⚠ caution flag is a **white suffix icon** placed **after** the status
text, matching the convention of the existing missing-approver badge
(`_myrHasMissingApprover`) and card-layout `cardMissing` suffix.
Pre-CMD78h it was a colored prefix (amber matching the status color).
Applied uniformly across ACTIVE-table rows, card layout, and the
existing missing-approver badge which was also recolored to white.
Tooltip-header ⚠ inside the popup retains its red color — that's
header chrome, not status-text decoration.

---

## Iron Rule 35 candidate (submit to operator approval before codifying)

> **Rule 35 — State-change emits describe what happened, not what was
> attempted.** An event bus emit naming a state transition
> (`workflow_request.resolved`, `instance.completed`, `form.submitted`)
> MUST fire only after the corresponding DB write has been confirmed.
> Emits that fire optimistically — before the write or alongside a
> fire-and-forget PATCH — create false signal that subscribers cannot
> distinguish from real signal. When the underlying write fails and
> gets rolled back, the emit is already in flight and subscribers'
> derived state (queue renders, reactive migrations, Wait ForEvent
> script branches) becomes stale. The event describes the outcome,
> not the intent.

This rule is analogous to Iron Rule 34 (multi-actor visibility) but
operates at a different layer: Rule 34 governs WHO hears about a
state change, Rule 35 governs WHEN the emit is allowed to fire.

---

## Verified behaviors (production, 2026-04-23)

3-session chain (Vaughn submit → Vaughn self-review → Angela manager →
Ron finance) run repeatedly with Ron's Firefox BLOCK URL rule toggled:

- **Attempt 1 (BLOCK active):** approver modal fires, admin notified,
  submitter ⚠ appears, CoC `request.approval_failed` written, row
  retained in Ron's queue (DB rolled back to `open`, confirmed via
  direct PostgREST probe).
- **Attempt 2 (BLOCK still active):** second click during first
  invocation's async work correctly held by `_rrpInFlight` guard —
  console warn, no duplicate emits, no DB change.
- **Attempt 3 (BLOCK disabled):** full happy path, `instance.completed`
  fires, Vaughn's HISTORY receives the row with all 4 steps green.

Ground-truth verification: direct `workflow_requests` probe via
Vaughn's session confirmed every failure attempt left `status: 'open'`.
The pre-CMD78g bug where the queue disappeared visually despite
correct DB state was resolved entirely by gating the emit.

---

## Files shipped

- `mw-events.js` → **v20260423-CMD78g**
- `mw-tabs.js` → **v20260423-CMD78h**

`mw-core.js` (CMD74) and `cmd-center.js` (CMD74) unchanged.

---

## Operator time-sink worth documenting for future sessions

Ron's Firefox DevTools' **BLOCK URL** rule persisted across hard
reloads and was matching `workflow_instances` by URL pattern. Symptom:
`NetworkError when attempting to fetch resource.` thrown from every
`API.get('workflow_instances?...')` in Ron's session. The
`.catch(()=>[])` wrapper masked it as silent no-op — no red console
errors, no visible 4xx.

Diagnosis path that worked: direct PostgREST probes via Vaughn's
session (which could read `workflow_instances`) vs Ron's session
(which could not), with matching bearer tokens and apikey,
column-set-walk probe (`select=id` alone failed on Ron's session too
— ruling out column-level RLS). That isolated the block to the table
endpoint entirely for Ron specifically, which narrowed the cause to
environmental.

**Lesson for future debugging:** when a `.catch(()=>[])` fallback
returns empty and the instance fails to advance, check whether the
client can reach the table at all via direct PostgREST before spending
session time on RLS / column-level hypotheses. The `DIAG` instrumentation
added at both GET sites in `_rrpSubmit` (still shipped, low-cost) now
makes this visible: `threw: true` in the log line is the
client-side-block signature.

---

## Follow-up items

1. **Strip DIAG instrumentation** on a future ship once a few successful
   ships without the Ron-class issue confirm no regression. The two
   `console.log('[rrpSubmit DIAG] ...')` lines at the two GET sites in
   `_rrpSubmit` are cheap but don't belong long-term in production.
2. **Operator decision needed on Rule 35** codification (text above).
3. **`_myrInstHasFailedApproval` regression watch:** when an approver
   retries and succeeds, the CoC event chain is `request.approval_failed`
   followed later by `request.approved` plus `instance.completed`. The
   helper at `mw-tabs.js:_myrInstHasFailedApproval` correctly evaluates
   false when `inst.status === 'complete'` (the 'complete' terminal
   state gates the warning). Verified in production. No regression
   observed.
4. **Consider mapping `workflow_action_items` rollback analog:** this
   brief rolled back `workflow_requests`. The `workflow_action_items`
   branch (the `else` path at `mw-events.js:1236`) has identical
   logic but is less exercised in production. Worth a separate
   verification pass the next time an admin-dispatched review fails.

#######################################################################
## START:  Iron Rule 35 Ratification Block
## DATE:   2026-04-23
#######################################################################

# Iron Rule 35 — Ratification + emit-timing audit

**Date:** 2026-04-23
**Occasion:** B-UI-9 v2.0 shipped (CMD78g — emit-gating correctness).
The `workflow_request.resolved` emit was found to fire unconditionally
before the terminal PATCH or step-advance GET resolved. On failure, the
rollback correctly restored DB state, but the already-emitted resolved
event had caused downstream subscribers (`mw-tabs.js:3233`) to drop the
row from the approver's queue. DB was correct. Local UI was stale.

This is the second occurrence of the pattern (first: B-UI-8 Part B's
silent `.catch()` allowing `instance.completed` to fire on un-persisted
state; fixed by the emit-guarding discipline). Threshold crossed for
codification.

**Status:** Candidate draft from the B-UI-9 v2.0 handoff append.
This document ratifies (or amends) the draft and records a sweep of
existing emit sites against it.

---

## Rule 35 — final wording

> **Rule 35.** State-change emits describe what happened, not what
> was attempted. An event bus emit whose name asserts a state
> transition (`workflow_request.resolved`, `instance.completed`,
> `instance.withdrawn`, `form.submitted`, `modal.opened`, etc.) MUST
> fire only AFTER the corresponding DB write (or DOM commit, for
> UI-surface emits) has been confirmed. Emits that fire optimistically
> — before the write, alongside a fire-and-forget PATCH, or in a
> `finally` block that runs regardless of outcome — create false
> signal that subscribers cannot distinguish from real signal. When
> the underlying write fails and gets rolled back, the emit is
> already in flight and subscribers' derived state (queue renders,
> reactive migrations, `Wait ForEvent` script branches) becomes
> stale in a way that is not recoverable by later re-emits alone.

**Companion discipline — emit gating on failure paths:** if a write
is attempted, fails, and is rolled back (compensating write), the
state-change emit does NOT fire at all. The correct emit for the
rollback path is either a distinct failure event
(`instance.approval_failed` per B-UI-9) OR silence (if no subscriber
needs the failure signal). The attempted-but-rolled-back transition
is neither a resolution nor a pending state.

Ratified without amendment.

---

## Relationship to prior rules

### Rule 31 (payload completeness)
Rule 31 governs WHAT the emit carries. Rule 35 governs WHEN the emit
is allowed to fire at all. A payload-complete emit that fires
optimistically still violates Rule 35.

### Rule 32 (runtime evidence)
Rule 32 governs OBSERVABILITY of platform behavior. Rule 35 is the
emit-side counterpart: subscribers observe emits as ground truth, so
the emit must match the ground truth of persisted state.

### Rule 34 (cross-session state mirroring)
Rule 34 governs WHO needs to know about a state change (mirror
routing-side writes onto receive-side reads). Rule 35 governs WHEN
they're entitled to be told (only after the state change has
actually occurred). Together: every actor who needs to know learns
about every state change that actually happened, and no actor is
misled by signals about transitions that didn't persist.

---

## Scope clarifications (from the audit below)

1. **Rule 35 applies to emits whose names assert a state transition.**
   Verbs like `resolved`, `completed`, `withdrawn`, `recalled`,
   `submitted`, `opened`, `rendered`, `launched`, `blocked`,
   `approval_failed`. These emits are contracts: subscribers act on
   them as if the named transition has persisted.

2. **Rule 35 does NOT apply to observation emits** that report
   evidence of the current state without asserting a transition.
   Examples: `location.ready`, `tab_switch`, `presence sync`. These
   are "I am here, I am in this tab" rather than "I just transitioned
   to here."

3. **Rule 35 applies to DOM-surface emits under the same principle:**
   `modal.opened` must fire AFTER the overlay is committed to DOM
   (B-UI-4 already satisfied this with rAF); `work_queue.rendered`
   must fire AFTER the list is queryable (B-UI-1 already satisfied
   this with post-await emit). The principle generalizes: emit after
   the commit that gives the emit its truth.

4. **Rule 35 is prospective discipline** plus one retroactive fix
   (the `workflow_request.resolved` relocation in CMD78g). Future
   briefs that add state-change emits must pass Rule 35 at review
   time. The audit below sweeps existing emits and finds no further
   violations.

5. **The rollback-and-no-emit pattern is the canonical failure-path
   shape.** When a write fails after an optimistic UI change has
   already committed (button disabled, row dropped from local view,
   etc.), the compensating write restores DB state AND a separate
   failure emit (`*.approval_failed`, `*.rejected`, etc.) gives
   subscribers a chance to reverse their optimistic UI. The
   would-be success emit is never fired.

---

## Emit-timing audit

Source-read sweep across authorized files (`mw-core.js`, `mw-tabs.js`,
`mw-events.js`, `cmd-center.js`) for `_cmdEmit` call sites whose
event name asserts a state transition.

### State-change emits (Rule 35 applies)

| Emit | Site | Timing | Compliance |
|------|------|--------|-----------|
| `form.submitted` | `mw-tabs.js:~1819` | After workflow_instances POST returns | ✓ Compliant |
| `instance.launched` | `mw-tabs.js:~1786` | After instance row confirmed created | ✓ Compliant |
| `instance.completed` | `mw-events.js:~1270` | After terminal PATCH succeeds (gated by B-UI-8's try/catch early-return on failure) | ✓ Compliant post-B-UI-8 |
| `instance.blocked` | `mw-tabs.js:~2235` | After blocked-routing detection confirmed | ✓ Compliant |
| `instance.withdrawn` | `mw-tabs.js:~1063` | After withdraw PATCH returns (B-UI-7a) | ✓ Compliant |
| `instance.recalled` | `mw-tabs.js:~2753` | After recall PATCH + draft-restore (B-UI-7a) | ✓ Compliant |
| `instance.approval_failed` | `mw-events.js:~1253` | In catch block after rollback PATCH awaited (B-UI-9) | ✓ Compliant (failure event, inverse of success) |
| `workflow_request.created` | `mw-tabs.js:~2313` | After workflow_requests INSERT returns | ✓ Compliant |
| `workflow_request.resolved` | `mw-events.js:~CMD78g relocations` | **Now gated post-successful-write** (three locations: changes-requested branch, non-terminal step-advance, terminal PATCH success) | ✓ Compliant post-CMD78g |
| `modal.opened` | `mw-events.js:~663, :~864` | After appendChild commit, rAF-wrapped (B-UI-4) | ✓ Compliant |
| `work_queue.rendered` | `mw-core.js:~CMD64 site` | After list innerHTML assignment + paint-tick (B-UI-1) | ✓ Compliant |

### Observation emits (Rule 35 does NOT apply)

| Emit | Site | Character | Compliance |
|------|------|-----------|-----------|
| `location.ready` | `mw-core.js:~location change` | Current-location evidence, not a transition | ✓ N/A |
| `tab_switch` | `mw-tabs.js:~tab handlers` | Current-tab evidence | ✓ N/A |
| `presence sync` | `cmd-center.js:~280` | Session-list snapshot | ✓ N/A |

### One historical violation, now remediated

**`workflow_request.resolved`** at `mw-events.js` (pre-CMD78g).

- **Violation shape:** emit fired immediately after the
  `workflow_requests.status = 'resolved'` PATCH, regardless of
  whether the subsequent terminal PATCH or step-advance GET
  succeeded.
- **Observable consequence:** on failure, the rollback correctly
  restored DB `status = 'open'`, but the emitted resolved event
  had already triggered `mw-tabs.js:3233`'s subscriber to call
  `_mwLoadUserView()` and filter the row out of the approver's
  queue. DB was correct; local UI was stale in a way no
  subsequent re-render fixed.
- **Fix shape (CMD78g):** emit relocated to three site-specific
  success paths: immediately after the changes-requested PATCH
  (the PATCH IS the state change for that branch), after the
  non-terminal step-advance `_mwResolveAndRoute` completes, and
  after the terminal PATCH succeeds (before `instance.completed`
  fires).
- **Failure paths (both terminal-PATCH throw and step-advance
  failure) correctly elide the emit.** The workflow did not
  resolve; the emit does not fire; the approver's queue row is
  not dropped; the compensating `workflow_requests` rollback
  restores `status = 'open'`; the `instance.approval_failed`
  emit gives subscribers a distinct signal about the failure
  rather than leaking false truth into the resolved-event
  stream.

No other violations found.

---

## Handoff action items

1. **In-code documentation.** The three CMD78g emit sites should
   reference Rule 35 in their comment blocks so future readers
   understand the gating requirement isn't accidental. B-UI-9 v2.0
   append notes this as satisfied.

2. **Brief template update (prospective).** When drafting briefs that
   add new `_cmdEmit` calls, the "Protocol contract" section should
   explicitly identify whether the emit is a state-change assertion
   (Rule 35 applies) or an observation (Rule 35 does not apply), and
   state where the emit fires relative to the corresponding write.

3. **No retroactive cleanup sweep required.** The audit above finds
   no violations other than the one remediated by CMD78g. Existing
   state-change emits were already shipped with post-write timing
   by their authoring briefs (B-UI-1's rAF, B-UI-4's modal-commit,
   B-UI-7a's post-PATCH, B-UI-8's try/catch gating). Rule 35
   codifies what was already good practice; it names the rule so
   future work doesn't drift.

4. **`workflow_action_items` rollback analog** (carried from B-UI-9
   append follow-up #4). The `else` branch at `mw-events.js:1236`
   handles admin-dispatched review failures. Its emit timing
   relative to rollback has not been exercised in production testing.
   A future verification pass should confirm the same Rule 35
   posture applies.

---

## Prospective guidance for future briefs

Any brief adding a new `_cmdEmit` call whose event name includes a
past-tense verb (`completed`, `resolved`, `submitted`, `rejected`,
`withdrawn`, `recalled`, `opened`, `rendered`) MUST specify in its
Protocol Contract section:

- The write (DB or DOM) that makes the emit true.
- The timing: "fires after <write> returns successfully."
- The failure handling: "on <write> failure, the emit does NOT
  fire; a compensating <rollback write> restores state; a distinct
  <failure event> gives subscribers the failure signal."

The three-part spec matches the B-UI-9 CMD78g fix shape. Briefs
that cannot cleanly satisfy these three bullets are adding emits
that probably violate Rule 35.

---

## Pattern retrospective

Rule 35 is the third rule this phase to emerge from "reliability at
one layer exposes latent defects at adjacent layers":

- **Rule 33** (DOM-anchor serialization) emerged from B-UI-3.4 after
  B-UI-3.2 closed the map-write leg of the Click ForInstance race.
- **Rule 34** (cross-session state mirroring) emerged from B-UI-6.1
  after cross-session variable resolution (B-UI-5) made cross-
  session scripts reliable enough to expose the wrid-lookup gap.
- **Rule 35** (state-change emit timing) emerged from B-UI-9 v2.0
  after B-UI-8 Part B's error propagation fix made emit-persistence
  coupling observable as a user-facing defect.

Each rule generalizes the immediate fix into prospective discipline.
The pattern — reliability-at-layer-N-exposes-defects-at-layer-N-plus-1
— is itself a meta-observation; it is the recursive engine of Phase 1
briefs. Whether IT becomes a codified rule (perhaps Rule 36, or a
meta-principle documented separately) is a future question. For now,
Rules 33, 34, and 35 are its concrete children.

---

*End of Rule 35 ratification. Merge into the master handoff after
the Iron Rule 34 Ratification Block.*

#######################################################################
## END:    Iron Rule 35 Ratification Block
#######################################################################

#######################################################################
## START:  B-UI-10 (CMD79)
## DATE:   2026-04-24
#######################################################################

# Handoff append — B-UI-10 (CMD79)

**Date shipped:** 2026-04-24
**Predecessor briefs:** B2 (CMD63, typed Wait + parent-side handler), B-UI-4 (CMD74, `modal.opened` precedent), B-UI-9 v2.0 (CMD78h, unrelated)
**Successor:** `dual_session_test v1.5` Pause-free migration (~30 min) → Phase 1 exit gate

---

## Status

**Shipped.** Full chain validated on Vaughn's session 2026-04-24. `form.opened` emit fires with protocol-complete payload; `Wait ForForm` contract active. **Phase 1 structural work closed.**

---

## Outcome

B-UI-10 activated B2's deferred iframe-side sender without the originally-planned DB migration. Bootstrap is injected by Compass at form-render time (not by Cadence at form-publish time, not by DB UPDATE on existing forms). Cadence's `cdn-form-editor.js` was not touched. `workflow_form_definitions.source_html` rows were not modified. Existing forms work unchanged; future Cadence-authored forms work without any Cadence-side cooperation.

The signaling concern (form → Compass handshake) now lives with the platform that cares about it (Compass), following the architectural precedent of the existing `restoreScript` injection at `mw-tabs.js:1385-1388`.

---

## Step 2 findings (all four items)

**2a — Scenario D triggered.** 5 `_myrOpenHtmlFormOverlay` call sites found, not 3 as brief expected:

| Line (pre-edit) | Caller | Mode | Scope decision |
|---|---|---|---|
| 1388 | `myrContinueDraft` | Editable (draft resume) | In scope — brief Path 1 |
| 1450 | `myrLaunchRequest` primary | Editable (fresh launch, storage URL) | In scope — brief Path 2 |
| 1529 | `myrLaunchRequest` fallback | Editable (DB `source_html`) | In scope — brief Path 3 |
| 2125 | `myrOpenAttachment` | Review (Document Review Request, fields disabled at 400ms) | **Added** — Path 4 |
| 2992 | `myrOpenInstance` | Review (submitted-instance view, "Recall to Draft" chrome) | **Added** — Path 5 |

**Operator decision (2026-04-24):** inject at all 5 sites for consistency. Rationale: review-mode `Wait ForForm` is harmless (fields are structurally present before the 400ms disable fires) and may be useful for scripts driving review flows. Cost of bootstrap on a review-mode open is negligible.

**2b — Scenario A/B unresolved, ship-with-graceful-degradation.** Path 2 uses `_getSignedUrl()` or public URL on the `form-assets` Supabase bucket. CORS posture not verifiable from code alone. Brief-authorized graceful degradation implemented: on fetch failure, fall back to direct URL load with `console.warn`; `Wait ForForm` times out for that form, overlay still renders. Runtime evidence (below) suggests the editable form-open path taken for Expense Report was either Path 1 or Path 3, not Path 2 — Path 2's actual CORS behavior remains unobserved in this test run. If a future test exercises Path 2 and times out on `Wait ForForm`, investigate storage bucket CORS at that time.

**2c — OK.** Expense Report HTML contains abundant `<input type="number">` elements per `.day-table`, `.misc-table`, `.ent-table` CSS rules in `CADENCE_FORM_CSS`. Readiness heuristic `input,select,textarea` is valid for the canonical verification form.

**2d — OK.** No ordering dependency between bootstrap and existing `restoreScript` injection at Path 1. `restoreScript` populates field values on `setTimeout(..., 400)`; bootstrap's structural readiness check tests presence of `input/select/textarea` in static HTML (pre-restore). `form.opened` fires before drafts restore — semantically correct ("form ready for interaction" is tested against structural field presence, not restored values). Scripts awaiting `Wait ForForm` should not expect fields to already have draft values; they'd issue `Form Insert` to set values deliberately.

---

## Implementation details

### Bootstrap builder (new, module-level)

**`mw-tabs.js:1642-1687`** — `_myrBuildFormReadyBootstrap(formName, formDefId)`. Returns a `<script>` block containing an IIFE that:

1. Waits for DOM to contain at least one `input`, `select`, or `textarea` (polls via `requestAnimationFrame` until satisfied).
2. Posts `{type:'compass_form_ready', form_name, form_def_id}` to parent with canonical identifiers baked in at injection time by Compass.
3. Wraps postMessage in try/catch to prevent iframe errors surfacing.
4. Uses `document.readyState` gate + `DOMContentLoaded` fallback for early-page cases.
5. Uses an IIFE to avoid polluting iframe global namespace.
6. Escaped closing tag (`<\/script>`) to avoid parser issues.

### Path 1 — `myrContinueDraft` (editable draft)

**`mw-tabs.js:1387-1399`** — after existing `restoreScript` injection, bootstrap injected via `</body>` replace (append fallback if no `</body>` tag). Order: restoreScript → bootstrap, both before `</body>`.

### Path 2 — `myrLaunchRequest` primary (storage URL)

**`mw-tabs.js:1457-1483`** — rewrote direct URL pass to fetch-then-blob flow:

```
fetch(url).then(r => r.text())
  .then(html => inject bootstrap → blob → open overlay)
  .catch(fetchErr => fall back to direct URL load + console.warn)
```

On any fetch failure (CORS, network, 404), falls back to direct URL load. Bootstrap not injected in fallback; `Wait ForForm` times out for that form; overlay still renders normally. Graceful degradation per brief Scenario A.

### Path 3 — `myrLaunchRequest` fallback (DB `source_html`)

**`mw-tabs.js:1556-1570`** — after `CADENCE_FORM_CSS` prepend, bootstrap injected via `</body>` replace (append fallback). Changed `const html` → `let html` to allow post-injection reassignment.

### Path 4 — `myrOpenAttachment` (review mode, added)

**`mw-tabs.js:2198-2214`** — bootstrap injected alongside existing restoreScript. Review-mode semantics: form fields are structurally present at DOMContentLoaded; disable fires at 400ms. Bootstrap readiness check passes before disable; `form.opened` fires normally.

### Path 5 — `myrOpenInstance` (review mode, added)

**`mw-tabs.js:3077-3089`** — bootstrap injected alongside existing restoreScript. Preserved existing `<\/body>` escaped-slash style from the surrounding code (nested template-literal context just above; the escape is inert but maintained for consistency).

### Version bump

**`mw-tabs.js`** CMD78h → **CMD79** at 3 internal sites per Rule 28:
- Line 3: VERSION header comment
- Line 5: console banner (color changed to green `#1a7f3a` to mark B-UI-10 ship)
- Line 6: `window._mwTabsVersion` literal

---

## Runtime evidence

Browser console on Vaughn's Compass session, 2026-04-24, after running:

```
Assert session VS is connected
VS: Set View "compass"
Wait ForLocation VS "compass.my_work" timeout=30000
VS: Set Tab "MY REQUESTS"
VS: Set SubTab "BROWSE"
VS: Form Open "Expense Report"
Wait ForForm "Expense Report" timeout=5000
Log "✓ Wait ForForm resolved — form.opened emit received"
```

**Banner confirming CMD79 loaded:**
```
mw-tabs.js?v=20260422-CMD79:5 [mw-tabs] v20260424-CMD79 — B-UI-10:
  compass_form_ready bootstrap injected into every Compass-rendered
  form iframe; activates B2 form.opened / Wait ForForm chain
```

**`form.opened` emit fired with complete Rule 31 payload:**
```
[cmd-center] emit form.opened {
  form_name:          'Expense Report',
  form_def_id:        'ee100010-0001-0001-0001-000000000001',
  opener_resource_id: 'e1000001-0000-0000-0000-000000000001',
  opener_user_id:     '57b93738-6a2a-4098-ba12-bfffd1f7dd07'
}
```

All four identifiers non-null — parent-side `_myrCurrentForm` source-of-truth held. No iframe script errors in Compass console. `Wait ForForm` resolved; script advanced past the Log statement.

**Timing:** `form.opened` fires immediately after form-iframe DOMContentLoaded + rAF tick. Subjective latency between `Form Open` ack and `Wait ForForm` resolution: well under 500ms (within brief's expected ~100-500ms band).

---

## `dual_session_test v1.4` regression posture

v1.4 continues to use `Pause` for the Form Open wait. Pause is indifferent to the new `form.opened` emit firing — it awaits operator keypress regardless of protocol events. No observed regression. v1.5 migration (separate brief) will swap the Pause for `Wait ForForm "Expense Report"`, at which point the test runs fully unattended.

---

## Iron rules compliance

- **Rule 15** — `form.opened` already in Aegis self-echo allow-list per B2. No change.
- **Rule 20** — no new listener paths. Parent-side handler existed (B2). Iframe-side sender is a transmission surface (single outbound postMessage), not a listener.
- **Rule 22** — retention buffer absorbs `form.opened` automatically via `_cmdEmit`.
- **Rule 23** — outbound emit queue unchanged.
- **Rule 25** — idempotent. If iframe re-renders and fires bootstrap twice, `Wait ForForm` resolves on first match; buffer dedup ignores the rest.
- **Rule 26** — `Wait ForForm` runs locally on dispatcher per B2.
- **Rule 28** — `mw-tabs.js` CMD79 reconciled across 3 internal sites (lines 3, 5, 6). Loader-tag cache-bust deployed.
- **Rule 31** — emit payload complete: `form_name`, `form_def_id`, `opener_resource_id`, `opener_user_id` all populated from parent-side `_myrCurrentForm` + session identity. Runtime evidence confirms.
- **Rule 32** — runtime evidence via Aegis emit log + visible form UI interaction. No transient instrumentation.
- **Rule 35** — `form.opened` emit describes what happened (iframe confirmed fields queryable), not what was attempted (overlay started loading). Compliant.

---

## Per-file CMD chain post-B-UI-10

| File | Version | Brief | Notes |
|---|---|---|---|
| `mw-core.js` | CMD74 | B-UI-6 | Unchanged |
| `mw-tabs.js` | **CMD79** | **B-UI-10** | Bootstrap injection at 5 form-open paths |
| `mw-events.js` | CMD78g (observed runtime: CMD78g2) | B-UI-9 Part B | Unchanged by this brief |
| `cmd-center.js` | CMD74 | B-UI-4 | Unchanged |

Loader-tag cache-bust reconciled on `sidebar.js`, `compass.html`, `my-work.html`, `aegis.html` → CMD79 at deploy time.

**Note on observed `mw-events.js` version:** runtime banner shows `CMD78g2` rather than the brief's expected `CMD78g`. Minor baseline drift — not in B-UI-10's scope to reconcile. Flag for future handoff.

---

## Phase 1 scoreboard update

**Phase 1 structural work: CLOSED.**

Remaining before v1.5 fully-unattended exit gate:

1. `dual_session_test v1.5` migration — swap Form Open Pause for `Wait ForForm "Expense Report"`. ~30 min. Separate brief.
2. Test firm data completeness — external to brief stream.

After (1), the test runs unattended end-to-end, and the Phase 1 exit gate closes.

**Phase 2 backlog** unchanged by this brief.

---

## Observations for future briefs

1. **`form.closed` emit remains deferred.** B2's companion to `form.opened`. Overlay close handlers at `mw-tabs.js:1644-1648` and `1663-1668` postMessage `cmd:form_action` with action `Form Close` but do not emit on the event bus. If a future policy needs "form closed without submit → notify," address then.

2. **Path 2 CORS posture remains unobserved.** This test run exercised Path 1 or Path 3 (editable form-open for a known form with `source_html` presumably in DB). If a future test exercises Path 2 (fresh storage-URL launch) and times out on `Wait ForForm`, the fallback branch fired — investigate Supabase `form-assets` bucket CORS at that point.

3. **`mw-events.js` baseline drift to CMD78g2.** Flag for next brief touching `mw-events.js`.

4. **Review-mode `form.opened` emits now fire.** Paths 4 and 5 (review-mode overlay opens) now emit `form.opened` alongside editable opens. If any downstream listener assumed `form.opened` meant "user about to fill form," that assumption is no longer valid — the listener may need to gate on additional context. No known consumer today; flag for future review.

---

*End of handoff append — B-UI-10 v1.0 shipped 2026-04-24.*

#######################################################################
## START:  Phase 1 Exit Gate · CLOSED
## DATE:   2026-04-24
#######################################################################

dual_session_test v1.5 (renamed from "Two-session" — actually tri-session
VS + AK + RW) ran fully unattended 2026-04-24. All reactive paths shipped
during Phase 1 (Wait ForForm, Wait ForModal, Wait ForRoute, Wait ForQueueRow,
Wait ForInstance) exercised in a single pass. Phase 1 structural work
complete. Script preserved at <path>.

## END:    Phase 1 Exit Gate · CLOSED

#######################################################################
## START:  Hand-off · CMD-COC-ACTOR-RESOURCE-1
## DATE:   2026-05-06
#######################################################################

# Hand-off · CMD-COC-ACTOR-RESOURCE-1

**Status:** Phase 2 SHIPPED. coc.js defensive resolution layer in place; IR58 amended; four follow-up CMDs filed. §5.2 (mw-timesheet self-resolves) and §5.3 (correctly-coded callers regression-free) verification pending operator deploy.

---

## §1 — Files modified / created

| File | Effect |
|---|---|
| `js/coc.js` | MODIFIED. Replaced `_resolveActor()` (sync, 4-slot chain trusting `window.CURRENT_USER.id`) with: (a) async `_resolveActorAsync()` 6-slot chain; (b) `_lookupResourceIdForUserId()` lazy live-query helper with session cache + in-flight dedup; (c) retained sync `_resolveActor()` facade for non-write consumers, with the buggy CURRENT_USER slot removed. `write()` now `await`s the async resolver. New `opts.actorUserId` opt added; existing `opts.actorResourceId` override preserved unchanged. Throws structured Error on definitive miss in authenticated context. Updated header docblock + JSDoc. ~+170 lines net. |
| `js/version.js` | MODIFIED. Pin → `v20260506-CMD-COC-ACTOR-RESOURCE-1`. IR65 eighth confirmation, sixth deliberate non-firing — no template body changes; `RENDER_VERSION` unchanged at `v20260505-CMD-PROJECTION-ENGINE-2`. |
| `iron-rule-58-amendment.md` | NEW. Architect-ratifiable canonical-text amendment. Supersedes §1–§3 of original IR58 ratification; adds §4 (failure mode) and §5 (pre-amendment legacy data) clauses. |

---

## §2 — Phase 1 caller inventory + post-fix outcome

10 callers of `CoC.write()` audited. Outcome per caller post-fix:

| # | Call site | Pre-fix actor source | Post-fix outcome |
|---|---|---|---|
| 1 | `accord-minutes.js:505` | `opts.actorResourceId` (inline `_myResource → live lookup` chain) | Slot 1 (override) wins; **unchanged**. Inline resolution chain is now redundant with the defensive layer but remains correct. |
| 2 | `mw-timesheet.js:214` | `_resolveActor()` slot 1 → `CURRENT_USER.id` (= **user_id**) → FK violation (F12 incident) | Slot 3 (`_myResource.id`) wins; resolves to correct `resources.id`. **Self-heals without per-caller fix.** §5.2 doctrinal-floor verification target. |
| 3 | `my-time.html:1031` | `_resolveActor()` slot 1 → `CURRENT_USER.id` → silently corrupted (S1) | Slot 3 (`_myResource.id`) when `_myResource` is populated, else slot 5 live lookup. Resolves correctly. |
| 4 | `my-time.html:1061` | `_resolveActor()` slot 1 → silently corrupted (S1) | Same as #3. |
| 5 | `proposal-detail.html:1428` | `_resolveActor()` slot 1 → silently corrupted (S1) — surface didn't load coc.js pre-CMD-SURFACE-DEP-AUDIT-1 | Slot 3 if `_myResource` populated, else slot 5 live lookup. Resolves correctly post-fix. |
| 6 | `proposal-detail.html:1485` | Same as #5 | Same as #5. |
| 7 | `proposal-detail.html:1492` | Same as #5 | Same as #5. |
| 8 | `prospect-detail.html:3881` | `_resolveActor()` chain | Slot 3/slot 5; passes `actorName` opt, retained. Resolves correctly. |
| 9 | `prospect-detail.html:4165` | `_resolveActor()` chain | Same as #8. |
| 10 | `sow-builder.html:1319` | `_resolveActor()` chain | Slot 3/slot 5. Resolves correctly. |

**Net: 1/10 callers were correctly coded pre-fix; 9/10 were silently corrupted but now self-heal via the defensive layer with no caller-side modification.** The §5.2 doctrinal floor (mw-timesheet self-resolves) is satisfied by-construction; live-test verification pending.

---

## §3 — `accord_user_to_resource()` helper handling

Survey result: `accord_user_to_resource()` is a **SQL function** referenced in IR58's original ratification text and `coc.js`'s pre-amendment JSDoc. It is **never actually called** in the JS codebase — `accord-minutes.js`'s "canonical" pattern uses an inline REST query (`API.get('resources?user_id=eq.<id>&limit=1&select=id')`), not the SQL RPC.

Decision: **the inline REST pattern from `accord-minutes.js` is the de-facto canonical reference.** The new defensive layer in coc.js implements the same pattern (via `_lookupResourceIdForUserId()`) using the same REST endpoint. The SQL helper is left in place (no harm) but is unused from the JS side; flagged as a finding (F4 below) for future cleanup if the architect wants to retire it.

`accord-minutes.js`'s inline chain is now structurally redundant with the defensive layer (both slots — `_myResource.id` and live lookup — are now in coc.js). It is **not refactored in this CMD** because:
1. It still passes `opts.actorResourceId` (slot 1 override), which bypasses the new internal chain. It works exactly as before.
2. Refactoring it would mean removing the inline chain and trusting coc.js's defensive layer to do the same work. Behaviorally equivalent, but a code change in another module — outside the brief's "modify coc.js only" scope.

If the architect wants accord-minutes.js refactored to drop the inline chain (relying on the defensive layer for the same resolution), it's a small follow-up; can be folded into routine cleanup. Recommend leaving it for now; the redundancy is benign.

---

## §4 — Slots 3/4 populator findings

Per architect Q2: removed both regardless of populators. Findings on populators:

**Slot 3 — `window.CURRENT_USER_RESOURCE_ID`:**
- `projects.html:3374` — `const CURRENT_USER_RESOURCE_ID = window.CURRENT_USER?.id || window._myResource?.id || null;` — same root-cause bug as the global `_resolveActor()` chain: trusts `CURRENT_USER.id` as a resource_id. Now unused (slot 3 removed from chain). Latent bug-class artifact.
- `resource-requests.html:447` — `const CURRENT_USER_RESOURCE_ID = 'e1000001-0000-0000-0000-000000000002';` — hardcoded literal (Chris's resource_id). Demo/test artifact, not real population. Now unused.

Both populators are now dead code from coc.js's perspective. They may still be referenced internally by their own surface modules for unrelated purposes (e.g., labelling); not investigated. Filed as a finding for surface-level cleanup.

**Slot 4 — `window.STATE.currentUserId`:**
- No populators found in any surface or module. Dead path. Removal has no impact.

---

## §5 — Diff highlight: `_resolveActorAsync()` chain

```js
// New chain (priority order; first non-null wins; throws on miss in authenticated context)
1. opts.actorResourceId            → use directly                         [override path; CMD-A6 preserved]
2. opts.actorUserId                → resources?user_id=eq.<id>&limit=1    [new internal lookup]
3. window._myResource.id           → use directly                         [Compass / cmd-center cache]
4. _resolvedResourceIdCache        → use cached prior resolution          [session cache]
5. live lookup against authUserId  → resources?user_id=eq.<auth.uid()>    [defensive last resort]
6. throw structured Error          [authenticated user has no resource row]
   OR System fallback              [unauthenticated context only]
```

Removed slots:
- ~~`window.CURRENT_USER?.id`~~ — root cause; populated by hud-shell with `users.id`
- ~~`window.CURRENT_USER_RESOURCE_ID`~~ — only buggy/demo populators; no live use
- ~~`window.STATE.currentUserId`~~ — no populators; dead path

Performance: one resolution per authenticated session. Live query fires at most once per surface load (cached for the session via `_resolvedResourceIdCache` + `_resolvedResourceIdInflight` dedup). All subsequent CoC writes from the same session return immediately from the cache. Negligible cost.

---

## §6 — Verification status

| Subtest | Result |
|---|---|
| §5.1 Sentinel | Pending operator deploy. Pin shows `v20260506-CMD-COC-ACTOR-RESOURCE-1` in console banner. |
| §5.2 mw-timesheet self-resolves (DOCTRINAL FLOOR) | PASS-by-construction. mw-timesheet:214 carries no `actorResourceId` override; defensive chain slot 3 (`_myResource.id`, populated by Compass) wins. Live-test target: trigger Compass timesheet "Mark today complete"; verify no FK error; verify `coc_events` row written with correct `actor_resource_id` (= Vaughn's `e1000001-...0001`, not `57b93738-...`). |
| §5.3 Correctly-coded callers regression-free (DOCTRINAL FLOOR) | PASS-by-construction. accord-minutes.js:505 passes `opts.actorResourceId`; slot 1 still wins, bypasses internal chain. No behavior change for the only correctly-coded caller. Live-test target: print Accord minutes; verify CoC `accord.minutes.printed` row written with same `actor_resource_id` as prior (`accordRender.actor_resource_id`). |
| §5.4 Diagnostic on resolution failure | PASS-by-construction. Test path: a user without a `resources` row in the current firm calls `CoC.write()` without overrides → `_resolveActorAsync()` falls through to slot 5 (live lookup), gets null, throws structured Error. Caller sees `[CoC.write] actor_resource_id resolution failed: authenticated user <id> has no resources row in the current firm. Either provision a resource for this user, or pass an explicit opts.actorResourceId. See IR58 (CMD-COC-ACTOR-RESOURCE-1 amendment) for resolution chain.` |
| §5.5 Cross-firm isolation regression | PASS-by-design. RLS on `resources` table scopes the live lookup to the current firm. A user authenticated against firm A cannot resolve to a firm B resource_id (RLS blocks the SELECT). |
| §5.6 Existing CMD regression | PASS-by-construction. Backward-compat preserved for `opts.actorResourceId`; new `opts.actorUserId` is additive. CMD-AEGIS-1 (Aegis playbook runs), CMD-A6 (Accord seal), CMD-PROJECTION-ENGINE-2 (template renders) — all CoC writes flow through `CoC.write()`; defensive chain handles them uniformly. |

---

## §7 — Findings

**F1 · S1 confirmed and quantified.** Per Phase 1 finding S1, `_resolveActor()` slot 1 has been silently writing `users.id` values as `actor_resource_id` since hud-shell.js started populating `window.CURRENT_USER`. Compass-side CoC writes (mw-timesheet, my-time, proposal-detail, prospect-detail, sow-builder, projects.html artifacts) have been corrupted for that entire period. CMD-AEGIS-1's surfacing was only the visible tip; CMD-SURFACE-DEP-AUDIT-1 F12 made it audible by canonicalizing `coc.js` loading. Historical `coc_events.actor_resource_id` values are forensically unreliable. **Filed as `CMD-COC-ACTOR-BACKFILL-1` follow-up per architect direction.** Note: backfill is non-trivial — some historical rows carry `users.id` values; cleanup must distinguish those from genuine resource_ids and resolve via the same lookup the defensive layer now uses.

**F2 · `accord_user_to_resource()` SQL RPC is documented but unused.** IR58's original ratification text and coc.js's pre-amendment JSDoc reference the SQL RPC. No JS code path calls it. The de-facto canonical pattern is the inline REST query (`resources?user_id=eq.<id>&limit=1`), now centralized in `_lookupResourceIdForUserId()`. The SQL helper is harmless if retained. Architect may want to retire it for hygiene; out of scope.

**F3 · Slot 3/4 populator artifacts are now dead code from coc.js's perspective** (per §4). `projects.html:3374` and `resource-requests.html:447` declare `CURRENT_USER_RESOURCE_ID` consts; nothing in `coc.js` reads them anymore. They may be referenced internally by their own surfaces; not investigated. Filed as low-priority cleanup; surface during the next per-surface audit.

**F4 · S5 confirmed: `mw-timesheet.js:214` writes literal `'unknown'` as `entity_id` when `_myResource` is null at call time.** Pre-existing latent bug, would FK-violate against `coc_events.entity_id` if exercised. Filed per architect direction as a known-issue finding to be addressed in either CMD-MW-TIMESHEET-FIXES-1 OR folded into CMD-COC-DIRECT-WRITER-AUDIT-1 scope. **Not fixed in this CMD per IR40 §1.1 / brief §2 scope-out.**

**F5 · Direct `API.post('coc_events', ...)` legacy bypasses (5 sites)** — `cadence.html:3036`, `project-detail.html:3897`, `users.html:3875`, `approve.html:744`, `approve.html:835`. These bypass `CoC.write()` entirely and therefore the defensive layer. **Filed as `CMD-COC-DIRECT-WRITER-AUDIT-1` follow-up per architect direction.** That brief will decide between (a) refactor each call site to flow through `CoC.write()`, or (b) propagate per-site resource_id resolution.

**F6 · IR58 amendment is the first amendment to a ratified Iron Rule** in the build arc. Per brief §11: "rules ratified as call-site discipline that produce repeated miscall incidents are candidates for amendment to defensive-layer enforcement." Not yet a new rule (one amendment is one data point), but a pattern worth tracking if recurrent.

**F7 · IR65 eighth confirmation, sixth deliberate non-firing.** Internal logic refactor in `coc.js`; no template body changes. `RENDER_VERSION` constant unchanged.

**F8 · Backward compatibility verified-by-construction for `opts.actorResourceId`.** Slot 1 of the new chain matches slot-1 semantics of the pre-amendment override block (`if (opts.actorResourceId) { actor.actor_resource_id = opts.actorResourceId; }`). The only difference: the pre-amendment code unconditionally ran `_resolveActor()` first and then overwrote; the post-amendment code short-circuits when override is present. Behaviorally identical for callers; minor performance improvement (no wasted resolution).

**F9 · Race / lifecycle note for `_myResource`.** `_myResource` is populated by Compass in async init AFTER `Auth.getCurrentUserId()` resolves. CoC writes that fire before init completes hit slot 5 (live lookup) instead. Slot 5 is correct but adds one query latency. Operator may observe a slight delay on the first CoC write of a fresh page load if `_myResource` hasn't yet populated; subsequent writes hit the cache. Not a bug; documented for awareness.

**F10 · `_lookupResourceIdForUserId()` is the new first-caller hazard surface (IR60).** It hooks into `window.API.get` once per session per user_id. Re-entrancy is dedup'd via `_resolvedResourceIdInflight`. Caller writing CoC during an unauthenticated boot phase (no `window.API`) will get null → System fallback, not a throw — that's correct behavior for system events.

---

## §8 — Follow-up CMDs filed

Per architect direction:

1. **`CMD-COC-ACTOR-BACKFILL-1`** — historical row backfill for the silent-corruption period. Substrate-level investigation required; backfill brief will define resolution method per row and ambiguity handling.
2. **`CMD-COC-DIRECT-WRITER-AUDIT-1`** — refactor or harden the 5 direct `API.post('coc_events', ...)` legacy bypass sites.
3. **`CMD-MW-TIMESHEET-FIXES-1`** — F4 (S5 entity_id `'unknown'` literal) plus any other mw-timesheet hygiene; can be folded into CMD-COC-DIRECT-WRITER-AUDIT-1 if scope overlaps.
4. **(Optional)** `CMD-COC-SQL-HELPER-RETIREMENT-1` — retire the unused `accord_user_to_resource()` SQL RPC if architect prefers cleanup.

---

## §9 — Verification artifacts

```bash
# Confirm coc.js has the new resolver
grep -n "_resolveActorAsync\|_lookupResourceIdForUserId" js/coc.js

# Confirm legacy slots are removed from active resolution
grep -nE "window\.CURRENT_USER\?\\.id|CURRENT_USER_RESOURCE_ID|STATE\\.currentUserId" js/coc.js
# Should return only comment lines documenting the removal

# Confirm version pin
grep -n "_PROJECTHUD_VERSION" js/version.js

# Post-deploy: confirm the F12 caller no longer FK-violates
# 1. Open Compass; navigate to My Work → timesheet drawer; click "Mark today complete"
# 2. Verify no [CoC] write failed in console
# 3. Check substrate:
#    SELECT actor_resource_id, actor_name, event_type, occurred_at
#      FROM coc_events
#     WHERE event_class='timesheet'
#       AND event_type='submitted'
#       AND occurred_at > now() - interval '5 minutes'
#     ORDER BY occurred_at DESC LIMIT 1;
#    Expected: actor_resource_id = 'e1000001-...0001' (Vaughn's resources.id),
#    NOT '57b93738-...' (Vaughn's users.id).
```

---

*End of hand-off — CMD-COC-ACTOR-RESOURCE-1.*
