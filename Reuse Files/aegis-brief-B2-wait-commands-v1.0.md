# Brief B2 · Typed Wait Commands + `form.opened` emit

**Phase:** 1 (Foundation — payoff for B1 event bus)
**Depends on:** B1 complete (CMD61); M2-FEED-1 complete (CMD61); B1.5 complete (CMD62, patched)
**Unblocks:** clean scripting without `Pause` hacks; B6 (policy engine will consume the same event taxonomy)
**Inherits from:** `hud-ecosystem-protocol-v0.1.md`, `aegis-vision-anchor-v1.1.md`
**Estimated session:** 3–4 hours
**Brief version:** 1.0 · 2026-04-18

---

## Scope statement

Add four typed `Wait` commands to the Aegis script vocabulary and one
new event emit to Compass:

1. `Wait ForLocation <alias> "<location>"` — block until the specified
   session reports `location.ready` for the named location.
2. `Wait ForInstance <instance_id>` — block until `instance.launched`,
   `instance.completed`, or `instance.blocked` fires for that
   instance. Multi-event subscription.
3. `Wait ForRoute <instance_id> to <alias>` — block until
   `workflow_request.created` fires with a matching instance and
   assignee resolving to the alias.
4. `Wait ForForm "<form_name>"` — block until `form.opened` fires on
   the dispatching session's target with a matching form name.
5. **New emit:** `form.opened` — fires on Compass when the form
   overlay's iframe has rendered its body and input fields are
   queryable. This is the missing emit flagged as B1 Open Question #7
   and surfaced by the `form.submitted` race during M2-FEED-1 smoke.

The four Wait commands are **thin typed wrappers** over the existing
`_waitForEventFiltered`. They exist to make scripts readable and
intent-legible, not to introduce new matching semantics. Filter logic
is reused; existing iron rules are honored without modification.

The `form.opened` emit follows the same envelope and payload
conventions as the seven B1 emits. It is the eighth logical emit site;
the `tab_switch` legacy emit remains separate and untouched.

**Do not** migrate `dual_session_test` or `b1_event_emit_probe` in
this brief. Both can have their `Pause` lines deleted as a trivial
follow-up once the new commands verify. Keeping the migration
separate means any regression in B2 is cleanly bisectable against
the still-working pre-migration scripts.

**Do not** modify `_waitForEvent` or `_waitForEventFiltered` unless
a specific gap forces it. If a gap is surfaced, surface it in a
pre-flight question before writing code — same pattern as B1's Q2 and
B1.5's dedup catch.

---

## Context files

Read in this order:

1. `hud-ecosystem-protocol-v0.1.md` — Contract 1 (event envelope).
   The new `form.opened` emit must be protocol-compliant.
2. `aegis-vision-anchor-v1.1.md` — especially commitment #2 ("one
   DSL family") and the policy system's Response vocabulary.
3. `aegis-handoff-2026-04-17-milestone.md` — pay attention to:
   - The B1 section's seven emits and their payloads (new emit
     should match the pattern)
   - Iron Rules 15, 20, 22, 23, 24, 25 — all relevant
   - B1's Open Question #7 (`form.opened` rationale)
   - CMD55 (retention buffer behavior that Wait commands depend on)
4. `cmd-center.js` — particularly:
   - `_waitForEvent` and `_waitForEventFiltered` (~lines 414–498
     post-B1.5; search if line numbers drift)
   - The `'Wait'` command definition in the `COMMANDS` registry
     (~lines 810–870, the `ForEvent` branch)
   - `_parseLine` and the command dispatch loop
   - `_resolveTargetAlias` (alias → userId resolution)
5. `mw-tabs.js` — `Form Open` command and the form overlay iframe
   lifecycle. Specifically:
   - Where `myrLaunchRequest('form', ...)` is defined
   - Where `myr-html-form-overlay` is created and the iframe is
     injected
   - The existing `postMessage` bridge between parent and iframe
     (search for `source: 'cmd-center'` to find the handlers)
6. The form iframe's internal JS (search for where form fields are
   rendered inside the iframe). Likely a separate script but same
   repository; ask if it's not locatable.
7. `aegis-brief-B1-event-bus-v1.1.md` for emit payload shape
   conventions.

**Do not read** `mw-events.js`, `mw-core.js`, `compass.html`,
`aegis.html`, or `sidebar.js`. This brief does not touch them.

---

## Iron rules inherited

From the handoff (rules 15, 20, 22, 23, 24, 25 especially):

- **Rule 15** — Aegis exempt from self-echo filter. Wait commands
  run on Aegis (the dispatcher) and must receive events from any
  other session. The existing `app_event` handler already preserves
  this; Wait commands inherit it via `_waitForEventFiltered`.
- **Rule 20** — Listeners receive inner payload, not envelope. Wait
  command implementations read `data.instance_id`, `data.location`,
  etc., directly — never `data.payload.instance_id`.
- **Rule 22** — Retention buffer scan precedes forward queue. New
  Wait commands MUST inherit this by using `_waitForEventFiltered`,
  which already scans the buffer. If a command bypasses the buffer,
  it will race against fast-firing events.
- **Rule 23** — Outbound emit queue. The new `form.opened` emit
  goes through `_cmdEmit` and inherits the queue automatically.
  Do not bypass `_cmdEmit`.
- **Rule 25** — `event_id` dedup on `app_event` handler entry. The
  new emit carries `event_id`; dedup applies automatically. Do not
  touch the dedup logic.

From protocol Contract 1:

- The new `form.opened` emit uses the standard envelope
  (`protocol_version`, `event_id`, `source_product`,
  `source_session`, `ts`, `firm_id`, `payload`) built
  automatically by `_cmdEmit`. Payload fields are specified below.

---

## Specification

### Part 1 — `form.opened` emit

#### Where it fires

On Compass, inside the form iframe's bootstrap code (wherever the
iframe decides its fields are rendered and ready for `Form Insert`
commands to address them). The emit must originate from the **parent
window**, not the iframe — Compass's `window._cmdEmit` is the
parent's. Mechanism:

1. Form iframe bootstrap completes its render.
2. Iframe sends a `postMessage` to the parent:
   `{ type: 'compass_form_ready', form_name: '<name>', form_def_id: '<uuid>' }`.
3. Parent's existing `window.addEventListener('message', ...)`
   handler in `mw-tabs.js` (search for `compass_form_submit` to find
   the adjacent cases — the ready-handler lives alongside) branches
   on the new type and calls `window._cmdEmit('form.opened', payload)`.

If the iframe→parent bridge has no existing pattern for a "ready"
signal, add one using the same `postMessage({type: ...})` convention
already used for `compass_form_submit`. Do not invent a new IPC
mechanism.

#### Payload

```json
{
  "form_name": "Expense Report",
  "form_def_id": "<uuid>",
  "opener_resource_id": "<uuid>",
  "opener_user_id": "<uuid>"
}
```

Same payload conventions as B1: `ts`, `event_id`, `source_session`,
etc., are auto-injected by `_cmdEmit`.

#### Readiness definition

"Ready" means every DOM field that `Form Insert` would address is
queryable. The simplest implementation:

- After the iframe's render pass completes, verify that at least one
  input, select, or textarea is queryable in the iframe's document.
- If the form has dynamic sections (e.g., "add another row"),
  `form.opened` fires once the *initial* fields are ready. Dynamic
  additions trigger their own post-add events if B6 needs them; not
  in scope here.

Optional hardening: use `requestAnimationFrame` to ensure the render
frame is committed before the emit. If the iframe's render path is
already synchronous and frame-aligned, skip this.

### Part 2 — `Wait ForLocation`

Syntax:

```
Wait ForLocation <alias> "<location>" [timeout=<ms>]
```

Example:

```
Wait ForLocation VS "compass.my_work"
Wait ForLocation AK "compass.my_work" timeout=30000
```

Semantics:

- Resolve the alias to a `resource_id` via `_sessions`.
- Call `_waitForEventFiltered('location.ready', 'resource_id',
  <resolved_resource_id>, timeoutMs)`.
- Default timeout: 30000 ms.
- On buffer hit (event already fired within the retention window),
  resolve immediately. On live match, resolve when the next matching
  emit fires. On timeout, throw per the existing `_waitForEventFiltered`
  behavior.

Return value on resolve: `location.ready received: <alias> @ <location>`.

If the alias cannot be resolved, throw an actionable error:
`Wait ForLocation: unknown alias '<alias>'` — same class of error the
existing command-dispatch path produces.

### Part 3 — `Wait ForInstance`

Syntax:

```
Wait ForInstance <$variable|literal_uuid> [for <state>] [timeout=<ms>]
```

Examples:

```
Wait ForInstance $instance_id
Wait ForInstance $instance_id for launched
Wait ForInstance $instance_id for completed timeout=60000
Wait ForInstance $instance_id for blocked
```

Semantics:

- Resolve the variable or use the literal UUID.
- `for <state>` is optional; default is `launched` (any of the three
  states technically, but `launched` is the most common need).
- Accepted states: `launched`, `completed`, `blocked`.
- Map state to event name: `launched` → `instance.launched`,
  `completed` → `instance.completed`, `blocked` → `instance.blocked`.
- Call `_waitForEventFiltered(<event_name>, 'instance_id',
  <resolved_uuid>, timeoutMs)`.
- Default timeout: 60000 ms (instance lifecycle events can be slow).

**Multi-state variant (stretch):** `Wait ForInstance $id for any`
could wait for any of the three. This requires `Promise.race` over
three filtered waits. Include only if straightforward; otherwise
document as a later enhancement.

Return value on resolve: `instance.<state>: <instance_id prefix>`.

### Part 4 — `Wait ForRoute`

Syntax:

```
Wait ForRoute <$variable|literal_uuid> to <alias> [timeout=<ms>]
```

Example:

```
Wait ForRoute $instance_id to AK
Wait ForRoute $instance_id to AK timeout=15000
```

Semantics:

- Resolve the instance UUID and the alias (→ `resource_id`).
- Call `_waitForEventFiltered('workflow_request.created', ...)` with
  a **compound filter**: both `instance_id` AND `assignee_resource_id`
  must match. If `_waitForEventFiltered` does not support compound
  filters, this is a real gap — flag as pre-flight question.

Reading the existing implementation: `_waitForEventFiltered` accepts a
single `filterKey` / `filterVal`. For a compound filter, either:

- (a) Extend `_waitForEventFiltered` to accept a filter predicate
  function, then callers pass arbitrary logic. Riskier because other
  callers exist.
- (b) Wait on `instance_id`, then re-check `assignee_resource_id` on
  each match and re-queue if it doesn't match. Mirrors the re-queue
  pattern already in `_waitForEventFiltered` at line ~459 for filter
  mismatches.

**Preference: (b).** It mirrors an existing pattern and doesn't
touch the shared API. Implementation:

```js
async function _waitForRoute(instanceId, assigneeResourceId, timeoutMs) {
  var deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    var remaining = Math.max(0, deadline - Date.now());
    var data = await _waitForEventFiltered(
      'workflow_request.created', 'instance_id', instanceId, remaining
    );
    // Compound check
    if (data.assignee_resource_id === assigneeResourceId) return data;
    // Non-match: loop and wait again for the next event with this instance_id
  }
  throw new Error('Timeout waiting for route of ' + instanceId + ' to ' + assigneeResourceId);
}
```

Default timeout: 30000 ms.

Return value on resolve:
`workflow_request.created → <alias> (step <seq>)`.

### Part 5 — `Wait ForForm`

Syntax:

```
Wait ForForm "<form_name>" [timeout=<ms>]
```

Example:

```
VS: Form Open "Expense Report"
Wait ForForm "Expense Report"
VS: Form Insert employee_name "Vaughn Staples"
```

Semantics:

- Call `_waitForEventFiltered('form.opened', 'form_name',
  <form_name>, timeoutMs)`.
- Default timeout: 10000 ms. Form overlays render fast; a form that
  takes 10+ seconds is a bug worth surfacing.

Return value on resolve: `form.opened: <form_name>`.

### Part 6 — Command registry integration

All four commands follow the existing `COMMANDS` registry pattern in
`cmd-center.js` (see the `'Wait'` entry around line ~810). Either:

- (a) Extend the `'Wait'` command to recognize the new `For*`
  keywords after its existing `ForEvent` branch.
- (b) Add four new top-level commands: `'Wait ForLocation'`,
  `'Wait ForInstance'`, `'Wait ForRoute'`, `'Wait ForForm'`.

Check how `_parseLine` handles multi-word command matching. If it
already favors two-word verbs (it does — see the `twoWord` variable),
preference is **(b)**: four new top-level entries, same pattern as
`Form Open`, `Form Submit`, `DB Get`, `DB Poll`. Keeps each command's
logic isolated.

Add to the parser's two-word match if that's where new verbs
register.

### Part 7 — Documentation in handoff

The handoff's B2 section should include a compact **script
vocabulary reference** of the five new surface-area items (four
commands + one emit), with one-line syntax and one-line purpose each.
Future scripts are authored against this reference.

---

## Definition of done

### Code-level evidence

- `node --check cmd-center.js` passes.
- `node --check mw-tabs.js` passes.
- `grep -c "Wait ForLocation\|Wait ForInstance\|Wait ForRoute\|Wait ForForm" cmd-center.js`
  returns ≥4.
- `grep -c "form.opened\|compass_form_ready" cmd-center.js mw-tabs.js`
  returns ≥3 (emit call + postMessage handler + iframe sender).
- `grep -c "window._cmdEmit(" cmd-center.js mw-tabs.js mw-events.js mw-core.js`
  returns exactly 9 (eight logical emits + `tab_switch` legacy).
- Cache-bust bumped to `v20260418-CMD63` (or next) at all three sites.

### Probe script evidence

Author **`scripts/b2_wait_commands_probe.txt`** that exercises all
four new commands end-to-end:

```
# Version: 1.0
# Requires: VS
# B2 Wait commands probe — no Pauses, all typed waits.

Assert session VS is connected

VS: Set View "compass"
Wait ForLocation VS "compass.my_work" timeout=30000

VS: Set Tab "MY REQUESTS"
VS: Set SubTab "BROWSE"
VS: Form Open "Expense Report"
Wait ForForm "Expense Report"

VS: Form Insert employee_name "Vaughn Staples"
VS: Form Insert trip_start_date "2026-04-14"
VS: Form Insert trip_end_date "2026-04-14"
VS: Form Select business_purpose "client"
VS: Form Insert purpose_description "B2 probe"
VS: Form Insert customer_name "Apex Consulting Group"
VS: Form Submit

Wait ForEvent "form.submitted" → $instance_id
Wait ForInstance $instance_id for launched
Wait ForRoute $instance_id to VS

Log "✓ B2 probe complete · $instance_id"
```

Run the probe. All Waits resolve within their timeouts. No `Pause`
lines. The operator does not press Enter at any point. Script
completes in under 30 seconds for a warm-cached Compass session.

### dual_session_test preservation

`dual_session_test` v1.1 unchanged. Still passes. **Do not delete its
`Pause` lines in this brief.** The migration is a separate follow-up
(call it `dual_session_test` v1.2) once B2 is verified.

### M2 feed evidence

Live M2 feed renders the new `form.opened` event in the signal
bucket. Verify visually by submitting a form while the Aegis M2 panel
is open. (`form.opened` is not in the noise bucket — it's a
first-class signal event.)

### Cross-session evidence

From Aegis: `Wait ForLocation VS "compass.my_work"` resolves when
VS's Compass tab reaches that location, regardless of which
session's tab is running the Wait. Tested by having Aegis run the
probe while VS is the target.

### Handoff update

Append `## Brief B2 — Typed Wait Commands + form.opened (CMD63)`
with:

1. The five new surface-area items, summarized.
2. The `form.opened` emit's firing site and payload.
3. Implementation choice for compound filter in `Wait ForRoute`
   (option b per the brief, or whatever was actually chosen).
4. Any new iron rule (likely 0–1 for this brief — the command-layer
   is lower-risk than the channel-layer).
5. Updated file version table.
6. Updated cache-bust inventory.
7. Candidate follow-ups: migrate `dual_session_test` to delete its
   `Pause` lines; M2-FEED-2 Instance Feed reactive.

---

## Out of scope

- **Do not** migrate `dual_session_test` or the B1 probe to the new
  commands.
- **Do not** add new events beyond `form.opened`. If you see a
  plausible ninth emit (e.g., `form.closed`), document it as an
  open question for B6, do not silently add it.
- **Do not** modify the policy engine, Cadence, or the CoC writer.
- **Do not** refactor `_waitForEvent` or `_waitForEventFiltered`
  unless a real gap forces it. If gap forces a change, surface it
  as a pre-flight question.
- **Do not** add new CSS, HTML, or UI surfaces. This is a script-
  vocabulary brief.
- **Do not** extend to other common waits like `Wait ForApproval`
  or `Wait ForTimesheet`. Four commands is the scope.

---

## Pre-flight checklist

Answer these before writing code:

1. Does `_waitForEventFiltered` already handle the retention buffer
   scan before queueing forward? (It should — Rule 22 says so.)
2. Does `_waitForEventFiltered` support compound filters, or is the
   re-queue pattern in Part 4 the right approach?
3. Where does `compass_form_submit` get sent from in the existing
   iframe→parent bridge? (Find it; `compass_form_ready` should land
   in the same handler.)
4. What is the mechanism by which the form iframe knows when its
   fields are queryable? (Is there a synchronous render, a Promise,
   an event?)
5. What does `_parseLine` do with two-word command verbs that share
   a prefix? (Check `twoWord` branch — this determines whether the
   four new commands register as top-level or as sub-branches of
   `Wait`.)
6. After this brief, can the B1 probe's `Pause` lines be replaced
   with `Wait ForLocation` and `Wait ForForm` cleanly? (Verify the
   syntax works before writing the migration.)
7. Does the existing `Form Open` command need modification, or can
   `Wait ForForm` sit alongside it as a separate command the script
   author calls explicitly? (Preference: separate command. Don't
   auto-block inside `Form Open` — that changes established behavior.)
8. The M2 live feed's filter: does `form.opened` belong in signal
   or noise? (Answer: signal. It represents a real UX moment.)

---

## Post-completion next steps

After B2 lands and is verified:

- **Migrate `dual_session_test` to v1.2** deleting its `Pause` lines
  and replacing them with the new Wait commands. Trivial follow-up
  brief, maybe 30 minutes. Becomes the regression test for B2.
- **Migrate `b1_event_emit_probe.txt`** similarly.
- **B1.6 — Legacy channel removal** — gated on tab refresh
  confirmation, independent of B2.
- **M2-FEED-2 — Instance Feed reactive** — independent.
- **B6 — Predicate engine (Phase 2 start)** — now genuinely
  unblocked. Every event the policy engine needs to subscribe to is
  specified, flowing, and dedupable.

---

*End of Brief B2. Revisions go in a new numbered brief.*
