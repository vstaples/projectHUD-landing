# Commission · C-08 · CMD-ACCORD-SETUP-INTELLIGENCE-1

**Phase:** 3 of Wave 2 — Intelligence Mode (Cmd+I private overlay) + attendee intelligence enrichment
**Authored:** 2026-05-10
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Accord Meeting Setup Shell — Requirements Specification v1.1 §10, §6.2
**Predecessor:** C-07 · CMD-ACCORD-SETUP-AGENDA-ENHANCED-1 sealed
**Successor:** C-09 · CMD-ACCORD-SETUP-ACTION-KANBAN-1
**Coding agent:** execute sequentially; halt-and-surface after §9

---

## §1 — Scope

This CMD has two deliverables:

1. **Intelligence Mode** — Cmd+I overlay: full-screen dim, private panel, per-attendee intelligence cards, hot-button items, operator private notes, risk surface
2. **Attendee card enrichment** — upgrade the v1 rsvp-only status badges to substrate-derived behavioral status (ENGAGED·STEADY, DISSENT·SIMMERING, OVERDUE·PRESSURE, QUIET·RE-ONBOARD) with expand detail

**What does NOT ship:**
- AI synthesis (X-08, X-09)
- Percolate-by-person (C-11)
- Gathering mode visual transition (C-12)
- Action Items kanban (C-09)
- Cmd+I browser extension conflict workaround — document as known environment issue; alternative keystroke `Ctrl+Shift+I` offered as fallback

---

## §2 — IR64 verification (before writing any code)

**V1 — `accord_meeting_intel_notes` absent:**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name = 'accord_meeting_intel_notes';
```
Expected: zero rows. Halt if present.

**V2 — `accord_nras_current` view columns:**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'accord_nras_current'
ORDER BY ordinal_position;
```
Need: confirm `node_id`, `state`, `declared_at`, `deferred_at` column names for intelligence derivation.

**V3 — `accord_nodes` action status column:**
```sql
SELECT DISTINCT status FROM accord_nodes WHERE tag = 'action' LIMIT 10;
```
Need: confirm valid status values for action overdue detection. If `status` is null for all rows, overdue detection relies on `due_date < now()` only.

**V4 — `accord-meeting-setup.js` Intelligence Mode stub (from C-01):**
```javascript
document.getElementById('ac-intel-overlay')?.style?.display;
document.getElementById('ac-intel-overlay')?.innerHTML?.slice(0, 100);
```
Confirm overlay div exists (planted in C-01 §8.2), is `display:none`, and is empty. The Cmd+I listener stub is also from C-01 — this CMD replaces the stub log with full logic.

**V5 — Identity resolution carry-forward:**
`resources.user_id → auth.users.id` pattern confirmed C-04. `accord_nodes.created_by = users.id`. `accord_nodes.dissented_by = users.id`. Document as carry-forward.

Report V1–V4 in close-out. V5 as carry-forward.

---

## §3 — Substrate: `accord_meeting_intel_notes`

```sql
-- Migration: 2026-05-10_accord_meeting_intel_notes.sql
-- C-08 · CMD-ACCORD-SETUP-INTELLIGENCE-1

CREATE TABLE accord_meeting_intel_notes (
  note_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id           UUID        NOT NULL REFERENCES firms(id),
  meeting_id        UUID        NOT NULL REFERENCES accord_meetings(meeting_id)
                                ON DELETE CASCADE,
  author_resource_id UUID       NOT NULL REFERENCES resources(id),
  body              TEXT        NOT NULL DEFAULT '',
  is_private        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE accord_meeting_intel_notes IS
  'Operator private prep notes. Author-only visible. '
  'Never surfaced in meeting minutes or shared records. '
  'C-08 CMD-ACCORD-SETUP-INTELLIGENCE-1.';

CREATE INDEX accord_meeting_intel_notes_meeting_idx
  ON accord_meeting_intel_notes (meeting_id, author_resource_id);
```

### §3.1 — RLS policies

```sql
ALTER TABLE accord_meeting_intel_notes ENABLE ROW LEVEL SECURITY;

-- SELECT: author only (private notes)
CREATE POLICY accord_meeting_intel_notes_select ON accord_meeting_intel_notes
  FOR SELECT USING (
    firm_id = my_firm_id()
    AND author_resource_id = (
      SELECT id FROM resources WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- INSERT: firm member only; author_resource_id must match caller
CREATE POLICY accord_meeting_intel_notes_insert ON accord_meeting_intel_notes
  FOR INSERT WITH CHECK (
    firm_id = my_firm_id()
    AND author_resource_id = (
      SELECT id FROM resources WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- UPDATE: author only
CREATE POLICY accord_meeting_intel_notes_update ON accord_meeting_intel_notes
  FOR UPDATE
  USING (
    firm_id = my_firm_id()
    AND author_resource_id = (
      SELECT id FROM resources WHERE user_id = auth.uid() LIMIT 1
    )
  )
  WITH CHECK (firm_id = my_firm_id());

-- DELETE: author only
CREATE POLICY accord_meeting_intel_notes_delete ON accord_meeting_intel_notes
  FOR DELETE USING (
    firm_id = my_firm_id()
    AND author_resource_id = (
      SELECT id FROM resources WHERE user_id = auth.uid() LIMIT 1
    )
  );
```

**Post-migration:**
```sql
SELECT pg_notify('pgrst', 'reload schema');
```

---

## §4 — Intelligence derivation engine

All derivation is substrate-computed. No AI. Produces a structured `IntelData` object used by both the Intelligence Mode panel and the attendee card enrichment.

### §4.1 — `IntelData` shape

```javascript
// IntelData = {
//   attendees: [
//     {
//       resource_id:     string,
//       name:            string,
//       user_id:         string,
//       role:            string,
//       status_tag:      string,   // 'ENGAGED·STEADY' | 'DISSENT·SIMMERING' | 'OVERDUE·PRESSURE' | 'QUIET·RE-ONBOARD'
//       status_color:    string,   // 'green' | 'rose' | 'amber' | 'muted'
//       owed_line:       string,   // e.g. "Owes belief on DC-117 (12d). Owns 5 actions."
//       urgency_line:    string,   // e.g. "Dissent DS-005: 22d unresolved · move now"
//       open_actions:    number,
//       overdue_actions: number,
//       open_dissents:   [{ seq_id, summary, age_days }],
//       days_off_substrate: number  // days since last node authored
//     }
//   ],
//   hot_buttons: [
//     { type: 'dissent'|'nra'|'overdue', text: string, severity: 'high'|'mid' }
//   ],
//   private_note: { note_id: string|null, body: string }
// }
```

### §4.2 — Main derivation fetch

```javascript
var _intelToken = 0;
var _intelData  = null;   // cached per render; invalidated on teardown

function _deriveIntelData(meeting, workstreamId, callback) {
  var myToken = ++_intelToken;

  if (!workstreamId) {
    callback({ attendees: [], hot_buttons: [], private_note: { note_id: null, body: '' } });
    return;
  }

  // Step 1: get attendees with resource + user mapping
  API.get(
    'accord_meeting_attendees?meeting_id=eq.' + meeting.meeting_id +
    '&select=attendee_id,resource_id,role_in_meeting'
  ).then(function(attendeeRows) {
    if (_intelToken !== myToken) return;
    attendeeRows = attendeeRows || [];
    if (!attendeeRows.length) {
      callback({ attendees: [], hot_buttons: [], private_note: { note_id: null, body: '' } });
      return;
    }

    var resourceIds = attendeeRows.map(function(a) { return a.resource_id; }).join(',');

    // Step 2: parallel fetches against workstream history
    return API.get(
      'accord_meetings?workstream_id=eq.' + workstreamId +
      '&state=in.(closed,sealed,running)' +
      '&select=meeting_id&limit=30'
    ).then(function(priorMtgs) {
      priorMtgs = priorMtgs || [];
      if (!priorMtgs.length) {
        return [[], [], [], [], []];
      }
      var mids = priorMtgs.map(function(m) { return m.meeting_id; }).join(',');

      return Promise.all([
        // Resources with user_ids
        API.get('resources?id=in.(' + resourceIds + ')&select=id,name,user_id'),
        // Dissent nodes in workstream
        API.get(
          'accord_nodes?meeting_id=in.(' + mids + ')&tag=eq.dissent' +
          '&select=node_id,summary,seq_id,dissented_by,dissent_recorded_at,meeting_id'
        ),
        // Action nodes in workstream
        API.get(
          'accord_nodes?meeting_id=in.(' + mids + ')&tag=eq.action' +
          '&select=node_id,summary,seq_id,created_by,due_date,status'
        ),
        // Belief adjustments awaiting (open decisions)
        API.get(
          'accord_nodes?meeting_id=in.(' + mids + ')&tag=eq.decision' +
          '&select=node_id,seq_id,summary,created_by'
        ),
        // Private intel note for this meeting + this author
        API.get(
          'accord_meeting_intel_notes?meeting_id=eq.' + meeting.meeting_id +
          '&select=note_id,body&limit=1'
        )
      ]);
    }).then(function(results) {
      if (_intelToken !== myToken) return;
      var resources  = results[0] || [];
      var dissents   = results[1] || [];
      var actions    = results[2] || [];
      var decisions  = results[3] || [];
      var noteRows   = results[4] || [];

      // Build user_id → resource map
      var userToResource = {};
      resources.forEach(function(r) {
        if (r.user_id) userToResource[r.user_id] = r;
      });
      var resourceMap = {};
      resources.forEach(function(r) { resourceMap[r.id] = r; });

      var now = Date.now();

      // Per-attendee derivation
      var attendeeIntel = attendeeRows.map(function(a) {
        var res = resourceMap[a.resource_id] || {};
        var userId = res.user_id;

        // Dissents by this attendee
        var myDissents = dissents.filter(function(d) {
          return d.dissented_by === userId;
        }).map(function(d) {
          var age = d.dissent_recorded_at
            ? Math.round((now - new Date(d.dissent_recorded_at).getTime()) / 86400000)
            : null;
          return { seq_id: d.seq_id, summary: d.summary, age_days: age };
        });

        // Actions by this attendee
        var myActions = actions.filter(function(n) { return n.created_by === userId; });
        var myOverdue = myActions.filter(function(n) {
          return n.due_date && new Date(n.due_date).getTime() < now;
        });

        // Days since last node authored by this user
        var myNodes = dissents.concat(actions).filter(function(n) {
          return n.created_by === userId || n.dissented_by === userId;
        });

        // Status tag derivation
        var statusTag, statusColor;
        var hasActiveDissent = myDissents.some(function(d) { return d.age_days !== null; });
        var oldestDissent    = myDissents.reduce(function(max, d) {
          return (d.age_days || 0) > (max.age_days || 0) ? d : max;
        }, { age_days: 0 });
        var isOverdue = myOverdue.length > 0;

        if (hasActiveDissent && oldestDissent.age_days >= 14) {
          statusTag   = 'DISSENT · SIMMERING';
          statusColor = 'rose';
        } else if (isOverdue && myOverdue.length >= 2) {
          statusTag   = 'OVERDUE · PRESSURE';
          statusColor = 'amber';
        } else if (myNodes.length === 0 && myActions.length === 0) {
          statusTag   = 'QUIET · RE-ONBOARD';
          statusColor = 'muted';
        } else {
          statusTag   = 'ENGAGED · STEADY';
          statusColor = 'green';
        }

        // Owed line
        var owedParts = [];
        if (myActions.length) owedParts.push('Owns ' + myActions.length + ' action' +
          (myActions.length !== 1 ? 's' : '') + ' in workstream');
        if (myOverdue.length) owedParts.push(myOverdue.length + ' overdue');
        var owedLine = owedParts.join('. ');

        // Urgency line
        var urgencyLine = '';
        if (hasActiveDissent && oldestDissent.age_days) {
          urgencyLine = (oldestDissent.seq_id || 'Dissent') + ': ' +
                        oldestDissent.age_days + 'd unresolved';
          if (oldestDissent.age_days >= 20) urgencyLine += ' · move now';
        }

        return {
          resource_id:     a.resource_id,
          name:            res.name || 'Unknown',
          user_id:         userId || null,
          role:            a.role_in_meeting,
          status_tag:      statusTag,
          status_color:    statusColor,
          owed_line:       owedLine,
          urgency_line:    urgencyLine,
          open_actions:    myActions.length,
          overdue_actions: myOverdue.length,
          open_dissents:   myDissents
        };
      });

      // Hot-buttons: high-severity dissents + overdue on critical actions
      var hotButtons = [];
      dissents.forEach(function(d) {
        var age = d.dissent_recorded_at
          ? Math.round((now - new Date(d.dissent_recorded_at).getTime()) / 86400000)
          : 0;
        if (age >= 14) {
          hotButtons.push({
            type:     'dissent',
            text:     (d.seq_id || 'Dissent') + ' · ' +
                      (d.summary || '').slice(0, 60) + ' · ' + age + 'd unresolved',
            severity: age >= 20 ? 'high' : 'mid'
          });
        }
      });

      var privateNote = noteRows[0] || { note_id: null, body: '' };

      var intelData = {
        attendees:    attendeeIntel,
        hot_buttons:  hotButtons.slice(0, 5),
        private_note: privateNote
      };

      _intelData = intelData;
      callback(intelData);
    });
  }).catch(function(e) {
    console.error('[AccordMeetingSetup] intel derivation failed', e);
    callback({ attendees: [], hot_buttons: [], private_note: { note_id: null, body: '' } });
  });
}
```

---

## §5 — Attendee card enrichment

Upgrade `_paintAttendees()` to use `IntelData` when available. Called after `_deriveIntelData` completes.

```javascript
function _renderAttendees(meeting, workstreamId) {
  _attendeesAborted = false;
  var host = document.querySelector('.ac-col-tabbody[data-col="right"]');
  if (!host) return;

  // Use cached intel data if available (derive runs in parallel)
  _loadAttendees(meeting, workstreamId);
  _deriveIntelData(meeting, workstreamId, function(intel) {
    if (_attendeesAborted) return;
    _intelData = intel;
    // Re-paint attendees with enriched data if already loaded
    var block = document.getElementById('ac-attendees-block');
    if (block && block.querySelectorAll('.ac-attendee-card').length > 0) {
      _enrichAttendeeCards(block, intel);
    }
  });
}
```

### §5.1 — Enrich existing cards

Called after intel data arrives. Updates status badges and adds owed/urgency lines to already-rendered cards without full re-render:

```javascript
function _enrichAttendeeCards(block, intel) {
  var intelMap = {};
  intel.attendees.forEach(function(a) { intelMap[a.resource_id] = a; });

  block.querySelectorAll('.ac-attendee-card').forEach(function(card) {
    var attendeeId = card.dataset.attendeeId;
    // Find resource_id for this attendee card
    // Cards rendered with data-resource-id in enriched paint
    var resourceId = card.dataset.resourceId;
    if (!resourceId) return;
    var intel_a = intelMap[resourceId];
    if (!intel_a) return;

    // Replace rsvp status badge with behavioral badge
    var existingBadge = card.querySelector('.ac-attendee-badge');
    if (existingBadge) existingBadge.remove();

    var badgeCls = 'ac-attendee-badge ac-attendee-badge--behavioral ' +
                   'ac-badge--' + intel_a.status_color;
    var badge = document.createElement('span');
    badge.className = badgeCls;
    badge.textContent = intel_a.status_tag;
    card.appendChild(badge);

    // Add owed line if not present
    if (intel_a.owed_line && !card.querySelector('.ac-attendee-owed')) {
      var owedEl = document.createElement('div');
      owedEl.className = 'ac-attendee-owed';
      owedEl.textContent = intel_a.owed_line;
      card.appendChild(owedEl);
    }

    // Add urgency line if not present
    if (intel_a.urgency_line && !card.querySelector('.ac-attendee-urgency')) {
      var urgEl = document.createElement('div');
      urgEl.className = 'ac-attendee-urgency';
      urgEl.textContent = intel_a.urgency_line;
      card.appendChild(urgEl);
    }
  });
}
```

**IR71 note:** `_enrichAttendeeCards` re-queries the DOM for cards at call time — no stale references.

Add `data-resource-id` attribute to attendee cards in `_attendeeCardHtml()`:

```javascript
// In _attendeeCardHtml(), add data-resource-id to the card div:
var html = '<div class="ac-attendee-card" ' +
           'data-attendee-id="' + esc(attendee.attendee_id) + '" ' +
           'data-resource-id="' + esc(attendee.resource_id) + '">';
```

---

## §6 — Intelligence Mode panel

### §6.1 — Keystroke wiring (replaces C-01 stub)

```javascript
function _onIntelKey(ev) {
  if ((ev.metaKey || ev.ctrlKey) && ev.key === 'i') {
    ev.preventDefault();
    _toggleIntelOverlay();
    return;
  }
  // Fallback: Ctrl+Shift+I (browser extension conflict workaround)
  if (ev.ctrlKey && ev.shiftKey && ev.key === 'I') {
    ev.preventDefault();
    _toggleIntelOverlay();
  }
  if (ev.key === 'Escape') {
    var overlay = document.getElementById('ac-intel-overlay');
    if (overlay && overlay.style.display !== 'none') {
      _closeIntelOverlay();
    }
  }
}
```

### §6.2 — Toggle

```javascript
var _intelOpen = false;

function _toggleIntelOverlay() {
  _intelOpen ? _closeIntelOverlay() : _openIntelOverlay();
}

function _openIntelOverlay() {
  var overlay = document.getElementById('ac-intel-overlay');
  var shell   = document.querySelector('.ac-setup-shell');
  if (!overlay || !shell) return;

  // Populate if intel data is ready; else show loading state
  _paintIntelOverlay(overlay, _intelData);

  overlay.style.display = '';
  shell.classList.add('ac-intel-dimmed');
  _intelOpen = true;

  // Animate in
  requestAnimationFrame(function() {
    overlay.classList.add('ac-intel-overlay--visible');
  });
}

function _closeIntelOverlay() {
  var overlay = document.getElementById('ac-intel-overlay');
  var shell   = document.querySelector('.ac-setup-shell');
  if (!overlay) return;

  overlay.classList.remove('ac-intel-overlay--visible');
  shell && shell.classList.remove('ac-intel-dimmed');
  _intelOpen = false;

  setTimeout(function() {
    if (!_intelOpen) overlay.style.display = 'none';
  }, 280);  // match transition duration
}
```

### §6.3 — Paint overlay

```javascript
function _paintIntelOverlay(overlay, intel) {
  if (!intel) {
    overlay.innerHTML = [
      '<div class="ac-intel-panel">',
        '<div class="ac-intel-hint">Esc or Cmd+I to close</div>',
        '<div class="ac-intel-loading">Deriving intelligence…</div>',
        '<div class="ac-intel-watermark">PRIVATE VIEW</div>',
      '</div>'
    ].join('');
    _wireIntelEvents(overlay);
    return;
  }

  var html = '<div class="ac-intel-panel">';
  html += '<div class="ac-intel-hint">Esc or Cmd+I to close</div>';
  html += '<div class="ac-intel-watermark">PRIVATE VIEW</div>';

  // ── Per-attendee intelligence ────────────────────────
  html += '<div class="ac-intel-section">';
  html += '<div class="ac-intel-section-label">PER ATTENDEE</div>';
  if (!intel.attendees.length) {
    html += '<div class="ac-intel-empty">No attendees in this meeting.</div>';
  } else {
    intel.attendees.forEach(function(a) {
      var badgeCls = 'ac-intel-badge ac-intel-badge--' + a.status_color;
      html += '<div class="ac-intel-attendee">';
      html += '<div class="ac-intel-att-header">';
      html += '<span class="ac-intel-att-name">' + esc(a.name) + '</span>';
      html += '<span class="' + badgeCls + '">' + esc(a.status_tag) + '</span>';
      if (a.role === 'organizer') html += '<span class="ac-intel-att-role">ORGANIZER</span>';
      html += '</div>';
      if (a.owed_line) {
        html += '<div class="ac-intel-att-owed">' + esc(a.owed_line) + '</div>';
      }
      if (a.urgency_line) {
        html += '<div class="ac-intel-att-urgency">▸ ' + esc(a.urgency_line) + '</div>';
      }
      if (a.open_dissents.length) {
        a.open_dissents.forEach(function(d) {
          html += '<div class="ac-intel-att-dissent">⊘ ' +
                  esc(d.seq_id || 'DS') + ' · ' +
                  esc((d.summary || '').slice(0, 60)) +
                  (d.age_days ? ' · ' + d.age_days + 'd' : '') +
                  '</div>';
        });
      }
      html += '</div>'; // .ac-intel-attendee
    });
  }
  html += '</div>';

  // ── Hot-button items ─────────────────────────────────
  if (intel.hot_buttons.length) {
    html += '<div class="ac-intel-section">';
    html += '<div class="ac-intel-section-label">HOT-BUTTON ITEMS</div>';
    intel.hot_buttons.forEach(function(hb) {
      var cls = 'ac-intel-hotbtn ac-intel-hotbtn--' + hb.severity;
      html += '<div class="' + cls + '">⚡ ' + esc(hb.text) + '</div>';
    });
    html += '</div>';
  }

  // ── Private notes ────────────────────────────────────
  html += '<div class="ac-intel-section ac-intel-section--notes">';
  html += '<div class="ac-intel-section-label">PRIVATE NOTES <span class="ac-intel-note-hint">— never shared</span></div>';
  html += '<textarea class="ac-intel-notes-textarea" id="ac-intel-notes-textarea" ' +
          'placeholder="Your private prep notes…">' +
          esc(intel.private_note.body || '') + '</textarea>';
  html += '</div>';

  html += '</div>'; // .ac-intel-panel
  overlay.innerHTML = html;
  _wireIntelEvents(overlay);
}
```

### §6.4 — Intel overlay events

```javascript
var _intelNoteTimer = null;

function _wireIntelEvents(overlay) {
  // Close on backdrop click (outside panel)
  overlay.addEventListener('click', function(ev) {
    if (ev.target === overlay) _closeIntelOverlay();
  });

  // Private notes autosave
  var textarea = overlay.querySelector('#ac-intel-notes-textarea');
  if (textarea && !textarea.dataset.listenerBound) {
    textarea.dataset.listenerBound = '1';
    textarea.addEventListener('input', function() {
      if (_intelNoteTimer) clearTimeout(_intelNoteTimer);
      _intelNoteTimer = setTimeout(function() {
        _saveIntelNote(textarea.value);
      }, 800);
    });
  }
}

function _saveIntelNote(body) {
  if (!_currentMeeting || !_currentResourceId) return;
  var note = _intelData && _intelData.private_note;

  if (note && note.note_id) {
    // UPDATE existing
    API.patch(
      'accord_meeting_intel_notes?note_id=eq.' + note.note_id,
      { body: body, updated_at: new Date().toISOString() }
    ).catch(function(e) {
      console.error('[AccordMeetingSetup] intel note update failed', e);
    });
  } else {
    // INSERT new
    API.post('accord_meeting_intel_notes', {
      firm_id:           _currentMeeting.firm_id,
      meeting_id:        _currentMeeting.meeting_id,
      author_resource_id: _currentResourceId,
      body:              body,
      is_private:        true
    }).then(function(rows) {
      // Cache new note_id
      var row = rows && rows[0];
      if (row && _intelData) {
        _intelData.private_note = { note_id: row.note_id, body: body };
      }
    }).catch(function(e) {
      console.error('[AccordMeetingSetup] intel note insert failed', e);
    });
  }
}
```

**`_currentMeeting` and `_currentResourceId`** — module-level vars set in `render()`:

```javascript
var _currentMeeting    = null;
var _currentResourceId = null;

// In render(meeting, workstreamId):
_currentMeeting    = meeting;
_currentResourceId = null;  // resolved async:
API.get('resources?user_id=eq.' + _getCurrentUserId() + '&select=id&limit=1')
  .then(function(rows) {
    if (rows && rows[0]) _currentResourceId = rows[0].id;
  });
```

`_getCurrentUserId()` reads JWT sub from localStorage — same pattern confirmed C-04 V4.

---

## §7 — Teardown additions

```javascript
// In teardown():
_intelData  = null;
_currentMeeting = null;
_currentResourceId = null;
_intelOpen  = false;
if (_intelNoteTimer) { clearTimeout(_intelNoteTimer); _intelNoteTimer = null; }

// Close overlay if open
var overlay = document.getElementById('ac-intel-overlay');
if (overlay) {
  overlay.style.display = 'none';
  overlay.classList.remove('ac-intel-overlay--visible');
  overlay.innerHTML = '';
}
var shell = document.querySelector('.ac-setup-shell');
if (shell) shell.classList.remove('ac-intel-dimmed');
```

---

## §8 — CSS additions

```css
/* ── Intelligence overlay ───────────────────────────── */
#ac-intel-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 40px;
  background: rgba(0,0,0,0.72);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  opacity: 0;
  transition: opacity 0.22s ease;
}
#ac-intel-overlay.ac-intel-overlay--visible { opacity: 1; }

/* Dimmed shell */
.ac-setup-shell.ac-intel-dimmed {
  pointer-events: none;
  filter: brightness(0.15);
  transition: filter 0.22s ease;
}

/* Panel */
.ac-intel-panel {
  position: relative;
  width: 72%;
  max-width: 900px;
  max-height: 78vh;
  background: var(--ac-bg-deep);
  border: 1px solid var(--ac-border-mid);
  border-radius: 10px;
  padding: 22px 26px 20px 26px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 22px;
  transform: translateY(20px);
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
#ac-intel-overlay.ac-intel-overlay--visible .ac-intel-panel {
  transform: translateY(0);
}

/* Hint + watermark */
.ac-intel-hint {
  position: absolute;
  top: 14px; right: 18px;
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-faint);
  letter-spacing: 0.8px;
}
.ac-intel-watermark {
  position: absolute;
  bottom: 14px; right: 18px;
  font-family: var(--ac-font-mono);
  font-size: 11px;
  color: var(--ac-text-faint);
  opacity: 0.15;
  letter-spacing: 2px;
  user-select: none;
}

/* Sections */
.ac-intel-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ac-intel-section-label {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-tertiary);
  letter-spacing: 1.4px;
  text-transform: uppercase;
}
.ac-intel-note-hint { color: var(--ac-text-faint); font-weight: normal; }
.ac-intel-empty, .ac-intel-loading {
  font-size: 12px;
  color: var(--ac-text-tertiary);
  font-style: italic;
}

/* Per-attendee cards */
.ac-intel-attendee {
  background: var(--ac-bg-tile);
  border: 1px solid var(--ac-border-subtle);
  border-radius: 6px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ac-intel-att-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ac-intel-att-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--ac-text-primary);
}
.ac-intel-att-role {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  color: var(--ac-text-faint);
  letter-spacing: 0.5px;
}
.ac-intel-att-owed { font-size: 11.5px; color: var(--ac-text-secondary); }
.ac-intel-att-urgency { font-size: 11.5px; color: var(--ac-amber); }
.ac-intel-att-dissent {
  font-family: var(--ac-font-mono);
  font-size: 10px;
  color: var(--ac-rose);
}

/* Intel badges */
.ac-intel-badge {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 3px;
  letter-spacing: 0.6px;
}
.ac-intel-badge--green  { background: var(--ac-green-dim);  color: var(--ac-green);  }
.ac-intel-badge--rose   { background: var(--ac-rose-dim);   color: var(--ac-rose);   }
.ac-intel-badge--amber  { background: var(--ac-amber-dim);  color: var(--ac-amber);  }
.ac-intel-badge--muted  { background: rgba(255,255,255,.05); color: var(--ac-text-tertiary); }

/* Attendee card enrichment badges (right column) */
.ac-attendee-badge--behavioral {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.4px;
}
.ac-attendee-owed {
  width: 100%;
  font-size: 11px;
  color: var(--ac-text-secondary);
  margin-top: 3px;
}
.ac-attendee-urgency {
  width: 100%;
  font-size: 11px;
  color: var(--ac-amber);
  font-family: var(--ac-font-mono);
}

/* Hot-button items */
.ac-intel-hotbtn {
  font-size: 12px;
  padding: 7px 10px;
  border-radius: 4px;
  line-height: 1.4;
}
.ac-intel-hotbtn--high {
  background: var(--ac-rose-dim);
  color: var(--ac-rose);
  border: 1px solid rgba(251,113,133,0.25);
}
.ac-intel-hotbtn--mid {
  background: var(--ac-amber-dim);
  color: var(--ac-amber);
  border: 1px solid rgba(251,191,119,0.2);
}

/* Private notes textarea */
.ac-intel-section--notes { flex: 1; }
.ac-intel-notes-textarea {
  width: 100%;
  min-height: 100px;
  max-height: 200px;
  font-size: 13px;
  font-family: var(--ac-font-serif);
  font-style: italic;
  color: var(--ac-text-primary);
  background: var(--ac-bg-pane);
  border: 1px solid var(--ac-border-mid);
  border-radius: 5px;
  padding: 10px 12px;
  resize: vertical;
  outline: none;
  line-height: 1.6;
}
.ac-intel-notes-textarea:focus { border-color: var(--ac-border-active); }
.ac-intel-notes-textarea::placeholder { color: var(--ac-text-faint); font-style: italic; }
```

---

## §9 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Cmd+I opens overlay | Shell dims + blurs. Panel slides up from bottom. PRIVATE VIEW watermark visible. Esc/Cmd+I dismisses. |
| 2 | Panel content — attendees | Per-attendee cards render with name, behavioral status badge (not rsvp), owed line if applicable. |
| 3 | Panel content — hot buttons | Workstream with open dissents 14d+ → hot-button section shows rose entries. |
| 4 | Panel content — private notes | Notes textarea renders. Type text → 800ms debounce → INSERT fires. Reopen overlay → text persists (loaded from substrate). |
| 5 | Private notes update | Type new text in existing note → UPDATE fires (not INSERT). Confirm via Supabase: `SELECT body FROM accord_meeting_intel_notes WHERE meeting_id = '<id>'` |
| 6 | Attendee card enrichment | Right column cards show behavioral status badges (ENGAGED·STEADY etc.) after intel data loads. Owed line visible on cards with actions. |
| 7 | DISSENT·SIMMERING badge | Attendee with dissent 14d+ → badge renders rose DISSENT·SIMMERING. Urgency line shows days + "move now" if 20d+. |
| 8 | RLS: notes visible only to author | Notes saved by one session are not visible when queried as a different user. Verify via SQL: `SELECT * FROM accord_meeting_intel_notes` returns only the current user's notes. |
| 9 | Teardown | Navigate away → overlay hidden → `ac-intel-dimmed` class removed from shell → no stale DOM. |

---

## §10 — Files manifest

| File | Change |
|---|---|
| `accord_meeting_intel_notes` (Supabase) | New table + RLS + index |
| `accord-meeting-setup.js` | `_deriveIntelData()`; `_enrichAttendeeCards()`; `_openIntelOverlay()`/`_closeIntelOverlay()`/`_paintIntelOverlay()`; `_saveIntelNote()`; `_currentMeeting`/`_currentResourceId` vars; teardown additions |
| `accord-meeting-setup.css` | Intelligence overlay + panel + attendee enrichment styles |
| `accord-views.js` | No changes |
| `version.js` | Operator-managed (IR65) |

---

## §11 — Discipline checklist

- `var` only
- Token pattern: `_intelToken`; `isConnected` not needed (intel delivery is via callback, not DOM paint)
- `Promise.all` for parallel intel fetches — all independent reads; documented
- Sequential fetches where second depends on first (attendees → workstream history)
- `data-resource-id` added to attendee cards (§5.1) — required for enrichment matching
- `data-action` on all interactive elements in overlay
- `_intelNoteTimer` cleared in `teardown()`; `_intelData` nulled; overlay cleaned up
- `_currentResourceId` resolved async from `resources.user_id = auth.uid()` (C-04 V4 pattern)
- INSERT vs UPDATE correctly branched on `note_id` presence
- `updated_at` on UPDATE — not on INSERT (DEFAULT handles it)
- Cmd+I browser extension conflict documented; `Ctrl+Shift+I` fallback wired
- `--ac-*` token prefix throughout; no production Accord tokens
- `pointer-events: none` on dimmed shell prevents operator interacting with shell while overlay is open
- Behavioral status derivation thresholds documented in close-out (14d dissent = SIMMERING, 2+ overdue = PRESSURE)

---

**Halt-and-surface after §9. Close-out must include: V1–V4 IR64 findings, behavioral status derivation thresholds confirmed, INSERT vs UPDATE note path verified in smoke test 5, RLS author-only confirmed in smoke test 8.**

**After seal: C-09 · CMD-ACCORD-SETUP-ACTION-KANBAN-1 is unblocked.**

---

*End Commission · C-08 · CMD-ACCORD-SETUP-INTELLIGENCE-1.*
