# Brief B1 · Event Bus Wiring

**Phase:** 1 (Foundation)
**Depends on:** CMD53 deployed and `dual_session_test` v1.1 passing end-to-end
**Unblocks:** B2 (Wait commands), B6 (Predicate engine), M2 CoC live stream, CommandHUD bus subscription
**Inherits from:** `hud-ecosystem-protocol-v0.1.md`, `aegis-vision-anchor-v1.1.md`
**Estimated session:** 2–4 hours
**Brief version:** 1.1 · 2026-04-18
**Supersedes:** B1 v1.0 (adds protocol-compliant envelope)

---

## Scope statement

Wire seven `app_event` emit calls at seven identified code sites in
`mw-tabs.js`, `mw-events.js`, and `cmd-center.js`. Each emit publishes a
typed, protocol-compliant payload to the existing Supabase realtime
channel via a lightly enhanced `window._cmdEmit(name, data)` function.

**Do not** modify the channel subscription logic, the command vocabulary,
the UI shell, or the `Wait ForEvent` command. `Wait ForEvent` already works
against this bus; it just has nothing to wait on today. This brief gives it
something to wait on. B2 will add the specific `Wait ForLocation`,
`Wait ForInstance`, and `Wait ForRoute` commands that consume these events.

**Do not** build the policy evaluator. That is B6. This brief produces the
raw event stream; the evaluator is a later subscriber.

**Do not** build CommandHUD integration. CommandHUD subscribes to this
same bus per the ecosystem protocol, but its consumer side is out of
scope here. This brief emits the events in protocol-compliant form;
CommandHUD's subscription lands in a future, parallel workstream.

The success criterion is that after this brief ships:
1. The existing M2 CoC stream UI can be wired to render live events in a
   subsequent micro-task — but *rendering* is not part of this brief.
2. A CommandHUD session subscribing to the same channel sees
   protocol-compliant envelopes without requiring any migration shim.
3. The existing `dual_session_test` v1.1 continues to pass.

---

## Context files

The coding session reads these files, in this order:

1. `hud-ecosystem-protocol-v0.1.md` — full document, ~15 min. Pay
   particular attention to **Contract 1 (The event bus)**, specifically
   the message envelope.
2. `aegis-vision-anchor-v1.1.md` — full document, ~15 min.
3. `aegis-handoff-2026-04-17-milestone.md` — full document, ~15 min.
4. `cmd-center.js` — lines 308–456 (event bus, result handler,
   `_cmdEmit`, `_waitForEvent`, `_waitForEventFiltered`).
5. `cmd-center.js` — lines 2314–2443 (`_hookAppEvents`, property
   intercepts, including the existing `_cmdEmit('tab_switch', ...)` call
   at line 2323 — this is the template for every emit in this brief).
6. `mw-tabs.js` — the function that currently sets
   `window._lastSubmittedInstanceId` after form submission (search for
   this symbol). Note its exact location; an emit call lands adjacent.
7. `mw-events.js` — the section that handles workflow_requests routing
   and instance transitions (~line 934–1045, per the grep output).
8. `compass.html` — for context on how `mw-tabs.js` is loaded and what
   globals are available.

**Do not** read files beyond this list unless a specific need arises during
implementation, and if so, document why.

---

## Iron rules inherited

From `aegis-handoff-2026-04-17-milestone.md`:

- **Rule 15** — Self-echo filters keyed on `_mySession.userId` are fragile
  when one human runs multiple tabs. The existing `app_event` handler at
  line 310 already filters `d.from === _mySession.userId` to skip local
  echoes. **This is correct for app_events.** Do not change it.
- **Rule 16** — Null-guard UI element references in `cmd-center.js`. Not
  directly triggered by this brief, but emit sites must not assume DOM
  presence.
- **Rule 17** — Any DOM presence check in `_runScript` must be guarded
  `!window._aegisMode`. **Do not add emit calls to `aegis.html` or any
  path that runs under `window._aegisMode = true`.** Aegis never executes,
  so it never emits.
- **Rule 18** — `Get Latest <var>` preservation semantics. Not triggered.
- **Rule 19** — Variable substitution literal-token fallback. Not
  triggered.

From the Ecosystem Protocol:

- **Protocol Contract 1** — The envelope shape is non-negotiable. The
  envelope gets emitted verbatim. Payload fields inside the envelope are
  specified by this brief.
- **Protocol Contract 3** — Humans are identified by `resource_id`. Every
  payload that references a human carries `resource_id`, not just
  `user_id`.

From the Vision Anchor:

- **Commitment #1** — One event bus. This brief uses the existing
  `window._cmdEmit()`; do not create a parallel emit path.
- **Commitment #7** — CoC on every firing. *This brief does not touch
  CoC.* CoC writing is downstream of the policy evaluator (B6). These
  emits fire regardless of whether any policy consumes them.
- **Commitment #8** — No direct channel delivery from policies. Not
  triggered in this brief (no policy responses run here), but relevant
  because it clarifies why the event bus matters — it is the substrate
  CommandHUD will consume.

---

## Specification — the `_cmdEmit` envelope enhancement

Before wiring the seven emits, make one small enhancement to
`_cmdEmit` at `cmd-center.js` line 448. The current implementation
broadcasts `{event, from, name, ...userPayload}`. The protocol-compliant
envelope adds four fields and nests the user-supplied payload:

Current (line 448–456):
```js
window._cmdEmit = function(eventName, data) {
  if (!_channel || !_mySession) return;
  _channelSend({
    type: 'broadcast', event: 'app_event',
    payload: Object.assign({ event: eventName, from: _mySession.userId, name: _mySession.name }, data || {})
  });
  _resolveEventListeners(eventName, data);
};
```

Target:
```js
window._cmdEmit = function(eventName, data) {
  if (!_channel || !_mySession) return;
  var envelope = {
    protocol_version: 1,
    event_type: eventName,
    event_id: _uuid(),
    source_product: 'projecthud',
    source_session: _mySession.userId,
    ts: Date.now(),
    firm_id: FIRM_ID,
    payload: data || {},
    // Back-compat shims — maintain v1.0 field access for any consumer
    // that reads d.event, d.from, d.name directly. Remove in v2.
    event: eventName,
    from: _mySession.userId,
    name: _mySession.name,
  };
  _channelSend({ type: 'broadcast', event: 'app_event', payload: envelope });
  if (DEBUG_EVENTS) console.log('[cmd-center] emit', eventName, data || {});
  _resolveEventListeners(eventName, data);
};
```

Add a small `_uuid()` helper near the top of the IIFE (before the
`_loadSupabase` function). Use `crypto.randomUUID()` when available
with a fallback:

```js
function _uuid() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}
```

Add a `DEBUG_EVENTS` constant near the existing `_cmdCenterLoaded` guard
at line 23:

```js
var DEBUG_EVENTS = true;  // flip to false before production release
```

The back-compat shim fields (`event`, `from`, `name`) are deliberately
preserved so the existing `app_event` handler at line 310 continues to
work without modification. That handler reads `d.from === _mySession.userId`
for self-echo filtering — that lookup resolves the same way on the new
envelope.

### Verification before proceeding

After this envelope change, run `dual_session_test` v1.1 end to end. It
must still pass with no script edits. If it does not, the envelope
change introduced a regression — diagnose before moving on. **Do not
proceed to the seven emits until this passes.**

---

## Specification — the seven emits

Each emit call is ~3–5 lines: a single `window._cmdEmit(eventName, payload)`
invocation with a defined payload, placed adjacent to the behavior it
observes. The payload is **the inner payload**, not the full envelope —
`_cmdEmit` wraps it per the enhancement above.

The following table is normative; payload field names are locked and
constitute an ecosystem contract per protocol Contract 1.

### Emit #1 — `location.ready`

| | |
|-|-|
| **Fires when** | `_mwLoadUserView()` in `mw-tabs.js` finishes rendering the My Work view (end of function, after DOM is populated, before the return). |
| **Purpose** | Unblocks the 20+ second Compass-load `Pause` in `dual_session_test`. |
| **Payload** | `{ location, resource_id, user_id }` |
| **Required for B2** | `Wait ForLocation VS "compass.my_work"` |

Location string convention: `{view}.{tab}` lowercase, snake_case if tab
has spaces. Future views follow the same shape (`compass.my_time`,
`compass.my_calendar`, `aegis.m2`, etc.). Other locations are not required
in this brief; only `compass.my_work` fires.

### Emit #2 — `form.submitted`

| | |
|-|-|
| **Fires when** | The code in `mw-tabs.js` that sets `window._lastSubmittedInstanceId` completes. Immediately after the assignment; before any downstream UI actions. |
| **Purpose** | Canonical "a form was just submitted" event. Consumed by future policies and by `Wait ForInstance`. Also consumed by CommandHUD for agent-pipeline triggers. |
| **Payload** | `{ instance_id, form_name, submitter_resource_id, submitter_user_id, amount }` |
| **Required for B2** | `Wait ForInstance $instance_id` |
| **Required for B6** | All Class 1 threshold policies on form submission. |

The `form_name` field must carry the human-readable name ("Expense Report",
"PTO Request") not an internal ID, because downstream policies predicate on
it. The `amount` field is best-effort: parse the form's value map for
common field names (`amount`, `total_amount`, `expense_total`, `budget`);
set to `null` when absent. Document in a code comment which form fields
were inspected so B6 can extend the list.

### Emit #3 — `workflow_request.created`

| | |
|-|-|
| **Fires when** | `_mwResolveAndRoute(...)` in `mw-events.js` completes the routing step *after* the notes patch finishes (i.e., after the 1.5s timeout currently used in the `_mwResolveAndRoute` intercept at line 2400 of `cmd-center.js`). |
| **Purpose** | Signals a new task has landed in a specific assignee's queue. Foundational for Class 3 (combinatorial) and Class 7 (routing) policies. CommandHUD also consumes this to know when to deliver pending work. |
| **Payload** | `{ instance_id, seq, assignee_resource_id, assignee_name, role, template_id }` |
| **Required for B2** | `Wait ForRoute $instance_id to AK` |
| **Required for B6** | Class 3 "same person submitter + approver" separation-of-duties policy. |

This emit lives in `mw-events.js` (the actual routing code path), not in
the intercept at cmd-center.js line 2400. The intercept is a transcript
observer. The emit should be where the route actually happens, so it fires
for all routes — not only those the intercept catches on Compass.

### Emit #4 — `workflow_request.resolved`

| | |
|-|-|
| **Fires when** | `_rrpSubmit(...)` in `mw-events.js` completes — after the server acknowledges the approval/rejection write. |
| **Purpose** | Signals a specific approver has made a decision. Closes the loop on routing policies and feeds velocity counters (Class 2). CommandHUD cancels any pending dispatch requests for this workflow_request. |
| **Payload** | `{ instance_id, seq, resolver_resource_id, resolver_name, decision }` |

Valid values for `decision`: `'approved'`, `'changes_requested'`,
`'declined'`.

### Emit #5 — `instance.launched`

| | |
|-|-|
| **Fires when** | A new workflow instance row is successfully inserted into `workflow_instances` — the same transaction that creates the instance. |
| **Purpose** | Firm-wide "something started" event. Feeds M2 live feed, Class 2 velocity counters, and Class 5 precondition checks ("this template is running; does it have a valid cert?"). |
| **Payload** | `{ instance_id, template_id, template_name, submitter_resource_id }` |

### Emit #6 — `instance.completed`

| | |
|-|-|
| **Fires when** | The final step of a workflow instance transitions from `active` to `complete` (i.e., the last approval or sign-off lands). |
| **Purpose** | End-of-lifecycle event. Feeds duration statistics (the basis for Class 4 and Class 6 anomaly detection later) and terminates any `Wait ForEvent` listeners keyed to this instance. |
| **Payload** | `{ instance_id, template_id, final_status, elapsed_ms }` |

Valid values for `final_status`: `'complete'`, `'cancelled'`.

### Emit #7 — `instance.blocked`

| | |
|-|-|
| **Fires when** | The router encounters a null assignee, missing role, or other non-fatal condition that halts routing without cancelling. This is the case the existing M2 mock UI calls out ("Finance contact unassigned"). |
| **Purpose** | Surfaces blocked instances to operators in realtime, replacing the current hand-maintained M2 mock. CommandHUD may trigger critical-urgency dispatches for blocked instances older than a threshold. |
| **Payload** | `{ instance_id, seq, reason, details }` |

Valid values for `reason`: `'no_assignee'`, `'missing_role'`,
`'invalid_state'`. The `details` field is free-form string for debugging
context.

---

## Payload conventions (apply to all seven)

1. **Timestamps.** `ts` is automatically inserted by `_cmdEmit` into the
   envelope. **Do not** add `ts` to any inner payload — it would be
   redundant and inconsistent.
2. **Resource IDs.** Always include `resource_id` per protocol Contract 3,
   never just `user_id`. Where both are useful (e.g., `form.submitted`
   carrying both `submitter_resource_id` and `submitter_user_id`), include
   both explicitly named.
3. **No PII beyond what the event requires.** Do not put email addresses,
   phone numbers, or personal comments in payloads. Names are acceptable
   because they appear in the transcript UI.
4. **`source_session`, `source_product`, `firm_id`, `event_id` are
   auto-injected.** The enhanced `_cmdEmit` handles these. Do not re-add
   them.
5. **Payload field names never change after this brief.** Downstream
   consumers (B2, B6, M2 UI, CommandHUD, StaffingHUD potentially)
   hard-code on these field names. Adding fields in a future brief is
   allowed — it is a protocol minor version bump; renaming is a major
   version bump.

---

## Self-echo behavior — important

The existing `app_event` handler at `cmd-center.js` line 310:

```js
_channel.on('broadcast', { event: 'app_event' }, function(payload) {
  var d = payload.payload;
  if (!d || d.from === _mySession.userId) return;
  _resolveEventListeners(d.event, d);
});
```

…filters self-echoes via the back-compat shim field `d.from`. With the
envelope enhancement, this continues to work because the envelope
carries `from` at the top level. The new canonical field is
`source_session`, and future consumers (CommandHUD, policy evaluator in
B6) should read that instead — but **do not refactor this handler in
this brief**. It works, and changing it without its consumers being
ready to adopt the new field is a risk.

`_cmdEmit` after the enhancement also resolves local listeners
immediately, unchanged from before. The originating session hears its
own emits; remote sessions receive the broadcast and filter per their
rules.

If you find yourself modifying either function to make an emit work,
something else is wrong — stop and diagnose.

---

## Definition of done

After this brief is complete, all of the following must hold.

### Console-visible evidence

On Compass (VS), with the browser console open and `DEBUG_EVENTS = true`,
submit an Expense Report:

```
[cmd-center] emit location.ready {location: "compass.my_work", ...}
[cmd-center] emit form.submitted {instance_id: "3f8a...", form_name: "Expense Report", ...}
[cmd-center] emit workflow_request.created {instance_id: "3f8a...", seq: 2, assignee_name: "Angela Kim", ...}
[cmd-center] emit instance.launched {template_name: "Expense Report", ...}
```

### Aegis-side evidence

With Aegis open alongside Compass, the Aegis console shows the same emits
arriving via the bus. Add a matching line in the `app_event` handler at
line 310, also gated on `DEBUG_EVENTS`:

```js
if (DEBUG_EVENTS) console.log('[Aegis] app_event received', d.event_type || d.event, d.payload || d);
```

(Use `d.event_type || d.event` so both the canonical field and the
back-compat field resolve the right value during the transition.)

### Envelope-compliance evidence

In the browser console on either session, after any emit:

```js
// Inspect the last raw broadcast
_channel._bindings.broadcast.filter(b => b.filter.event === 'app_event')[0]
// Verify protocol fields are present:
// { protocol_version: 1, event_type, event_id, source_product: 'projecthud',
//   source_session, ts, firm_id, payload, ...back-compat }
```

If protocol fields are missing or `source_product !== 'projecthud'`, the
envelope enhancement was not applied correctly.

### Script-level evidence

The existing `dual_session_test` v1.1 still passes end-to-end with no
changes. **Do not edit this script in this brief.** Its `Pause` lines
remain in place because B2 will replace them with `Wait For*` commands.

A new throwaway diagnostic script, saved as
`scripts/b1_event_emit_probe.txt`:

```
# Version: 1.0
# Requires: VS
# B1 emit probe — submits a tiny form and listens for all seven events.
# Will time out on events that haven't been wired yet; that is diagnostic.

Assert session VS is connected

VS: Set View "compass"
Pause Compass loading — press Enter when LIVE

# Probe emit #1
Wait ForEvent "location.ready" timeout=5000

# Probe emits #2, #3, #5
VS: Set Tab "MY REQUESTS"
VS: Set SubTab "BROWSE"
VS: Form Open "Expense Report"
VS: Form Insert employee_name "Vaughn Staples"
VS: Form Insert trip_start_date "2026-04-14"
VS: Form Insert trip_end_date "2026-04-14"
VS: Form Select business_purpose "client"
VS: Form Insert purpose_description "B1 event probe"
VS: Form Insert customer_name "Apex Consulting Group"
VS: Form Submit

Wait ForEvent "form.submitted" timeout=10000 → $instance_id
Wait ForEvent "instance.launched" timeout=5000
Wait ForEvent "workflow_request.created" where assignee=VS timeout=10000

Log "✓ B1 emits 1, 2, 3, 5 verified for instance $instance_id"
```

Running this script end-to-end, all four `Wait ForEvent` calls resolve
within their timeouts. Note that `Wait ForEvent` reads the event name —
with the protocol's namespaced events it will read `location.ready`
(not `location_ready`). Verify `_waitForEventFiltered` in
`cmd-center.js` line 387 handles dotted event names. It should, because
it treats the event name as an opaque string; but verify.

Emit #4 (`workflow_request.resolved`) and #6 (`instance.completed`)
require a full approval run and can be verified against
`dual_session_test`. Emit #7 (`instance.blocked`) requires a negative
case — verify by manually removing the Finance assignee on a test
template and observing the console. This negative verification is
manual and does not require a script.

### Code-level evidence

- `node --check cmd-center.js` passes.
- `node --check mw-tabs.js` passes (may require running through a minimal
  node shim; if it cannot parse under plain node, note this in the
  handoff update and skip).
- `grep -c "window._cmdEmit(" cmd-center.js mw-tabs.js mw-events.js`
  returns exactly 8 total across the three files (7 new + 1 pre-existing
  `tab_switch` at cmd-center.js line 2323).
- `grep -c "protocol_version" cmd-center.js` returns at least 1 (the
  envelope enhancement).
- The cache-bust procedure from the handoff (lines 340–354) is followed.
  Bump all three version strings to `v20260418-CMD54` (or next
  appropriate number if another brief has landed first).

### Handoff document update

Append a new section to `aegis-handoff-2026-04-17-milestone.md` titled
`## Brief B1 — Event Bus Wiring (CMD54)` with:

1. The envelope enhancement — specifically noting the
   protocol-compliance intent and the back-compat shims.
2. The seven emit sites, one line each, listing file and line number.
3. The note that `tab_switch` (the pre-existing emit at line 2323)
   was **not** renamed to `tab.switched` despite the namespacing
   convention — back-compat with any script using it by the old name
   takes priority. It is deprecated; B6 may rename it with proper
   migration.
4. Any new iron rules discovered during implementation (likely one or
   two — this is normal).
5. Updated file version table.
6. Updated cache-bust inventory.

If implementation raises any questions about payload schema, severity
handling, or event ordering that were not answered by this brief,
document them under a new `### Open questions for B2/B6` subsection
rather than making guesses.

---

## Out of scope — do not do these

- **Do not build the policy evaluator.** Policies are not consumed in
  this brief. B6 does this.
- **Do not wire the M2 UI to display events.** That is a UI micro-task
  after this brief.
- **Do not build CommandHUD integration.** This brief emits
  protocol-compliant events; CommandHUD subscribes to them from its own
  codebase. No changes to ProjectHUD are required for that subscription
  to work — that is the whole point of the shared channel.
- **Do not add more than seven emits.** If you find a candidate eighth
  site, record it in the handoff `Open questions` section for B6 to
  consider.
- **Do not modify `_waitForEvent` or `_waitForEventFiltered`.** The
  envelope enhancement of `_cmdEmit` is the only modification to
  existing event-bus code allowed in this brief.
- **Do not refactor the existing `_mwResolveAndRoute` intercept** at
  cmd-center.js line 2398. It is a transcript observer; the new emit
  for `workflow_request.created` lives in `mw-events.js` at the routing
  site. Both can coexist.
- **Do not touch Cadence or CadenceHUD code.**
- **Do not rename `tab_switch`.** Keep the existing emit exactly as it
  is to preserve any downstream behavior. Its misalignment with the
  `namespace.verb` convention is known and will be migrated in a later
  brief.
- **Do not add TypeScript, build steps, or new dependencies.**

---

## Pre-flight checklist for the implementing session

Before writing any code, the session should be able to answer these
questions aloud. If not, re-read the relevant context file.

1. What is the protocol-compliant envelope, and which fields does
   `_cmdEmit` auto-inject vs which fields belong in the inner
   payload?
2. At which line of which file does `_lastSubmittedInstanceId` get
   set?
3. Why does emit #3 live in `mw-events.js` and not in the
   `_mwResolveAndRoute` intercept at cmd-center.js:2398?
4. What is the difference between `app_event` broadcasts and `cmd`
   broadcasts on the Supabase channel?
5. Why is `form.submitted`'s payload the right shape for a Class 1
   threshold policy?
6. What happens to existing `dual_session_test` v1.1 after this brief?
   (Answer: nothing. It still runs with its `Pause` lines.)
7. What back-compat fields are in the envelope and why do they exist?
   (Answer: `event`, `from`, `name` — to keep the existing handler at
   line 310 working without modification.)
8. If a CommandHUD session subscribed to the same channel today, could
   it read the envelopes correctly? (Answer: yes — that is the
   definition of protocol compliance and the primary reason for the
   envelope enhancement.)

---

## Post-completion next steps (context for the session)

This brief unblocks:

- **B2 — Wait commands** — adds `Wait ForLocation`, `Wait ForInstance`,
  `Wait ForRoute` that subscribe to these events with typed filters.
- **M2 live feed wiring** — a small UI task to replace the hardcoded
  CoC mock in `aegis.html:670–679` with a rolling render of live
  `app_event` broadcasts.
- **B6 — Predicate engine** — subscribes the policy evaluator to these
  same events.
- **CommandHUD ingest** — a parallel workstream on a different product,
  but unblocked the moment these emits land on the shared channel with
  protocol-compliant envelopes.

The next brief (B2) should begin within a day or two of this one
landing, so that `dual_session_test` can be de-paused and the new Wait
commands proven in production.

---

*End of Brief B1. Revisions go in a new numbered brief; do not edit
this one after it has been executed.*

---

## Revision history

- *2026-04-18 · v1.0 · initial brief.*
- *2026-04-18 · v1.1 · adds protocol-compliant envelope per HUD
  Ecosystem Protocol v0.1; adds `_uuid()` helper; renames events to
  namespaced form (`location.ready`, not `location_ready`); adds
  CommandHUD as a future consumer to context without expanding scope.
  No changes to payload field names that were in v1.0 — only the
  envelope changes.*
