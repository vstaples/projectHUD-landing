# Commission · CMD-ACCORD-SETUP-HEADER-1

**Phase:** 2 of Wave 1 — Header zone content
**Authored:** 2026-05-09
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Accord Meeting Setup Shell — Requirements Specification v1.0 §3, §12
**Predecessor:** CMD-ACCORD-SETUP-LAYOUT-1 sealed
**Successor:** CMD-ACCORD-SETUP-OUTCOMES-1 (blocked on this CMD)
**Coding agent:** execute sequentially; halt-and-surface after §8

---

## §1 — Scope

Wire the `.ac-setup-header` zone established in CMD-ACCORD-SETUP-LAYOUT-1. The header zone currently renders a placeholder. This CMD replaces it with the full header content.

**Deliverables:**
1. Meeting title — large serif, contenteditable, PATCH on blur
2. Stakes field — cyan-labeled, italic serif, contenteditable, PATCH on blur; new `stakes` column migration
3. Schedule metadata — WHEN / WHERE / WORKSTREAM / STARTS IN — right-aligned
4. WHERE field — new `location` column migration; inline editable
5. FOLLOW-UP / FIRST-EVER toggle — derived, read-only
6. STARTS IN countdown — amber pulse, shown within 24h of `scheduled_for`
7. State-gate trigger — `stakes` and `location` immutable once `state='running'`
8. All 9 smoke tests pass

**What does NOT ship in this CMD:**
- Outcomes block (CMD-ACCORD-SETUP-OUTCOMES-1)
- Any column content
- Footer or filmstrip content
- Save & invite button wiring

---

## §2 — Substrate amendments (deploy before UI)

Two column additions and one trigger amendment.

```sql
-- Migration: 2026-05-09_accord_meetings_header_fields.sql
-- CMD-ACCORD-SETUP-HEADER-1

ALTER TABLE accord_meetings
  ADD COLUMN stakes   TEXT NULL,
  ADD COLUMN location TEXT NULL;

COMMENT ON COLUMN accord_meetings.stakes IS
  'Operator-authored field: what is at risk in this meeting. '
  'Distinct from intended_outcome/outcomes (commitments). '
  'Editable while state=''idle''; immutable once running. '
  'CMD-ACCORD-SETUP-HEADER-1.';

COMMENT ON COLUMN accord_meetings.location IS
  'Where the meeting takes place (room, video link, etc.). '
  'Editable while state=''idle''; immutable once running. '
  'CMD-ACCORD-SETUP-HEADER-1.';
```

**Verification:**
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'accord_meetings'
  AND column_name IN ('stakes', 'location')
ORDER BY column_name;
```

### §2.1 — State-gate trigger amendment

The existing `accord_meetings_briefing_text_gate` trigger (from CMD-ACCORD-MEETING-SETUP-1 Phase 2) gates `briefing_text` only. Amend it to also gate `stakes` and `location` using the same pattern — immutable once `state <> 'idle'`, organizer-only write.

Replace the existing trigger function:

```sql
CREATE OR REPLACE FUNCTION accord_meetings_field_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- briefing_text gate (existing)
  IF NEW.briefing_text IS DISTINCT FROM OLD.briefing_text THEN
    IF OLD.state <> 'idle' THEN
      RAISE EXCEPTION 'briefing_text is immutable once meeting has started (state=%)',
        OLD.state USING ERRCODE = 'P0001';
    END IF;
    IF auth.uid() <> OLD.organizer_id THEN
      RAISE EXCEPTION 'briefing_text may only be edited by the meeting organizer'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- stakes gate (new)
  IF NEW.stakes IS DISTINCT FROM OLD.stakes THEN
    IF OLD.state <> 'idle' THEN
      RAISE EXCEPTION 'stakes is immutable once meeting has started (state=%)',
        OLD.state USING ERRCODE = 'P0001';
    END IF;
    IF auth.uid() <> OLD.organizer_id THEN
      RAISE EXCEPTION 'stakes may only be edited by the meeting organizer'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- location gate (new — any firm member may set location, but not once running)
  IF NEW.location IS DISTINCT FROM OLD.location THEN
    IF OLD.state <> 'idle' THEN
      RAISE EXCEPTION 'location is immutable once meeting has started (state=%)',
        OLD.state USING ERRCODE = 'P0001';
    END IF;
    -- No organizer restriction on location — collaborative scheduling
  END IF;

  RETURN NEW;
END;
$$;
```

Drop the old trigger and create a new one pointing to the renamed function:

```sql
DROP TRIGGER IF EXISTS accord_meetings_briefing_text_gate_trg ON accord_meetings;

CREATE TRIGGER accord_meetings_field_gate_trg
  BEFORE UPDATE ON accord_meetings
  FOR EACH ROW
  EXECUTE FUNCTION accord_meetings_field_gate();
```

**Verification:**
```sql
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'accord_meetings'
  AND trigger_name = 'accord_meetings_field_gate_trg';
```

Do not proceed to UI work until trigger row returns.

---

## §3 — `accord-views.js` amendment

Add `stakes` and `location` to the `accord_meetings` select query in `renderMeetingView`. The select was last extended in CMD-ACCORD-MEETING-SETUP-1 Phase 4 to add `briefing_text` and Phase 7 to add `duration_minutes`. Add both new columns to that same list.

Document the updated column list in close-out.

---

## §4 — Header HTML structure

Replace the `.ac-setup-header` placeholder with:

```html
<div class="ac-setup-header">

  <div class="ac-header-left">

    <!-- Meeting title -->
    <div class="ac-header-title"
         contenteditable="true"
         spellcheck="false"
         data-field="title"
         id="ac-meeting-title"></div>

    <!-- Stakes field -->
    <div class="ac-header-stakes-block">
      <span class="ac-header-stakes-label">STAKES</span>
      <div class="ac-header-stakes"
           contenteditable="true"
           spellcheck="false"
           data-field="stakes"
           id="ac-meeting-stakes"
           data-placeholder="What is at risk in this meeting…"></div>
    </div>

  </div>

  <div class="ac-header-right">

    <!-- FOLLOW-UP / FIRST-EVER toggle -->
    <div class="ac-header-mode-toggle">
      <span class="ac-mode-tab" id="ac-mode-followup">FOLLOW-UP</span>
      <span class="ac-mode-tab" id="ac-mode-firstever">FIRST-EVER</span>
    </div>

    <!-- Schedule metadata -->
    <div class="ac-header-meta">
      <div class="ac-meta-row">
        <span class="ac-meta-label">WHEN</span>
        <span class="ac-meta-value" id="ac-meta-when">—</span>
      </div>
      <div class="ac-meta-row">
        <span class="ac-meta-label">WHERE</span>
        <span class="ac-meta-value ac-meta-editable"
              contenteditable="true"
              spellcheck="false"
              data-field="location"
              id="ac-meta-where"
              data-placeholder="Add location…"></span>
      </div>
      <div class="ac-meta-row">
        <span class="ac-meta-label">WORKSTREAM</span>
        <span class="ac-meta-value" id="ac-meta-workstream">—</span>
      </div>
      <div class="ac-meta-row" id="ac-meta-starts-row" style="display:none;">
        <span class="ac-pulse-dot"></span>
        <span class="ac-meta-value ac-meta-starts" id="ac-meta-starts">—</span>
      </div>
    </div>

  </div>

</div>
```

---

## §5 — Header render function

Called from `AccordMeetingSetup.render()` after the shell HTML is written:

```javascript
function _renderHeader(meeting, workstreamId) {
  _paintTitle(meeting);
  _paintStakes(meeting);
  _paintMeta(meeting, workstreamId);
  _paintModeToggle(meeting, workstreamId);
  _wireHeaderEdits(meeting);
  _startCountdown(meeting);
}
```

### §5.1 — Title

```javascript
function _paintTitle(meeting) {
  var el = document.getElementById('ac-meeting-title');
  if (!el) return;
  el.textContent = meeting.title || '';
}
```

### §5.2 — Stakes

```javascript
function _paintStakes(meeting) {
  var el = document.getElementById('ac-meeting-stakes');
  if (!el) return;
  if (meeting.stakes) {
    el.textContent = meeting.stakes;
    el.classList.remove('ac-placeholder');
  } else {
    el.textContent = '';
    el.classList.add('ac-placeholder');
  }
}
```

Placeholder text rendered via CSS `::before` pseudo-element using `data-placeholder` attribute — not via JS innerHTML. This keeps the contenteditable clean.

### §5.3 — Meta row: WHEN

Format `scheduled_for` + `duration_minutes`:

```javascript
function _paintMeta(meeting, workstreamId) {
  var whenEl = document.getElementById('ac-meta-when');
  if (whenEl) {
    var when = _fmtWhen(meeting.scheduled_for, meeting.duration_minutes);
    whenEl.textContent = when;
  }

  var whereEl = document.getElementById('ac-meta-where');
  if (whereEl) {
    if (meeting.location) {
      whereEl.textContent = meeting.location;
      whereEl.classList.remove('ac-placeholder');
    } else {
      whereEl.textContent = '';
      whereEl.classList.add('ac-placeholder');
    }
  }

  _paintWorkstreamMeta(workstreamId, meeting.meeting_id);
}

function _fmtWhen(scheduledFor, durationMinutes) {
  if (!scheduledFor) return '—';
  var d = new Date(scheduledFor);
  var opts = { weekday: 'short', month: 'short', day: 'numeric' };
  var date = d.toLocaleDateString(undefined, opts);
  var startTime = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (!durationMinutes) return date + ' · ' + startTime;
  var end = new Date(d.getTime() + durationMinutes * 60000);
  var endTime = end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return date + ' · ' + startTime + ' — ' + endTime;
}
```

### §5.4 — Meta row: WORKSTREAM

Fetch workstream name + prior meeting count + days-since-last asynchronously:

```javascript
function _paintWorkstreamMeta(workstreamId, currentMeetingId) {
  var el = document.getElementById('ac-meta-workstream');
  if (!el) return;
  if (!workstreamId) { el.textContent = 'No workstream'; return; }

  Promise.all([
    API.get('workstreams?workstream_id=eq.' + workstreamId + '&select=name&limit=1'),
    API.get(
      'accord_meetings?workstream_id=eq.' + workstreamId +
      '&meeting_id=neq.' + currentMeetingId +
      '&state=in.(closed,sealed)' +
      '&select=meeting_id,sealed_at,scheduled_for' +
      '&order=scheduled_for.desc.nullslast,created_at.desc' +
      '&limit=1'
    )
  ]).then(function(results) {
    var ws      = results[0] && results[0][0];
    var lastMtg = results[1] && results[1][0];
    if (!el) return;                          // IR71: re-check after async
    var name    = ws ? ws.name : 'Unknown workstream';
    var lastStr = '';
    if (lastMtg) {
      var lastDate = new Date(lastMtg.sealed_at || lastMtg.scheduled_for);
      var daysAgo  = Math.round((Date.now() - lastDate.getTime()) / 86400000);
      lastStr = ' · last met ' + daysAgo + 'd ago';
    } else {
      lastStr = ' · first meeting';
    }
    el.textContent = name + lastStr;
  }).catch(function() {
    if (el) el.textContent = '—';
  });
}
```

### §5.5 — FOLLOW-UP / FIRST-EVER toggle

Derived from prior meeting count. Not operator-settable.

```javascript
function _paintModeToggle(meeting, workstreamId) {
  var fuEl = document.getElementById('ac-mode-followup');
  var feEl = document.getElementById('ac-mode-firstever');
  if (!fuEl || !feEl) return;

  if (!workstreamId) {
    // Parking-lot meeting: always FIRST-EVER (no workstream context)
    fuEl.classList.remove('active');
    feEl.classList.add('active');
    return;
  }

  API.get(
    'accord_meetings?workstream_id=eq.' + workstreamId +
    '&meeting_id=neq.' + meeting.meeting_id +
    '&state=in.(closed,sealed)' +
    '&select=meeting_id&limit=1'
  ).then(function(rows) {
    var isFollowUp = rows && rows.length > 0;
    fuEl.classList.toggle('active', isFollowUp);
    feEl.classList.toggle('active', !isFollowUp);
  }).catch(function() {
    fuEl.classList.remove('active');
    feEl.classList.remove('active');
  });
}
```

### §5.6 — STARTS IN countdown

Shown only when `scheduled_for` is within 24h. Updates every 30 seconds.

```javascript
var _countdownTimer = null;

function _startCountdown(meeting) {
  _stopCountdown();
  if (!meeting.scheduled_for) return;

  function _tick() {
    var row = document.getElementById('ac-meta-starts-row');
    var el  = document.getElementById('ac-meta-starts');
    if (!row || !el) { _stopCountdown(); return; }

    var now    = Date.now();
    var target = new Date(meeting.scheduled_for).getTime();
    var diffMs = target - now;

    if (diffMs < 0 || diffMs > 86400000) {
      row.style.display = 'none';
      return;
    }

    row.style.display = '';
    var diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) {
      el.textContent = 'Starting now';
    } else if (diffMin < 60) {
      el.textContent = 'Starts in ' + diffMin + 'min';
    } else {
      var h = Math.floor(diffMin / 60);
      var m = diffMin % 60;
      el.textContent = 'Starts in ' + h + 'h' + (m ? ' ' + m + 'min' : '');
    }

    // 5-minute warning: rose color
    el.classList.toggle('ac-meta-starts--imminent', diffMin <= 5);
  }

  _tick();
  _countdownTimer = setInterval(_tick, 30000);
}

function _stopCountdown() {
  if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
}
```

`_stopCountdown()` called in `teardown()`.

---

## §6 — Edit wiring (contenteditable PATCHes)

All three contenteditable fields (title, stakes, location) share a single debounced PATCH pattern. One 800ms debounce timer per field, keyed by field name.

```javascript
var _headerSaveTimers = {};

function _wireHeaderEdits(meeting) {
  var fields = [
    { id: 'ac-meeting-title',  col: 'title',    organizer_only: false },
    { id: 'ac-meeting-stakes', col: 'stakes',   organizer_only: true  },
    { id: 'ac-meta-where',     col: 'location', organizer_only: false },
  ];

  fields.forEach(function(f) {
    var el = document.getElementById(f.id);
    if (!el) return;

    el.addEventListener('input', function() {
      var val = el.textContent.trim();

      // Placeholder toggle
      if (el.dataset.placeholder) {
        el.classList.toggle('ac-placeholder', !val);
      }

      // Debounce PATCH
      if (_headerSaveTimers[f.col]) clearTimeout(_headerSaveTimers[f.col]);
      _headerSaveTimers[f.col] = setTimeout(function() {
        var body = {};
        body[f.col] = val || null;
        API.patch('accord_meetings?meeting_id=eq.' + meeting.meeting_id, body)
          .catch(function(e) {
            console.error('[AccordMeetingSetup] header PATCH failed (' + f.col + ')', e);
          });
      }, 800);
    });

    el.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter' && f.id === 'ac-meeting-title') {
        ev.preventDefault();   // title is single-line
        el.blur();
      }
    });

    // On blur: immediate save, cancel debounce
    el.addEventListener('blur', function() {
      if (_headerSaveTimers[f.col]) {
        clearTimeout(_headerSaveTimers[f.col]);
        _headerSaveTimers[f.col] = null;
      }
      var val = el.textContent.trim();
      var body = {};
      body[f.col] = val || null;
      API.patch('accord_meetings?meeting_id=eq.' + meeting.meeting_id, body)
        .catch(function(e) {
          console.error('[AccordMeetingSetup] header blur PATCH failed (' + f.col + ')', e);
        });
    });
  });
}
```

IR71: `el` captured inside `forEach` closure at wire time — synchronous, no async mutation risk.

### §6.1 — Teardown

```javascript
// In teardown():
Object.keys(_headerSaveTimers).forEach(function(k) {
  if (_headerSaveTimers[k]) clearTimeout(_headerSaveTimers[k]);
});
_headerSaveTimers = {};
_stopCountdown();
```

---

## §7 — CSS

All styles scoped inside `.ac-setup-shell`. Token prefix `--ac-*` throughout (no production Accord tokens).

### §7.1 — Header layout

```css
.ac-setup-header {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 18px;
  align-items: start;
  padding: 16px 28px 14px 28px;
  border-bottom: 1px solid var(--ac-border-subtle);
  background: rgba(17, 22, 30, 0.4);
}
.ac-header-left  { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.ac-header-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; }
```

### §7.2 — Title

```css
.ac-header-title {
  font-family: var(--ac-font-serif);
  font-size: 25px;
  font-weight: 500;
  color: var(--ac-text-primary);
  cursor: text;
  border: 1px solid transparent;
  padding: 3px 8px;
  margin-left: -8px;
  border-radius: 6px;
  outline: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ac-header-title:hover,
.ac-header-title:focus {
  border-color: var(--ac-border-mid);
  background: var(--ac-bg-pane);
  white-space: normal;
  overflow: visible;
}
```

### §7.3 — Stakes

```css
.ac-header-stakes-block { display: flex; flex-direction: column; gap: 3px; }
.ac-header-stakes-label {
  font-family: var(--ac-font-mono);
  font-size: 8.5px;
  color: var(--ac-cyan);
  letter-spacing: 1.6px;
  text-transform: uppercase;
}
.ac-header-stakes {
  font-family: var(--ac-font-serif);
  font-size: 13.5px;
  color: var(--ac-text-secondary);
  font-style: italic;
  line-height: 1.5;
  padding-left: 11px;
  border-left: 2px solid var(--ac-cyan-dim);
  cursor: text;
  outline: none;
  max-width: 660px;
}
.ac-header-stakes:hover,
.ac-header-stakes:focus { border-left-color: var(--ac-cyan); }

/* Placeholder via CSS pseudo-element */
.ac-header-stakes.ac-placeholder::before {
  content: attr(data-placeholder);
  color: var(--ac-text-faint);
  font-style: italic;
  pointer-events: none;
}
```

Same placeholder pattern for `.ac-meta-editable.ac-placeholder::before`.

### §7.4 — Mode toggle

```css
.ac-header-mode-toggle {
  display: flex;
  background: var(--ac-bg-pane);
  border: 1px solid var(--ac-border-subtle);
  border-radius: 6px;
  padding: 2px;
}
.ac-mode-tab {
  padding: 5px 11px;
  font-family: var(--ac-font-mono);
  font-size: 9px;
  letter-spacing: 1.3px;
  text-transform: uppercase;
  color: var(--ac-text-tertiary);
  cursor: default;
  border-radius: 4px;
  user-select: none;
}
.ac-mode-tab.active {
  color: var(--ac-cyan);
  background: var(--ac-cyan-dim);
}
```

### §7.5 — Meta rows

```css
.ac-header-meta { display: flex; flex-direction: column; gap: 5px; }
.ac-meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--ac-font-mono);
  font-size: 11px;
  color: var(--ac-text-secondary);
}
.ac-meta-label {
  color: var(--ac-text-tertiary);
  font-size: 9px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  flex-shrink: 0;
}
.ac-meta-editable { cursor: text; outline: none; min-width: 120px; }
.ac-meta-editable:focus { color: var(--ac-text-primary); }

/* STARTS IN row */
.ac-meta-starts { color: var(--ac-amber); }
.ac-meta-starts--imminent { color: var(--ac-rose); }

.ac-pulse-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--ac-amber);
  animation: ac-pulse 2s ease-in-out infinite;
  flex-shrink: 0;
}
@keyframes ac-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(0.85); }
}
```

---

## §8 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Open idle meeting | Header zone renders. Title populated. Stakes field shows placeholder if null. WHEN/WHERE/WORKSTREAM meta rows visible. FOLLOW-UP or FIRST-EVER tab active (not both). |
| 2 | Edit title → wait 800ms | PATCH fires. Reload → title persists. |
| 3 | Edit stakes → wait 800ms | PATCH fires. Reload → stakes text persists with cyan border-left styling. |
| 4 | Edit WHERE inline | PATCH fires for `location`. Reload → location persists. |
| 5 | FOLLOW-UP / FIRST-EVER accuracy | Meeting in a workstream with prior closed/sealed meetings → FOLLOW-UP active. First meeting in workstream or parking-lot → FIRST-EVER active. |
| 6 | WORKSTREAM meta row | Shows workstream name + "last met Xd ago" or "first meeting". Renders without blocking initial paint (two-pass async). |
| 7 | STARTS IN — within 24h | Row visible with correct countdown. Updates on 30s tick. |
| 8 | STARTS IN — outside 24h or no scheduled_for | Row hidden. |
| 9 | Trigger gate | In Supabase SQL editor: `UPDATE accord_meetings SET stakes = 'test' WHERE meeting_id = '<a running meeting id>';` → `ERROR: stakes is immutable once meeting has started`. Same for `location`. |

---

## §9 — Files manifest

| File | Change |
|---|---|
| `accord_meetings` (Supabase) | `stakes` + `location` columns; trigger renamed + amended |
| `accord-views.js` | `stakes`, `location` added to select query |
| `accord-meeting-setup.js` | `_renderHeader()` + sub-functions; `_wireHeaderEdits()`; `_startCountdown()`; teardown additions |
| `accord-meeting-setup.css` | Header zone styles |
| `version.js` | Operator-managed (IR65) |

---

## §10 — Discipline checklist

- `var` only
- IR71: `el` references inside `_wireHeaderEdits` forEach — synchronous closure capture, safe; async callbacks re-query by ID or use closure-captured `el` only where element is guaranteed alive (blur fires before DOM wipe)
- `_headerSaveTimers` cancelled in `teardown()`
- `_countdownTimer` cancelled in `teardown()` via `_stopCountdown()`
- Placeholder via CSS `::before` + `.ac-placeholder` class — no innerHTML manipulation
- `--ac-*` token prefix throughout; no production Accord tokens
- Style Doctrine v1.8 §3.8: mockup v5 palette for Setup shell
- Trigger renamed from `accord_meetings_briefing_text_gate_trg` to `accord_meetings_field_gate_trg` — old trigger dropped first; close-out confirms no orphan triggers remain
- `accord-views.js` select column list documented in close-out

---

**Halt-and-surface after §8. Close-out includes: trigger verification result, updated select column list, FOLLOW-UP/FIRST-EVER accuracy confirmation against at least one of each case.**

**After seal: CMD-ACCORD-SETUP-OUTCOMES-1 is unblocked.**

---

*End Commission · CMD-ACCORD-SETUP-HEADER-1.*
