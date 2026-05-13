# Commission · CMD-ACCORD-MY-MEETINGS-1

**Phase:** New Architecture Track — My Meetings attendee dashboard
**Authored:** 2026-05-13
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Operator direction 2026-05-12; accord-build-state-2026-05-12.md
**Predecessor:** CMD-ACCORD-INVITATION-PIPELINE-1 sealed · A-09 sealed
**Successor:** CMD-ACCORD-SCHEDULE-1
**IR66 in effect:** Token values sourced from deployed CSS only — never architect memory
**IR67 in effect:** All modified files must have version + date in header
**Coding agent:** execute sequentially; halt-and-surface after §8

---

## §1 — Scope

My Meetings is a personal meeting dashboard accessible from the Accord left rail.
It surfaces three zones for the current user:

1. **LIVE NOW** — meetings currently running that the user is invited to or organizing.
   Prominent JOIN button navigating to `accord.html?meeting=<id>`.
2. **PENDING YOUR RESPONSE** — meeting invitations awaiting RSVP.
   Inline Accept / Decline without navigating away.
3. **UPCOMING** — accepted meetings scheduled in the next 14 days.
   Read-only list. Click → Setup shell (idle) or Live Capture (running).

**Entry point:** "MY MEETINGS" item in the Accord left workstream rail.
Clicking it replaces the constellation/workstream view with the My Meetings
dashboard. A "← Back" affordance returns to the prior view.

**Who sees what:**
- Vaughn (organizer): sees meetings he organized + meetings he's been invited to
- Angela (attendee): sees only meetings she's been invited to
- New user (no meetings): sees all three zones empty with onboarding prompt

**What does NOT ship:**
- Calendar grid view (CMD-ACCORD-SCHEDULE-1 scope)
- Creating a new meeting from My Meetings (use + NEW MEETING in rail)
- Editing meeting details from My Meetings
- Historical meetings (past/sealed/closed) — forward-looking only

---

## §2 — IR64 verification (before writing any code)

**V1 — Left rail My Meetings entry:**
```javascript
// Does a "MY MEETINGS" entry already exist in the rail?
var myMtgs = document.querySelector(
  '[data-nav="my-meetings"], #my-meetings-nav, .my-meetings-nav'
);
console.log('my-meetings nav:', myMtgs?.className || 'NOT FOUND');

// Check rail structure
var rail = document.querySelector('.ac-workstream-rail, #workstream-rail, .rail-nav');
console.log('rail:', rail?.className || 'NOT FOUND');
console.log('rail HTML:', rail?.innerHTML?.slice(0, 300));
```

**V2 — Current user's resource_id:**
```javascript
console.log('me:', JSON.stringify(window.Accord?.state?.me));
console.log('resource_id:', window.Accord?.state?.me?.resource_id);
```
`my_resource_id()` confirmed working from VISIBILITY-1. Need `resource_id`
on `state.me` — confirmed added by A-12 `_resolveMe` amendment.

**V3 — Data queries — confirm counts:**
```javascript
var rid = window.Accord?.state?.me?.resource_id;
var uid = window.Accord?.state?.me?.id;

// Live meetings (organizer or invited, state=running)
API.get(
  'accord_meetings?state=eq.running' +
  '&or=(organizer_id.eq.' + uid + ',meeting_id.in.(select:meeting_id:from:accord_meeting_attendees:where:resource_id.eq.' + rid + '))' +
  '&select=meeting_id,title,state&limit=5'
).then(function(r) { console.log('live:', r?.length, JSON.stringify(r)); });

// Simpler approach — use two queries
API.get(
  'accord_meetings?state=eq.running&organizer_id=eq.' + uid +
  '&select=meeting_id,title,state&limit=5'
).then(function(r) { console.log('live-organizer:', r?.length); });

API.get(
  'accord_meeting_attendees?resource_id=eq.' + rid +
  '&rsvp_status=eq.pending&select=attendee_id,meeting_id&limit=5'
).then(function(r) { console.log('pending invites:', r?.length); });
```

Report V1–V3 in close-out.

---

## §3 — No new substrate

All data from existing tables:
- `accord_meetings` — title, state, scheduled_for, organizer_id
- `accord_meeting_attendees` — rsvp_status, resource_id
- `my_resource_id()` — current user resource identity

No migrations.

---

## §4 — Module-level state

In `accord-capture.js` or a new `accord-my-meetings.js` (agent's choice —
confirm with V1 which file owns the rail):

```javascript
var _myMeetingsActive  = false;   // is My Meetings view currently showing
var _myMeetingsTimer   = null;    // refresh interval
```

---

## §5 — Entry point wiring

### §5.1 — Add MY MEETINGS to left rail

Find where the left rail nav items are rendered in `accord-rails.js` or
`accord-views.js`. Add a MY MEETINGS item above the workstream list:

```javascript
// Add to rail nav HTML (exact placement confirmed by V1):
'<div class="ac-rail-nav-item" data-action="open-my-meetings" ' +
'id="ac-my-meetings-nav">' +
'<span class="ac-rail-nav-glyph">◈</span>' +
'<span class="ac-rail-nav-label">MY MEETINGS</span>' +
'</div>'
```

Wire click handler:
```javascript
// In rail delegation:
if (action === 'open-my-meetings') {
  _openMyMeetings();
  return;
}
```

### §5.2 — View mount/unmount

```javascript
function _openMyMeetings() {
  _myMeetingsActive = true;

  // Hide constellation/workstream content
  var constellation = document.querySelector(
    '.ac-constellation, #constellation-view, .ac-workstream-view'
  );
  if (constellation) constellation.style.display = 'none';

  // Mount My Meetings panel
  var host = document.querySelector('.ac-meeting-surface-host, #accord-app');
  if (!host) return;

  var existing = document.getElementById('ac-my-meetings-view');
  if (!existing) {
    var panel = document.createElement('div');
    panel.id = 'ac-my-meetings-view';
    panel.className = 'ac-my-meetings-view';
    host.appendChild(panel);
  }

  _renderMyMeetings();
  _startMyMeetingsRefresh();
}

function _closeMyMeetings() {
  _myMeetingsActive = false;
  _stopMyMeetingsRefresh();

  var panel = document.getElementById('ac-my-meetings-view');
  if (panel) panel.remove();

  // Restore constellation/workstream
  var constellation = document.querySelector(
    '.ac-constellation, #constellation-view, .ac-workstream-view'
  );
  if (constellation) constellation.style.display = '';
}
```

---

## §6 — Data fetch and render

```javascript
function _renderMyMeetings() {
  var panel = document.getElementById('ac-my-meetings-view');
  if (!panel) return;

  panel.innerHTML = '<div class="ac-mm-loading">Loading your meetings…</div>';

  var me      = window.Accord.state.me;
  var uid     = me && me.id;
  var rid     = me && me.resource_id;

  if (!uid) {
    panel.innerHTML = '<div class="ac-mm-empty">Sign in to see your meetings.</div>';
    return;
  }

  // Fetch in parallel:
  // 1. Meetings I organize that are running or upcoming
  // 2. Meetings I'm invited to (via accord_meeting_attendees)
  Promise.all([
    // Organized meetings — running + idle upcoming
    API.get(
      'accord_meetings?organizer_id=eq.' + uid +
      '&state=in.(running,idle)' +
      '&order=scheduled_for.asc' +
      '&select=meeting_id,title,state,scheduled_for,duration_minutes,workstream_id' +
      '&limit=20'
    ).catch(function() { return []; }),

    // Invited meetings (all rsvp states)
    rid ? API.get(
      'accord_meeting_attendees?resource_id=eq.' + rid +
      '&select=attendee_id,meeting_id,rsvp_status,' +
      'accord_meetings!inner(meeting_id,title,state,scheduled_for,' +
      'duration_minutes,workstream_id,organizer_id)'
    ).catch(function() { return []; }) : Promise.resolve([])

  ]).then(function(results) {
    var organized = results[0] || [];
    var invites   = results[1] || [];

    // Build unified meeting map (deduplicate)
    var meetingMap = {};

    organized.forEach(function(m) {
      meetingMap[m.meeting_id] = {
        meeting_id:       m.meeting_id,
        title:            m.title,
        state:            m.state,
        scheduled_for:    m.scheduled_for,
        duration_minutes: m.duration_minutes,
        workstream_id:    m.workstream_id,
        role:             'organizer',
        rsvp_status:      'accepted'
      };
    });

    invites.forEach(function(inv) {
      var m = inv.accord_meetings;
      if (!m) return;
      if (!meetingMap[m.meeting_id]) {
        meetingMap[m.meeting_id] = {
          meeting_id:       m.meeting_id,
          title:            m.title,
          state:            m.state,
          scheduled_for:    m.scheduled_for,
          duration_minutes: m.duration_minutes,
          workstream_id:    m.workstream_id,
          role:             'attendee',
          rsvp_status:      inv.rsvp_status,
          attendee_id:      inv.attendee_id
        };
      }
    });

    var meetings = Object.values(meetingMap);

    // Partition into zones
    var now        = Date.now();
    var in14days   = now + 14 * 24 * 60 * 60 * 1000;

    var liveNow    = meetings.filter(function(m) { return m.state === 'running'; });
    var pending    = meetings.filter(function(m) {
      return m.state === 'idle' && m.rsvp_status === 'pending';
    });
    var upcoming   = meetings.filter(function(m) {
      return m.state === 'idle'
          && m.rsvp_status !== 'pending'
          && m.scheduled_for
          && new Date(m.scheduled_for).getTime() > now
          && new Date(m.scheduled_for).getTime() < in14days;
    }).sort(function(a, b) {
      return new Date(a.scheduled_for) - new Date(b.scheduled_for);
    });

    panel.innerHTML = _myMeetingsHtml(liveNow, pending, upcoming);
    _wireMyMeetingsEvents(panel);
  });
}
```

---

## §7 — HTML render

```javascript
function _myMeetingsHtml(liveNow, pending, upcoming) {
  var html = '<div class="ac-mm-header">';
  html += '<span class="ac-mm-title">MY MEETINGS</span>';
  html += '<button class="ac-mm-back" data-action="close-my-meetings">← Back</button>';
  html += '</div>';

  // ── LIVE NOW ──────────────────────────────────────────────
  html += '<div class="ac-mm-zone">';
  html += '<div class="ac-mm-zone-label">● LIVE NOW</div>';

  if (liveNow.length) {
    liveNow.forEach(function(m) {
      html += '<div class="ac-mm-card ac-mm-card--live">';
      html += '<div class="ac-mm-card-title">' + esc(m.title) + '</div>';
      html += '<div class="ac-mm-card-meta">' +
              (m.role === 'organizer' ? 'Organizer' : 'Invited') + '</div>';
      html += '<a class="ac-mm-join-btn" href="/accord.html?meeting=' +
              esc(m.meeting_id) + '">JOIN →</a>';
      html += '</div>';
    });
  } else {
    html += '<div class="ac-mm-empty-zone">No meetings in progress.</div>';
  }
  html += '</div>';

  // ── PENDING YOUR RESPONSE ─────────────────────────────────
  if (pending.length) {
    html += '<div class="ac-mm-zone">';
    html += '<div class="ac-mm-zone-label">PENDING YOUR RESPONSE ' +
            '<span class="ac-mm-badge">' + pending.length + '</span></div>';

    pending.forEach(function(m) {
      var dateStr = m.scheduled_for
        ? new Date(m.scheduled_for).toLocaleDateString(undefined,
            { weekday: 'short', month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit' })
        : 'Date TBD';

      html += '<div class="ac-mm-card ac-mm-card--pending">';
      html += '<div class="ac-mm-card-title">' + esc(m.title) + '</div>';
      html += '<div class="ac-mm-card-meta">' + esc(dateStr) + '</div>';
      html += '<div class="ac-mm-rsvp-row">';
      html += '<button class="ac-mm-rsvp-btn ac-mm-rsvp-accept" ' +
              'data-action="mm-rsvp-accept" ' +
              'data-attendee-id="' + esc(m.attendee_id || '') + '" ' +
              'data-meeting-id="' + esc(m.meeting_id) + '">✓ Accept</button>';
      html += '<button class="ac-mm-rsvp-btn ac-mm-rsvp-decline" ' +
              'data-action="mm-rsvp-decline" ' +
              'data-attendee_id="' + esc(m.attendee_id || '') + '" ' +
              'data-meeting-id="' + esc(m.meeting_id) + '">✕ Decline</button>';
      html += '</div></div>';
    });
    html += '</div>';
  }

  // ── UPCOMING ──────────────────────────────────────────────
  html += '<div class="ac-mm-zone">';
  html += '<div class="ac-mm-zone-label">UPCOMING — NEXT 14 DAYS</div>';

  if (upcoming.length) {
    upcoming.forEach(function(m) {
      var dateStr = m.scheduled_for
        ? new Date(m.scheduled_for).toLocaleDateString(undefined,
            { weekday: 'short', month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit' })
        : 'Date TBD';
      var durStr = m.duration_minutes ? ' · ' + m.duration_minutes + 'min' : '';

      html += '<div class="ac-mm-card ac-mm-card--upcoming" ' +
              'data-action="mm-open-meeting" ' +
              'data-meeting-id="' + esc(m.meeting_id) + '">';
      html += '<div class="ac-mm-card-title">' + esc(m.title) + '</div>';
      html += '<div class="ac-mm-card-meta">' + esc(dateStr + durStr) + '</div>';
      html += '<div class="ac-mm-card-role">' +
              (m.role === 'organizer' ? 'Organizer' : 'Invited') + '</div>';
      html += '</div>';
    });
  } else {
    html += '<div class="ac-mm-empty-zone">No upcoming meetings in the next 14 days.</div>';
  }
  html += '</div>';

  return html;
}
```

---

## §8 — Event wiring + RSVP

```javascript
function _wireMyMeetingsEvents(panel) {
  panel.addEventListener('click', function(ev) {
    var action = ev.target.dataset.action ||
                 ev.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'close-my-meetings') {
      _closeMyMeetings();
      return;
    }

    if (action === 'mm-open-meeting') {
      var card = ev.target.closest('[data-meeting-id]');
      if (card) location.href = '/accord.html?meeting=' + card.dataset.meetingId;
      return;
    }

    if (action === 'mm-rsvp-accept' || action === 'mm-rsvp-decline') {
      var btn        = ev.target.closest('[data-action]');
      var attendeeId = btn?.dataset.attendeeId;
      var outcome    = action === 'mm-rsvp-accept' ? 'accepted' : 'declined';

      if (!attendeeId) return;

      // Disable buttons immediately
      btn.disabled = true;
      var siblingBtns = btn.closest('.ac-mm-rsvp-row')
        ?.querySelectorAll('button');
      if (siblingBtns) siblingBtns.forEach(function(b) { b.disabled = true; });

      // RSVP via direct PATCH (authenticated session — no token needed)
      API.patch(
        'accord_meeting_attendees?attendee_id=eq.' + attendeeId,
        { rsvp_status: outcome }
      ).then(function() {
        // Refresh the view to show updated state
        _renderMyMeetings();
      }).catch(function(e) {
        console.error('[MyMeetings] RSVP failed:', e);
        btn.disabled = false;
        if (siblingBtns) siblingBtns.forEach(function(b) { b.disabled = false; });
      });
      return;
    }
  });
}
```

---

## §9 — Refresh timer

```javascript
function _startMyMeetingsRefresh() {
  _stopMyMeetingsRefresh();
  // Refresh every 30 seconds — picks up new live meetings, RSVP changes
  _myMeetingsTimer = setInterval(function() {
    if (_myMeetingsActive) _renderMyMeetings();
  }, 30000);
}

function _stopMyMeetingsRefresh() {
  if (_myMeetingsTimer) {
    clearInterval(_myMeetingsTimer);
    _myMeetingsTimer = null;
  }
}
```

Add `_closeMyMeetings()` and `_stopMyMeetingsRefresh()` to teardown.

---

## §10 — CSS

```css
/* ── My Meetings view ───────────────────────────────── */
.ac-my-meetings-view {
  position: absolute;
  inset: 0;
  background: var(--ac-bg-deep);
  z-index: 100;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.ac-mm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--ac-border-subtle);
  padding-bottom: 12px;
}
.ac-mm-title {
  font-family: var(--ac-font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.4px;
  color: var(--ac-text-secondary);
}
.ac-mm-back {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-faint);
  background: none;
  border: 1px solid var(--ac-border-subtle);
  border-radius: 3px;
  padding: 3px 10px;
  cursor: pointer;
}
.ac-mm-back:hover { color: var(--ac-text-secondary); }

/* ── Zones ──────────────────────────────────────────── */
.ac-mm-zone { display: flex; flex-direction: column; gap: 8px; }
.ac-mm-zone-label {
  font-family: var(--ac-font-mono);
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 1.2px;
  color: var(--ac-text-tertiary);
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 8px;
}
.ac-mm-badge {
  background: var(--ac-amber-dim);
  color: var(--ac-amber);
  border-radius: 10px;
  padding: 1px 7px;
  font-size: 9px;
}
.ac-mm-empty-zone {
  font-size: 11px;
  color: var(--ac-text-faint);
  font-style: italic;
  padding: 6px 0;
}
.ac-mm-loading {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-faint);
  letter-spacing: 0.8px;
  text-align: center;
  padding: 40px 0;
}

/* ── Cards ──────────────────────────────────────────── */
.ac-mm-card {
  background: var(--ac-bg-pane);
  border: 1px solid var(--ac-border-subtle);
  border-radius: 5px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ac-mm-card--live {
  border-color: rgba(34,197,94,0.35);
  background: rgba(34,197,94,0.05);
}
.ac-mm-card--pending {
  border-color: rgba(251,191,119,0.25);
}
.ac-mm-card--upcoming { cursor: pointer; }
.ac-mm-card--upcoming:hover {
  border-color: var(--ac-border-mid);
  background: var(--ac-bg-tile);
}
.ac-mm-card-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--ac-text-primary);
}
.ac-mm-card-meta {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-tertiary);
}
.ac-mm-card-role {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  color: var(--ac-text-faint);
  letter-spacing: 0.6px;
  text-transform: uppercase;
}

/* ── JOIN button ────────────────────────────────────── */
.ac-mm-join-btn {
  display: inline-block;
  margin-top: 6px;
  font-family: var(--ac-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.8px;
  padding: 7px 16px;
  background: #22c55e;
  color: var(--ac-bg-deep);
  border: none;
  border-radius: 4px;
  text-decoration: none;
  align-self: flex-start;
  cursor: pointer;
}
.ac-mm-join-btn:hover { opacity: 0.88; }

/* ── RSVP buttons ───────────────────────────────────── */
.ac-mm-rsvp-row { display: flex; gap: 8px; margin-top: 6px; }
.ac-mm-rsvp-btn {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.8px;
  padding: 5px 14px;
  border-radius: 3px;
  cursor: pointer;
  border: 1px solid;
}
.ac-mm-rsvp-accept {
  background: rgba(34,197,94,0.1);
  color: #22c55e;
  border-color: rgba(34,197,94,0.35);
}
.ac-mm-rsvp-accept:hover { background: rgba(34,197,94,0.2); }
.ac-mm-rsvp-decline {
  background: rgba(251,113,133,0.1);
  color: var(--ac-rose);
  border-color: rgba(251,113,133,0.25);
}
.ac-mm-rsvp-decline:hover { background: rgba(251,113,133,0.2); }
.ac-mm-rsvp-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Rail nav item ──────────────────────────────────── */
.ac-rail-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  cursor: pointer;
  font-size: 11px;
  color: var(--ac-text-tertiary);
  border-radius: 3px;
  transition: background 0.12s, color 0.12s;
}
.ac-rail-nav-item:hover {
  background: var(--ac-bg-tile);
  color: var(--ac-text-secondary);
}
.ac-rail-nav-glyph {
  font-size: 12px;
  flex-shrink: 0;
}
```

---

## §11 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | MY MEETINGS appears in left rail | Nav item visible above workstream list. Click opens My Meetings view. Constellation hidden. |
| 2 | ← Back button | Closes My Meetings. Constellation/workstream view restores. |
| 3 | LIVE NOW zone — running meeting | Meeting card shows with green border and JOIN → button. Click navigates to `accord.html?meeting=<id>`. |
| 4 | LIVE NOW zone — no running meetings | "No meetings in progress." empty state shown. |
| 5 | PENDING zone — Angela has pending invite | Invite card shows with Accept / Decline buttons. |
| 6 | Accept RSVP inline | Click Accept → `rsvp_status` updates to `accepted` in DB → card moves to UPCOMING on refresh. |
| 7 | Decline RSVP inline | Click Decline → `rsvp_status` updates to `declined` → card disappears from PENDING. |
| 8 | UPCOMING zone | Accepted upcoming meetings listed in date order. Click → Setup shell. |
| 9 | New user (no meetings) | All three zones show empty state. No errors. |
| 10 | 30-second refresh | With a meeting running in another tab, switch to Live and confirm LIVE NOW zone updates within 30s. |

---

## §12 — Files manifest

| File | Change |
|---|---|
| `accord-rails.js` or `accord-views.js` | MY MEETINGS nav item in left rail; `open-my-meetings` click handler |
| `accord-capture.js` or new `accord-my-meetings.js` | All My Meetings functions; module-level vars; teardown |
| `accord-views.css` | All `.ac-mm-*` styles |
| `accord.html` | No change expected — `:root` tokens already added by A-09 |
| `version.js` | Operator-managed (IR65) |

---

## §13 — Discipline checklist

- `var` only
- IR66: all CSS token values sourced from deployed `accord-meeting-setup.css` — not this brief
- IR67: version + date in header of every modified file
- IR66 console diagnosis before any file changes
- `data-action` on all interactive elements
- RSVP via authenticated `API.patch` — no token needed for internal users
- `_myMeetingsTimer` cleared in `_stopMyMeetingsRefresh` and teardown
- Double-open guard on `_openMyMeetings` (check `_myMeetingsActive`)
- `accordion_meeting_attendees` join uses `!inner` to exclude orphan rows
- `esc()` on all user-sourced strings in HTML

---

**Halt-and-surface after §11. Close-out must confirm V1–V3 pre-flight findings,
smoke test 3 (JOIN navigation), and smoke test 6 (RSVP Accept inline).**

**After seal: CMD-ACCORD-SCHEDULE-1 is unblocked.**

---

*End Commission · CMD-ACCORD-MY-MEETINGS-1.*
