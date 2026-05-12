# Commission · A-12 · CMD-ACCORD-CAPTURE-ATTENDEES-1

**Phase:** Live Capture — Attendees panel data source fix
**Authored:** 2026-05-12
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Operator direction 2026-05-12; C-04 substrate
**Predecessor:** X-16 sealed
**Successor:** A-13 (TBD)
**Coding agent:** execute sequentially; halt-and-surface after §7

---

## §1 — Scope

The live capture attendees panel currently shows all logged-in Aegis sessions
(everyone on ProjectHUD) rather than the invited participants for the specific
meeting. This CMD fixes the data source.

**Two-layer model:**

**Layer 1 — Invited attendees:** Read from `accord_meeting_attendees` for the
URL meeting. Only invited attendees appear in the panel. Non-invitees who are
logged into ProjectHUD do not appear.

**Layer 2 — Live presence overlay:** Attendees whose `resource_id` matches an
active Aegis presence session get a green pulsing conn-dot. Invited attendees
who are not currently present get a gray static dot.

**What does NOT ship:**
- Adding/removing attendees from live capture (Setup shell scope — C-04)
- RSVP status display in live capture (Setup shell scope)
- Presence derived from Supabase realtime (CMD-ACCORD-MEETING-PRESENCE-1 scope)
  — v1 presence is Aegis session-based only
- Attendee detail expand (C-08 intelligence scope)

---

## §2 — IR64 verification (before writing any code)

**V1 — Current attendees panel selector and data source:**
```javascript
var attendeesPanel = document.querySelector('#attendeesList, .attendees-list, .ac-attendees-list');
console.log('attendees panel:', attendeesPanel?.id, attendeesPanel?.className);
console.log('attendees HTML:', attendeesPanel?.innerHTML?.slice(0, 300));
```
Confirm the selector and what's currently rendering.

**V2 — `accord_meeting_attendees` for current meeting:**
```javascript
var mtgId = window.Accord.state.meeting?.meeting_id;
API.get(
  'accord_meeting_attendees?meeting_id=eq.' + mtgId +
  '&select=attendee_id,resource_id,role_in_meeting,rsvp_status'
).then(function(rows) {
  console.log('invited attendees:', JSON.stringify(rows));
});
```
Confirm table exists and has rows for the current meeting. If zero rows —
attendees were never added via Setup shell. Seed one via SQL before proceeding:
```sql
INSERT INTO accord_meeting_attendees (
  attendee_id, firm_id, meeting_id, resource_id, role_in_meeting, rsvp_status
) VALUES (
  gen_random_uuid(),
  'aaaaaaaa-0001-0001-0001-000000000001',
  '<current meeting_id>',
  'e1000001-0000-0000-0000-000000000001',
  'organizer',
  'accepted'
);
```

**V3 — Active Aegis presence sessions:**
```javascript
// Aegis presence is in cmd-center — check what's exposed
console.log('presence sessions:', window.Accord?.state?.presenceSessions ||
            window._aegisPresence || 'not found');
// Alternative: check cmd-center's presence state
var presenceData = document.querySelector('[data-presence]');
console.log('presence element:', presenceData);
```
Need to confirm how active sessions are identified — resource_id or user_id.
The conn-dot overlay depends on this.

Report V1–V3 in close-out.

---

## §3 — No substrate changes

`accord_meeting_attendees` confirmed in schema inventory (C-04).
`resources` table confirmed. No migrations needed.

---

## §4 — Module-level attendee state

In `accord-capture.js`:

```javascript
var _attendeeList      = [];   // resolved attendee objects for current meeting
var _presenceSessions  = {};   // { resource_id: true } — active Aegis sessions
```

---

## §5 — Fetch and render attendees

### §5.1 — Entry point

Called from `_loadAll` after meeting loads, replacing the current Aegis-session
render:

```javascript
function _loadAttendees(meetingId) {
  // Step 1: fetch invited attendees
  API.get(
    'accord_meeting_attendees?meeting_id=eq.' + meetingId +
    '&select=attendee_id,resource_id,role_in_meeting,rsvp_status'
  ).then(function(rows) {
    rows = rows || [];
    if (!rows.length) {
      _renderAttendees([]);
      return;
    }

    // Step 2: resolve resource names
    var resourceIds = rows.map(function(r) { return r.resource_id; });
    API.get(
      'resources?id=in.(' + resourceIds.join(',') + ')' +
      '&select=id,name'
    ).then(function(resources) {
      var nameMap = {};
      (resources || []).forEach(function(r) { nameMap[r.id] = r.name; });

      _attendeeList = rows.map(function(a) {
        return {
          attendee_id: a.attendee_id,
          resource_id: a.resource_id,
          name:        nameMap[a.resource_id] || 'Unknown',
          role:        a.role_in_meeting,
          rsvp:        a.rsvp_status
        };
      });

      _renderAttendees(_attendeeList);
    });
  }).catch(function(e) {
    console.error('[AccordCapture] attendees load failed', e);
  });
}
```

### §5.2 — Presence detection

Aegis presence sessions are tracked in cmd-center. Check what's available via
`window.Accord.state` or cmd-center's exposed presence map. The goal is a
`{ resource_id: boolean }` map of who is currently active.

```javascript
function _buildPresenceMap() {
  _presenceSessions = {};
  // Primary: check window.Accord.state for presence data
  var sessions = window.Accord.state.presenceSessions ||
                 window.Accord.state.execSessions ||
                 null;

  if (sessions && Array.isArray(sessions)) {
    sessions.forEach(function(s) {
      if (s.resource_id) _presenceSessions[s.resource_id] = true;
      if (s.resourceId)  _presenceSessions[s.resourceId]  = true;
    });
  }

  // Fallback: check cmd-center's known presence via DOM
  // cmd-center stamps active sessions — look for resource_id in presence data
  // V3 will confirm the correct access pattern
  return _presenceSessions;
}
```

**Note:** If V3 reveals a different presence access pattern, amend
`_buildPresenceMap` accordingly before writing `_renderAttendees`.

### §5.3 — Render

```javascript
function _renderAttendees(attendees) {
  var list = document.getElementById('attendeesList');
  if (!list) return;

  _buildPresenceMap();

  var myResourceId = window.Accord.state.me &&
                     window.Accord.state.me.resource_id ||
                     null;

  if (!attendees.length) {
    list.innerHTML = '<div class="ac-attendees-empty">No attendees added yet.</div>';
    return;
  }

  // Sort: organizer first, then by name
  var sorted = attendees.slice().sort(function(a, b) {
    if (a.role === 'organizer' && b.role !== 'organizer') return -1;
    if (b.role === 'organizer' && a.role !== 'organizer') return 1;
    return a.name.localeCompare(b.name);
  });

  var html = sorted.map(function(a) {
    var isPresent = !!_presenceSessions[a.resource_id];
    var isMe      = a.resource_id === myResourceId;
    var dotCls    = isPresent ? 'ac-presence-dot ac-presence-dot--live'
                              : 'ac-presence-dot ac-presence-dot--away';

    return '<div class="ac-attendee-row" data-resource-id="' + esc(a.resource_id) + '">' +
             '<span class="' + dotCls + '"></span>' +
             '<span class="ac-attendee-name">' + esc(a.name) + '</span>' +
             (a.role === 'organizer'
               ? '<span class="ac-attendee-role">organizer</span>'
               : '') +
             (isMe ? '<span class="ac-attendee-you">you</span>' : '') +
           '</div>';
  }).join('');

  list.innerHTML = html;
}
```

---

## §6 — Presence refresh

Presence changes periodically as users join/leave. Refresh the attendee panel
every 30 seconds while meeting is running:

```javascript
var _attendeeRefreshTimer = null;

function _startAttendeeRefresh(meetingId) {
  _stopAttendeeRefresh();
  if (window.Accord.state.meeting?.state !== 'running') return;
  _attendeeRefreshTimer = setInterval(function() {
    _renderAttendees(_attendeeList);  // re-render with fresh presence map
  }, 30000);
}

function _stopAttendeeRefresh() {
  if (_attendeeRefreshTimer) {
    clearInterval(_attendeeRefreshTimer);
    _attendeeRefreshTimer = null;
  }
}
```

Call `_startAttendeeRefresh(meetingId)` after first `_renderAttendees` call.
Call `_stopAttendeeRefresh()` from `teardown()`.

---

## §7 — Teardown additions

```javascript
// In teardown():
_stopAttendeeRefresh();
_attendeeList     = [];
_presenceSessions = {};
```

---

## §8 — CSS additions

```css
/* ── Attendee rows ──────────────────────────────────── */
.ac-attendee-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
  color: var(--ink-body, var(--ac-text-primary));
}

/* ── Presence dots ──────────────────────────────────── */
.ac-presence-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ac-presence-dot--live {
  background: #22c55e;
  box-shadow: 0 0 0 2px rgba(34,197,94,0.25),
              0 0 6px rgba(34,197,94,0.4);
  animation: ac-presence-pulse 2s ease-in-out infinite;
}
.ac-presence-dot--away {
  background: transparent;
  border: 1.5px solid var(--ink-ghost, var(--ac-border-mid));
}
@keyframes ac-presence-pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(34,197,94,0.25), 0 0 6px rgba(34,197,94,0.4); }
  50%       { box-shadow: 0 0 0 4px rgba(34,197,94,0.1), 0 0 12px rgba(34,197,94,0.25); }
}

.ac-attendee-name { flex: 1; }
.ac-attendee-role {
  font-family: var(--ac-font-mono, monospace);
  font-size: 8px;
  color: var(--ink-ghost, var(--ac-text-faint));
  letter-spacing: 0.8px;
  text-transform: uppercase;
}
.ac-attendee-you {
  font-family: var(--ac-font-mono, monospace);
  font-size: 8px;
  color: var(--ink-ghost, var(--ac-text-faint));
  letter-spacing: 0.5px;
}
.ac-attendees-empty {
  font-size: 11px;
  color: var(--ink-ghost, var(--ac-text-faint));
  font-style: italic;
  padding: 4px 0;
}
```

---

## §9 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Attendees panel on running meeting | Shows only invited attendees from `accord_meeting_attendees`. No other ProjectHUD users visible. |
| 2 | Organizer appears first | Organizer row at top, sorted by name below. |
| 3 | "you" label | Current user's row shows "you" label on the right. |
| 4 | Green presence dot | Attendees whose session is active in Aegis show green pulsing dot. |
| 5 | Gray dot for absent invitees | Invited attendees not currently active show gray outline dot. |
| 6 | Meeting with no attendees | Shows "No attendees added yet." empty state. |
| 7 | Teardown | Navigate away. Timer cleared. Lists reset. No residual DOM. |

---

## §10 — Files manifest

| File | Change |
|---|---|
| `accord-capture.js` | `_loadAttendees`, `_buildPresenceMap`, `_renderAttendees`, `_startAttendeeRefresh`, `_stopAttendeeRefresh`; module-level vars; replace Aegis session render with `_loadAttendees` call in `_loadAll`; teardown additions |
| `accord-views.css` | Attendee row + presence dot styles |
| `version.js` | Operator-managed (IR65) |

---

## §11 — Discipline checklist

- `var` only
- `_attendeeRefreshTimer` handle stored; cleared in `_stopAttendeeRefresh` and `teardown()`
- `_buildPresenceMap` called fresh on every `_renderAttendees` — presence state is not cached
- Only invited attendees render — non-invitees never appear regardless of Aegis session
- `myResourceId` derived from `window.Accord.state.me` — confirm `resource_id` field name in V3
- CSS uses both `--ink-*` (accord-views token set) and `--ac-*` fallbacks for compatibility
- No new substrate changes
- `--ac-*` / `--ink-*` token prefix throughout

---

**Halt-and-surface after §9. Close-out must confirm V2 (invited attendees in substrate), V3 (presence access pattern confirmed), and smoke test 1 (non-invitees absent from panel).**

**After seal: A-08 full multi-user acceptance test with correct attendee panel.**

---

*End Commission · A-12 · CMD-ACCORD-CAPTURE-ATTENDEES-1.*
