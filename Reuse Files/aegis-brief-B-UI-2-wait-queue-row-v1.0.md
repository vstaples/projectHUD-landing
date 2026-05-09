# Brief B-UI-2 · `Wait ForQueueRow` Command

**Category:** Script vocabulary extension (completes B-UI-1's arc)
**Depends on:** B2 complete (typed Wait pattern); B-UI-1 complete (`work_queue.rendered` emit live)
**Unblocks:** `dual_session_test` v1.4 and future scripts that need typed observation of queue-row rendering
**Inherits from:** `hud-ecosystem-protocol-v0.1.md`, `aegis-vision-anchor-v1.1.md`
**Estimated session:** 30–60 minutes
**Brief version:** 1.0 · 2026-04-19

---

## Scope statement

Add one typed `Wait` command that consumes the `work_queue.rendered`
emit introduced by B-UI-1:

```
Wait ForQueueRow <$variable|literal_uuid> [to <alias>] [timeout=<ms>]
```

The command is a thin typed wrapper over `_waitForEventFiltered` (for
single-field matches) or the compound-filter re-queue pattern (Rule
27 / `_waitForRoute`) when `to <alias>` is supplied.

**This is pure vocabulary extension.** No new emits. No new handler
logic. No new protocol surface. One command, pattern-matched against
`Wait ForRoute` which is structurally identical.

**Do not** add new emits. **Do not** modify `work_queue.rendered`.
**Do not** touch `_waitForEventFiltered` or `_waitForRoute`.

---

## Context files

Read in this order:

1. `aegis-handoff-2026-04-17-milestone.md` — pay attention to:
   - Brief B2 section (the four existing Wait commands)
   - `_waitForRoute` implementation per CMD63b (the compound-filter
     re-queue pattern you'll mirror)
   - Iron Rule 27 (one-scan-per-wait)
   - Brief B-UI-1 section (the `work_queue.rendered` emit's payload)
2. `aegis-brief-B2-wait-commands-v1.0.md` — the Wait command pattern,
   especially `Wait ForRoute`'s implementation spec.
3. `aegis-brief-B-UI-1-reactivity-v1.0.md` — the `work_queue.rendered`
   emit's payload shape.
4. `cmd-center.js` — the four existing `Wait For*` command
   implementations. `Wait ForQueueRow` lives alongside them.

**Do not read** `mw-tabs.js`, `mw-events.js`, `mw-core.js`, `aegis.html`,
`compass.html`, `sidebar.js`. This brief is contained within
`cmd-center.js`.

---

## Iron rules inherited

- **Rule 20** — Listeners receive inner payload.
- **Rule 22** — Retention buffer scan precedes forward queue.
- **Rule 25** — `event_id` dedup.
- **Rule 27** — One buffer scan per wait; re-check runs against
  forward emits only, not against the buffer.

---

## Specification

### Syntax

```
Wait ForQueueRow <$variable|literal_uuid> [to <alias>] [timeout=<ms>]
```

Examples:

```
# Single-field match — any queue row for this instance
Wait ForQueueRow $instance_id

# Compound match — queue row for this instance on a specific alias's tab
Wait ForQueueRow $instance_id to VS
Wait ForQueueRow $instance_id to AK timeout=15000
```

Default timeout: 15000 ms. Work Queue re-renders are fast; 15 seconds
is generous. Shorter than `Wait ForInstance`'s 60000 ms because queue
rendering is not expected to have significant lag once the emit
fires.

### Single-field match (no `to <alias>`)

Resolves `$variable` to a UUID. Calls
`_waitForEventFiltered('work_queue.rendered', 'instance_id',
<resolved_uuid>, timeoutMs)`. Standard existing pattern.

Return value on resolve:
`work_queue.rendered: <instance_id prefix> (step <seq>)`

### Compound match (with `to <alias>`)

Resolves the instance UUID AND the alias (→ `resource_id`). Mirrors
`_waitForRoute` (CMD63b) exactly:

1. One compound-aware initial buffer scan checking both
   `instance_id` AND `assignee_resource_id`.
2. If buffer hit: resolve immediately.
3. If no buffer hit: register a forward-only listener with the
   compound predicate. Non-matching forward emits re-queue the
   listener without re-scanning the buffer (Rule 27).
4. Timeout fires normally.

Return value on resolve:
`work_queue.rendered → <alias> (step <seq>)`

If alias resolution fails: throw `Wait ForQueueRow: unknown alias
'<alias>'` — same error class as the other typed Waits.

### Command registry

Add `'Wait ForQueueRow'` as a top-level command, following the same
pattern as `'Wait ForLocation'`, `'Wait ForInstance'`, `'Wait
ForRoute'`, `'Wait ForForm'`. The two-word verb matching in
`_parseLine` already handles this shape.

Registration goes in the `COMMANDS` registry alongside the other
`Wait For*` commands. Implementation body sits adjacent to
`_waitForRoute` so the re-queue pattern is visually collocated with
its twin.

### Implementation shape

```js
async function _waitForQueueRow(instanceId, assigneeResourceId, timeoutMs) {
  if (assigneeResourceId == null) {
    // Single-field match — standard _waitForEventFiltered
    return await _waitForEventFiltered(
      'work_queue.rendered', 'instance_id', instanceId, timeoutMs
    );
  }
  // Compound match — mirror _waitForRoute's pattern exactly
  // ... (see _waitForRoute for reference implementation)
}
```

**Preferred:** refactor the compound-filter portion of `_waitForRoute`
into a shared helper (e.g., `_waitForCompoundEvent(eventName,
primaryKey, primaryVal, secondaryKey, secondaryVal, timeoutMs)`) if
the refactor is genuinely trivial (< 30 minutes, no existing callers
broken). Both `_waitForRoute` and `_waitForQueueRow` then call it.
Rule 27 compliance is preserved in the shared helper.

**Acceptable alternative:** copy the re-queue pattern from
`_waitForRoute` into `_waitForQueueRow` verbatim, with a comment
pointing at the twin. Less DRY but zero refactor risk.

Pick whichever is faster. If unsure, pick copy-paste; B-UI-3 or B6
can DRY it up later when a third call site exists.

---

## Definition of done

### Code-level evidence

- `node --check cmd-center.js` passes.
- `grep -c "Wait ForQueueRow" cmd-center.js` returns ≥2 (registry
  entry + implementation).
- `grep -c "work_queue.rendered" cmd-center.js mw-tabs.js aegis.html`
  unchanged from B-UI-1 baseline (no new emit sites).
- Cache-bust bumped at all relevant sites (whatever the current
  canonical version is; see Rule 28 per the CMD64c reconciliation).

### Script-level evidence

Probe script `scripts/b-ui-2_wait_queue_row_probe.txt`:

```
# Version: 1.0
# Requires: VS
# B-UI-2 probe — Wait ForQueueRow both single-field and compound.

Assert session VS is connected

VS: Set View "compass"
Wait ForLocation VS "compass.my_work" timeout=30000

VS: Set Tab "MY REQUESTS"
VS: Set SubTab "BROWSE"
VS: Form Open "Expense Report"
Pause Form open — confirm Expense Report modal is visible

VS: Form Insert "Employee Name" "Vaughn Staples"
VS: Form Insert "Trip Start Date" "2026-04-14"
VS: Form Insert "Trip End Date" "2026-04-14"
VS: Form Select "Business Purpose" "client"
VS: Form Insert "Purpose Description" "B-UI-2 probe"
VS: Form Insert "Customer Name" "Apex Consulting Group"
VS: Form Submit

Wait ForEvent "form.submitted" → $instance_id
Wait ForInstance $instance_id for launched

VS: Set Tab "MY WORK"

# Single-field match
Wait ForQueueRow $instance_id

# Compound match (same event; proves both paths work)
Wait ForQueueRow $instance_id to VS

Log "✓ B-UI-2 probe complete · $instance_id"
```

Runs end-to-end with one Form Open Pause (unchanged — that's
form-render category, a separate brief). Both `Wait ForQueueRow`
variants resolve on the same emit firing; the single-field call
resolves from the buffer on the second invocation.

### dual_session_test v1.4 migration (optional same-session follow-up)

Since `work_queue.rendered` fires immediately after the Work Queue
reactivity updates the DOM, `dual_session_test` v1.3's two Work
Queue Click "Review" sites could theoretically be preceded by a
`Wait ForQueueRow` to make the test even more deterministic. Not
strictly needed — B-UI-1's reactive subscription already handles
the timing — but adding `Wait ForQueueRow` calls:

- Makes the script's intent explicit (declares "wait for queue
  render" rather than assuming the timing holds)
- Provides a canonical usage example for future script authors
- Eliminates any residual race if a DOM commit ever becomes
  slower than expected

If this migration is straightforward (< 15 minutes), include it in
the brief deliverable as v1.4. If the migration surfaces any
complication, defer it to a separate follow-up.

### Handoff update

Append `## Brief B-UI-2 — Wait ForQueueRow (CMD65)` with:

1. The new command's syntax and implementation choice
   (shared-helper refactor vs copy-paste).
2. The updated command vocabulary table (now five typed Waits).
3. Probe script reference.
4. v1.4 migration status (applied or deferred).
5. Updated file version table.
6. Updated cache-bust inventory.
7. Candidate follow-ups: `modal.opened` emit + `Wait ForModal`
   command; Cadence iframe SQL sweep for `compass_form_ready`.

---

## Out of scope

- **Do not** add new emits.
- **Do not** modify `work_queue.rendered` payload.
- **Do not** add `Wait ForX` commands beyond this one.
- **Do not** refactor `_waitForEventFiltered`.
- **Do not** touch B-UI-1's reactivity subscriptions.
- **Do not** expand to Instance Feed waits (`Wait ForInstanceCard`
  or similar) — that's a B-UI-3 candidate if ever needed.

---

## Pre-flight checklist

1. Does `_waitForRoute` (CMD63b) use the one-scan-per-wait pattern
   correctly? (Should — it's the reference implementation for Rule
   27.)
2. Will the shared-helper refactor break any existing
   `_waitForRoute` callers? (Only `dual_session_test`,
   `b1_event_emit_probe`, and the new B-UI-2 probe should call it
   through command-registry dispatch.)
3. What's the canonical CMD version to bump to after the CMD64c
   reconciliation you flagged?
4. Do both the single-field and compound match paths honor Rule
   22 (buffer scan precedes forward queue)?
5. Does the command parser correctly distinguish `Wait ForQueueRow
   $id` (single-field) from `Wait ForQueueRow $id to VS` (compound)?
   If `to` is a keyword for other Wait commands already, the parser
   should handle it naturally; confirm.

---

## Post-completion

After B-UI-2 lands:

- Script vocabulary is at 5 typed Wait commands (+ `Wait ForEvent`
  legacy = 6 total).
- `work_queue.rendered` has a canonical consumer.
- `dual_session_test` v1.4 may or may not ship depending on the
  migration choice above.
- Next candidates: `modal.opened` + `Wait ForModal` (drops 2 of the
  remaining 3 Pauses); Cadence iframe SQL sweep (drops the last).

---

*End of Brief B-UI-2. Revisions go in a new numbered brief.*
