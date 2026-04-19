# Brief B-UI-3 · Instance-Targeted Click

**Category:** Script vocabulary extension + correctness fix
**Depends on:** B-UI-1 (Work Queue reactive), B-UI-2 (`Wait ForQueueRow` shipped)
**Unblocks:** `dual_session_test` running correctly on non-empty queues; any script that acts on a specific instance when others exist
**Inherits from:** `hud-ecosystem-protocol-v0.1.md`, `aegis-vision-anchor-v1.1.md`
**Estimated session:** 1–2 hours
**Brief version:** 1.0 · 2026-04-19

---

## Scope statement

Add one new script command that disambiguates DOM target selection
by instance:

```
Click ForInstance <$variable|literal_uuid> "<button_label>"
```

The existing `Click "<label>"` command scrapes the DOM for the first
matching button regardless of which workflow_instance's row it
belongs to. On any queue with multiple pending items, this is
silently incorrect — the script may click "Review" on an unrelated
row while the instance it just submitted sits further down the list.

This brief fixes that correctness hazard by introducing an
instance-scoped click. Existing `Click "<label>"` behavior is
unchanged (backward-compatible); new scripts use `Click ForInstance`
when they need disambiguation.

**Do not** modify `Click "<label>"` itself. **Do not** add implicit
context-variable behavior (no `Set Instance`, no auto-scoping based
on last Wait). Explicit command, explicit args.

---

## Context files

Read in this order:

1. `aegis-handoff-2026-04-17-milestone.md` — pay attention to:
   - Brief B-UI-2 section (the recent CMD65 work)
   - Candidate follow-up #4 in B-UI-2's handoff append (the
     instance-blind `Click` diagnosis)
   - Iron Rule 29 (session prefix discipline) and Rule 30 if
     present (DOM-first action-command hazard)
2. `cmd-center.js` — specifically:
   - The existing `Click` command in the `COMMANDS` registry
     (search for `'Click'` as a registry key)
   - How DOM element lookup works in the current `Click`
     implementation
   - The `$variable` substitution path used by other `ForInstance`-
     shaped commands (e.g., `Wait ForInstance`)
3. `mw-tabs.js` — specifically the Work Queue row rendering:
   - Confirm each queue row carries a `data-instance-id` attribute
     (or equivalent) that can be DOM-queried
   - If it doesn't, adding one is in scope — the new command needs
     a stable per-row instance identifier to select against

**Do not read** `mw-events.js`, `mw-core.js`, `aegis.html`,
`compass.html`, `sidebar.js`.

---

## Iron rules inherited

- **Rule 15** (per CMD64a) — no `senderId === _mySession.userId`
  filter added to any handler.
- **Rule 20** — Listeners receive inner payload.
- **Rule 27** — One buffer scan per wait; forward-only re-queue.
  (Not directly relevant; `Click` is not a Wait, but the rule's
  discipline of single-scan-per-command-invocation applies.)
- **Rule 28** — Version strings reconciled across all loader sites
  at deploy.
- **Rule 29** — Session prefix discipline. The new command will
  typically be used as `VS: Click ForInstance $instance_id "Review"`.
- **Rule 30** (if present; added during B-UI-2) — DOM-first action
  commands are unsafe against lists with prior state. This brief
  is the direct remedy for that rule's named hazard.

---

## Specification

### Syntax

```
Click ForInstance <$variable|literal_uuid> "<button_label>" [timeout=<ms>]
```

Examples:

```
VS: Click ForInstance $instance_id "Review"
AK: Click ForInstance $instance_id "Approve"
VS: Click ForInstance 6360d3a8-3da0-4209-901f-12118da24420 "Review" timeout=3000
```

### Semantics

1. Resolve `$variable` to a UUID if prefixed with `$`; else use
   literal.
2. Select the queue row whose `data-instance-id` (or equivalent —
   see Part 2) matches the resolved UUID.
3. Within that row's scope, find the button with matching text.
4. If the row exists and the button exists: click it, ack back.
5. If the row does not exist: throw
   `Click ForInstance: no row for instance <uuid_prefix>`.
6. If the row exists but the button does not: throw
   `Click ForInstance: no "<label>" button in row for instance <uuid_prefix>`.
7. Optional `timeout=<ms>` parameter: if the row isn't yet in the
   DOM at call time, poll for up to `timeout` ms (default 0 — no
   polling). The typical caller will have preceded this with a
   `Wait ForQueueRow $instance_id`, so the row is already present
   and the timeout serves only as a defensive fallback.

### Default timeout

Zero — no polling by default. The expected pattern is:

```
Wait ForQueueRow $instance_id to VS
VS: Click ForInstance $instance_id "Review"
```

The Wait guarantees the row is rendered; `Click ForInstance` then
acts immediately. A non-zero timeout is a defensive option, not
the primary path.

### Error semantics — be specific and actionable

The errors should clearly distinguish "wrong instance" from
"wrong button" from "race condition." Operators reading the
transcript should know exactly where the failure is:

```
Click ForInstance: no row for instance 6360d3a8 (check Wait
ForQueueRow resolved before click, or queue was cleared between
wait and click)

Click ForInstance: found row for instance 6360d3a8 but no
"Reviw" button (typo? available labels: Review, Recall, Delete)
```

The second error's fallback — listing available button labels in
the row — is worth implementing. Typos in labels are a common
script-authoring error and should be caught loudly.

### Part 2 — DOM attribute verification

The new command depends on queue rows carrying a stable per-row
instance identifier. Before writing command code:

1. Inspect the existing `mw-tabs.js` row render to confirm rows
   carry a `data-instance-id` attribute (or equivalent naming).
2. If not present: add it. This is a minimal, additive change —
   one attribute on the existing row element, sourced from the
   same data already available in the renderer.
3. If present but named differently (e.g., `data-request-id` or
   `data-workflow-id`): use the existing attribute. Document the
   name in the handoff.

**Do not** add any new emit or event around the attribute. It's a
static DOM decoration used at query time.

### Command registry integration

`'Click ForInstance'` registered alongside `'Click'` in the
`COMMANDS` registry. Two-word verb matching in `_parseLine`
handles it. Verb added to both local-dispatch arrays (`_lv` and
`_rl`) so it behaves correctly under session prefixes (which
route through dispatch).

### Implementation shape

Rough outline:

```js
'Click ForInstance': async function(args, ctx) {
  var instanceId = _resolveVar(args[0], ctx);
  var label      = args[args.length - 1];  // quoted final arg
  var timeoutMs  = _parseTimeoutKwarg(args, 0);

  var row = await _findRowByInstance(instanceId, timeoutMs);
  if (!row) {
    throw new Error('Click ForInstance: no row for instance '
      + instanceId.slice(0,8));
  }

  var btn = _findButtonInScope(row, label);
  if (!btn) {
    var available = _listButtonLabelsInScope(row);
    throw new Error('Click ForInstance: found row for instance '
      + instanceId.slice(0,8) + ' but no "' + label + '" button'
      + (available.length ? ' (available: ' + available.join(', ') + ')' : ''));
  }

  btn.click();
  return 'Click ForInstance: ' + label + ' · ' + instanceId.slice(0,8);
}
```

`_findRowByInstance` queries
`document.querySelectorAll('[data-instance-id="<uuid>"]')` (or the
equivalent attribute), returning the first match. If `timeoutMs
> 0`, polls at ~100ms intervals until the row appears or timeout
fires.

`_findButtonInScope(row, label)` queries within the row scope:
`row.querySelectorAll('button, [role="button"]')`, filters by
textContent match (case-insensitive trim).

`_listButtonLabelsInScope` returns the visible button labels for
the error message.

### Part 3 — Probe script

`scripts/b-ui-3_click_for_instance_probe.txt`:

```
# Version: 1.0
# Requires: VS, AK
# B-UI-3 probe — Click ForInstance selects the correct row on a
# queue with multiple pending items.

Assert session VS is connected
Assert session AK is connected

VS: Set View "compass"
AK: Set View "compass"
Wait ForLocation VS "compass.my_work" timeout=30000
Wait ForLocation AK "compass.my_work" timeout=30000

# Submit first Expense Report (the "noise" instance)
VS: Set Tab "MY REQUESTS"
VS: Set SubTab "BROWSE"
VS: Form Open "Expense Report"
Pause Form open — confirm Expense Report modal is visible

VS: Form Insert "Employee Name" "Vaughn Staples"
VS: Form Insert "Trip Start Date" "2026-04-14"
VS: Form Insert "Trip End Date" "2026-04-14"
VS: Form Select "Business Purpose" "client"
VS: Form Insert "Purpose Description" "B-UI-3 probe — noise row"
VS: Form Insert "Customer Name" "Noise Corp"
VS: Form Submit

Wait ForEvent "form.submitted" → $noise_id
Wait ForInstance $noise_id for launched

# Do NOT approve the noise row — leave it in the queue

# Submit second Expense Report (the target instance)
VS: Form Open "Expense Report"
Pause Form open — confirm Expense Report modal is visible

VS: Form Insert "Employee Name" "Vaughn Staples"
VS: Form Insert "Trip Start Date" "2026-04-14"
VS: Form Insert "Trip End Date" "2026-04-14"
VS: Form Select "Business Purpose" "client"
VS: Form Insert "Purpose Description" "B-UI-3 probe — target row"
VS: Form Insert "Customer Name" "Target Corp"
VS: Form Submit

Wait ForEvent "form.submitted" → $target_id
Wait ForInstance $target_id for launched

VS: Set Tab "MY WORK"
Wait ForQueueRow $target_id to VS

# The queue now has at least 2 pending rows for VS. Under old
# Click "Review", the wrong one (noise, likely at top) would be
# clicked. Under Click ForInstance, the correct one is selected.

VS: Click ForInstance $target_id "Review"

Pause Confirm the Review popup is for "Target Corp" (not "Noise Corp")

Log "✓ B-UI-3 probe complete · target $target_id"
```

The probe deliberately submits two instances, leaves the noise
row unapproved, and verifies `Click ForInstance` selects the
target instead of the top row. Script completion requires operator
confirmation at the final Pause — a human visually verifying
"Target Corp" text in the opened review form.

---

## Definition of done

### Code-level evidence

- `node --check cmd-center.js` passes.
- `node --check mw-tabs.js` passes.
- `grep -c "Click ForInstance" cmd-center.js` returns ≥2
  (registry entry + implementation).
- `grep -n "data-instance-id" mw-tabs.js` confirms the attribute
  is present (pre-existing or newly added).
- Cache-bust bumped on all aligned files per Rule 28.

### Behavioral evidence

The probe script runs cleanly. At the final Pause, the opened
Review form shows "Target Corp" text. The first-submitted "Noise
Corp" row remains in VS's queue, unacted-on.

Optional: run `dual_session_test` v1.3 against a queue that has
at least one stale row. Without B-UI-3's command usage, v1.3 will
still fail (because v1.3 uses plain `Click "Review"`). After
migrating v1.3 to use `Click ForInstance`, it runs clean on any
queue state. That migration is a follow-up v1.4 task, not part of
this brief.

### Handoff update

Append `## Brief B-UI-3 — Click ForInstance (CMD66)` with:

1. New command syntax and semantics.
2. DOM attribute confirmation (existing vs added).
3. Error classes and their diagnostic values.
4. Probe script reference.
5. Updated command vocabulary — now 5 typed Waits + 1 typed Click.
6. v1.4 migration note (deferred or applied).
7. Updated file version table and cache-bust inventory.
8. Candidate follow-ups: `modal.opened` + `Wait ForModal`;
   Cadence iframe SQL sweep.

---

## Out of scope

- **Do not** modify existing `Click "<label>"`.
- **Do not** add implicit instance-context state (no `Set Instance`,
  no auto-scoping).
- **Do not** add variants for other list-based commands (Select,
  Scroll To, etc.) unless they surface as the same class of bug.
- **Do not** migrate `dual_session_test` to use
  `Click ForInstance`. That's a separate v1.4 follow-up.
- **Do not** touch the reactive subscription or the
  `work_queue.rendered` emit.
- **Do not** add new emits.

---

## Pre-flight checklist

Answer these before writing code:

1. Does the Work Queue row render in `mw-tabs.js` already carry
   a `data-instance-id` attribute (or equivalent)? If not, what's
   the minimal-change to add it?
2. How does the existing `Click "<label>"` command query the DOM?
   Does it already support scoping, or is it always
   document-wide?
3. How does variable substitution work for positional args — is
   `$variable` resolved before or after argument parsing?
4. Does the command registry recognize `Click ForInstance` as a
   two-word verb the same way `Wait ForInstance` is handled?
5. What's the current CMD version string? Verify all four loader
   sites match before bumping.
6. Is there any existing code that would conflict with the new
   command name? (e.g., a `ForInstance` modifier somewhere.)
7. If `_findRowByInstance` uses
   `document.querySelectorAll('[data-instance-id="..."]')`, does
   the selector need escaping for UUID hyphens? (Standard
   attribute selectors handle UUIDs fine; verify.)

---

## Post-completion

After B-UI-3 lands:

- Script vocabulary is at 5 typed Waits + 1 typed Click.
- `dual_session_test` can be migrated to v1.4 using
  `Click ForInstance` — runs cleanly regardless of queue state.
- Next candidates: `modal.opened` + `Wait ForModal` (drops 2
  Pauses); Cadence iframe SQL sweep (drops last Pause).

---

*End of Brief B-UI-3. Revisions go in a new numbered brief.*
