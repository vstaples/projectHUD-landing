# HANDOFF — CMD-ACCORD-MINUTES-1 v2 · Phase 1: Cleanup + Review Mode Transition

**Date:** 2026-05-19
**CMD:** M-01 · CMD-ACCORD-MINUTES-1 v2
**Operator:** Vaughn Staples
**Phase:** 1 of 4 — Cleanup + `_enterReviewMode()` + sidebar swap + topbar

---

## §0 — PRE-FLIGHT

Read `Brief_CMD-ACCORD-MINUTES-1_v2.md` end-to-end before proceeding.
Session protocol: terse mode; test Chrome connection first; Test Mode after
each code update — one checklist item at a time.
Iron Rules 36, 40 §1, 47, 64, 71, 72 apply.
`var` only — no `let`/`const`.
No `setTimeout` for sequencing — `.then()` chains only.
Deliver in §6 file order, then operator review note, then §7 checklist. Stop.

---

## §1 — CONTEXT

`accord-minutes.js` has been deleted by the operator.
Two stale references remain in the codebase — remove them this phase.

Review mode is a state transition within `accord-live-capture.js`.
END MEETING already fires `_endMeeting()` which PATCHes `state='closed'`
and dispatches `accord:level-changed`. The new approach: instead of
routing away from Live Capture on close, the shell detects the closed
state and transitions to review mode in place.

---

## §2 — INPUTS

| File | Purpose |
|------|---------|
| `accord-live-capture.js` | Phase 6 output — extend with review mode |
| `accord-views.js` | Remove stale AccordMinutes branch |
| `accord.html` | Remove stale script tag |

---

## §3 — DELIVERABLES

1. `accord-views.js` — stale branch removed
2. `accord.html` — stale script tag removed
3. `accord-live-capture.js` — `_enterReviewMode()` + sidebar swap + topbar

Operator review checkpoint before Phase 2.

---

## §4 — BUILD SPEC

### 4.1 — Cleanup

**`accord-views.js`:**
Remove the `if (meeting.state === 'closed')` branch that calls
`AccordMinutes.render()`. The closed state should fall through to the
existing closed-meeting handling (or do nothing if Live Capture is
already mounted).

**`accord.html`:**
Remove `<script src="...accord-minutes.js...">` or equivalent tag.
If the tag includes a version query string (`?v=...`), remove the whole
line regardless of the exact string.

---

### 4.2 — Review mode trigger

Currently `_endMeeting()` dispatches `accord:level-changed` after the
PATCH confirms, which tears down the Live Capture shell. Change this:

Instead of dispatching `accord:level-changed`, call `_enterReviewMode()`
directly after the PATCH confirms:

```javascript
// In _endMeeting() .then() — replace accord:level-changed dispatch with:
Accord.state.meeting.state = 'closed';
_enterReviewMode();
```

The shell stays mounted. No navigation occurs. The operator sees the
same canvas they were just working in, with the sidebar swapped.

---

### 4.3 — `_enterReviewMode()` function

```javascript
function _enterReviewMode() {

  // 1. Stop timer
  _stopTimer();

  // 2. Update topbar
  var liveEl = document.getElementById('ac-lc-live-pill');
  if (liveEl) liveEl.style.display = 'none';

  var badge = document.getElementById('ac-lc-state-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'ac-lc-state-badge';
    // Insert after live pill position in topbar
    var topbar = document.getElementById('ac-lc-topbar');
    if (topbar) topbar.insertBefore(badge, topbar.children[2]);
  }
  badge.className = 'ac-lc-review-badge ac-lc-review-badge--review';
  badge.textContent = 'Under Review';

  // 3. Disable END MEETING, add Preview + Route+Send
  var endBtn = document.getElementById('ac-lc-end-btn');
  if (endBtn) {
    endBtn.disabled = true;
    endBtn.style.opacity = '.35';
    endBtn.style.pointerEvents = 'none';
  }
  _renderReviewTopbarActions();

  // 4. Swap sidebar
  _renderReviewSidebar();

  // 5. Load recipients (non-blocking)
  _loadRecipients();
}
```

---

### 4.4 — Review topbar actions

```javascript
function _renderReviewTopbarActions() {
  // Add Preview → and Route + Send ↑ buttons to topbar right
  // Preview: enabled, click fires _openPreview() (Phase 2)
  // Route + Send: disabled until checklist complete
  var topbarRight = document.getElementById('ac-lc-topbar-right');
  if (!topbarRight) return;

  var previewBtn = document.createElement('button');
  previewBtn.id = 'ac-lc-preview-btn';
  previewBtn.className = 'ac-lc-topbar-btn';
  previewBtn.textContent = 'Preview →';
  previewBtn.onclick = function() { _openPreview(); };

  var sendBtn = document.createElement('button');
  sendBtn.id = 'ac-lc-send-btn';
  sendBtn.className = 'ac-lc-topbar-btn ac-lc-send-btn disabled';
  sendBtn.textContent = 'Route + Send ↑';
  sendBtn.disabled = true;
  sendBtn.onclick = function() { _openSendModal(); };

  topbarRight.insertBefore(sendBtn, topbarRight.firstChild);
  topbarRight.insertBefore(previewBtn, sendBtn);
}
```

**State badge CSS:**
```css
.ac-lc-review-badge { font-size:11px; font-weight:700; letter-spacing:.08em;
  text-transform:uppercase; padding:3px 10px; border-radius:3px; }
.ac-lc-review-badge--review { background:rgba(232,148,48,.10);
  color:var(--act); border:1px solid rgba(232,148,48,.22); }
.ac-lc-review-badge--ready { background:var(--nt-bg);
  color:var(--nt); border:1px solid var(--nt-bd); }
.ac-lc-review-badge--sent { background:var(--dec-bg);
  color:var(--dec); border:1px solid var(--dec-bd); }
.ac-lc-send-btn.disabled { opacity:.35; pointer-events:none; }
```

---

### 4.5 — `_renderReviewSidebar()`

Hide the live sidebar, render the review sidebar in its place.

```javascript
function _renderReviewSidebar() {
  var liveSidebar = document.getElementById('ac-lc-sidebar');
  if (liveSidebar) liveSidebar.style.display = 'none';

  var reviewSidebar = document.createElement('div');
  reviewSidebar.id = 'ac-lc-review-sidebar';
  reviewSidebar.className = 'ac-lc-review-sidebar';
  reviewSidebar.innerHTML = _buildReviewSidebarHTML();

  // Insert in same position as live sidebar
  if (liveSidebar && liveSidebar.parentNode) {
    liveSidebar.parentNode.insertBefore(reviewSidebar, liveSidebar);
  }

  _wireChecklistToggles();
}
```

**Review sidebar HTML structure:**

```javascript
function _buildReviewSidebarHTML() {
  return '<div class="ac-lc-rsb-section ac-lc-rsb-checklist">' +
    '<div class="ac-lc-rsb-label">Review Checklist</div>' +
    '<div class="ac-lc-rsb-items">' +
    _checklistItem('Meeting header') +
    _checklistItem('Attendance confirmed') +
    _checklistItem('Outcomes reviewed') +
    _checklistItem('Agenda entries checked') +
    _checklistItem('Decisions verified') +
    _checklistItem('Actions confirmed') +
    '</div></div>' +
    '<div class="ac-lc-rsb-section ac-lc-rsb-nav">' +
    '<div class="ac-lc-rsb-label">Sections</div>' +
    _buildSectionsNav() +   // reuse existing sections nav builder
    '</div>' +
    '<div class="ac-lc-rsb-section ac-lc-rsb-recipients">' +
    '<div class="ac-lc-rsb-label">Recipients</div>' +
    '<div id="ac-lc-recipients-list"></div>' +
    '<div class="ac-lc-rsb-add-recip" onclick="_showAddExternalRecip()">+ Add external recipient…</div>' +
    '</div>';
}

function _checklistItem(label) {
  return '<div class="ac-lc-chk-row" onclick="AccordLiveCapture._toggleChecklist(this)">' +
    '<div class="ac-lc-chk-toggle"></div>' +
    '<span class="ac-lc-chk-lbl">' + label + '</span>' +
    '</div>';
}
```

**Checklist CSS:**
```css
.ac-lc-review-sidebar { width:240px; flex-shrink:0; background:var(--surface);
  border-right:1px solid var(--b0); display:flex; flex-direction:column;
  overflow-y:auto; }
.ac-lc-rsb-section { padding:12px 16px 10px; border-bottom:1px solid var(--b0); }
.ac-lc-rsb-label { font-size:11px; font-weight:700; letter-spacing:.10em;
  text-transform:uppercase; color:var(--hi); margin-bottom:8px; }
.ac-lc-chk-row { display:flex; align-items:center; gap:8px; padding:4px 0;
  cursor:pointer; }
.ac-lc-chk-toggle { width:16px; height:16px; border-radius:50%;
  border:1px solid var(--b2); flex-shrink:0; transition:all .13s; }
.ac-lc-chk-toggle.done { background:var(--nt); border-color:var(--nt); }
.ac-lc-chk-toggle.done::after { content:'✓'; font-size:9px; color:white;
  font-weight:700; display:flex; align-items:center; justify-content:center; }
.ac-lc-chk-lbl { font-size:12px; color:var(--md); }
.ac-lc-chk-row.done .ac-lc-chk-lbl { color:var(--nt); }
.ac-lc-rsb-add-recip { font-size:11px; color:var(--lo); cursor:pointer;
  padding:4px 0; }
.ac-lc-rsb-add-recip:hover { color:var(--md); }
```

---

### 4.6 — Checklist gate

```javascript
AccordLiveCapture._toggleChecklist = function(row) {
  var toggle = row.querySelector('.ac-lc-chk-toggle');
  var done = toggle.classList.toggle('done');
  row.classList.toggle('done', done);

  var total = document.querySelectorAll('.ac-lc-chk-toggle').length;
  var checked = document.querySelectorAll('.ac-lc-chk-toggle.done').length;
  var sendBtn = document.getElementById('ac-lc-send-btn');
  var badge = document.getElementById('ac-lc-state-badge');

  if (checked === total) {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.classList.remove('disabled'); }
    if (badge) { badge.className = 'ac-lc-review-badge ac-lc-review-badge--ready';
                 badge.textContent = 'Ready to Send'; }
  } else {
    if (sendBtn) { sendBtn.disabled = true; sendBtn.classList.add('disabled'); }
    if (badge) { badge.className = 'ac-lc-review-badge ac-lc-review-badge--review';
                 badge.textContent = 'Under Review'; }
  }
};
```

---

### 4.7 — `_loadRecipients()`

```javascript
function _loadRecipients() {
  return API.get('accord_meeting_attendees?meeting_id=eq.' + _meeting.meeting_id)
  .then(function(attendees) {
    if (!attendees || !attendees.length) return;
    var ids = attendees.map(function(a) { return a.resource_id; }).join(',');
    return API.get('resources?id=in.(' + ids + ')&select=id,name')
    .then(function(resources) {
      var nameMap = {};
      (resources || []).forEach(function(r) { nameMap[r.id] = r.name; });
      var list = document.getElementById('ac-lc-recipients-list');
      if (!list) return;
      list.innerHTML = attendees.map(function(a) {
        var name = nameMap[a.resource_id] || 'Unknown';
        var initials = name.split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
        var role = a.resource_id === (_meeting.organizer_id || '') ? 'Organizer'
          : a.rsvp_status === 'accepted' ? 'Attended' : 'Invited · absent';
        return '<div class="ac-lc-recip-row">' +
          '<div class="ac-lc-recip-av">' + initials + '</div>' +
          '<span class="ac-lc-recip-name">' + name + '</span>' +
          '<span class="ac-lc-recip-role">' + role + '</span>' +
          '<input type="checkbox" class="ac-lc-recip-check" data-resource-id="' +
          a.resource_id + '" checked>' +
          '</div>';
      }).join('');
    });
  });
}
```

**Recipient CSS:**
```css
.ac-lc-recip-row { display:flex; align-items:center; gap:7px; padding:4px 0; }
.ac-lc-recip-av { width:22px; height:22px; border-radius:50%;
  background:#152c54; color:#4a8cf5; display:flex; align-items:center;
  justify-content:center; font-size:7px; font-weight:700; flex-shrink:0; }
.ac-lc-recip-name { font-size:12px; color:var(--md); flex:1; }
.ac-lc-recip-role { font-size:11px; color:var(--lo); flex-shrink:0; }
```

---

## §5 — IRON RULE REMINDERS

**IR47:** Confirm `accord_meeting_attendees.organizer_id` field — this column
does not exist on that table. Organizer is on `accord_meetings.organizer_id`.
Use `_meeting.organizer_id` for the organizer role check, not a field on
`accord_meeting_attendees`.

**IR72:** `accord:level-changed` is no longer dispatched from `_endMeeting()`.
Confirm no other module depends on receiving this event for the
`running → closed` transition. If any do, surface as a finding.

**`var` only** — no `let`/`const`.

---

## §6 — FILE ORDER

1. `accord-views.js` — stale AccordMinutes branch removed (diff only)
2. `accord.html` — stale script tag removed (diff only)
3. `accord-live-capture.js` — full file with review mode added

Then: operator review note.
Then: §7 checklist verbatim. Stop.

---

## §7 — PHASE 1 CHECKLIST

- [ ] `accord-views.js` stale AccordMinutes branch removed
- [ ] `accord.html` stale script tag removed
- [ ] IR72: confirmed no module depends on `accord:level-changed` for running→closed
- [ ] END MEETING confirm → `_enterReviewMode()` called (no level-changed dispatch)
- [ ] LIVE pill hidden; "Under Review" amber badge appears
- [ ] Timer stops at final elapsed time
- [ ] END MEETING button disabled
- [ ] Preview → button appears in topbar (enabled)
- [ ] Route + Send ↑ button appears in topbar (disabled)
- [ ] Live sidebar hidden; review sidebar renders in its place
- [ ] Review sidebar: Review Checklist, Sections nav, Recipients sections
- [ ] All 6 checklist items toggle correctly
- [ ] All 6 checked → Route + Send enables, badge → "Ready to Send"
- [ ] Unchecking any → Route + Send disables, badge → "Under Review"
- [ ] Sections nav renders and scroll-to works
- [ ] Recipients loaded from accord_meeting_attendees with resolved names
- [ ] Organizer role label correct (from _meeting.organizer_id)
- [ ] Recipients default to checked
- [ ] + Add external recipient link renders
- [ ] All canvas affordances still work (+ Add, ×, Exclude, reclassify)
- [ ] Running meeting (LIVE state) unaffected — no regression
- [ ] `var` only — no `let`/`const`

---

**Ship it.**
