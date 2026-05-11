# Commission · X-11+X-12 · CMD-ACCORD-BRIEFING-EDIT-FIX + DURATION-EDIT-1

**Phase:** Ancillary polish — combined micro-CMD
**Authored:** 2026-05-11
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Predecessor:** C-13 sealed · Setup Shell complete · X-13 resolved
**Coding agent:** execute sequentially; halt-and-surface after §6

---

## §1 — Scope

Two targeted defect fixes in `accord-meeting-setup.js`. No substrate changes.

**X-11 — Briefing edit defect:**
The `focus-briefing` click handler (line 2754) incorrectly focuses `#ac-meeting-stakes`
instead of opening a briefing textarea. Fix: replace handler with inline textarea edit
pattern matching the mockup — cyan left border, italic text, PATCH on blur/debounce.

**X-12 — Duration inline edit:**
No UI path exists to set `accord_meetings.duration_minutes` from the Setup shell. The
WHEN row (`#ac-meta-when`) is read-only. Fix: make the WHEN row clickable, reveal a
compact duration input inline, PATCH on change.

---

## §2 — No IR64 verification needed

Both fixes target confirmed selectors already in the deployed file:
- `data-action="focus-briefing"` at line 2754 — confirmed
- `#ac-meta-when` at line 971 — confirmed
- `#ac-briefing-synthesis` container — confirmed at line 2592
- `accord_meetings.duration_minutes` column — confirmed schema inventory

No new schema. No new tables. Proceed directly to §3.

---

## §3 — X-11: Briefing edit fix

### §3.1 — Replace the broken handler

**Find** (line 2754):
```javascript
      if (action === 'focus-briefing') {
        var stakes = document.getElementById('ac-meeting-stakes');
        if (stakes) { stakes.focus(); stakes.scrollIntoView({ behavior: 'smooth' }); }
        return;
      }
```

**Replace with:**
```javascript
      if (action === 'focus-briefing') {
        _openBriefingEdit(meeting);
        return;
      }

      if (action === 'save-briefing') {
        _saveBriefingEdit(meeting);
        return;
      }

      if (action === 'cancel-briefing') {
        _cancelBriefingEdit(meeting);
        return;
      }
```

### §3.2 — `_openBriefingEdit`

```javascript
var _briefingEditTimer = null;

function _openBriefingEdit(meeting) {
  var wrap = document.querySelector('.ac-briefing-synthesis');
  if (!wrap) return;
  if (wrap.querySelector('.ac-briefing-edit-area')) return;  // already open

  // Replace placeholder with textarea
  var placeholder = wrap.querySelector('.ac-briefing-synthesis-placeholder');
  var existingText = wrap.querySelector('.ac-briefing-synthesis-text');
  var seed = meeting.briefing_text || '';

  // Hide existing content
  if (placeholder) placeholder.style.display = 'none';
  if (existingText) existingText.style.display = 'none';

  var editHtml = '<div class="ac-briefing-edit-area">' +
    '<textarea class="ac-briefing-textarea" ' +
    'placeholder="What leadership needs to know walking in\u2026" ' +
    'rows="5">' + esc(seed) + '</textarea>' +
    '<div class="ac-briefing-edit-actions">' +
      '<button class="ac-briefing-save-btn" data-action="save-briefing">Save</button>' +
      '<button class="ac-briefing-cancel-btn" data-action="cancel-briefing">Cancel</button>' +
    '</div>' +
  '</div>';

  wrap.insertAdjacentHTML('beforeend', editHtml);

  var textarea = wrap.querySelector('.ac-briefing-textarea');
  if (textarea) {
    textarea.focus();
    // Place cursor at end
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;

    // Debounced autosave
    textarea.addEventListener('input', function() {
      if (_briefingEditTimer) clearTimeout(_briefingEditTimer);
      _briefingEditTimer = setTimeout(function() {
        _patchBriefingText(textarea.value, meeting);
      }, 800);
    });
  }
}
```

### §3.3 — `_saveBriefingEdit` and `_cancelBriefingEdit`

```javascript
function _saveBriefingEdit(meeting) {
  var textarea = document.querySelector('.ac-briefing-textarea');
  if (!textarea) return;
  var val = textarea.value.trim();
  _patchBriefingText(val, meeting);
  _closeBriefingEdit(meeting, val);
}

function _cancelBriefingEdit(meeting) {
  _closeBriefingEdit(meeting, meeting.briefing_text || null);
}

function _closeBriefingEdit(meeting, newValue) {
  if (_briefingEditTimer) { clearTimeout(_briefingEditTimer); _briefingEditTimer = null; }
  var wrap = document.querySelector('.ac-briefing-synthesis');
  if (!wrap) return;

  var editArea = wrap.querySelector('.ac-briefing-edit-area');
  if (editArea) editArea.remove();

  // Update local state
  meeting.briefing_text = newValue || null;

  // Re-render synthesis block
  var placeholder = wrap.querySelector('.ac-briefing-synthesis-placeholder');
  var existingText = wrap.querySelector('.ac-briefing-synthesis-text');

  if (newValue) {
    if (existingText) {
      existingText.textContent = newValue;
      existingText.style.display = '';
    } else {
      // Insert text element
      wrap.insertAdjacentHTML('beforeend',
        '<div class="ac-briefing-synthesis-text">' + esc(newValue) + '</div>');
    }
    if (placeholder) placeholder.style.display = 'none';
  } else {
    if (placeholder) placeholder.style.display = '';
    if (existingText) existingText.style.display = 'none';
  }
}

function _patchBriefingText(val, meeting) {
  API.patch(
    'accord_meetings?meeting_id=eq.' + meeting.meeting_id,
    { briefing_text: val || null }
  ).catch(function(e) {
    console.error('[AccordMeetingSetup] briefing_text patch failed', e);
  });
}
```

Also add `_briefingEditTimer` to teardown:
```javascript
// In teardown():
if (_briefingEditTimer) { clearTimeout(_briefingEditTimer); _briefingEditTimer = null; }
```

---

## §4 — X-12: Duration inline edit

### §4.1 — Make WHEN row clickable

**Find** in `_buildHTML` (line 322):
```javascript
'<div class="ac-meta-row">' +
  '<span class="ac-meta-label">WHEN</span>' +
  '<span class="ac-meta-value" id="ac-meta-when">\u2014</span>' +
'</div>' +
```

**Replace with:**
```javascript
'<div class="ac-meta-row ac-meta-row--when" id="ac-meta-when-row">' +
  '<span class="ac-meta-label">WHEN</span>' +
  '<span class="ac-meta-value" id="ac-meta-when">\u2014</span>' +
  '<span class="ac-duration-edit-hint" id="ac-duration-hint">\u2014</span>' +
'</div>' +
```

### §4.2 — Wire the WHEN row click

Add to the header delegation block (where title/stakes/location edits are wired, around line 1116):

```javascript
function _wireDurationEdit(meeting) {
  var whenRow = document.getElementById('ac-meta-when-row');
  if (!whenRow || whenRow.dataset.durationWired) return;
  whenRow.dataset.durationWired = '1';

  // Show hint on hover
  var hint = document.getElementById('ac-duration-hint');
  if (hint) {
    hint.textContent = meeting.duration_minutes
      ? 'click to edit duration'
      : '+ add duration';
  }

  whenRow.addEventListener('click', function(ev) {
    if (ev.target.closest('.ac-duration-input-row')) return;
    _openDurationEdit(meeting);
  });
}

function _openDurationEdit(meeting) {
  var whenRow = document.getElementById('ac-meta-when-row');
  if (!whenRow) return;
  if (whenRow.querySelector('.ac-duration-input-row')) return;  // already open

  var current = meeting.duration_minutes || '';
  var inputRow = document.createElement('div');
  inputRow.className = 'ac-duration-input-row';
  inputRow.innerHTML =
    '<input class="ac-duration-input" type="number" min="5" max="480" step="5" ' +
    'value="' + esc(String(current)) + '" placeholder="min" autocomplete="off">' +
    '<span class="ac-duration-unit">min</span>' +
    '<button class="ac-duration-save" data-action="save-duration">✓</button>' +
    '<button class="ac-duration-cancel" data-action="cancel-duration">✕</button>';

  whenRow.appendChild(inputRow);

  var input = inputRow.querySelector('.ac-duration-input');
  if (input) {
    input.focus();
    input.select();

    input.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); _saveDurationEdit(meeting); }
      if (ev.key === 'Escape') { _cancelDurationEdit(meeting); }
    });
  }

  // Wire save/cancel buttons
  inputRow.querySelector('[data-action="save-duration"]')
    .addEventListener('click', function() { _saveDurationEdit(meeting); });
  inputRow.querySelector('[data-action="cancel-duration"]')
    .addEventListener('click', function() { _cancelDurationEdit(meeting); });
}

function _saveDurationEdit(meeting) {
  var input = document.querySelector('.ac-duration-input');
  if (!input) return;
  var val = parseInt(input.value, 10);
  var newDuration = (val > 0) ? val : null;

  API.patch(
    'accord_meetings?meeting_id=eq.' + meeting.meeting_id,
    { duration_minutes: newDuration }
  ).then(function() {
    meeting.duration_minutes = newDuration;
    _closeDurationEdit(meeting);
    // Re-render WHEN display + footer budget bar
    var whenEl = document.getElementById('ac-meta-when');
    if (whenEl) whenEl.textContent = _fmtWhen(meeting.scheduled_for, meeting.duration_minutes);
    _renderFooter(meeting, meeting.workstream_id || null);
  }).catch(function(e) {
    console.error('[AccordMeetingSetup] duration_minutes patch failed', e);
    _closeDurationEdit(meeting);
  });
}

function _cancelDurationEdit(meeting) {
  _closeDurationEdit(meeting);
}

function _closeDurationEdit(meeting) {
  var row = document.querySelector('.ac-duration-input-row');
  if (row) row.remove();
  // Update hint text
  var hint = document.getElementById('ac-duration-hint');
  if (hint) {
    hint.textContent = meeting.duration_minutes
      ? 'click to edit duration'
      : '+ add duration';
  }
}
```

Call `_wireDurationEdit(meeting)` from `_paintMeta()` after the WHEN element is populated.

---

## §5 — CSS additions

```css
/* ── X-11: Briefing edit ────────────────────────────── */
.ac-briefing-synthesis-text {
  font-size: 13px;
  color: var(--ac-text-primary);
  line-height: 1.6;
  font-style: italic;
  border-left: 3px solid var(--ac-cyan);
  padding: 8px 12px;
  margin: 6px 0;
  background: var(--ac-bg-pane);
  border-radius: 0 4px 4px 0;
  cursor: pointer;
}
.ac-briefing-synthesis-text:hover {
  background: var(--ac-bg-tile);
}

.ac-briefing-edit-area {
  margin: 6px 0;
}
.ac-briefing-textarea {
  width: 100%;
  min-height: 90px;
  font-size: 13px;
  font-style: italic;
  color: var(--ac-text-primary);
  background: var(--ac-bg-pane);
  border: none;
  border-left: 3px solid var(--ac-cyan);
  border-radius: 0 4px 4px 0;
  padding: 8px 12px;
  resize: vertical;
  outline: none;
  line-height: 1.6;
  font-family: var(--ac-font-sans);
  box-sizing: border-box;
}
.ac-briefing-textarea::placeholder { color: var(--ac-text-faint); }
.ac-briefing-textarea:focus { border-left-color: var(--ac-cyan); }

.ac-briefing-edit-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}
.ac-briefing-save-btn {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  letter-spacing: 0.8px;
  padding: 4px 12px;
  background: var(--ac-cyan-dim);
  color: var(--ac-cyan);
  border: 1px solid rgba(94,234,212,0.3);
  border-radius: 4px;
  cursor: pointer;
}
.ac-briefing-save-btn:hover { background: var(--ac-cyan); color: var(--ac-bg-deep); }
.ac-briefing-cancel-btn {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  padding: 4px 10px;
  background: none;
  color: var(--ac-text-faint);
  border: 1px solid var(--ac-border-subtle);
  border-radius: 4px;
  cursor: pointer;
}
.ac-briefing-cancel-btn:hover { color: var(--ac-text-secondary); }

/* ── X-12: Duration inline edit ─────────────────────── */
.ac-meta-row--when { cursor: pointer; position: relative; }
.ac-meta-row--when:hover .ac-duration-edit-hint { opacity: 1; }

.ac-duration-edit-hint {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  color: var(--ac-text-faint);
  margin-left: 8px;
  opacity: 0;
  transition: opacity 0.15s;
  letter-spacing: 0.5px;
}

.ac-duration-input-row {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  padding-left: 42px;  /* align under WHEN value */
}
.ac-duration-input {
  width: 54px;
  font-size: 12px;
  font-family: var(--ac-font-mono);
  background: var(--ac-bg-tile);
  color: var(--ac-text-primary);
  border: 1px solid var(--ac-border-active);
  border-radius: 3px;
  padding: 3px 6px;
  outline: none;
  text-align: right;
}
.ac-duration-unit {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-tertiary);
}
.ac-duration-save, .ac-duration-cancel {
  font-size: 11px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  line-height: 1;
}
.ac-duration-save  { color: var(--ac-cyan); }
.ac-duration-cancel { color: var(--ac-text-faint); }
.ac-duration-save:hover  { color: var(--ac-text-primary); }
.ac-duration-cancel:hover { color: var(--ac-rose); }
```

---

## §6 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Click "Write one →" | Inline textarea opens in briefing synthesis block. Cyan left border. Italic placeholder text. Focus lands in textarea. Stakes field is NOT focused. |
| 2 | Type in textarea | 800ms debounce → PATCH fires on `briefing_text`. Verify: `SELECT briefing_text FROM accord_meetings WHERE meeting_id = '<id>'` returns typed text. |
| 3 | Click Save | Edit area collapses. Briefing text renders as cyan-bordered italic block. Local `meeting.briefing_text` updated. |
| 4 | Click Cancel | Edit area collapses. Original text restored (no PATCH). |
| 5 | Click existing briefing text | Edit area re-opens with current text pre-filled. Cursor at end. |
| 6 | WHEN row hover | "+ add duration" hint fades in to the right of the WHEN value. |
| 7 | Click WHEN row | Duration input row appears below WHEN value. Input pre-filled with current duration (or empty). |
| 8 | Enter duration + Enter key | PATCH fires. WHEN row updates to show end time. Budget bar re-renders with new duration. Input row closes. |
| 9 | Click ✕ cancel | Input row closes. No PATCH. Duration unchanged. |
| 10 | Set duration to blank/zero | PATCH sends `null`. WHEN row reverts to date · time only (no end time). Budget bar shows empty state. |

---

## §7 — Files manifest

| File | Change |
|---|---|
| `accord-meeting-setup.js` | Replace `focus-briefing` handler; add `_openBriefingEdit`, `_saveBriefingEdit`, `_cancelBriefingEdit`, `_closeBriefingEdit`, `_patchBriefingText`; add `_wireDurationEdit`, `_openDurationEdit`, `_saveDurationEdit`, `_cancelDurationEdit`, `_closeDurationEdit`; amend `_buildHTML` WHEN row; call `_wireDurationEdit` from `_paintMeta`; teardown `_briefingEditTimer` |
| `accord-meeting-setup.css` | Briefing textarea + edit actions styles; WHEN row hover + duration input styles |
| `version.js` | Operator-managed (IR65) |

---

## §8 — Discipline checklist

- `var` only
- `data-action="save-briefing"`, `data-action="cancel-briefing"`, `data-action="save-duration"`, `data-action="cancel-duration"` — no anonymous onclicks on Save/Cancel buttons
- `_briefingEditTimer` cleared in teardown
- Double-open guard on both edit areas (`if (wrap.querySelector('.ac-briefing-edit-area')) return`)
- `_wireDurationEdit` guard: `whenRow.dataset.durationWired` prevents double-wiring on re-renders
- PATCH sends `null` when value is empty — not `0` or `''`
- `_renderFooter` re-called after duration PATCH resolves — budget bar stays current
- No substrate changes — `duration_minutes` and `briefing_text` columns confirmed in schema inventory

---

**Halt-and-surface after §6. Close-out must confirm smoke test 1 (stakes NOT focused) and smoke test 8 (budget bar re-renders after duration set).**

**After seal: X-11 and X-12 closed. Setup Shell polish phase complete.**

---

*End Commission · X-11+X-12 · CMD-ACCORD-BRIEFING-EDIT-FIX + DURATION-EDIT-1.*
