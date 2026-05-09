# Commission · C-03 · CMD-ACCORD-SETUP-OUTCOMES-1

**Phase:** 3 of Wave 1 — Outcomes block (center column, above Agenda)
**Authored:** 2026-05-09
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Accord Meeting Setup Shell — Requirements Specification v1.1 §5.2
**Predecessor:** C-02 · CMD-ACCORD-SETUP-HEADER-1 sealed
**Successor:** C-04 · CMD-ACCORD-SETUP-ATTENDEES-1 (blocked on this CMD)
**Coding agent:** execute sequentially; halt-and-surface after §8

---

## §1 — Scope

Wire the center column's `.ac-col-tabbody[data-col="center"]` placeholder with the Outcomes block. The Agenda placeholder remains — this CMD adds Outcomes above it. No Agenda logic ships here.

**Deliverables:**
1. `accord_meeting_outcomes` substrate — full table + RLS + state-gate trigger
2. Outcomes block rendered above the Agenda placeholder in the center column
3. Add / edit / reorder / delete outcomes inline
4. Verb chip, description, owner chip per outcome row
5. Owner chips linked to `resources` table (display name only; no modal)
6. Outcome state immutable once `accord_meetings.state = 'running'`
7. All 8 smoke tests pass

**What does NOT ship:**
- Agenda content (C-07)
- Prep prompt (C-07)
- Click-to-percolate on owner chips (C-11)
- Outcome ratification at meeting close (X-03)
- Outcomes in the running-meeting surface

---

## §2 — IR64 verification (before writing any code)

**V1 — `resources` table PK and name column:**
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'resources'
  AND column_name IN ('id', 'resource_id', 'name', 'full_name', 'display_name')
ORDER BY ordinal_position;
```
Need: exact PK name and the name column used for display. Do not assume.

**V2 — Existing `accord_meeting_outcomes` table (confirm absent):**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name = 'accord_meeting_outcomes';
```
Expected: zero rows. If the table exists, halt and surface before proceeding.

**V3 — Center column tabbody selector in live DOM:**
```javascript
document.querySelector('.ac-col-tabbody[data-col="center"]')?.className;
```
Confirm the selector resolves correctly after C-01 and C-02 landed.

**V4 — `accord_meetings.state` values in production (carry-forward from prior CMDs):**
Confirmed: `idle | running | closed`. Trigger gates on `state <> 'idle'`. No re-verification needed — document as carry-forward in close-out.

Report V1–V3 in close-out.

---

## §3 — Substrate: `accord_meeting_outcomes` table

```sql
-- Migration: 2026-05-09_accord_meeting_outcomes.sql
-- C-03 · CMD-ACCORD-SETUP-OUTCOMES-1

CREATE TABLE accord_meeting_outcomes (
  outcome_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id             UUID        NOT NULL REFERENCES firms(id),
  meeting_id          UUID        NOT NULL REFERENCES accord_meetings(meeting_id) ON DELETE CASCADE,
  verb                TEXT        NOT NULL,
  description         TEXT        NOT NULL DEFAULT '',
  owner_resource_id   UUID        NULL REFERENCES resources(<pk_per_V1>),
  condition           TEXT        NULL,
  status              TEXT        NOT NULL DEFAULT 'open'
                                  CHECK (status IN ('open','achieved','partial','carried','abandoned')),
  position            INTEGER     NOT NULL DEFAULT 0,
  resolved_at         TIMESTAMPTZ NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID        NULL REFERENCES users(id)
);

COMMENT ON TABLE accord_meeting_outcomes IS
  'Pre-meeting outcome commitments. Each row is one discrete '
  'outcome the meeting intends to achieve. Authored during Setup '
  'shell (state=idle); immutable once meeting starts (state=running). '
  'C-03 CMD-ACCORD-SETUP-OUTCOMES-1.';
```

**Substitute actual PK name from V1 in the `owner_resource_id` REFERENCES clause.**

### §3.1 — CHECK constraint on verb

```sql
ALTER TABLE accord_meeting_outcomes
  ADD CONSTRAINT accord_meeting_outcomes_verb_check
  CHECK (verb IN ('RESOLVE','SEAL','DECIDE','ASSIGN','DEFER','INFORM'));
```

### §3.2 — RLS policies

```sql
ALTER TABLE accord_meeting_outcomes ENABLE ROW LEVEL SECURITY;

-- SELECT: firm-wide readable
CREATE POLICY accord_meeting_outcomes_select ON accord_meeting_outcomes
  FOR SELECT USING (firm_id = my_firm_id());

-- INSERT: organizer only (firm-scoped)
CREATE POLICY accord_meeting_outcomes_insert ON accord_meeting_outcomes
  FOR INSERT WITH CHECK (
    firm_id = my_firm_id()
    AND EXISTS (
      SELECT 1 FROM accord_meetings m
      WHERE m.meeting_id = accord_meeting_outcomes.meeting_id
        AND m.organizer_id = auth.uid()
        AND m.state = 'idle'
    )
  );

-- UPDATE: organizer only, meeting must be idle
-- IR73: state-machine semantics on status column — disjoint policies per transition
-- status transitions: open→achieved, open→partial, open→carried, open→abandoned
-- For Phase 1 (pre-meeting): status stays 'open'; only verb/description/owner/position editable.
-- Ratification transitions (X-03) will add per-transition UPDATE policies.
-- Single permissive UPDATE policy for now (status=open only):
CREATE POLICY accord_meeting_outcomes_update ON accord_meeting_outcomes
  FOR UPDATE
  USING (
    firm_id = my_firm_id()
    AND status = 'open'
    AND EXISTS (
      SELECT 1 FROM accord_meetings m
      WHERE m.meeting_id = accord_meeting_outcomes.meeting_id
        AND m.organizer_id = auth.uid()
        AND m.state = 'idle'
    )
  )
  WITH CHECK (
    firm_id = my_firm_id()
    AND status = 'open'
  );

-- DELETE: organizer only, meeting must be idle
CREATE POLICY accord_meeting_outcomes_delete ON accord_meeting_outcomes
  FOR DELETE USING (
    firm_id = my_firm_id()
    AND EXISTS (
      SELECT 1 FROM accord_meetings m
      WHERE m.meeting_id = accord_meeting_outcomes.meeting_id
        AND m.organizer_id = auth.uid()
        AND m.state = 'idle'
    )
  );
```

**IR73 note:** `status` is a state-machine column. The single UPDATE policy above gates on `status = 'open'` which is appropriate for the pre-meeting prep phase (all outcomes start open; none transition during Setup). X-03 (Outcome Ratification CMD) will add disjoint per-transition UPDATE policies for the post-meeting close flow per IR73 canon. Document this in close-out.

### §3.3 — State-gate trigger

Outcomes are immutable once the meeting starts. Gate via trigger on `accord_meeting_outcomes` — check parent meeting state on any INSERT or UPDATE:

```sql
CREATE OR REPLACE FUNCTION accord_meeting_outcomes_state_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state TEXT;
BEGIN
  SELECT state INTO v_state
  FROM accord_meetings
  WHERE meeting_id = NEW.meeting_id;

  IF v_state IS DISTINCT FROM 'idle' THEN
    RAISE EXCEPTION
      'accord_meeting_outcomes are immutable once meeting has started (state=%)',
      v_state USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER accord_meeting_outcomes_state_gate_trg
  BEFORE INSERT OR UPDATE ON accord_meeting_outcomes
  FOR EACH ROW
  EXECUTE FUNCTION accord_meeting_outcomes_state_gate();
```

**Verification:**
```sql
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'accord_meeting_outcomes';
```
Expected: two rows (INSERT + UPDATE), both BEFORE.

---

## §4 — `accord-views.js` amendment

No changes needed. The meeting object already contains all fields needed for the Outcomes block. The Outcomes block fetches its own data via `API.get('accord_meeting_outcomes?...')`.

---

## §5 — Outcomes block render

### §5.1 — Entry point

Called from `AccordMeetingSetup.render()` after shell HTML is written, targeting the center column tabbody:

```javascript
function _renderOutcomes(meeting, workstreamId) {
  var host = document.querySelector('.ac-col-tabbody[data-col="center"]');
  if (!host) return;

  // Insert outcomes container above the existing agenda placeholder
  var existing = host.innerHTML;
  host.innerHTML = '<div class="ac-outcomes-block" id="ac-outcomes-block"></div>' + existing;

  _loadOutcomes(meeting);
}
```

IR71: `host` re-queried at call time. The outcomes container is prepended; the existing agenda placeholder is preserved.

### §5.2 — Load and paint

```javascript
var _outcomesAborted = false;

function _loadOutcomes(meeting) {
  _outcomesAborted = false;
  var block = document.getElementById('ac-outcomes-block');
  if (!block) return;
  block.innerHTML = '<div class="ac-outcomes-loading">Loading…</div>';

  API.get(
    'accord_meeting_outcomes?meeting_id=eq.' + meeting.meeting_id +
    '&order=position.asc,created_at.asc' +
    '&select=*'
  ).then(function(rows) {
    if (_outcomesAborted) return;
    var block = document.getElementById('ac-outcomes-block');
    if (!block) return;
    _paintOutcomes(block, rows || [], meeting);
  }).catch(function(e) {
    console.error('[AccordMeetingSetup] outcomes fetch failed', e);
    var block = document.getElementById('ac-outcomes-block');
    if (block) block.innerHTML = '<div class="ac-outcomes-error">Could not load outcomes.</div>';
  });
}
```

### §5.3 — Paint

```javascript
function _paintOutcomes(block, outcomes, meeting) {
  var isRunning = meeting.state !== 'idle';
  var html = '<div class="ac-outcomes-header">';
  html += '<span class="ac-outcomes-label">INTENDED OUTCOMES</span>';
  if (!isRunning) {
    html += '<button class="ac-outcomes-add-btn" data-action="add-outcome">+ Add outcome</button>';
  }
  html += '</div>';
  html += '<div class="ac-outcomes-list" id="ac-outcomes-list">';

  if (!outcomes.length) {
    html += '<div class="ac-outcomes-empty">No outcomes defined. Add one to set the meeting\'s intent.</div>';
  } else {
    outcomes.forEach(function(o) {
      html += _outcomeRowHtml(o, isRunning);
    });
  }

  html += '</div>';

  // Add-outcome form (hidden by default)
  if (!isRunning) {
    html += _addOutcomeFormHtml();
  }

  block.innerHTML = html;
  _wireOutcomeEvents(block, outcomes, meeting);
}
```

### §5.4 — Outcome row HTML

```javascript
function _outcomeRowHtml(outcome, isRunning) {
  var verbClass = 'ac-verb-' + outcome.verb.toLowerCase();
  var html = '<div class="ac-outcome-row" data-outcome-id="' + esc(outcome.outcome_id) + '">';

  // Verb chip
  html += '<span class="ac-outcome-verb ' + verbClass + '">' + esc(outcome.verb) + '</span>';

  // Description (editable if idle)
  if (isRunning) {
    html += '<span class="ac-outcome-desc">' + esc(outcome.description) + '</span>';
  } else {
    html += '<span class="ac-outcome-desc ac-outcome-desc--editable" ' +
            'contenteditable="true" spellcheck="false">' +
            esc(outcome.description) + '</span>';
  }

  // Owner chip (display only in v1; C-11 wires percolation)
  if (outcome.owner_resource_id && outcome._owner_name) {
    html += '<span class="ac-outcome-owner">' + esc(outcome._owner_name) + '</span>';
  }

  // Condition (DEFER type)
  if (outcome.condition) {
    html += '<span class="ac-outcome-condition">if ' + esc(outcome.condition) + '</span>';
  }

  // Controls (idle only)
  if (!isRunning) {
    html += '<div class="ac-outcome-controls">';
    html += '<button class="ac-outcome-btn" data-action="move-up" title="Move up">▲</button>';
    html += '<button class="ac-outcome-btn" data-action="move-down" title="Move down">▼</button>';
    html += '<button class="ac-outcome-btn ac-outcome-btn--delete" data-action="delete" title="Remove">×</button>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}
```

**Owner name resolution:** `accord_meeting_outcomes` stores `owner_resource_id`. The `select=*` query does not join `resources`. Resolve names in a single follow-up fetch after the outcomes load:

```javascript
function _resolveOwnerNames(outcomes, callback) {
  var ids = outcomes
    .filter(function(o) { return o.owner_resource_id; })
    .map(function(o) { return o.owner_resource_id; });

  if (!ids.length) { callback(outcomes); return; }

  API.get(
    'resources?<pk_per_V1>=in.(' + ids.join(',') + ')' +
    '&select=<pk_per_V1>,<name_col_per_V1>'
  ).then(function(rows) {
    var nameMap = {};
    (rows || []).forEach(function(r) { nameMap[r['<pk_per_V1>']] = r['<name_col_per_V1>']; });
    outcomes.forEach(function(o) {
      if (o.owner_resource_id) o._owner_name = nameMap[o.owner_resource_id] || null;
    });
    callback(outcomes);
  }).catch(function() { callback(outcomes); });
}
```

Call `_resolveOwnerNames` between fetch and paint:

```javascript
API.get('accord_meeting_outcomes?...').then(function(rows) {
  if (_outcomesAborted) return;
  _resolveOwnerNames(rows || [], function(resolved) {
    if (_outcomesAborted) return;
    var block = document.getElementById('ac-outcomes-block');
    if (!block) return;
    _paintOutcomes(block, resolved, meeting);
  });
});
```

**Substitute actual column names from V1 throughout.**

### §5.5 — Add-outcome form HTML

```javascript
function _addOutcomeFormHtml() {
  return [
    '<div class="ac-outcome-form" id="ac-outcome-form" style="display:none;">',
      '<div class="ac-outcome-form-row">',
        '<select class="ac-outcome-verb-select" id="ac-outcome-verb-select">',
          '<option value="">Verb…</option>',
          '<option value="RESOLVE">RESOLVE</option>',
          '<option value="SEAL">SEAL</option>',
          '<option value="DECIDE">DECIDE</option>',
          '<option value="ASSIGN">ASSIGN</option>',
          '<option value="DEFER">DEFER</option>',
          '<option value="INFORM">INFORM</option>',
        '</select>',
        '<input class="ac-outcome-desc-input" id="ac-outcome-desc-input" ',
               'type="text" placeholder="Describe the outcome…" autocomplete="off">',
      '</div>',
      '<div class="ac-outcome-form-actions">',
        '<button class="ac-outcome-form-submit btn btn-signal" id="ac-outcome-submit">Add</button>',
        '<button class="ac-outcome-form-cancel btn btn-ghost" id="ac-outcome-cancel">Cancel</button>',
      '</div>',
    '</div>'
  ].join('');
}
```

Owner assignment deferred to v2 — complexity of a resource picker is out of scope for Wave 1. Outcomes created without an owner in v1.

### §5.6 — Event wiring

Single event delegation on `block`:

```javascript
function _wireOutcomeEvents(block, outcomes, meeting) {
  block.addEventListener('click', function(ev) {
    var action = ev.target.dataset.action ||
                 ev.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'add-outcome')  { _showAddForm(block); return; }
    if (action === 'ac-outcome-submit') { _submitOutcome(block, meeting); return; }
    if (action === 'ac-outcome-cancel') { _hideAddForm(block); return; }

    var row = ev.target.closest('.ac-outcome-row');
    if (!row) return;
    var outcomeId = row.dataset.outcomeId;

    if (action === 'delete')    { _deleteOutcome(outcomeId, block, outcomes, meeting); return; }
    if (action === 'move-up')   { _moveOutcome(outcomeId, -1, outcomes, meeting); return; }
    if (action === 'move-down') { _moveOutcome(outcomeId,  1, outcomes, meeting); return; }
  });

  // Description inline edit — debounced PATCH on input
  block.addEventListener('input', function(ev) {
    var desc = ev.target.closest('.ac-outcome-desc--editable');
    if (!desc) return;
    var row = desc.closest('.ac-outcome-row');
    if (!row) return;
    var outcomeId = row.dataset.outcomeId;
    _debouncedDescPatch(outcomeId, desc.textContent.trim(), meeting);
  });
}
```

### §5.7 — CRUD operations

**Add:**
```javascript
function _submitOutcome(block, meeting) {
  var verb  = document.getElementById('ac-outcome-verb-select')?.value;
  var desc  = document.getElementById('ac-outcome-desc-input')?.value.trim();
  if (!verb || !desc) return;

  var list = block.querySelector('#ac-outcomes-list');
  var pos  = list ? list.querySelectorAll('.ac-outcome-row').length : 0;

  API.post('accord_meeting_outcomes', {
    firm_id:    meeting.firm_id,
    meeting_id: meeting.meeting_id,
    verb:       verb,
    description: desc,
    position:   pos,
    status:     'open'
  }).then(function() {
    _hideAddForm(block);
    _loadOutcomes(meeting);
  }).catch(function(e) {
    console.error('[AccordMeetingSetup] add outcome failed', e);
  });
}
```

**Delete:**
```javascript
function _deleteOutcome(outcomeId, block, outcomes, meeting) {
  API.del('accord_meeting_outcomes?outcome_id=eq.' + outcomeId)
    .then(function() { _loadOutcomes(meeting); })
    .catch(function(e) {
      console.error('[AccordMeetingSetup] delete outcome failed', e);
    });
}
```

**Reorder:** swap `position` values of target and neighbor. Sequential PATCHes (not Promise.all — shared-state write antipattern):

```javascript
function _moveOutcome(outcomeId, direction, outcomes, meeting) {
  var idx = outcomes.findIndex(function(o) { return o.outcome_id === outcomeId; });
  if (idx === -1) return;
  var swapIdx = idx + direction;
  if (swapIdx < 0 || swapIdx >= outcomes.length) return;

  var a = outcomes[idx];
  var b = outcomes[swapIdx];

  API.patch('accord_meeting_outcomes?outcome_id=eq.' + a.outcome_id, { position: b.position })
    .then(function() {
      return API.patch('accord_meeting_outcomes?outcome_id=eq.' + b.outcome_id, { position: a.position });
    })
    .then(function() { _loadOutcomes(meeting); })
    .catch(function(e) {
      console.error('[AccordMeetingSetup] reorder outcome failed', e);
      _loadOutcomes(meeting);   // restore consistent state
    });
}
```

**Description PATCH (debounced):**
```javascript
var _descPatchTimers = {};

function _debouncedDescPatch(outcomeId, desc, meeting) {
  if (_descPatchTimers[outcomeId]) clearTimeout(_descPatchTimers[outcomeId]);
  _descPatchTimers[outcomeId] = setTimeout(function() {
    API.patch('accord_meeting_outcomes?outcome_id=eq.' + outcomeId, { description: desc })
      .catch(function(e) {
        console.error('[AccordMeetingSetup] desc patch failed', e);
      });
  }, 800);
}
```

### §5.8 — Show/hide add form

```javascript
function _showAddForm(block) {
  var form = block.querySelector('#ac-outcome-form');
  var btn  = block.querySelector('[data-action="add-outcome"]');
  if (form) form.style.display = '';
  if (btn)  btn.style.display  = 'none';
  var input = block.querySelector('#ac-outcome-desc-input');
  if (input) input.focus();
}

function _hideAddForm(block) {
  var form  = block.querySelector('#ac-outcome-form');
  var btn   = block.querySelector('[data-action="add-outcome"]');
  var verb  = block.querySelector('#ac-outcome-verb-select');
  var input = block.querySelector('#ac-outcome-desc-input');
  if (form)  form.style.display  = 'none';
  if (btn)   btn.style.display   = '';
  if (verb)  verb.value          = '';
  if (input) input.value         = '';
}
```

---

## §6 — Teardown additions

```javascript
// In teardown():
_outcomesAborted = true;
Object.keys(_descPatchTimers).forEach(function(k) {
  if (_descPatchTimers[k]) clearTimeout(_descPatchTimers[k]);
});
_descPatchTimers = {};
```

---

## §7 — CSS

All styles inside `.ac-setup-shell`. Token prefix `--ac-*` only.

```css
/* ── Outcomes block ─────────────────────────────────── */
.ac-outcomes-block {
  padding: 14px 18px 10px 18px;
  border-bottom: 1px solid var(--ac-border-subtle);
}
.ac-outcomes-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}
.ac-outcomes-label {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-tertiary);
  letter-spacing: 1.4px;
  text-transform: uppercase;
}
.ac-outcomes-add-btn {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-cyan);
  background: none;
  border: none;
  cursor: pointer;
  letter-spacing: 0.8px;
  padding: 0;
}
.ac-outcomes-add-btn:hover { text-decoration: underline; }
.ac-outcomes-empty {
  font-size: 12px;
  color: var(--ac-text-tertiary);
  font-style: italic;
  padding: 6px 0;
}

/* ── Outcome row ────────────────────────────────────── */
.ac-outcome-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px solid var(--ac-border-subtle);
}
.ac-outcome-row:last-child { border-bottom: none; }

/* Verb chip */
.ac-outcome-verb {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  padding: 3px 7px;
  border-radius: 3px;
  flex-shrink: 0;
}
.ac-verb-resolve  { background: var(--ac-rose-dim);   color: var(--ac-rose);   }
.ac-verb-seal     { background: var(--ac-cyan-dim);   color: var(--ac-cyan);   }
.ac-verb-decide   { background: var(--ac-cyan-dim);   color: var(--ac-cyan);   }
.ac-verb-assign   { background: var(--ac-amber-dim);  color: var(--ac-amber);  }
.ac-verb-defer    { background: var(--ac-violet-dim); color: var(--ac-violet); }
.ac-verb-inform   { background: rgba(255,255,255,0.06); color: var(--ac-text-tertiary); }

/* Description */
.ac-outcome-desc {
  flex: 1;
  font-size: 12.5px;
  color: var(--ac-text-primary);
  line-height: 1.4;
  min-width: 0;
  outline: none;
}
.ac-outcome-desc--editable { cursor: text; }
.ac-outcome-desc--editable:focus {
  background: var(--ac-bg-pane);
  border-radius: 3px;
  padding: 1px 4px;
  margin: -1px -4px;
}

/* Owner chip */
.ac-outcome-owner {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-secondary);
  background: var(--ac-bg-tile);
  border: 1px solid var(--ac-border-subtle);
  border-radius: 10px;
  padding: 2px 8px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Condition */
.ac-outcome-condition {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-violet);
  flex-shrink: 0;
}

/* Controls */
.ac-outcome-controls {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
}
.ac-outcome-btn {
  font-size: 10px;
  color: var(--ac-text-faint);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  line-height: 1;
}
.ac-outcome-btn:hover { color: var(--ac-text-secondary); background: var(--ac-bg-tile); }
.ac-outcome-btn--delete:hover { color: var(--ac-rose); }

/* ── Add-outcome form ───────────────────────────────── */
.ac-outcome-form {
  padding: 10px 0 4px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ac-outcome-form-row { display: flex; gap: 8px; align-items: center; }
.ac-outcome-verb-select {
  font-family: var(--ac-font-mono);
  font-size: 10px;
  background: var(--ac-bg-tile);
  color: var(--ac-text-primary);
  border: 1px solid var(--ac-border-mid);
  border-radius: 4px;
  padding: 5px 8px;
  flex-shrink: 0;
  cursor: pointer;
}
.ac-outcome-desc-input {
  flex: 1;
  font-size: 12px;
  background: var(--ac-bg-tile);
  color: var(--ac-text-primary);
  border: 1px solid var(--ac-border-mid);
  border-radius: 4px;
  padding: 5px 10px;
  outline: none;
}
.ac-outcome-desc-input:focus { border-color: var(--ac-border-active); }
.ac-outcome-form-actions { display: flex; gap: 8px; }
```

---

## §8 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Open idle meeting with no outcomes | Outcomes block renders above agenda placeholder. "INTENDED OUTCOMES" label. "+ Add outcome" button. Empty-state message. |
| 2 | Add outcome: RESOLVE + description | Form submits. Outcome row renders with RESOLVE chip (rose) + description text. Re-fetch shows persisted row. |
| 3 | Add outcome: DEFER + description | DEFER chip (violet) renders correctly. |
| 4 | Edit description inline | Type in description field. Wait 800ms. PATCH fires. Reload → updated text persists. |
| 5 | Reorder via ▲ / ▼ | Items swap positions. Re-fetch confirms new order. First item ▲ disabled; last item ▼ disabled. |
| 6 | Delete an outcome | Row removed. Re-fetch confirms row absent. |
| 7 | Substrate state-gate (trigger) | In Supabase SQL editor: insert a row for a running meeting → `ERROR: accord_meeting_outcomes are immutable once meeting has started`. |
| 8 | Running meeting (state='running') | Outcomes block renders in read-only mode — no add button, no controls, no contenteditable on descriptions. |

---

## §9 — Files manifest

| File | Change |
|---|---|
| `accord_meeting_outcomes` (Supabase) | New table + RLS + trigger |
| `accord-meeting-setup.js` | `_renderOutcomes()`; `_loadOutcomes()`; `_paintOutcomes()`; CRUD functions; teardown additions |
| `accord-meeting-setup.css` | Outcomes block + row + form styles |
| `accord-views.js` | No changes |
| `version.js` | Operator-managed (IR65) |

---

## §10 — Discipline checklist

- `var` only
- IR73: `status` UPDATE policy gates on `status = 'open'` only; X-03 adds per-transition policies at ratification time; document in close-out
- IR71: `block` and `host` re-queried after async; `_outcomesAborted` checked before paint
- Sequential PATCHes for reorder (not Promise.all)
- `Promise.all` for owner name fetch + outcomes fetch — safe; both are independent reads
- `_descPatchTimers` and `_outcomesAborted` cleared in `teardown()`
- Owner name column names substituted from V1 finding — not hardcoded before verification
- `firm_id` on INSERT sourced from `meeting.firm_id` — verify present on meeting object (confirmed in C-02 select list; document in close-out)
- `--ac-*` token prefix throughout; no production Accord tokens
- Verb CHECK constraint vocabulary matches the six chips in `_addOutcomeFormHtml` exactly

---

**Halt-and-surface after §8. Close-out must include: V1 resource table findings, updated column list confirmation, IR73 note on status policies, trigger verification result.**

**After seal: C-04 · CMD-ACCORD-SETUP-ATTENDEES-1 is unblocked.**

---

*End Commission · C-03 · CMD-ACCORD-SETUP-OUTCOMES-1.*
