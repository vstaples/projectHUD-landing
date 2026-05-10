# Commission · C-04 · CMD-ACCORD-SETUP-ATTENDEES-1

**Phase:** 4 of Wave 1 — Attendees substrate + right column roster
**Authored:** 2026-05-09
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Accord Meeting Setup Shell — Requirements Specification v1.1 §6
**Predecessor:** C-03 · CMD-ACCORD-SETUP-OUTCOMES-1 sealed
**Successor:** C-05 · CMD-ACCORD-SETUP-FILMSTRIP-2 (blocked on this CMD)
**Coding agent:** execute sequentially; halt-and-surface after §8

---

## §1 — Scope

Wire the right column's `.ac-col-tabbody[data-col="right"]` placeholder with an attendee roster. Simultaneously ships the `accord_meeting_attendees` substrate.

**Deliverables:**
1. `accord_meeting_attendees` substrate — full table + RLS + index
2. Right column roster: per-attendee card with conn-dot, avatar, name, role, status badge, stakes line
3. Attendee add/remove affordance (organizer only, idle meetings)
4. Gathering mode auto-detection hook (data attribute only — full logic in C-12)
5. All 8 smoke tests pass

**What does NOT ship:**
- Intelligence data (pattern tags, urgency math, owed lines) — C-08
- Gathering mode visual transition — C-12
- Attendee invitations — X-02
- Click-to-percolate on attendee cards — C-11
- Connected/late status (no real-time presence in this CMD)
- Expand/collapse detail — C-08

---

## §2 — IR64 verification (before writing any code)

**V1 — `resources` table confirmed from C-03:** `resources.id` (PK), `resources.name` (display). Carry-forward — no re-query needed. Document as carry-forward in close-out.

**V2 — `accord_meeting_attendees` absent:**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name = 'accord_meeting_attendees';
```
Expected: zero rows. Halt if present.

**V3 — Right column tabbody selector:**
```javascript
document.querySelector('.ac-col-tabbody[data-col="right"]')?.className;
```
Confirm resolves after C-01 and C-02 landed.

**V4 — Current organizer identification:**
Confirm `auth.uid()` resolves to `resources.id` or `users.id` in the current session. Check against `accord_meetings.organizer_id` — is it a `users.id` or a `resources.id`? Critical for the organizer-gate RLS policy and for identifying the "YOU" badge in the roster.

```sql
SELECT organizer_id FROM accord_meetings LIMIT 3;
-- Compare to:
SELECT id FROM auth.users LIMIT 3;
SELECT id FROM resources LIMIT 3;
```

Identify which table `organizer_id` references. The RLS USING clause depends on this.

**V5 — `accord_nodes` action ownership column:**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'accord_nodes'
  AND column_name IN ('created_by', 'assigned_to', 'owner_id', 'owner_resource_id');
```
Need: which column holds the action owner. Used in the stakes-line derivation (§5.4). Do not assume.

Report V2–V5 in close-out. V1 document as carry-forward.

---

## §3 — Substrate: `accord_meeting_attendees` table

```sql
-- Migration: 2026-05-09_accord_meeting_attendees.sql
-- C-04 · CMD-ACCORD-SETUP-ATTENDEES-1

CREATE TABLE accord_meeting_attendees (
  attendee_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id           UUID        NOT NULL REFERENCES firms(id),
  meeting_id        UUID        NOT NULL REFERENCES accord_meetings(meeting_id) ON DELETE CASCADE,
  resource_id       UUID        NOT NULL REFERENCES resources(id),
  role_in_meeting   TEXT        NOT NULL DEFAULT 'participant'
                                CHECK (role_in_meeting IN
                                  ('organizer','lead','participant','observer')),
  rsvp_status       TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (rsvp_status IN
                                  ('pending','accepted','declined','tentative')),
  invited_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, resource_id)   -- one row per attendee per meeting
);

COMMENT ON TABLE accord_meeting_attendees IS
  'Curated attendee list for a meeting. One row per attendee. '
  'Replaces the all-firm-resources dump used in MEETING-SETUP-1. '
  'C-04 CMD-ACCORD-SETUP-ATTENDEES-1.';

CREATE INDEX accord_meeting_attendees_meeting_id_idx
  ON accord_meeting_attendees (meeting_id);
```

### §3.1 — RLS policies

```sql
ALTER TABLE accord_meeting_attendees ENABLE ROW LEVEL SECURITY;

-- SELECT: firm-wide readable
CREATE POLICY accord_meeting_attendees_select ON accord_meeting_attendees
  FOR SELECT USING (firm_id = my_firm_id());

-- INSERT: organizer only (per V4 finding — auth.uid() vs organizer_id type)
CREATE POLICY accord_meeting_attendees_insert ON accord_meeting_attendees
  FOR INSERT WITH CHECK (
    firm_id = my_firm_id()
    AND EXISTS (
      SELECT 1 FROM accord_meetings m
      WHERE m.meeting_id = accord_meeting_attendees.meeting_id
        AND m.organizer_id = auth.uid()
    )
  );

-- UPDATE: organizer only (rsvp_status updates, role changes)
CREATE POLICY accord_meeting_attendees_update ON accord_meeting_attendees
  FOR UPDATE
  USING (
    firm_id = my_firm_id()
    AND EXISTS (
      SELECT 1 FROM accord_meetings m
      WHERE m.meeting_id = accord_meeting_attendees.meeting_id
        AND m.organizer_id = auth.uid()
    )
  )
  WITH CHECK (firm_id = my_firm_id());

-- DELETE: organizer only
CREATE POLICY accord_meeting_attendees_delete ON accord_meeting_attendees
  FOR DELETE USING (
    firm_id = my_firm_id()
    AND EXISTS (
      SELECT 1 FROM accord_meetings m
      WHERE m.meeting_id = accord_meeting_attendees.meeting_id
        AND m.organizer_id = auth.uid()
    )
  );
```

**Note on V4:** if `organizer_id` references `users.id` rather than `resources.id`, the `auth.uid()` comparison in the RLS USING clause is correct as written. If `organizer_id` references `resources.id`, an additional join to `users` may be required. Resolve from V4 finding before deploying.

### §3.2 — Auto-seed organizer row

When a new meeting is created, the organizer should appear in the attendee list automatically. This is not implemented as a trigger in this CMD — the organizer is added as the first attendee at roster render time if absent. See §5.2.

**Verification:**
```sql
SELECT table_name, constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'accord_meeting_attendees';
```

---

## §4 — `accord-views.js` amendment

No changes to the select query needed. The Attendees block fetches its own data. `meeting.firm_id` and `meeting.organizer_id` are already present on the meeting object (confirmed canonical select list from C-03 close-out).

---

## §5 — Attendees block render

### §5.1 — Entry point

Called from `AccordMeetingSetup.render()` targeting the right column tabbody:

```javascript
var _attendeesAborted = false;

function _renderAttendees(meeting, workstreamId) {
  _attendeesAborted = false;
  var host = document.querySelector('.ac-col-tabbody[data-col="right"]');
  if (!host) return;
  host.innerHTML = '<div class="ac-attendees-block" id="ac-attendees-block">' +
                   '<div class="ac-attendees-loading">Loading…</div>' +
                   '</div>';
  _loadAttendees(meeting);
}
```

### §5.2 — Load

```javascript
function _loadAttendees(meeting) {
  API.get(
    'accord_meeting_attendees?meeting_id=eq.' + meeting.meeting_id +
    '&select=attendee_id,resource_id,role_in_meeting,rsvp_status' +
    '&order=role_in_meeting.asc,invited_at.asc'
  ).then(function(rows) {
    if (_attendeesAborted) return;
    rows = rows || [];

    // Auto-seed organizer if absent
    var hasOrganizer = rows.some(function(r) {
      return r.role_in_meeting === 'organizer';
    });
    if (!hasOrganizer && meeting.state === 'idle') {
      return _seedOrganizer(meeting).then(function() {
        return _loadAttendees(meeting);  // re-fetch after seed
      });
    }

    return _resolveAttendeeNames(rows).then(function(enriched) {
      if (_attendeesAborted) return;
      var block = document.getElementById('ac-attendees-block');
      if (!block) return;
      _paintAttendees(block, enriched, meeting);
    });
  }).catch(function(e) {
    console.error('[AccordMeetingSetup] attendees fetch failed', e);
    var block = document.getElementById('ac-attendees-block');
    if (block) block.innerHTML = '<div class="ac-attendees-error">Could not load attendees.</div>';
  });
}
```

**Organizer seed:**
```javascript
function _seedOrganizer(meeting) {
  // Find the resource_id for the organizer (auth user)
  // organizer_id on accord_meetings references users.id per V4
  // Must resolve to resources.id for the attendee row
  return API.get(
    'resources?id=eq.' + meeting.organizer_id + '&select=id,name&limit=1'
  ).then(function(rows) {
    // If organizer_id IS a resources.id this works directly.
    // If organizer_id is a users.id, the query above may return empty.
    // V4 finding determines which path is correct — agent resolves.
    if (!rows || !rows.length) return;
    return API.post('accord_meeting_attendees', {
      firm_id:        meeting.firm_id,
      meeting_id:     meeting.meeting_id,
      resource_id:    rows[0].id,
      role_in_meeting: 'organizer',
      rsvp_status:    'accepted'
    }).catch(function(e) {
      // Ignore duplicate key — organizer may have been seeded by another path
      console.warn('[AccordMeetingSetup] organizer seed skipped:', e?.message);
    });
  });
}
```

**V4 note:** if `organizer_id` is a `users.id` rather than `resources.id`, the seed query must join through `users` to find `resources.id`. Agent resolves from V4 finding.

### §5.3 — Resolve names

```javascript
function _resolveAttendeeNames(attendees) {
  if (!attendees.length) return Promise.resolve([]);
  var ids = attendees.map(function(a) { return a.resource_id; }).join(',');
  return API.get(
    'resources?id=in.(' + ids + ')&select=id,name'
  ).then(function(rows) {
    var map = {};
    (rows || []).forEach(function(r) { map[r.id] = r.name; });
    attendees.forEach(function(a) { a._name = map[a.resource_id] || 'Unknown'; });
    return attendees;
  }).catch(function() { return attendees; });
}
```

### §5.4 — Stakes line derivation

A single lightweight derivation — action count owned by this attendee in this workstream. Fetched in parallel with name resolution, not sequentially:

```javascript
function _resolveStakesLines(attendees, workstreamId, currentMeetingId) {
  if (!workstreamId || !attendees.length) return Promise.resolve({});

  // Fetch prior meeting IDs in workstream
  return API.get(
    'accord_meetings?workstream_id=eq.' + workstreamId +
    '&state=in.(closed,sealed,running)' +
    '&select=meeting_id'
  ).then(function(meetings) {
    if (!meetings || !meetings.length) return {};
    var mids = meetings.map(function(m) { return m.meeting_id; }).join(',');
    var ownerCol = '<action_owner_col_per_V5>';  // substituted from V5 finding
    return API.get(
      'accord_nodes?meeting_id=in.(' + mids + ')' +
      '&tag=eq.action' +
      '&select=' + ownerCol
    ).then(function(nodes) {
      var counts = {};
      (nodes || []).forEach(function(n) {
        var owner = n[ownerCol];
        if (owner) counts[owner] = (counts[owner] || 0) + 1;
      });
      return counts;   // { resource_id: action_count }
    });
  }).catch(function() { return {}; });
}
```

**V5 substitution:** replace `<action_owner_col_per_V5>` with the confirmed column name from V5 finding. If the action owner column stores `users.id` rather than `resources.id`, a translation step is needed — agent resolves and documents.

Stakes line is rendered as: `"Owns N actions in this workstream."` If count is 0, line is omitted. If workstreamId is null, line is omitted.

### §5.5 — Paint

```javascript
function _paintAttendees(block, attendees, meeting) {
  var isOrganizer = _isCurrentUserOrganizer(meeting);
  var isIdle = meeting.state === 'idle';

  var html = '<div class="ac-attendees-header">';
  html += '<span class="ac-attendees-label">EXPECTED ATTENDEES</span>';
  html += '<span class="ac-attendees-count">' + attendees.length + '</span>';
  html += '</div>';

  html += '<div class="ac-attendees-list">';
  attendees.forEach(function(a) {
    html += _attendeeCardHtml(a, meeting, isOrganizer && isIdle);
  });
  html += '</div>';

  // Add attendee affordance (organizer + idle only)
  if (isOrganizer && isIdle) {
    html += _addAttendeeHtml();
  }

  block.innerHTML = html;
  _wireAttendeeEvents(block, meeting);
}

function _isCurrentUserOrganizer(meeting) {
  // Compare meeting.organizer_id to current auth user
  // window.Auth.getUserId() or equivalent — agent locates the correct
  // auth identity call from the existing codebase (accord-core.js or auth.js)
  try {
    var currentId = window.Auth && Auth.getUserId ? Auth.getUserId() : null;
    return currentId && currentId === meeting.organizer_id;
  } catch(e) { return false; }
}
```

### §5.6 — Attendee card HTML

```javascript
function _attendeeCardHtml(attendee, meeting, canRemove) {
  var isYou = attendee.role_in_meeting === 'organizer';
  var initials = _initials(attendee._name || '');
  var statusBadge = _statusBadge(attendee);

  var html = '<div class="ac-attendee-card" data-attendee-id="' +
             esc(attendee.attendee_id) + '">';

  // Connection dot (static in v1 — C-12 wires presence)
  html += '<div class="ac-conn-dot ac-conn-dot--idle" title="Connection status"></div>';

  // Avatar
  html += '<div class="ac-attendee-avatar' + (isYou ? ' ac-attendee-avatar--you' : '') + '">';
  html += esc(initials);
  html += '</div>';

  // Name block
  html += '<div class="ac-attendee-name-block">';
  html += '<div class="ac-attendee-name">' + esc(attendee._name || 'Unknown') + '</div>';
  html += '<div class="ac-attendee-role">' +
          esc(attendee.role_in_meeting.toUpperCase()) + '</div>';
  html += '</div>';

  // YOU badge
  if (isYou) html += '<span class="ac-attendee-you">YOU</span>';

  // Status badge (v1: derived from rsvp_status only; C-08 upgrades to behavioral)
  if (statusBadge) html += statusBadge;

  // Remove button (organizer + idle + not self)
  if (canRemove && !isYou) {
    html += '<button class="ac-attendee-remove" data-action="remove-attendee" ' +
            'title="Remove attendee">×</button>';
  }

  html += '</div>';
  return html;
}

function _statusBadge(attendee) {
  // v1: rsvp_status only. C-08 replaces with behavioral derivation.
  var map = {
    'accepted':  { cls: 'ac-badge--accepted',  label: 'ACCEPTED'  },
    'declined':  { cls: 'ac-badge--declined',  label: 'DECLINED'  },
    'tentative': { cls: 'ac-badge--tentative', label: 'TENTATIVE' },
    'pending':   null   // no badge for pending — default state
  };
  var entry = map[attendee.rsvp_status];
  if (!entry) return '';
  return '<span class="ac-attendee-badge ' + entry.cls + '">' + entry.label + '</span>';
}

function _initials(name) {
  var parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
```

### §5.7 — Add attendee HTML

```javascript
function _addAttendeeHtml() {
  return [
    '<div class="ac-add-attendee-row" id="ac-add-attendee-row">',
      '<button class="ac-add-attendee-btn" data-action="show-add-attendee">',
        '+ Add attendee',
      '</button>',
    '</div>',
    '<div class="ac-add-attendee-form" id="ac-add-attendee-form" style="display:none;">',
      '<input class="ac-add-attendee-input" id="ac-add-attendee-input" ',
             'type="text" placeholder="Search by name…" autocomplete="off">',
      '<div class="ac-add-attendee-results" id="ac-add-attendee-results"></div>',
      '<button class="btn btn-ghost ac-add-attendee-cancel" ',
              'data-action="hide-add-attendee">Cancel</button>',
    '</div>'
  ].join('');
}
```

### §5.8 — Event wiring

```javascript
function _wireAttendeeEvents(block, meeting) {
  block.addEventListener('click', function(ev) {
    var action = ev.target.dataset.action ||
                 ev.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'show-add-attendee') { _showAddAttendee(block); return; }
    if (action === 'hide-add-attendee') { _hideAddAttendee(block); return; }

    if (action === 'remove-attendee') {
      var card = ev.target.closest('.ac-attendee-card');
      if (!card) return;
      var attendeeId = card.dataset.attendeeId;
      _removeAttendee(attendeeId, meeting);
      return;
    }

    if (action === 'add-attendee-select') {
      var btn = ev.target.closest('[data-action="add-attendee-select"]');
      if (!btn) return;
      var resourceId = btn.dataset.resourceId;
      var name = btn.dataset.name;
      _addAttendee(resourceId, meeting);
      return;
    }
  });
}
```

### §5.9 — Search and add

```javascript
var _searchTimer = null;

function _showAddAttendee(block) {
  var row  = block.querySelector('#ac-add-attendee-row');
  var form = block.querySelector('#ac-add-attendee-form');
  var input = block.querySelector('#ac-add-attendee-input');
  if (row)  row.style.display  = 'none';
  if (form) form.style.display = '';
  if (input) {
    input.focus();
    input.addEventListener('input', function() {
      _debouncedResourceSearch(input.value.trim(), block);
    });
  }
}

function _hideAddAttendee(block) {
  var row  = block.querySelector('#ac-add-attendee-row');
  var form = block.querySelector('#ac-add-attendee-form');
  var input = block.querySelector('#ac-add-attendee-input');
  var results = block.querySelector('#ac-add-attendee-results');
  if (row)     row.style.display  = '';
  if (form)    form.style.display = 'none';
  if (input)   input.value = '';
  if (results) results.innerHTML = '';
  if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = null; }
}

function _debouncedResourceSearch(query, block) {
  if (_searchTimer) clearTimeout(_searchTimer);
  if (!query || query.length < 2) {
    var results = block.querySelector('#ac-add-attendee-results');
    if (results) results.innerHTML = '';
    return;
  }
  _searchTimer = setTimeout(function() {
    API.get(
      'resources?name=ilike.*' + encodeURIComponent(query) + '*' +
      '&select=id,name&limit=8'
    ).then(function(rows) {
      var results = block.querySelector('#ac-add-attendee-results');
      if (!results) return;
      if (!rows || !rows.length) {
        results.innerHTML = '<div class="ac-search-empty">No results.</div>';
        return;
      }
      results.innerHTML = (rows || []).map(function(r) {
        return '<button class="ac-search-result" data-action="add-attendee-select" ' +
               'data-resource-id="' + esc(r.id) + '" data-name="' + esc(r.name) + '">' +
               esc(r.name) + '</button>';
      }).join('');
    }).catch(function() {});
  }, 300);
}

function _addAttendee(resourceId, meeting) {
  API.post('accord_meeting_attendees', {
    firm_id:        meeting.firm_id,
    meeting_id:     meeting.meeting_id,
    resource_id:    resourceId,
    role_in_meeting: 'participant',
    rsvp_status:    'pending'
  }).then(function() {
    _loadAttendees(meeting);
  }).catch(function(e) {
    console.error('[AccordMeetingSetup] add attendee failed', e);
  });
}

function _removeAttendee(attendeeId, meeting) {
  API.del('accord_meeting_attendees?attendee_id=eq.' + attendeeId)
    .then(function() { _loadAttendees(meeting); })
    .catch(function(e) {
      console.error('[AccordMeetingSetup] remove attendee failed', e);
    });
}
```

### §5.10 — Gathering mode hook

Set `data-mode` on the attendees block based on time proximity. Full logic deferred to C-12; this CMD establishes the attribute and the computation:

```javascript
function _setGatheringMode(block, meeting) {
  if (!meeting.scheduled_for) return;
  var diffMs = new Date(meeting.scheduled_for).getTime() - Date.now();
  var isGathering = diffMs > 0 && diffMs < 15 * 60 * 1000;  // within 15 min
  block.setAttribute('data-mode', isGathering ? 'gathering' : 'prep');
}
```

Call `_setGatheringMode(block, meeting)` at the end of `_paintAttendees`. C-12 wires the CSS and visual transition against this attribute.

---

## §6 — Teardown additions

```javascript
// In teardown():
_attendeesAborted = true;
if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = null; }
```

---

## §7 — CSS

All styles inside `.ac-setup-shell`. Token prefix `--ac-*` only.

```css
/* ── Attendees block ────────────────────────────────── */
.ac-attendees-block { padding: 14px 16px; }

.ac-attendees-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}
.ac-attendees-label {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-tertiary);
  letter-spacing: 1.4px;
  text-transform: uppercase;
}
.ac-attendees-count {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-cyan);
  font-weight: 600;
}

/* ── Attendee card ──────────────────────────────────── */
.ac-attendee-card {
  display: flex;
  align-items: center;
  gap: 9px;
  background: var(--ac-bg-tile);
  border: 1px solid var(--ac-border-subtle);
  border-radius: 7px;
  padding: 10px 11px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

/* Connection dot — v1 static; C-12 wires presence */
.ac-conn-dot {
  width: 12px; height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ac-conn-dot--idle {
  background: transparent;
  border: 2px solid var(--ac-text-tertiary);
  box-shadow: 0 0 8px rgba(138,149,165,0.4);
  animation: ac-conn-glow 2.5s ease-in-out infinite;
}
@keyframes ac-conn-glow {
  0%,100% { box-shadow: 0 0 6px rgba(138,149,165,0.4); }
  50%      { box-shadow: 0 0 14px rgba(138,149,165,0.8); }
}

/* Avatar */
.ac-attendee-avatar {
  width: 24px; height: 24px;
  border-radius: 50%;
  background: var(--ac-bg-elevated);
  display: flex; align-items: center; justify-content: center;
  font-size: 9.5px; color: var(--ac-text-secondary); font-weight: 600;
  flex-shrink: 0;
  font-family: var(--ac-font-mono);
}
.ac-attendee-avatar--you {
  background: var(--ac-cyan-dim);
  color: var(--ac-cyan);
}

/* Name block */
.ac-attendee-name-block { flex: 1; min-width: 0; }
.ac-attendee-name {
  font-size: 12.5px;
  color: var(--ac-text-primary);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ac-attendee-role {
  font-family: var(--ac-font-mono);
  font-size: 8.5px;
  color: var(--ac-text-tertiary);
  letter-spacing: 0.5px;
}

/* YOU badge */
.ac-attendee-you {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  color: var(--ac-cyan);
  letter-spacing: 0.8px;
  flex-shrink: 0;
}

/* Status badges */
.ac-attendee-badge {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  padding: 2px 6px;
  border-radius: 3px;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  font-weight: 600;
  flex-shrink: 0;
}
.ac-badge--accepted  { background: var(--ac-green-dim);  color: var(--ac-green);  }
.ac-badge--declined  { background: var(--ac-rose-dim);   color: var(--ac-rose);   }
.ac-badge--tentative { background: var(--ac-amber-dim);  color: var(--ac-amber);  }

/* Remove button */
.ac-attendee-remove {
  font-size: 14px;
  color: var(--ac-text-faint);
  background: none; border: none;
  cursor: pointer; padding: 0 2px;
  line-height: 1; flex-shrink: 0;
}
.ac-attendee-remove:hover { color: var(--ac-rose); }

/* ── Add attendee ────────────────────────────────────── */
.ac-add-attendee-row { margin-top: 8px; }
.ac-add-attendee-btn {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-cyan);
  background: none; border: none;
  cursor: pointer; padding: 0;
  letter-spacing: 0.8px;
}
.ac-add-attendee-btn:hover { text-decoration: underline; }

.ac-add-attendee-form { margin-top: 8px; }
.ac-add-attendee-input {
  width: 100%;
  font-size: 12px;
  background: var(--ac-bg-tile);
  color: var(--ac-text-primary);
  border: 1px solid var(--ac-border-mid);
  border-radius: 4px;
  padding: 6px 10px;
  outline: none;
  margin-bottom: 6px;
}
.ac-add-attendee-input:focus { border-color: var(--ac-border-active); }

.ac-add-attendee-results { margin-bottom: 6px; }
.ac-search-result {
  display: block; width: 100%;
  text-align: left;
  font-size: 12px;
  color: var(--ac-text-primary);
  background: var(--ac-bg-tile);
  border: 1px solid var(--ac-border-subtle);
  border-radius: 4px;
  padding: 6px 10px;
  margin-bottom: 3px;
  cursor: pointer;
}
.ac-search-result:hover {
  background: var(--ac-bg-elevated);
  border-color: var(--ac-border-mid);
}
.ac-search-empty {
  font-size: 11px;
  color: var(--ac-text-tertiary);
  font-style: italic;
  padding: 4px 0;
}

/* ── Gathering mode (C-12 wires visual transition) ───── */
.ac-attendees-block[data-mode="gathering"] .ac-add-attendee-row { display: none; }
```

---

## §8 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Open idle meeting with no attendees | Attendees block renders. Organizer auto-seeded and appears as first card with YOU badge. |
| 2 | Organizer card appearance | Cyan avatar initials. ORGANIZER role label. YOU badge. No remove button. |
| 3 | Add attendee via search | Type 2+ chars → results appear. Click result → attendee card added. Re-fetch confirms row in `accord_meeting_attendees`. |
| 4 | Remove attendee | × button appears on non-organizer cards. Click → card removed. Re-fetch confirms row absent. |
| 5 | Duplicate attendee prevention | Add same resource twice → second INSERT fails on UNIQUE constraint. No duplicate card in UI. Error logged, not surfaced to user. |
| 6 | Count badge | Attendee count in header matches actual card count after add/remove. |
| 7 | Gathering mode hook | Temporarily set `meeting.scheduled_for` to 5 minutes from now (via Supabase SQL editor) → reload Setup shell → `.ac-attendees-block` has `data-mode="gathering"`. Add-attendee row hidden. |
| 8 | Non-organizer view | Log in as a non-organizer resource (or simulate) → no add button, no remove buttons on any card. |

---

## §9 — Files manifest

| File | Change |
|---|---|
| `accord_meeting_attendees` (Supabase) | New table + RLS + index |
| `accord-meeting-setup.js` | `_renderAttendees()` + all sub-functions; teardown additions |
| `accord-meeting-setup.css` | Attendee card + add-attendee + gathering mode hook styles |
| `accord-views.js` | No changes |
| `version.js` | Operator-managed (IR65) |

---

## §10 — Discipline checklist

- `var` only
- IR71: all DOM references re-queried after async; `_attendeesAborted` checked before paint
- `_attendeesAborted` set true in `teardown()`; `_searchTimer` cleared in `teardown()`
- `data-action` on ALL interactive elements — no id-only delegation targets (lesson from C-03)
- Double-submit guard not needed here (no form submit — individual async calls per action)
- V4 finding governs organizer seed path — agent documents resolution in close-out
- V5 finding governs stakes line owner column — agent substitutes verbatim
- `resources.name` used for display (carry-forward from C-03 V1)
- `firm_id` on all INSERTs sourced from `meeting.firm_id` (canonical; confirmed in C-03)
- Sequential PATCHes where applicable; independent reads use Promise.all
- `--ac-*` token prefix throughout; no production Accord tokens
- Gathering mode sets `data-mode` attribute only — no visual logic (C-12 owns that)
- Organizer remove button absent — self-removal not permitted

---

**Halt-and-surface after §8. Close-out must include: V2–V5 findings, organizer seed resolution (V4 path taken), action owner column used for stakes line (V5), gathering mode data-attribute confirmed in DOM.**

**After seal: C-05 · CMD-ACCORD-SETUP-FILMSTRIP-2 is unblocked.**

---

*End Commission · C-04 · CMD-ACCORD-SETUP-ATTENDEES-1.*
