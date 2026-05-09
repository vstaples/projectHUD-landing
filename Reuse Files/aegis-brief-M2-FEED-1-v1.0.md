# Brief M2-FEED-1 · Aegis M2 Live CoC Feed

**Category:** UI micro-brief (not a Phase-1 policy-system brief)
**Depends on:** B1 complete (CMD60 deployed; seven emits verified firing)
**Unblocks:** visible confirmation of the event bus for demos, stakeholder reviews, and daily operator use
**Inherits from:** `hud-ecosystem-protocol-v0.1.md`, `aegis-vision-anchor-v1.1.md`
**Estimated session:** 1–2 hours
**Brief version:** 1.0 · 2026-04-18

---

## Scope statement

Replace the hardcoded mock CoC event list in `aegis.html` (the "CoC event
stream · live" column of the M2 Overview tab, currently around lines
670–679) with a live-rendered feed driven by the `app_event` broadcast
channel.

The event stream is already flowing. This brief does not wire new
emits. It does not add new commands. It consumes what B1 produced and
renders it.

**Scope is deliberately narrow:**

- Only the M2 Overview tab's "CoC event stream · live" column is
  touched. The "Instance feed" column and "Session presence" column
  stay hardcoded for a later brief.
- The full "CoC stream" tab (`mc-coc` view in `aegis.html`) may get a
  trivial same-treatment, but the Overview column is the required
  deliverable; the full view is a stretch goal.
- No new events, no new emits, no new commands. Pure UI.

---

## Context files

The coding session reads these files, in this order:

1. `hud-ecosystem-protocol-v0.1.md` — skim Contract 1 (event bus).
   Relevant section: envelope format. Listeners receive the inner
   payload per Iron Rule 20.
2. `aegis-vision-anchor-v1.1.md` — full document for grounding.
3. `aegis-handoff-2026-04-17-milestone.md` — pay attention to:
   - The B1 section (seven emits and their payload shapes)
   - Iron Rules 20–23 (how event delivery actually works)
   - CMD57 (Aegis self-echo exemption — this brief runs *on* Aegis, so
     be aware of how `_aegisMode` affects filter paths)
4. `aegis.html` — particularly:
   - Lines ~666–680 (the current mock CoC stream to replace)
   - The `switchMC` function and the `mc-overview` / `mc-coc` views
   - CSS classes: `.coc-item`, `.coc-dot`, `.coc-body`, `.coc-evt`,
     `.coc-meta`, `.coc-time`, and the badges `.b-gr`, `.b-am`,
     `.b-rd`, `.b-aq`
5. `cmd-center.js` — particularly:
   - `_cmdEmit` (lines ~448 region) — understand the envelope
   - The `app_event` handler (~line 331) — understand what listeners
     get delivered
   - `_eventBuffer` and retention logic (CMD55) — new-listener scans
     the buffer on registration
6. `aegis-brief-B1-event-bus-v1.1.md` — for the emit payload
   specifications (table of seven events and their inner payload
   shapes)

**Do not** read `mw-tabs.js`, `mw-events.js`, `mw-core.js`, or
`compass.html`. They are Compass-side; this brief is Aegis-side only.

---

## Iron rules inherited

From `aegis-handoff-2026-04-17-milestone.md`:

- **Rule 15** (enumerated in CMD57) — Aegis must be exempt from
  self-echo filters. Verify the M2 feed receives events from all exec
  sessions, including any that happen to share `_mySession.userId`
  with Aegis. This is likely already handled by the line-331
  `app_event` handler; just confirm the feed subscribes via an API
  that inherits that handler's filtering.
- **Rule 20** — Event listeners receive the **inner payload**, never
  the envelope. When the feed subscribes to events, it gets the
  `{instance_id, form_name, ...}` shape directly, not the outer
  envelope. Do not attempt to read `event_id` or `protocol_version`
  from a listener callback.
- **Rule 22** — `_waitForEvent` scans the retention buffer before
  queueing forward. The M2 feed does not use `_waitForEvent` — it
  uses a long-lived listener pattern. But the *buffer exists* and
  may be useful for "render last N events on mount" (see Open
  question below).
- **Rule 23** — Outbound emit queue. Irrelevant to this brief (Aegis
  does not emit app_events).

From the Vision Anchor:

- **Commitment #5** — Authored in Cadence, enforced in Aegis, felt in
  Compass, delivered by CommandHUD. Aegis's M2 is the "enforced in
  Aegis" surface's primary observability layer. The live feed is part
  of making policy firings visible at a glance.

---

## Specification

### 1. Event subscription

Aegis M2 needs a module-level subscriber that receives every
`app_event` broadcast and appends it to the rendered feed.

Implementation: use the same `app_event` handler path that currently
logs `[cmd-center] recv <event>` (the `DEBUG_EVENTS` log line).
Specifically, tap into it — do not build a parallel channel
subscription.

Option A (recommended): expose a public subscription API from
`cmd-center.js`:

```js
// In cmd-center.js, near the existing CMDCenter public API block:
window.CMDCenter.onAppEvent = function(callback) {
  _m2FeedListeners.push(callback);
};
```

Then in the line-331 `app_event` handler, after self-echo filter and
buffer push, fan out to `_m2FeedListeners.forEach(fn => fn(eventName, payload))`.

This is a one-way, fire-and-forget subscription. Unsubscribe is not
needed for M2 (it is a long-lived panel). Do not build an
unsubscribe API unless a specific need arises.

Option B (less preferred): have the M2 feed poll `_eventBuffer`
every 500ms and diff. Simpler in some ways, but diffing is annoying,
and polling adds latency to the visible feed. Use Option A.

### 2. Event rendering

Each event becomes a list item matching the existing `.coc-item` CSS
structure:

```html
<div class="coc-item">
  <div class="coc-dot" style="background: {color}"></div>
  <div class="coc-body">
    <div class="coc-evt">{formatted_title}</div>
    <div class="coc-meta">{formatted_meta}</div>
  </div>
  <div class="coc-time">{relative_time}</div>
</div>
```

New items are **prepended** to the list (freshest at top). The list
is capped at 20 items on the M2 Overview column; the full CoC view
(stretch goal) is capped at 100.

Formatter per event type:

| Event | Dot color | Title | Meta |
|-------|-----------|-------|------|
| `form.submitted` | `--gr` (green) | `form.submitted · {form_name}` | `{submitter_name or resource_id prefix} · {amount or '—'}` |
| `instance.launched` | `--aq` (cyan) | `instance.launched · {template_name}` | `{instance_id prefix 8 chars}` |
| `instance.completed` | `--gr` | `instance.completed · {template_name or id prefix}` | `{final_status} · {elapsed_ms formatted as "Nh Nm" or "Nm Ns"}` |
| `instance.blocked` | `--rd` (red) | `instance.blocked · {template_name or id prefix}` | `{reason} · {details}` |
| `workflow_request.created` | `--am` (amber) | `wf_request.created · step {seq}` | `→ {assignee_name} · {role}` |
| `workflow_request.resolved` | `--gr` if approved, `--am` if changes_requested, `--rd` if declined | `wf_request.resolved · step {seq}` | `{decision} · by {resolver_name}` |
| `location.ready` | *(hidden by default — see filter)* | | |
| `tab_switch` | *(hidden by default — see filter)* | | |
| *unknown event* | `--pu` (purple) | `{event_type}` | JSON.stringify first 80 chars of payload |

**Relative time:** "just now" (<10s), "Xs" (<60s), "Xm" (<60m),
"Xh" (<24h), else the date. Recompute every 5 seconds for visible
items (don't let displayed relative times drift).

**Name resolution:** When a payload carries `resource_id` but not a
name (e.g., `location.ready` has `resource_id` but no `name`), the
formatter should look up the name from `_sessions` (the existing
presence map in `cmd-center.js`). If not found, display the first 8
characters of the resource_id. This prevents the feed from being a
wall of UUIDs.

### 3. Filtering

The M2 Overview column is the "signal" view. High-volume, low-signal
events (`tab_switch`, `location.ready`) are hidden by default.

Add a compact filter control above the feed — two or three small
toggle pills for "signal / noise / all". Default: signal only.

- **Signal** (default): `form.*`, `workflow_request.*`, `instance.*`,
  `policy.*`, `dispatch.*`, and any unknown event types.
- **Noise**: `location.*`, `tab_switch` (legacy name,
  unnamespaced — still hidden in this bucket).
- **All**: everything.

Filter state lives in module-level JS; does not persist across page
reloads. A session preference is fine if trivially easy, but not
required.

### 4. Initial population from the retention buffer

On M2 panel mount, render the most recent ~20 events already in
`_eventBuffer` (per CMD55). This means opening Aegis to M2 doesn't
show an empty column when real activity has happened in the last 30
seconds.

Expose the buffer contents via a public API if not already:

```js
// In cmd-center.js public API:
window.CMDCenter.recentEvents = function(n) {
  // Return newest-first array of {eventName, data, ts}, up to n entries.
};
```

Mount the feed by calling this, formatting each entry through the
same renderer live events use. After mount, subscribe to
`onAppEvent`. Live events prepend; the initial buffer-scan populates
the rest.

### 5. Where to wire it in `aegis.html`

The current mock is around lines 670–679 of `aegis.html`, inside the
`mc-overview` div's third column. Replace the static HTML with:

```html
<div id="m2-coc-feed" class="col-body">
  <!-- Populated by M2 feed JS -->
</div>
```

Add an inline `<script>` block at the end of the M2 Overview
section, or (cleaner) in the existing `<script>` block at the bottom
of `aegis.html`, that:

1. Defines formatters for each event type
2. Defines the renderer (`_m2RenderEvent(eventName, data)`)
3. On DOMContentLoaded (or right after `CMDCenter` is defined),
   calls `CMDCenter.recentEvents(20)` and renders
4. Calls `CMDCenter.onAppEvent((name, data) => _m2RenderEvent(name, data))`
5. Sets up a `setInterval` to refresh relative times every 5s

Keep the script block compact — this is presentation logic, not
architecture. ~100 lines of JS plus the CSS already present.

### 6. Empty state

When no events match the current filter (e.g., "signal only" with
nothing but tab_switch traffic), render a muted single-line message:

```
No events in the last 30 seconds matching current filter.
```

Not a big graphic. One line, `--t3` color, same 12px type. Hidden
when the feed has any items.

---

## Definition of done

After this brief lands:

### Visual evidence

Open Aegis. Navigate to M2 · Mission Control · Overview. The third
column ("CoC event stream · live") shows:

- At load: the most recent 20 events from the retention buffer,
  rendered in the formatted style.
- When an exec session (VS or AK) takes an action: new items appear
  at the top within a second of the emit firing.
- Hiding/showing `tab_switch` and `location.ready` via the filter
  control works as expected.
- Relative times update every 5 seconds without flicker.

### Code evidence

- `grep -c "window.CMDCenter.onAppEvent\|window.CMDCenter.recentEvents" cmd-center.js aegis.html`
  returns matches showing both are defined (in `cmd-center.js`) and
  consumed (in `aegis.html`).
- `node --check cmd-center.js` passes.
- `grep -n "coc-item" aegis.html` still shows the CSS classes
  defined (the existing selectors are reused); but the mock
  `<div class="coc-item">` hardcoded items around lines 670–679 are
  **gone**.
- No new dependencies. No build step. Same browser-native ES5/6.

### Handoff update

Append a new section to the handoff: `## Brief M2-FEED-1 — Live CoC
Feed (CMD61)` with:

1. The new public API on `CMDCenter` (`onAppEvent`, `recentEvents`).
2. The `aegis.html` edits (specific line ranges removed and added).
3. Any new iron rule discovered (likely one or none — this is a
   low-surprise brief).
4. Updated file version table.
5. Updated cache-bust inventory.

### No changes to B2 preconditions

After this brief, `dual_session_test` still passes unmodified. The
B1 probe script still passes unmodified. Nothing in the event
emission or Wait paths has been touched — only the M2 UI.

---

## Out of scope

- **Do not** touch the Instance feed column or Session presence
  column. They stay hardcoded.
- **Do not** touch the M2 Instances, M2 Sessions, or M2 CoC full-view
  tabs in this brief unless you extend the stretch goal (below).
- **Do not** add persistence. Events live in memory only. Reloading
  Aegis clears the feed (except for the last 30s from the buffer).
- **Do not** add per-event drill-down. Clicking an event item may, at
  most, copy its JSON to clipboard — do not build an inspector panel.
  That is a B6 / M5 Audit feature.
- **Do not** add policy-specific UI. `policy.*` events show up in the
  signal bucket with the generic renderer when they start firing.
  Specialized policy UI is B9.
- **Do not** attempt to render the "Instance feed" column's
  per-instance state by consuming events (it looks tempting — events
  could theoretically drive the "blocked / awaiting / in progress"
  counts). Defer that; state-projection is a larger design question.

### Stretch goal (if time permits)

The full "CoC stream" view (`mc-coc` in `aegis.html`) can be given
the same treatment — same renderer, cap at 100 items, include a
per-event-type filter with all namespaces selectable. If this is
straightforward, ship it; if it adds >30 min, skip and leave a
`// TODO: CoC full view — same renderer, cap 100` comment near the
Overview-column wiring.

---

## Pre-flight checklist

Before writing any code, answer these. If unclear, re-read the
relevant file.

1. What is the shape of the payload delivered to an `app_event`
   listener — envelope or inner?
2. Why do we use `CMDCenter.onAppEvent` instead of
   `_channel.on('broadcast', ...)`?
3. Where does the retention buffer live, and how old can an event in
   it be?
4. How does the feed render names when a payload only carries a
   `resource_id`?
5. Which events are hidden by default, and why?
6. What happens to B1's probe script after this brief ships?
   (Answer: nothing — no code it depends on was touched.)
7. Why does the filter default to "signal" rather than "all"?
8. If Iron Rule 15 somehow regressed again, what symptom would the
   M2 feed show? (Answer: VS's emits would not appear when Aegis is
   run in the same browser as VS's Compass.)

---

## Post-completion next steps

After this brief:

- The event bus has visible UX. B1's invisible plumbing is now
  demonstrable to any stakeholder in 30 seconds.
- B1.5 (channel rename) is next in the recommended sequence, then B2
  (Wait commands).
- M2's Instance feed and Session presence columns remain as later
  small UI briefs, in parallel with or after B2.

---

*End of Brief M2-FEED-1. Revisions go in a new numbered brief.*

## Brief M2-FEED-1 — Live CoC Feed (CMD61)

Replaced the hardcoded mock CoC stream in M2 Overview with a live-rendered
feed driven by the `app_event` broadcast channel. Pure presentation layer —
no new emits, no new commands, no schema changes.

### New public API on `window.CMDCenter`

- `onAppEvent(callback)` — register a long-lived listener that fires after
  self-echo filter and envelope unwrap. Callback receives
  `(eventName, innerPayload)`. Fire-and-forget; no unsubscribe.
- `recentEvents(n)` — returns up to N newest entries from `_eventBuffer`,
  newest-first, shaped as `{eventName, data, ts}`. Bounded by the existing
  30s retention window (CMD55).

Internal: `_m2FeedListeners[]` array and `_fanoutAppEventListeners()` helper
in `cmd-center.js` near the `_eventBuffer` declaration. Fan-out fires from
both the remote `app_event` handler (after `_pushEventBuffer`) and local
`_cmdEmit` (after `_resolveEventListeners`), so listeners see identical
shape regardless of origin.

### `aegis.html` edits

- **Removed:** 9 hardcoded `<div class="coc-item">` rows (former L670–678)
  in the M2 Overview "CoC event stream · live" column.
- **Added:** `<div id="m2-coc-feed" class="col-body">` container plus three
  `signal | noise | all` filter pills in the column header.
- **Removed:** static summary block + 9 `coc-full-item` rows in `#mc-coc`
  full view (former L899–915). Filter sidebar untouched.
- **Added:** `<div id="mc-coc-feed">` container under a minimal live
  summary, capped at 100 items, sharing the same renderer.
- **Added:** ~6 lines of CSS for `.m2f-pill` and `.m2f-empty`.
- **Added:** ~220-line IIFE before the `cmd-center.js` script tag —
  formatters per event type, filter state, renderer, buffer-seeded mount,
  5s rel-time tick. Polls for `window.CMDCenter` (50ms × 200) since the
  inline script runs before `cmd-center.js` loads.

### Filter classification

- **Signal** (default): `form.*`, `instance.*`, `workflow_request.*`,
  `policy.*`, `dispatch.*`, all unknown event types.
- **Noise**: `location.ready`, `location.changed`, `tab_switch`.
- **All**: everything.

Filter state is module-local; not persisted across reloads.

### Iron Rule discovered (Rule 24)

**Rule 24.** Late `window.CMDCenter = {...}` assignments at the end of
`cmd-center.js` clobber any earlier `window.CMDCenter.foo = …` or
`window.CMDCenter = window.CMDCenter || {}` additions. Public API methods
must be added inside the existing assignment block (line ~2744), not
appended to a separate `window.CMDCenter` reference earlier in the file.

Symptom: methods appear missing at runtime even though their definitions
parse cleanly and a `grep` shows them in the file. The `||` guard reads
defensive but defends against the wrong direction of override.

### Updated file version table

| File           | Prev               | Now                |
|----------------|--------------------|--------------------|
| cmd-center.js  | v20260418-CMD60    | v20260418-CMD61    |
| aegis.html     | (cmd-center stamp) | (cmd-center stamp) |
| mw-tabs.js     | unchanged          | unchanged          |
| mw-events.js   | unchanged          | unchanged          |
| mw-core.js     | unchanged          | unchanged          |

### Cache-bust inventory

`aegis.html` references `cmd-center.js?v=20260418-CMD61` (single reference,
end of file). No other version stamps to bump for this brief.

### B1 / B2 preconditions

`dual_session_test` v1.1 unchanged and still passes.
`b1_event_emit_probe.txt` unchanged. Note: the probe script's
`form.submitted` timeout under M2 visibility revealed a pre-existing race
between `Form Open` and `Form Insert` (form not yet rendered when inserts
fire, inserts silently no-op, submit fails on missing required fields).
This is a B-series command brief — the M2 feed correctly observed the
absence of `form.submitted`, which is what made the bug visible.