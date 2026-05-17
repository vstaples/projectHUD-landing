# HANDOFF — CMD-ACCORD-LIVE-CAPTURE-1 · Phase 3: Shell Skeleton + Topbar + Sidebar

**Date:** 2026-05-17
**CMD:** L-01 · CMD-ACCORD-LIVE-CAPTURE-1
**Operator:** Vaughn Staples
**Phase:** 3 of 7 — New shell registered. Topbar and sidebar wired to live data.

---

## §0 — PRE-FLIGHT

Read `Brief_CMD-ACCORD-LIVE-CAPTURE-1.md` end-to-end before proceeding.
Read Phase 1 findings in full — they carry forward in their entirety.
Phase 2 sealed: `accord_nodes.discipline`, `accord_nodes.topic`,
`accord_meetings.cloned_from_meeting_id`, and `accord_minutes_recipients` are in production.
Iron Rules 36, 40 §1, 47, 64, 71, 72 apply.
Terse output discipline. Deliver in §6 file order, then §7 checklist verbatim. Stop.

---

## §1 — PHASE 1 FINDINGS CARRY-FORWARD (required reading)

**Swap point:** Single branch addition in `accord-views.js:renderMeetingView()` at line ~394.
`accord-transitions.js` and `accord-core.js:startMeeting()` need no modification.

**`#ac-meeting-surface-host`:** Persistent singleton relocated between `document.body`
and `#ac-meeting-tab-body` by `_mountSurfaceHostInTabBody()`. The new shell renders
into this host — it does not replace the host element itself.

**`accord:surface-changed`:** accord-ledger.js will not activate without it.
New shell must call `Accord.switchSurface('capture')` on mount.

**Presence:** Two-layer (rsvp_status list + X-26 Realtime heartbeat on
`accord:meeting:{meetingId}`). Owned entirely by `accord-core.js`. Delegate — do not
re-implement.

**Team chat:** `accord_chat_messages` table. INSERT fields: `firm_id`, `meeting_id`,
`author_resource_id`, `body`. Realtime INSERT subscription at `accord-capture.js:770–791`.
SELECT at `accord-capture.js:721–723`.

**IR72 events:** The new shell must continue to emit all events listed in Phase 1 Item 7.
Most critical this phase: `accord:surface-changed` on mount.

**CSS:** Stylesheet files were not reviewed in Phase 1. Request them this phase
for token audit before styling the new shell.

---

## §2 — INPUTS

Request the following files from the operator:

| File | Purpose |
|------|---------|
| `accord-views.js` | Swap point at renderMeetingView(); confirmed Phase 1 |
| `accord-core.js` | startMeeting(), presence heartbeat, switchSurface() |
| `accord-capture.js` | Chat INSERT + Realtime subscription (lines 720–923) |
| Main Accord CSS file(s) | Token audit — font-family, palette, z-index conflicts |
| Current running-meeting shell file | Whatever currently renders the 5-tab shell; operator knows filename |

---

## §3 — DELIVERABLES

1. New Live Capture shell file (HTML structure + scoped CSS + JS)
2. Modified `accord-views.js` — branch addition only
3. Modified `accord-core.js` if `switchSurface()` needs guard (Phase 1 Item 2 trap)
4. CSS additions/overrides for Outfit font and Live Capture palette

Operator review checkpoint required before Phase 4.

---

## §4 — BUILD SPEC

### 4.1 — Shell registration in `accord-views.js`

In `renderMeetingView()` at the state branch (~line 394), add:

```javascript
if (meeting.state === 'running') {
    AccordLiveCapture.render(meeting, context);
    return;
}
```

This must execute before the existing 5-tab shell branch.
`AccordLiveCapture` is the new module defined in §4.2.

### 4.2 — New shell module: `accord-live-capture.js`

Module pattern consistent with existing Accord surface modules.
`var` only — no `let`/`const`.

**Public API:**
- `AccordLiveCapture.render(meeting, context)` — mounts shell into `#ac-meeting-surface-host`
- `AccordLiveCapture.destroy()` — teardown; called on `accord:level-changed` away from meeting

**On render:**
1. Build shell DOM into `#ac-meeting-surface-host`
2. Call `Accord.switchSurface('capture')` — satisfies IR72 / accord-ledger.js dependency
3. Start elapsed timer from `meeting.started_at`
4. Load attendees from `accord_meeting_attendees` (delegating presence state from `accord-core.js`)
5. Load and render chat history from `accord_chat_messages`
6. Subscribe to chat Realtime INSERT
7. Bind sidebar resize handle

### 4.3 — Topbar

Persistent across all canvas sections. Fixed to top of shell.

| Element | Source | Notes |
|---------|--------|-------|
| Logo `accord.` | Static | Logo dot color: `--dec` (#4a8cf5) |
| Live pill | Static | Pulsing green dot + "Live" text; `rgba(52,212,153,.10)` bg |
| Meeting title | `meeting.title` | Truncated with ellipsis |
| Progress bar | `accord_agenda_items` statuses | 3 segments: discussed=done, pending=active (first pending item), remainder=todo. Wire to live data — query on render, re-render on `accord:remote-agenda` event. `discussed`/`skipped` status transitions not yet implemented (Phase 4 scope) — render all items as todo for now |
| Elapsed timer | `meeting.started_at` | `setInterval` 1s; format MM:SS; store interval ref for cleanup |
| End Meeting button | — | Rendered but **disabled** (pointer-events:none, opacity:.35). Enabled in Phase 6 |

### 4.4 — Sidebar

Resizable. Min-width 160px, max-width 320px. Resize handle on right edge — Iron Rule.
Drag state: `col-resize` cursor on `document.body` during drag, cleared on `mouseup`.
Width persisted to `localStorage` key `accord.lc.sidebar.width`.

**Sections nav:**
Static jump links — Agenda, Decisions, Action Items, Risks & Issues, Parking Lot.
Scroll-to-anchor only (canvas sections not yet rendered; Phase 4/5 scope).
Active state: highlight link whose section is nearest top of canvas viewport.
Use `IntersectionObserver` on section headers.

**Live Attendees:**

```javascript
// Load from accord_meeting_attendees
// JOIN resources ON resource_id = resources.id
// WHERE meeting_id = meeting.meeting_id
// Fields: resource_id, rsvp_status, resources.name
```

Presence dot: delegate to `accord-core.js` presence map (`_meetingPresenceMap`).
Expose via `Accord.getPresence(resourceId)` if that helper exists; otherwise
read `Accord.state.meetingPresence` directly (confirm field name in accord-core.js).
"You" tag: match `resource_id` via `Accord.state.resource.id` (confirm field name).
Absent attendees (not in presence map): render at opacity .45.
Re-render presence dots on `accord:presence-updated` event if it exists,
otherwise poll `_meetingPresenceMap` on a 15s interval.

**Team Chat:**

Load history:
```javascript
// SELECT message_id, author_resource_id, body, created_at
// FROM accord_chat_messages
// WHERE meeting_id = [meeting_id]
// ORDER BY created_at ASC
// LIMIT 100
```

Resolve `author_resource_id` to display name via attendee list already loaded.
"You" bubble: right-aligned, `--dec-bg` background.
Others: left-aligned, `--raised` background, avatar + sender name above bubble.
Chat viewport background: `rgba(72,170,136,.025)` with `rgba(72,170,136,.10)` border.

Send: INSERT to `accord_chat_messages` on Enter key or Send button click.
```javascript
// INSERT: firm_id, meeting_id, author_resource_id, body
// author_resource_id = Accord.state.resource.id
```

Realtime subscription: re-use pattern from `accord-capture.js:770–791`.
Subscribe to `accord_chat_messages` INSERT filtered by `meeting_id`.
Append incoming messages to chat viewport and scroll to bottom.

### 4.5 — Font and palette

Outfit font loaded via Google Fonts link in shell HTML or main document head
(check if already loaded by Meeting Setup shell before adding duplicate).

CSS custom properties scoped to `.ac-live-capture-shell` to avoid polluting
production palette:

```css
.ac-live-capture-shell {
  --void: #0b0d14;
  --surface: #10131e;
  --raised: #171c2e;
  --hover: #1d2338;
  --b0: #1e2438; --b1: #252d44; --b2: #313d5e;
  --hi: #dce6f5; --md: #8899b2; --lo: #7a8a9a;
  --dec: #4a8cf5; --dec-bg: rgba(74,140,245,.09); --dec-bd: rgba(74,140,245,.24);
  --act: #e89430; --act-bg: rgba(232,148,48,.08); --act-bd: rgba(232,148,48,.24);
  --rsk: #e05252; --rsk-bg: rgba(224,82,82,.09); --rsk-bd: rgba(224,82,82,.24);
  --nt: #48aa88; --nt-bg: rgba(72,170,136,.08); --nt-bd: rgba(72,170,136,.22);
  --live: #34d499;
  font-family: 'Outfit', system-ui, sans-serif;
}
```

If Outfit is not already loaded by Meeting Setup: add
`<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap">`
to the shell's render output (inject into `<head>` if not present, avoid duplicates).

### 4.6 — Slim scrollbars (global to shell)

```css
.ac-live-capture-shell ::-webkit-scrollbar { width: 4px; height: 4px; }
.ac-live-capture-shell ::-webkit-scrollbar-track { background: transparent; }
.ac-live-capture-shell ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 2px; }
.ac-live-capture-shell ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.26); }
```

### 4.7 — Teardown

On `accord:level-changed` event (navigating away from meeting):
- Clear elapsed timer interval
- Unsubscribe Realtime chat channel
- Remove shell DOM from `#ac-meeting-surface-host`
- Call `AccordLiveCapture.destroy()`

---

## §5 — TRAPS FROM PHASE 1

**`#ac-meeting-surface-host` relocation contract:**
The new shell renders *into* this host element — it does not replace it.
`_mountSurfaceHostInTabBody()` in accord-views.js physically moves this DOM node.
The new shell bypasses the tab body entirely (full-panel render), so confirm
`#ac-meeting-surface-host` is visible in the new layout without relocation.
If `_mountSurfaceHostInTabBody` is called unconditionally before the branch,
add a guard: skip relocation when `meeting.state === 'running'`.

**`accord:surface-changed` + accord-ledger.js:**
`Accord.switchSurface('capture')` must be called on mount.
If `switchSurface` expects a `.surface[data-surface="capture"]` DOM element
to exist inside `#accord-app`, the shell must include that element even if it
is not visually used. Inspect `accord-core.js:189–193` to confirm whether
switchSurface fails silently or throws if the element is missing.

**Presence field names:**
Phase 1 identified `_meetingPresenceMap` and `Accord.state.resource.id` as the
relevant fields but did not confirm the exact path. Verify before wiring
the presence dot logic.

---

## §6 — FILE ORDER

1. `accord-live-capture.js` — new shell module (full file)
2. `accord-views.js` — diff showing branch addition only
3. `accord-core.js` — diff if switchSurface guard needed; otherwise "no changes"
4. CSS additions — either inline in shell or as separate patch to main stylesheet

Then: operator review note (what to visually confirm before Phase 4 proceeds).
Then: §7 checklist verbatim. Stop.

---

## §7 — PHASE 3 CHECKLIST

- [ ] `AccordLiveCapture.render()` mounts into `#ac-meeting-surface-host`
- [ ] `Accord.switchSurface('capture')` called on mount
- [ ] Topbar renders: logo, live pill, meeting title, progress bar, elapsed timer, End Meeting (disabled)
- [ ] Elapsed timer increments from `meeting.started_at`
- [ ] Progress bar renders (all todo segments acceptable until Phase 4 wires transitions)
- [ ] Sidebar renders with correct width and resize handle functional
- [ ] Sections nav renders (scroll-to not yet active — acceptable)
- [ ] Live attendees loaded from `accord_meeting_attendees` with presence dots
- [ ] "You" tag displayed correctly
- [ ] Absent attendees at opacity .45
- [ ] Chat history loaded and rendered as bubbles
- [ ] Chat send (Enter + button) inserts to `accord_chat_messages`
- [ ] Incoming chat messages appear via Realtime subscription
- [ ] Outfit font rendering confirmed
- [ ] Slim scrollbars applied throughout shell
- [ ] `AccordLiveCapture.destroy()` clears timer, unsubscribes Realtime, removes DOM
- [ ] No regressions in Meeting Setup shell (state='idle' still renders Setup)
- [ ] `#ac-meeting-surface-host` relocation trap dispositioned (guard added or confirmed unnecessary)

---

**Ship it.**
