# Commission · X-14 · CMD-ACCORD-SETUP-WHEN-PICKER-1

**Phase:** Ancillary polish — WHEN row scheduling panel
**Authored:** 2026-05-11
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Operator direction 2026-05-11
**Predecessor:** X-12 sealed (duration inline edit — superseded by this CMD)
**Coding agent:** execute sequentially; halt-and-surface after §9

---

## §1 — Scope

Replace the X-12 duration-only inline edit with a full scheduling panel. Clicking the
WHEN row opens a compact three-field panel anchored below the row:

```
[ May 15, 2026  ▾ ]  [ 3:00 PM  ▾ ]  [ 60 min  ▾ ]  [ ✓ Set ]
```

**Deliverables:**
1. Custom mini calendar (month grid, prev/next nav, day selection)
2. Time dropdown (30-min increments, 6:00 AM — 10:00 PM)
3. Duration dropdown (30 / 45 / 60 / 90 / 120 min + Custom)
4. Single PATCH on ✓ Set — `scheduled_for` (ISO timestamp) + `duration_minutes`
5. WHEN row re-renders on confirm. Footer budget bar re-derives.
6. Escape / outside click dismisses without saving.

**What does NOT ship:**
- Timezone selection (uses browser local timezone for alpha)
- Recurring meeting patterns
- Integration with external calendar (Google/Outlook) — future CMD
- Attendee availability overlay on calendar

**X-12 relationship:** X-12's `_wireDurationEdit`, `_openDurationEdit`, `_saveDurationEdit`,
`_cancelDurationEdit`, `_closeDurationEdit` are replaced entirely by this CMD.
The WHEN row click handler that X-12 added is reused — its body is replaced.

---

## §2 — IR64 verification (before writing any code)

**V1 — Confirm X-12 duration edit functions exist and are replaceable:**
```javascript
console.log('_wireDurationEdit:', typeof _wireDurationEdit);
// Expected: function (X-12 shipped it)
// If undefined — X-12 code is in a closure; locate the WHEN row click handler instead
```

**V2 — Confirm WHEN row structure post X-12:**
```javascript
var whenRow = document.getElementById('ac-meta-when-row');
console.log('when row HTML:', whenRow?.outerHTML?.slice(0, 300));
```
Confirm `ac-meta-when-row` exists with `data-duration-wired` attribute.
Confirm `ac-duration-edit-hint` span is present.

**V3 — Confirm `scheduled_for` format on meeting object:**
```javascript
console.log('scheduled_for:', window.Accord.state.meeting.scheduled_for);
console.log('duration_minutes:', window.Accord.state.meeting.duration_minutes);
```
Need: ISO timestamp format confirmation for PATCH construction.

Report V1–V3 in close-out.

---

## §3 — No substrate changes

`accord_meetings.scheduled_for` (timestamptz) and `accord_meetings.duration_minutes`
(integer) both confirmed in schema inventory. No migrations.

---

## §4 — Module-level picker state

```javascript
var _pickerOpen      = false;
var _pickerDate      = null;   // Date object — currently selected date
var _pickerHour      = 9;      // selected hour (24h)
var _pickerMinute    = 0;      // selected minute (0 or 30)
var _pickerDuration  = 60;     // selected duration in minutes
var _pickerViewYear  = null;   // calendar view year
var _pickerViewMonth = null;   // calendar view month (0–11)
```

---

## §5 — WHEN row wiring (replaces X-12 `_wireDurationEdit`)

```javascript
function _wireWhenPicker(meeting) {
  var whenRow = document.getElementById('ac-meta-when-row');
  if (!whenRow || whenRow.dataset.whenPickerWired) return;
  whenRow.dataset.whenPickerWired = '1';

  // Remove X-12 duration wired flag if present
  delete whenRow.dataset.durationWired;

  // Update hint text
  var hint = document.getElementById('ac-duration-hint');
  if (hint) hint.textContent = 'click to schedule';

  whenRow.addEventListener('click', function(ev) {
    if (ev.target.closest('#ac-when-picker')) return;
    if (ev.target.closest('[data-action="save-duration"]') ||
        ev.target.closest('[data-action="cancel-duration"]')) return;
    _toggleWhenPicker(meeting);
  });
}

function _toggleWhenPicker(meeting) {
  if (_pickerOpen) {
    _closeWhenPicker();
  } else {
    _openWhenPicker(meeting);
  }
}
```

---

## §6 — Open / close picker

```javascript
function _openWhenPicker(meeting) {
  _pickerOpen = true;

  // Seed state from current meeting values
  if (meeting.scheduled_for) {
    _pickerDate   = new Date(meeting.scheduled_for);
    _pickerHour   = _pickerDate.getHours();
    _pickerMinute = _pickerDate.getMinutes() >= 30 ? 30 : 0;
  } else {
    // Default: next weekday at 9am
    _pickerDate = _nextWeekday(new Date());
    _pickerHour   = 9;
    _pickerMinute = 0;
  }
  _pickerDuration  = meeting.duration_minutes || 60;
  _pickerViewYear  = _pickerDate.getFullYear();
  _pickerViewMonth = _pickerDate.getMonth();

  // Mount picker below WHEN row
  var whenRow = document.getElementById('ac-meta-when-row');
  if (!whenRow) return;

  var existing = document.getElementById('ac-when-picker');
  if (existing) existing.remove();

  var picker = document.createElement('div');
  picker.id = 'ac-when-picker';
  picker.className = 'ac-when-picker';
  whenRow.insertAdjacentElement('afterend', picker);

  _paintPicker(picker, meeting);

  // Outside click to close
  setTimeout(function() {
    document.addEventListener('click', _onPickerOutsideClick);
  }, 0);
}

function _closeWhenPicker() {
  _pickerOpen = false;
  var picker = document.getElementById('ac-when-picker');
  if (picker) picker.remove();
  document.removeEventListener('click', _onPickerOutsideClick);
}

function _onPickerOutsideClick(ev) {
  var picker = document.getElementById('ac-when-picker');
  var whenRow = document.getElementById('ac-meta-when-row');
  if (!picker) { document.removeEventListener('click', _onPickerOutsideClick); return; }
  if (!picker.contains(ev.target) && !whenRow.contains(ev.target)) {
    _closeWhenPicker();
  }
}

function _nextWeekday(date) {
  var d = new Date(date);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}
```

---

## §7 — Picker paint

```javascript
function _paintPicker(picker, meeting) {
  picker.innerHTML = [
    '<div class="ac-picker-body">',
      '<div class="ac-picker-left">',
        _calendarHtml(_pickerViewYear, _pickerViewMonth, _pickerDate),
      '</div>',
      '<div class="ac-picker-right">',
        '<div class="ac-picker-field">',
          '<label class="ac-picker-label">START TIME</label>',
          _timeSelectHtml(_pickerHour, _pickerMinute),
        '</div>',
        '<div class="ac-picker-field">',
          '<label class="ac-picker-label">DURATION</label>',
          _durationSelectHtml(_pickerDuration),
        '</div>',
        '<div class="ac-picker-actions">',
          '<button class="ac-picker-set" data-action="picker-set">✓ Set</button>',
          '<button class="ac-picker-cancel" data-action="picker-cancel">Cancel</button>',
        '</div>',
      '</div>',
    '</div>'
  ].join('');

  _wirePickerEvents(picker, meeting);
}
```

### §7.1 — Calendar HTML

```javascript
function _calendarHtml(year, month, selectedDate) {
  var MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
  var DAY_HEADERS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  var html = '<div class="ac-cal">';
  html += '<div class="ac-cal-nav">';
  html += '<button class="ac-cal-prev" data-action="cal-prev">‹</button>';
  html += '<span class="ac-cal-month-label">' +
          esc(MONTHS[month]) + ' ' + year + '</span>';
  html += '<button class="ac-cal-next" data-action="cal-next">›</button>';
  html += '</div>';

  html += '<div class="ac-cal-grid">';
  DAY_HEADERS.forEach(function(d) {
    html += '<span class="ac-cal-day-header">' + d + '</span>';
  });

  var firstDay = new Date(year, month, 1).getDay();
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var today = new Date();

  // Blank cells before first day
  for (var i = 0; i < firstDay; i++) {
    html += '<span class="ac-cal-cell ac-cal-cell--empty"></span>';
  }

  for (var d2 = 1; d2 <= daysInMonth; d2++) {
    var cellDate = new Date(year, month, d2);
    var isPast = cellDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var isToday = _isSameDay(cellDate, today);
    var isSelected = selectedDate && _isSameDay(cellDate, selectedDate);
    var cls = 'ac-cal-cell';
    if (isPast)     cls += ' ac-cal-cell--past';
    if (isToday)    cls += ' ac-cal-cell--today';
    if (isSelected) cls += ' ac-cal-cell--selected';

    html += '<span class="' + cls + '" ' +
            'data-action="cal-select" data-day="' + d2 + '">' +
            d2 + '</span>';
  }

  html += '</div></div>';
  return html;
}
```

### §7.2 — Time select HTML

```javascript
function _timeSelectHtml(hour, minute) {
  var html = '<select class="ac-picker-select" id="ac-picker-time">';
  for (var h = 6; h <= 22; h++) {
    for (var m = 0; m < 60; m += 30) {
      var label = _fmt12h(h, m);
      var val   = h + ':' + (m === 0 ? '00' : '30');
      var sel   = (h === hour && m === minute) ? ' selected' : '';
      html += '<option value="' + val + '"' + sel + '>' + esc(label) + '</option>';
    }
  }
  html += '</select>';
  return html;
}

function _fmt12h(hour, minute) {
  var ampm  = hour >= 12 ? 'PM' : 'AM';
  var h12   = hour % 12 || 12;
  var mStr  = minute === 0 ? ':00' : ':30';
  return h12 + mStr + ' ' + ampm;
}
```

### §7.3 — Duration select HTML

```javascript
function _durationSelectHtml(currentDuration) {
  var options = [30, 45, 60, 90, 120];
  var html = '<select class="ac-picker-select" id="ac-picker-duration">';
  options.forEach(function(min) {
    var label = min < 60 ? min + ' min'
              : min === 60 ? '1 hour'
              : (min / 60) + ' hours';
    var sel = (min === currentDuration) ? ' selected' : '';
    html += '<option value="' + min + '"' + sel + '>' + label + '</option>';
  });
  // Custom option
  var isCustom = options.indexOf(currentDuration) === -1 && currentDuration > 0;
  html += '<option value="custom"' + (isCustom ? ' selected' : '') + '>Custom…</option>';
  html += '</select>';
  if (isCustom) {
    html += '<input class="ac-picker-custom-duration" type="number" ' +
            'min="5" max="480" step="5" value="' + currentDuration + '">';
  }
  return html;
}
```

---

## §8 — Picker event wiring

```javascript
function _wirePickerEvents(picker, meeting) {
  picker.addEventListener('click', function(ev) {
    var action = ev.target.dataset.action ||
                 ev.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    ev.stopPropagation();

    if (action === 'cal-prev') {
      _pickerViewMonth--;
      if (_pickerViewMonth < 0) { _pickerViewMonth = 11; _pickerViewYear--; }
      var cal = picker.querySelector('.ac-cal');
      if (cal) cal.outerHTML = _calendarHtml(_pickerViewYear, _pickerViewMonth, _pickerDate);
      // Re-wire calendar events after repaint
      _wirePickerEvents(picker, meeting);
      return;
    }

    if (action === 'cal-next') {
      _pickerViewMonth++;
      if (_pickerViewMonth > 11) { _pickerViewMonth = 0; _pickerViewYear++; }
      var cal2 = picker.querySelector('.ac-cal');
      if (cal2) cal2.outerHTML = _calendarHtml(_pickerViewYear, _pickerViewMonth, _pickerDate);
      _wirePickerEvents(picker, meeting);
      return;
    }

    if (action === 'cal-select') {
      var btn = ev.target.closest('[data-action="cal-select"]');
      if (!btn || btn.classList.contains('ac-cal-cell--past')) return;
      var day = parseInt(btn.dataset.day, 10);
      _pickerDate = new Date(_pickerViewYear, _pickerViewMonth, day);
      // Re-render calendar to show selection
      var cal3 = picker.querySelector('.ac-cal');
      if (cal3) cal3.outerHTML = _calendarHtml(_pickerViewYear, _pickerViewMonth, _pickerDate);
      _wirePickerEvents(picker, meeting);
      return;
    }

    if (action === 'picker-set') {
      _saveWhenPicker(meeting);
      return;
    }

    if (action === 'picker-cancel') {
      _closeWhenPicker();
      return;
    }
  });

  // Time select change
  var timeSelect = picker.querySelector('#ac-picker-time');
  if (timeSelect && !timeSelect.dataset.wired) {
    timeSelect.dataset.wired = '1';
    timeSelect.addEventListener('change', function() {
      var parts = timeSelect.value.split(':');
      _pickerHour   = parseInt(parts[0], 10);
      _pickerMinute = parseInt(parts[1], 10);
    });
  }

  // Duration select change
  var durSelect = picker.querySelector('#ac-picker-duration');
  if (durSelect && !durSelect.dataset.wired) {
    durSelect.dataset.wired = '1';
    durSelect.addEventListener('change', function() {
      if (durSelect.value === 'custom') {
        // Show custom input
        var existing = picker.querySelector('.ac-picker-custom-duration');
        if (!existing) {
          var inp = document.createElement('input');
          inp.className = 'ac-picker-custom-duration';
          inp.type = 'number';
          inp.min = '5';
          inp.max = '480';
          inp.step = '5';
          inp.value = '60';
          durSelect.insertAdjacentElement('afterend', inp);
          inp.focus();
        }
      } else {
        _pickerDuration = parseInt(durSelect.value, 10);
        var customInp = picker.querySelector('.ac-picker-custom-duration');
        if (customInp) customInp.remove();
      }
    });
  }

  // Custom duration input change
  var customInp = picker.querySelector('.ac-picker-custom-duration');
  if (customInp && !customInp.dataset.wired) {
    customInp.dataset.wired = '1';
    customInp.addEventListener('input', function() {
      var val = parseInt(customInp.value, 10);
      if (val > 0) _pickerDuration = val;
    });
  }
}
```

---

## §9 — Save

```javascript
function _saveWhenPicker(meeting) {
  if (!_pickerDate) {
    _closeWhenPicker();
    return;
  }

  // Build scheduled_for ISO timestamp in local time
  var d = new Date(
    _pickerDate.getFullYear(),
    _pickerDate.getMonth(),
    _pickerDate.getDate(),
    _pickerHour,
    _pickerMinute,
    0, 0
  );
  var scheduledFor = d.toISOString();

  // Get final duration — check custom input first
  var customInp = document.querySelector('.ac-picker-custom-duration');
  if (customInp) {
    var val = parseInt(customInp.value, 10);
    if (val > 0) _pickerDuration = val;
  }

  API.patch(
    'accord_meetings?meeting_id=eq.' + meeting.meeting_id,
    {
      scheduled_for:    scheduledFor,
      duration_minutes: _pickerDuration
    }
  ).then(function() {
    meeting.scheduled_for    = scheduledFor;
    meeting.duration_minutes = _pickerDuration;
    _closeWhenPicker();
    // Re-render WHEN row
    var whenEl = document.getElementById('ac-meta-when');
    if (whenEl) whenEl.innerHTML = _fmtWhen(meeting.scheduled_for, meeting.duration_minutes);
    // Re-derive footer
    _renderFooter(meeting, meeting.workstream_id || null);
  }).catch(function(e) {
    console.error('[AccordMeetingSetup] scheduled_for patch failed', e);
    _closeWhenPicker();
  });
}
```

---

## §10 — Keyboard support

```javascript
// Add to the module-level keydown listener (or wire in _wireWhenPicker):
document.addEventListener('keydown', function _pickerKeydown(ev) {
  if (!_pickerOpen) return;
  if (ev.key === 'Escape') {
    _closeWhenPicker();
  }
  if (ev.key === 'Enter') {
    var picker = document.getElementById('ac-when-picker');
    if (picker) _saveWhenPicker(window.Accord.state.meeting);
  }
});
```

---

## §11 — Teardown additions

```javascript
// In teardown():
_closeWhenPicker();   // removes picker DOM + outside-click listener
_pickerOpen      = false;
_pickerDate      = null;
_pickerViewYear  = null;
_pickerViewMonth = null;
```

---

## §12 — CSS

```css
/* ── When picker panel ──────────────────────────────── */
#ac-when-picker {
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 6px;
  z-index: 8000;
  background: var(--ac-bg-deep);
  border: 1px solid var(--ac-border-mid);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  padding: 14px;
  min-width: 360px;
}

.ac-picker-body {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

/* ── Calendar ───────────────────────────────────────── */
.ac-picker-left { flex-shrink: 0; }
.ac-cal { width: 196px; }

.ac-cal-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.ac-cal-prev, .ac-cal-next {
  background: none;
  border: none;
  color: var(--ac-text-tertiary);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 3px;
}
.ac-cal-prev:hover, .ac-cal-next:hover { color: var(--ac-cyan); background: var(--ac-bg-tile); }
.ac-cal-month-label {
  font-family: var(--ac-font-mono);
  font-size: 10px;
  color: var(--ac-text-secondary);
  letter-spacing: 0.5px;
}

.ac-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.ac-cal-day-header {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  color: var(--ac-text-faint);
  text-align: center;
  padding: 2px 0;
}
.ac-cal-cell {
  font-size: 11px;
  text-align: center;
  padding: 4px 2px;
  border-radius: 3px;
  cursor: pointer;
  color: var(--ac-text-secondary);
  user-select: none;
}
.ac-cal-cell:hover:not(.ac-cal-cell--past):not(.ac-cal-cell--empty) {
  background: var(--ac-bg-tile);
  color: var(--ac-text-primary);
}
.ac-cal-cell--empty   { cursor: default; }
.ac-cal-cell--past    { color: var(--ac-text-faint); cursor: not-allowed; }
.ac-cal-cell--today   { color: var(--ac-cyan); font-weight: 600; }
.ac-cal-cell--selected {
  background: var(--ac-cyan);
  color: var(--ac-bg-deep);
  font-weight: 700;
  border-radius: 50%;
}

/* ── Right panel ────────────────────────────────────── */
.ac-picker-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ac-picker-field { display: flex; flex-direction: column; gap: 5px; }
.ac-picker-label {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  color: var(--ac-text-tertiary);
  letter-spacing: 1px;
}
.ac-picker-select {
  font-family: var(--ac-font-mono);
  font-size: 11px;
  color: var(--ac-text-primary);
  background: var(--ac-bg-tile);
  border: 1px solid var(--ac-border-mid);
  border-radius: 4px;
  padding: 6px 8px;
  cursor: pointer;
  outline: none;
  width: 100%;
}
.ac-picker-select:focus { border-color: var(--ac-border-active); }

.ac-picker-custom-duration {
  font-family: var(--ac-font-mono);
  font-size: 11px;
  color: var(--ac-text-primary);
  background: var(--ac-bg-tile);
  border: 1px solid var(--ac-border-active);
  border-radius: 4px;
  padding: 5px 8px;
  outline: none;
  width: 100%;
  margin-top: 4px;
}

.ac-picker-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.ac-picker-set {
  font-family: var(--ac-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.8px;
  padding: 7px 16px;
  background: var(--ac-cyan);
  color: var(--ac-bg-deep);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  flex: 1;
}
.ac-picker-set:hover { opacity: 0.88; }
.ac-picker-cancel {
  font-family: var(--ac-font-mono);
  font-size: 10px;
  padding: 7px 12px;
  background: none;
  color: var(--ac-text-faint);
  border: 1px solid var(--ac-border-subtle);
  border-radius: 4px;
  cursor: pointer;
}
.ac-picker-cancel:hover { color: var(--ac-text-secondary); }

/* ── WHEN row needs relative positioning for picker anchor ── */
.ac-meta-row--when { position: relative; }
```

---

## §13 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Click WHEN row | Picker panel opens below WHEN row, anchored right. Calendar shows current month. Time select pre-filled with current start time. Duration pre-filled. |
| 2 | Navigate calendar months | ‹ and › arrows change month. Past days grayed, not clickable. |
| 3 | Select a date | Day cell highlights cyan circle. Selected date persists when switching months and back. |
| 4 | Select time | Time dropdown scrollable. 30-min increments from 6:00 AM to 10:00 PM. Selection updates `_pickerHour` / `_pickerMinute`. |
| 5 | Select duration | 30 / 45 / 1 hour / 1.5 hours / 2 hours options. Custom… reveals number input. |
| 6 | ✓ Set | PATCH fires with ISO `scheduled_for` and `duration_minutes`. WHEN row updates: date in amber, time range in cyan. Footer budget bar re-renders. Picker closes. |
| 7 | Cancel / Escape / outside click | Picker closes. No PATCH. WHEN row unchanged. |
| 8 | No `scheduled_for` set | Picker opens with next weekday at 9:00 AM pre-selected. |
| 9 | Teardown while picker open | Navigate away. Picker removed. Outside-click listener removed. No residual DOM. |

---

## §14 — Files manifest

| File | Change |
|---|---|
| `accord-meeting-setup.js` | Replace X-12 duration functions with `_wireWhenPicker`, `_openWhenPicker`, `_closeWhenPicker`, `_paintPicker`, `_calendarHtml`, `_timeSelectHtml`, `_durationSelectHtml`, `_wirePickerEvents`, `_saveWhenPicker`; picker state vars; keyboard handler; teardown additions. Replace `_wireDurationEdit` call in `_paintMeta` with `_wireWhenPicker`. |
| `accord-meeting-setup.css` | Full picker panel styles; calendar grid; time/duration selects; action buttons |
| `version.js` | Operator-managed (IR65) |

---

## §15 — Discipline checklist

- `var` only
- `data-action` on all interactive elements — no anonymous onclicks
- `_onPickerOutsideClick` is a named function — self-removes via `removeEventListener`
- Calendar re-renders on month nav and day select — `_wirePickerEvents` re-called after each
- Wired guards (`dataset.wired`) on select and input listeners — no stacking
- `_closeWhenPicker` called in `teardown()` — removes DOM and outside-click listener
- PATCH sends ISO timestamp constructed from local Date — not UTC string manipulation
- `_renderFooter` re-called after PATCH resolves — budget bar stays current
- X-12 functions removed, not renamed — no dead code
- `--ac-*` token prefix throughout

---

**Halt-and-surface after §13. Close-out must confirm: smoke test 6 (PATCH ISO format correct in Supabase), smoke test 7 (outside-click listener removed after close), smoke test 9 (teardown clean).**

**After seal: X-14 closed. Scheduling is fully operator-driven from the Setup shell.**

---

*End Commission · X-14 · CMD-ACCORD-SETUP-WHEN-PICKER-1.*
