# Brief B1.5 · Channel Rename to Protocol-Compliant Name

**Phase:** 1 (Foundation cleanup)
**Depends on:** B1 complete (CMD60 deployed); M2-FEED-1 complete (CMD61 deployed)
**Unblocks:** CommandHUD subscription (parallel build track); resolves Open Question #1 from B1 handoff
**Inherits from:** `hud-ecosystem-protocol-v0.1.md`, `aegis-vision-anchor-v1.1.md`
**Estimated session:** 1.5–2 hours
**Brief version:** 1.0 · 2026-04-18

---

## Scope statement

Rename the Supabase realtime channel from `cmd-center-{FIRM_ID}` to the
protocol-compliant `hud:{firm_id}` per HUD Ecosystem Protocol v0.1
Contract 1.

The rename is 3 lines of code; the brief's complexity is in the
**cutover strategy**. A naive rename creates a window during which old
tabs and new tabs cannot see each other — dispatched commands time out,
app_events go undelivered, the M2 feed appears frozen on stale tabs.

This brief implements a **dual-subscribe transition**: the new code
subscribes to *both* channels for one release cycle. Old tabs keep
working on the old channel, new tabs publish to both. Once all tabs
have refreshed (operator confirms), the old channel is removed in a
follow-up micro-brief.

**Do not** remove old-channel support in this brief. That comes after
operator-confirmed full refresh, not before.

**Do not** change the channel name in any documentation or vision
artifact yet. The handoff and Vision Anchor get updated in this brief's
DoD; the protocol document itself stays unchanged (it always specified
`hud:{firm_id}` as the target).

---

## Context files

The coding session reads these files, in this order:

1. `hud-ecosystem-protocol-v0.1.md` — Contract 1 (event bus). The
   target channel name is specified there.
2. `aegis-handoff-2026-04-17-milestone.md` — pay attention to:
   - Open Question #1 in the B1 section (this brief resolves it)
   - Iron Rules 15, 22, 23 — all touch the realtime channel paths
   - The B1, CMD55, CMD56, CMD57 sections — they describe the current
     channel subscription, retention buffer, outbound queue, and
     self-echo handling. Dual-subscribe must preserve all of them.
3. `aegis-vision-anchor-v1.1.md` — light skim. The relevant commitment
   is #1 (one event bus); nothing in this brief violates it.
4. `cmd-center.js` — particularly:
   - Lines ~167–180 (`_connect()`, where `_channel = _supabase.channel(...)`
     is called)
   - Lines ~316–356 (the `_channel.subscribe()` callback and presence
     track call)
   - The presence-sync, join, leave handlers (~lines 179–241)
   - The `cmd`, `result`, `app_event`, `location_update` broadcast
     handlers
   - The outbound queue flush in the SUBSCRIBED callback (CMD56)
   - `_channelSend` (~line 156) — every send to the wire goes through
     here

**Do not** read `mw-tabs.js`, `mw-events.js`, `mw-core.js`,
`compass.html`, `aegis.html`, or any HTML file. The change is
entirely within `cmd-center.js`.

---

## Iron rules inherited

- **Rule 15** (enumerated in CMD57) — Self-echo filtering exempts
  Aegis. Dual-subscribe must not disturb this. Both channels must
  apply the same exemption to inbound broadcasts.
- **Rule 20** — Listeners receive the inner payload, not the envelope.
  Both channels must deliver to the same listener path.
- **Rule 22** — Retention buffer scan precedes forward queue. Both
  channels feed the same buffer (`_pushEventBuffer` is shared).
- **Rule 23** — Outbound emit queue flushes on SUBSCRIBED. With two
  channels, "ready" means *both* are SUBSCRIBED before flushing
  outbound emits — see specification below.

---

## Specification

### 1. Channel naming

The current channel name is built at `cmd-center.js` line 171:

```js
_channel = _supabase.channel('cmd-center-' + FIRM_ID, { config: {...} });
```

Replace the single channel with two parallel channels:

```js
var LEGACY_CHANNEL_NAME = 'cmd-center-' + FIRM_ID;
var TARGET_CHANNEL_NAME = 'hud:' + FIRM_ID;

_channel       = _supabase.channel(TARGET_CHANNEL_NAME, { config: {...} });
_channelLegacy = _supabase.channel(LEGACY_CHANNEL_NAME, { config: {...} });
```

Both channels use **identical** config (presence key, broadcast self,
ack settings). The presence key for the legacy channel uses the same
`_mySession.userId + ':' + suffix` pattern.

### 2. Listener wiring — inbound

Every `_channel.on(...)` registration in the existing code (presence
sync, presence join, presence leave, broadcast `cmd`, broadcast
`result`, broadcast `app_event`, broadcast `location_update`) must be
duplicated on `_channelLegacy`.

Factor the handler bodies into named functions if not already, so each
registration is a single line and duplication is mechanical. Example:

```js
// Before:
_channel.on('broadcast', { event: 'cmd' }, function(payload) {
  // ... 30 lines of logic ...
});

// After:
function _handleCmd(payload) { /* ... 30 lines of logic ... */ }
_channel.on(      'broadcast', { event: 'cmd' }, _handleCmd);
_channelLegacy.on('broadcast', { event: 'cmd' }, _handleCmd);
```

This pattern applies to all seven handlers (3 presence + 4 broadcast).

**Critical:** the buffered-replay path (Rule 22) and self-echo
filtering (Rule 15 enumerated) must apply identically to both
channels. Because the same handler function processes both, this is
automatic — but verify it after refactoring. Test: an `app_event`
arriving on the legacy channel from VS's tab should reach Aegis
exactly the same way as one arriving on the new channel.

### 3. Outbound — `_channelSend` dual-write

`_channelSend` at line ~156 currently sends on `_channel` only. After
this brief it sends on **both** channels:

```js
function _channelSend(payload) {
  if (!_channel && !_channelLegacy) return;
  _safeSendOn(_channel,       payload);
  _safeSendOn(_channelLegacy, payload);
}
function _safeSendOn(ch, payload) {
  if (!ch) return;
  try {
    var state = ch.socket && ch.socket.conn && ch.socket.conn.readyState;
    if (state !== undefined && state !== 1) return; // 1 = OPEN
    ch.send(payload);
  } catch (e) {}
}
```

Both channels share the same `socket` (Supabase realtime uses a single
WebSocket per client), so `readyState === 1` will be true or false on
both at the same moment — but check independently anyway. Defensive.

### 4. Outbound emit queue (Rule 23) — both-channels-ready semantics

`_socketReady()` currently checks one channel. After this brief, an
emit can be flushed to the wire only if **both** channels' SUBSCRIBED
callbacks have fired. Otherwise an outbound emit might land on the
new channel but be lost on the legacy channel, and old tabs would
miss it.

```js
var _channelReady       = false;
var _channelLegacyReady  = false;
function _bothChannelsReady() { return _channelReady && _channelLegacyReady; }
```

Set `_channelReady = true` inside the new channel's SUBSCRIBED
callback. Set `_channelLegacyReady = true` inside the legacy
channel's SUBSCRIBED callback. Drain `_outboundQueue` inside whichever
SUBSCRIBED callback fires *second* — guard the drain with
`_bothChannelsReady()`.

Update `_cmdEmit` to queue if `!_bothChannelsReady()` rather than
checking single-channel readiness.

The presence track call (currently in the SUBSCRIBED callback) should
fire on **each** channel's SUBSCRIBED — i.e. presence is published on
both channels independently. This means presence-sync handlers will
fire on both; the existing dedup logic by userId in `_sessions`
handles this correctly without changes.

### 5. Connection banner / status

The "Connected · session: …" banner (`_appendLine('SYS', 'sys', ...)`)
should fire only when **both** channels are SUBSCRIBED, not on the
first-to-subscribe. Otherwise the operator sees "Connected" while
the system is half-blind.

The LIVE clock (`_startLiveClock`, `_updateStatusEl`) similarly waits
for both.

### 6. Disconnect / cleanup

Wherever `_channel` is referenced for `unsubscribe`, `removeChannel`,
or close (likely in pop-out cleanup or panel teardown), apply the same
operation to `_channelLegacy`. If no such site exists today (the
existing code may not unsubscribe — Supabase auto-cleans on page
unload), document this as N/A in the handoff.

### 7. Diagnostic logging

Add (gated on `DEBUG_EVENTS`):

```
[cmd-center] subscribed to hud:<firm_id>
[cmd-center] subscribed to cmd-center-<firm_id> (legacy)
[cmd-center] both channels ready · flushing N queued outbound
```

When a broadcast arrives, do **not** log which channel it came from
in normal operation. (This would double-log most events because of
self-broadcast on both channels.) If diagnostic-channel-source
logging is wanted for the cutover window, add it under a separate
constant `DEBUG_CHANNEL_SOURCE = false` so it can be flipped on
during cutover and back off after.

---

## Definition of done

### Code-level evidence

- `node --check cmd-center.js` passes.
- `grep -c "TARGET_CHANNEL_NAME\|LEGACY_CHANNEL_NAME" cmd-center.js`
  returns at least 4 (declarations + at least one use of each).
- `grep -c "_channelLegacy" cmd-center.js` returns at least 8 — every
  inbound handler registration plus outbound send plus SUBSCRIBED
  callback.
- The cache-bust procedure from the handoff is followed. Bump version
  string to `v20260418-CMD62`. Three cache-bust sites
  (`sidebar.js:284`, `compass.html:1082`, `aegis.html:1307`).

### Console evidence (on Compass, fresh load)

```
[cmd-center] subscribed to hud:aaaaaaaa-0001-0001-0001-000000000001
[cmd-center] subscribed to cmd-center-aaaaaaaa-0001-0001-0001-000000000001 (legacy)
[cmd-center] both channels ready · flushing 0 queued outbound
Connected · session: Vaughn Staples
```

Both subscription lines must appear before the "both channels ready"
line. Order of the two subscription lines is not specified —
whichever Supabase processes first.

### Behavioral evidence — backwards compatibility

This is the critical test for the dual-subscribe approach.

**Test 1: New tab + old tab, both authenticated as same user.**

1. Deploy CMD62. Open a fresh Compass tab — it loads CMD62 and
   subscribes to both channels.
2. Open a second Compass tab in a private/incognito window with the
   *previous* deployed version (CMD61) loaded from cache or a separate
   environment if available. It subscribes only to `cmd-center-{FIRM_ID}`.
3. From the CMD62 tab, trigger an action that emits `tab_switch` or
   submits a form.
4. On the CMD61 tab's console, the event should appear (delivered via
   the legacy channel).
5. On the CMD62 tab, take the same action — both channels receive the
   broadcast. The event-buffer dedup must prevent listener double-fire.
   Verify by counting `[cmd-center] recv` log lines — should be 1 per
   event, not 2.

**Test 2: Aegis sees both old and new tabs.**

Open Aegis (CMD62) with one Compass tab on CMD62 and one on CMD61
simultaneously. Both should appear in the M2 session-presence sidebar.
Both should appear in the M2 live feed when they take action.

**Test 3: `dual_session_test` end-to-end on CMD62.**

Run `dual_session_test` v1.1 unmodified. It must pass.

### M2 feed evidence

The M2 live feed (from M2-FEED-1) continues to work without
modification. No code change to `aegis.html` should be needed for this
brief. Verify by:

1. Open Aegis on CMD62.
2. M2 Overview · "CoC event stream · live" column populates from
   buffer on mount and renders new events live.
3. Submit an Expense Report from a Compass tab. Verify
   `form.submitted`, `instance.launched`, `workflow_request.created`
   appear in M2 feed within ~1 second.

### Handoff document update

Append section: `## Brief B1.5 — Channel Rename (CMD62)` with:

1. The dual-subscribe pattern and rationale.
2. The factor-out-handlers refactor (which named functions were
   created).
3. The "both channels ready" semantics for outbound queue flushing
   and the connection banner.
4. **Open question:** when to schedule the legacy-channel removal
   micro-brief (B1.6). Recommendation: after operator confirms all
   tabs across all firms have refreshed at least once on CMD62 or
   later — typically 1–2 weeks of normal operator activity.
5. Updated file version table.
6. Updated cache-bust inventory.
7. Any new iron rules discovered (likely 1: probably about the
   both-channels-ready gate).

---

## Out of scope

- **Do not remove the legacy channel.** Removal is a separate brief
  (B1.6) executed after operator-confirmed full refresh.
- **Do not update CommandHUD's expected channel name.** That work is
  on the parallel build track. This brief makes both names work; your
  son's team chooses when to subscribe to the new name.
- **Do not change presence-sync logic.** The dedup-by-userId in
  `_sessions` already handles double-presence-events from two channels
  correctly. If during testing it doesn't, surface the issue —
  don't silently fix it.
- **Do not log channel source on every event.** Use the
  `DEBUG_CHANNEL_SOURCE` constant gated approach so it can be flipped
  on for cutover diagnosis and off otherwise.
- **Do not modify any file other than `cmd-center.js`** plus the three
  cache-bust files (`sidebar.js`, `compass.html`, `aegis.html`).
- **Do not touch the B1 probe script or `dual_session_test`.** They
  must pass unmodified.
- **Do not introduce new dependencies, new build steps, or
  TypeScript.**

---

## Pre-flight checklist

Before writing code, answer these. If unclear, re-read the relevant
file or section.

1. What does Supabase realtime do under the hood when you subscribe
   to two channels on the same client — does it open two WebSockets
   or one?
2. If a broadcast goes out on both channels and the same listener is
   registered on both, will it fire twice? Why or why not, given the
   existing event-buffer dedup logic?
3. What's the failure mode if the "both channels ready" gate is
   missed and outbound emits flush after only one channel
   subscribes?
4. Why must the connection banner wait for both channels rather than
   appearing on first-channel-ready?
5. What happens to a stale tab still loaded from a pre-CMD62 version
   when CMD62 deploys? (Answer: it stays on the legacy channel, sees
   no disruption, and remains addressable from CMD62 tabs.)
6. After this brief lands, what condition must hold before B1.6
   (legacy removal) can be authored?
7. Does this brief touch anything in `mw-tabs.js`, `mw-events.js`, or
   `mw-core.js`? (Answer: no.)

---

## Post-completion next steps

After this brief lands and is verified:

- **CommandHUD subscription unblocked.** Notify the parallel build
  track that `hud:{firm_id}` now accepts subscriptions, with the
  envelope format already protocol-compliant per B1.
- **B1.6 — Legacy channel removal.** Author when operator confirms
  full tab-refresh across active firms. The brief itself is small
  (delete the legacy declarations and registrations); the gating is
  procedural.
- **B2 — Wait commands** (the bigger next brief) is unaffected by
  this work — it touches script-engine paths, not channel paths.
  Unblocked.

---

*End of Brief B1.5. Revisions go in a new numbered brief.*
