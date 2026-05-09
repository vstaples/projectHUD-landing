# Brief B-UI-1 · UI Reactivity for Work Queue + Instance Feed

**Category:** UI correctness fix (not a Phase-2 brief)
**Depends on:** B1 complete (CMD61); M2-FEED-1 complete (CMD61); B1.5 complete (CMD62); B2 complete (CMD63b)
**Unblocks:** `dual_session_test` v1.3 without UI-render-gap Pauses; real operator use of Compass without stale work queues
**Inherits from:** `hud-ecosystem-protocol-v0.1.md`, `aegis-vision-anchor-v1.1.md`
**Estimated session:** 2–3 hours
**Brief version:** 1.0 · 2026-04-19

---

## Scope statement

Two Compass/Aegis UI surfaces are **non-reactive**: they render from
DB queries at mount time only, and ignore live event-bus broadcasts.
This means a user staring at their screen when an event fires on
their behalf sees nothing until they refresh.

This brief fixes both:

1. **Compass Work Queue** — subscribes to `workflow_request.created`
   and `workflow_request.resolved` for the current operator's
   `resource_id`. On matching events: inserts, updates, or removes
   the affected row without tab-switch or refresh.

2. **Aegis M2 Instance Feed** (the column to the left of the CoC
   stream that M2-FEED-1 wired) — subscribes to `instance.launched`,
   `instance.completed`, `instance.blocked`, and
   `workflow_request.resolved`. On matching events: inserts new
   instance cards, updates existing ones, re-sorts as needed.

3. **New emit: `work_queue.rendered`** — fires after the Work Queue
   has committed its DOM for a newly inserted row. Payload carries
   `instance_id`, `workflow_request_id`, `seq`, `assignee_resource_id`,
   `template_id`. Enables a future `Wait ForQueueRow` command (not
   in scope here; see Out of scope).

**This is product correctness, not feature work.** The event bus
already emits everything these UIs need. They simply aren't
listening.

---

## Context files

Read in this order:

1. `hud-ecosystem-protocol-v0.1.md` — Contract 1 (envelope). The new
   emit must be protocol-compliant.
2. `aegis-vision-anchor-v1.1.md` — commitments #1 (one event bus),
   #5 (felt in Compass).
3. `aegis-handoff-2026-04-17-milestone.md` — pay attention to:
   - The B1 emit table (payload shapes for the events being consumed)
   - M2-FEED-1 section (the `onAppEvent` API and renderer pattern
     this brief reuses)
   - Iron Rules 15, 20, 22, 24, 25, 27 (all relevant)
   - The CMD63b post-B2 migration handoff's Pause taxonomy
     (UI-render-gap is the category this brief resolves)
4. `cmd-center.js` — `window.CMDCenter.onAppEvent` and
   `window.CMDCenter.recentEvents` (lines vary; search).
5. `mw-tabs.js` — the Work Queue component:
   - Where `my-work` tab renders rows (search for `workqueue`,
     `work_queue`, or the rendering of `workflow_requests`)
   - Where the initial query fires (probably in the tab's activate
     handler or on mount)
   - The existing row-render function (we will reuse it)
6. `aegis.html` — the M2 Overview Instance Feed column. Lives to
   the left of the CoC feed column that M2-FEED-1 wired. Search for
   `instance-feed`, `instanceFeed`, or where instance cards are
   declared. Likely around the same region as M2-FEED-1's mount
   point.

**Do not read** `mw-events.js`, `mw-core.js`, `compass.html`, or
`sidebar.js`. This brief does not touch them.

---

## Iron rules inherited

- **Rule 15** (enumerated in CMD57) — Aegis exempt from self-echo
  filter. Both subscriptions inherit this via `onAppEvent`.
- **Rule 20** — Listeners receive inner payload, never envelope.
- **Rule 22** — Retention buffer precedes forward queue. On mount,
  both UIs should scan recent events via `recentEvents(N)` so a tab
  opened seconds after an event fired still catches up.
- **Rule 24** — Dual-subscribe active; no impact to this brief
  because `onAppEvent` is downstream of the dedup layer.
- **Rule 25** — `event_id` dedup at handler entry. Same — no impact
  because listeners fire after dedup.
- **Rule 27** — Predicate re-check must not re-scan the buffer. The
  Work Queue and Instance Feed aren't doing predicate re-checks, but
  if future logic does, respect this rule.

---

## Specification

### Part 1 — Compass Work Queue reactivity

#### Current state

The Work Queue renders from a DB query fired at tab-mount time. No
subscription. A `workflow_request.created` emit reaches the Compass
tab via the event bus and is available to `CMDCenter.onAppEvent`
listeners, but the Work Queue component has no listener.

#### Target state

On mount: existing query runs (unchanged). **In addition:** a
`CMDCenter.onAppEvent` subscription is registered. On every matching
event, the queue mutates in place:

- **`workflow_request.created`** where
  `assignee_resource_id === _myResource.id` → insert a new row at
  the top. If a row for this `workflow_request.id` already exists
  (rare, but guard anyway), update it in place instead of
  duplicating. After DOM insert commits, emit `work_queue.rendered`
  (see Part 3).

- **`workflow_request.resolved`** where `resolver_resource_id ===
  _myResource.id` → remove the corresponding row from this queue
  (the user resolved their own task; it should disappear). If the
  event's `decision` is `changes_requested`, leave the row and
  update its badge to "Changes requested" rather than removing.

Events for other operators (`assignee_resource_id !== _myResource.id`)
are ignored — the Work Queue shows only the current user's items.

#### Row rendering

Reuse the existing row-render function. Do not reimplement row HTML
inside the event handler. The subscription extracts the event
payload, constructs the minimum data shape the existing renderer
expects (probably `{id, instance_id, template_name, assignee_name,
role, seq, ...}`), and passes it through.

If the payload from the event doesn't carry every field the
renderer needs (e.g., `template_name` isn't in
`workflow_request.created`'s payload — per B1 spec, only
`template_id` is), make one targeted DB lookup to fill the gaps.
Cache the result in a module-local map keyed on `template_id` so
subsequent events for the same template don't re-query.

#### On-mount buffer scan

When the Work Queue mounts (tab activate, or initial load), after
the DB query, also call `CMDCenter.recentEvents(50)` and process
any `workflow_request.created` / `workflow_request.resolved` events
matching the current operator. Apply the same mutation logic. This
catches the "tab opened 5 seconds after the event fired" race.

Dedup against the DB query's rows: if a row for a
`workflow_request.id` is already present from the initial query,
skip the buffered event (don't double-insert).

### Part 2 — Aegis M2 Instance Feed reactivity

#### Current state

The Instance Feed column on M2 Overview renders from a DB query at
M2 mount time. No subscription. Confirmed during B1.5 smoke.

#### Target state

On M2 mount (or page load): existing query runs (unchanged). In
addition: a `CMDCenter.onAppEvent` subscription is registered. On
matching events, the feed mutates in place:

- **`instance.launched`** → insert a new instance card at the top.
  Payload carries `instance_id`, `template_id`, `template_name`,
  `submitter_resource_id`. Initial step count / progress indicator
  rendered from known defaults (step 1 of N where N comes from the
  template; if N isn't knowable, render "Step 1 of ?").

- **`workflow_request.resolved`** → update the step indicator on
  the affected instance card. Which step is now "current" is
  derived from the `seq` in the event. If the instance card isn't
  present (opened too long ago, scrolled off), ignore.

- **`instance.completed`** → update the card's status pill to
  "Complete" with appropriate color (green for success,
  amber/gray for cancelled). Re-sort: completed instances move to
  the bottom or drop out of the Overview view entirely depending
  on existing sort semantics. Check how the existing DB-mounted
  list handles completed; match that.

- **`instance.blocked`** → update the card's status pill to
  "Blocked" (red). Show a one-line reason pulled from the event's
  `details` field, truncated to fit.

#### List cap

The existing M2 Overview Instance Feed appears capped (the "18
ACTIVE" counter you'll see in the existing UI suggests a truncated
view). Maintain that cap — new `instance.launched` events cause the
oldest visible card to drop off. The full Instances tab (if
present) can render the uncapped list; in this brief the Overview
column is the only target.

If the Overview card cap is not obvious from the existing code,
pick a sensible default (e.g., 6 cards) and document the choice in
the handoff.

#### On-mount buffer scan

Same pattern as the Work Queue: on M2 mount, after the DB query,
call `CMDCenter.recentEvents(50)` and process matching events with
the same dedup-against-initial-query logic.

### Part 3 — `work_queue.rendered` emit

Fires from `mw-tabs.js`, **after** the Work Queue has committed its
DOM for a new row inserted by the Part 1 reactive subscription.

Trigger point: inside the Work Queue's row-insert handler, after
the DOM mutation completes. If the renderer returns a Promise or
uses `requestAnimationFrame`, fire the emit inside the RAF callback
or after the Promise resolves, to ensure the DOM is queryable
before the emit.

Payload:

```json
{
  "workflow_request_id": "<uuid>",
  "instance_id": "<uuid>",
  "seq": 3,
  "assignee_resource_id": "<uuid>",
  "template_id": "<uuid>"
}
```

Envelope auto-built by `_cmdEmit`.

Fires **only for newly inserted rows**, not for rows updated in
place (e.g., `changes_requested` badge update doesn't emit). The
emit's purpose is "a new queue item is now clickable."

Fires **only on the operator's own Compass tab** — i.e., only when
the row inserted is for `_myResource.id`. This is naturally the
case because the subscription only inserts rows for the current
operator.

### Part 4 — M2 feed classification of the new emit

`work_queue.rendered` goes in the **signal** filter bucket (same as
the other `*.created` / `*.resolved` / `instance.*` events). Not
noise.

The existing M2-FEED-1 formatter map needs an entry for
`work_queue.rendered`. Suggested:

- Dot color: `--aq` (cyan) — mirrors `instance.launched`'s color
- Title: `work_queue.rendered · step {seq}`
- Meta: `→ {assignee_name or resource_id prefix}`

Name resolution on `assignee_resource_id` follows the existing
pattern from M2-FEED-1.

---

## Definition of done

### Code-level evidence

- `node --check cmd-center.js` passes.
- `node --check mw-tabs.js` passes.
- `grep -c "window._cmdEmit(" cmd-center.js mw-tabs.js mw-events.js mw-core.js`
  returns **10** (nine logical emits + `tab_switch` legacy).
- `grep -c "CMDCenter.onAppEvent" mw-tabs.js aegis.html` returns
  ≥2 (Work Queue subscription in mw-tabs.js, Instance Feed
  subscription in aegis.html).
- `grep -c "work_queue.rendered" cmd-center.js mw-tabs.js aegis.html`
  returns ≥3 (emit call, renderer map entry, any filter mention).
- Cache-bust bumped to `v20260419-CMD64` (or next appropriate) at
  all three sites.

### Behavioral evidence

**Test 1: Work Queue live update on VS's Compass.**

1. Open Compass on VS in one tab. Navigate to MY WORK tab.
2. Submit an Expense Report from a second Compass tab (or from
   Aegis dispatching to VS). The submission routes back to VS at
   seq 2 (submitter approval).
3. Without refreshing, within ~1 second a new row should appear
   at the top of VS's Work Queue. No tab switch required.
4. Aegis console shows `recv work_queue.rendered` arriving from
   VS's tab.

**Test 2: Work Queue removes resolved item.**

1. Continuing from Test 1, VS clicks Approve on the newly-appeared
   row.
2. Within ~1 second the row disappears from the queue.
3. If another matching request is still pending, it remains.

**Test 3: Aegis Instance Feed live update.**

1. With Aegis open on M2 Overview, watch the Instance Feed column.
2. Submit an Expense Report from Compass.
3. A new instance card appears at the top of the feed within
   ~1 second of the `instance.launched` emit.
4. As approvals progress, the card's step indicator updates in
   place.
5. When the instance reaches a blocked step (Finance role
   unassigned), the card's status pill updates to "Blocked" with
   the reason text.

**Test 4: Tab-opened-after-event buffer catch-up.**

1. Close VS's Compass tab.
2. Submit an Expense Report from another Compass session (dispatch
   a `workflow_request.created` targeted at VS within the last
   30 seconds).
3. Open VS's Compass tab fresh. Navigate to MY WORK.
4. The newly-routed row appears immediately — from the
   `recentEvents(50)` buffer scan, not from waiting for a live
   emit.

**Test 5: `dual_session_test` v1.3 passes end-to-end.**

After this brief lands, the two UI-render-gap Pauses in v1.2
("Confirm request appears in Vaughn's work queue" / "Confirm
request appears in Angela's work queue") should be deletable. A
follow-up micro-migration ships v1.3 that drops them. v1.3 must
pass end-to-end unattended except for the remaining form-render
and modal-render Pauses.

The v1.3 migration itself is a separate follow-up, not part of
this brief. But this brief's acceptance is gated on confirming
the v1.3 path is viable — do one end-to-end run with the Pauses
**manually held by the operator** (press Enter immediately) and
verify Click "Review" succeeds every time.

### Handoff update

Append `## Brief B-UI-1 — UI Reactivity (CMD64)` with:

1. The two non-reactive surfaces, now reactive, and their
   subscription patterns.
2. The `work_queue.rendered` emit site and payload.
3. Overview Instance Feed card cap (whatever value was chosen).
4. Any new iron rules discovered.
5. Pause taxonomy update: UI-render-gap Pauses are now migratable
   (Target emit column: `work_queue.rendered` is live; instance
   feed is fully reactive).
6. Updated file version table.
7. Updated cache-bust inventory.
8. Candidate follow-ups: `dual_session_test` v1.3 migration;
   `modal.opened` emit for UI-modal-render Pauses; Cadence iframe
   `compass_form_ready` migration for form-render Pauses.

---

## Out of scope

- **Do not** add `modal.opened` emit or `Wait ForModal` command.
  That is a successor brief.
- **Do not** add `Wait ForQueueRow` command. This brief emits the
  signal; a future script-vocabulary brief adds the command. The
  emit existing without the command is fine.
- **Do not** make the full M2 Instances tab reactive. Only the M2
  Overview Instance Feed column. The Instances tab is a separate
  larger surface and a separate brief.
- **Do not** make other Compass tabs (MY TIME, MY CALENDAR, etc.)
  reactive. Only MY WORK's queue.
- **Do not** add new events beyond `work_queue.rendered`. If you
  see a plausible candidate during implementation (e.g.,
  `instance_feed.rendered`), document as open question for a
  future brief.
- **Do not** refactor existing render functions. Call them with
  the right data shape; don't rewrite them.
- **Do not** touch the initial DB queries that power the current
  mount-time render. Both should still fire and populate initial
  state. This brief adds a *second* code path (event
  subscription) that mutates in response to live events.
- **Do not** migrate `dual_session_test` v1.2 → v1.3 in this
  brief. Separate follow-up once B-UI-1 verifies.
- **Do not** touch the Cadence iframe migration (deferred).

---

## Pre-flight checklist

Answer before writing code:

1. Where does the Work Queue component currently fetch its rows,
   and is the fetch function reusable from an event handler?
2. What shape does the Work Queue's existing row renderer expect?
   Specifically: what fields does it need that are NOT in the
   `workflow_request.created` payload?
3. How is `_myResource.id` available to the Work Queue subscription?
   Is it already a module-level global on the Compass side?
4. Where is the M2 Overview Instance Feed column declared in
   `aegis.html`, and what's the existing mount-time query?
5. What is the Overview Instance Feed's current card cap, if any?
6. Where in `mw-tabs.js` does the row-insert actually commit to DOM
   — is there a synchronous insert, a render pass, or a rAF?
7. Does `_cmdEmit` fire `work_queue.rendered` cleanly if called
   from inside a rAF callback?
8. If a user has MY WORK open when a `workflow_request.created`
   event fires for a different operator (e.g., a global broadcast
   for audit purposes), the subscription must ignore it. Confirm
   the filter on `assignee_resource_id === _myResource.id` is
   applied upstream of any DOM mutation.

---

## Post-completion next steps

After B-UI-1 lands and verifies:

- **`dual_session_test` v1.3** — migration removing the two
  UI-render-gap Pauses. 15-minute follow-up.
- **Cadence iframe `compass_form_ready` migration** — SQL sweep
  runbook (the next planned mop-up item). Unblocks `Wait ForForm`.
- **`modal.opened` emit + `Wait ForModal` command** — drops the
  UI-modal-render Pauses (Review popup, Document Review panel).
  Candidate small brief.
- **Then B6** — Phase 2 policy engine. At that point, every
  script in the regression suite runs unattended, every non-
  reactive UI surface is reactive, and the event taxonomy is
  genuinely complete.

---

*End of Brief B-UI-1. Revisions go in a new numbered brief.*
