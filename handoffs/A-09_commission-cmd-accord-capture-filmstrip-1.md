# Commission · A-09 · CMD-ACCORD-CAPTURE-FILMSTRIP-1

**Phase:** Live Capture — Workstream filmstrip + Thread History filter
**Authored:** 2026-05-11
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Operator direction 2026-05-11; Accord prototype v3b-4
**Predecessor:** A-08 · CMD-ACCORD-CAPTURE-CHAT-1 sealed
**Successor:** A-10 · CMD-ACCORD-CAPTURE-ATTACHMENTS-1
**Coding agent:** execute sequentially; halt-and-surface after §9

---

## §1 — Scope

Add a workstream timeline filmstrip at the base of the live capture center pane.
Clicking a frame filters THREAD HISTORY to show nodes captured in that prior meeting.
This gives the operator temporal context — "what did we decide last time on this" —
without leaving the capture flow.

**This filmstrip is distinct from:**
- C-05 `accord-meeting-setup.js` filmstrip (Setup shell — scrub overlay on click)
- Prototype `#filmstrip` inside the attachment sidebar (image canvas — different purpose)

**Deliverables:**
1. Filmstrip zone at base of center capture pane — resizable drag handle
2. Frames from sealed workstream meetings in chronological order
3. C-14 progressive card content (dots + seq IDs at scale) — reuse existing CSS classes
4. Click a frame → THREAD HISTORY tab activates, stream filtered to that meeting's nodes
5. Active frame highlight — cyan border
6. "TODAY" marker on current meeting frame if it exists in the workstream
7. Resize handle — operator can expand/collapse the filmstrip zone height

**What does NOT ship:**
- Scrub overlay (Setup shell pattern — not applicable in live mode)
- Node capture from filmstrip (read-only in live mode)
- Attachment filmstrip (A-10 scope — different filmstrip inside attach sidebar)

---

## §2 — IR64 verification (before writing any code)

**V1 — Center pane structure:**
```javascript
var center = document.querySelector('.capture-center, .ac-capture-center, #captureCenter, .capture-main');
console.log('center class:', center?.className || 'not found');
console.log('center children:', Array.from(center?.children||[]).map(function(c){
  return c.tagName + '.' + c.className.split(' ')[0] + (c.id ? '#'+c.id : '');
}).join(' | '));
```
Need: confirm the center pane container class and its child structure so the filmstrip
zone can be appended at the correct position (below capture stream, above footer).

**V2 — Thread History tab and stream selectors:**
```javascript
var thTab    = document.querySelector('[data-tab="thread-history"], #threadHistoryTab, [id*="thread"]');
var thStream = document.querySelector('#threadHistoryStream, .thread-history-stream');
console.log('thread history tab:', thTab?.className, thTab?.id);
console.log('thread history stream:', thStream?.className, thStream?.id);
// Also check CAPTURED THIS MEETING tab
var captureTab = document.querySelector('[data-tab="captured"], [data-tab="captured-this"]');
console.log('captured tab:', captureTab?.className);
```

**V3 — Workstream meeting fetch (reuse C-05 pattern):**
```javascript
// Confirm workstream_id on current meeting
console.log('workstream_id:', window.Accord?.state?.meeting?.workstream_id);
console.log('meeting_id:', window.Accord?.state?.meeting?.meeting_id);
```

**V4 — C-14 filmstrip card CSS classes available:**
```javascript
// C-14 shipped ac-film-frame, ac-film-dots, ac-film-nodes, ac-film-thumb
var testFrame = document.querySelector('.ac-film-frame');
console.log('ac-film-frame present in DOM:', !!testFrame);
// Check if CSS classes are in the stylesheet
var sheets = Array.from(document.styleSheets);
var hasFilmCSS = sheets.some(function(s) {
  try { return Array.from(s.cssRules).some(function(r){ return r.selectorText && r.selectorText.includes('ac-film-frame'); }); }
  catch(e) { return false; }
});
console.log('ac-film-frame CSS loaded:', hasFilmCSS);
```

Report V1–V4 in close-out.

---

## §3 — No substrate changes

All data from `accord_meetings` and `accord_nodes` — already confirmed in schema
inventory. No new tables. No migrations.

---

## §4 — Module-level state

In `accord-capture.js`:

```javascript
var _liveFilmToken       = 0;
var _liveFilmMeetings    = [];    // sealed workstream meetings
var _liveFilmActiveId    = null;  // currently selected frame meeting_id
var _liveFilmResizing    = false;
```

---

## §5 — Filmstrip zone HTML

Injected at the base of the center capture pane, above the footer controls.
Called once after meeting loads:

```javascript
function _mountLiveFilmstrip(meeting) {
  var center = document.querySelector('.capture-center, #captureCenter');
  if (!center) return;
  if (document.getElementById('ac-live-filmstrip')) return;  // idempotent

  var zone = document.createElement('div');
  zone.id = 'ac-live-filmstrip';
  zone.className = 'ac-live-filmstrip';
  zone.innerHTML = [
    '<div class="ac-live-film-handle" id="ac-live-film-handle"></div>',
    '<div class="ac-live-film-header">',
      '<span class="ac-live-film-label">WORKSTREAM TIMELINE</span>',
      '<span class="ac-live-film-hint" id="ac-live-film-hint"></span>',
    '</div>',
    '<div class="ac-live-film-track" id="ac-live-film-track">',
      '<div class="ac-live-film-loading">Loading timeline…</div>',
    '</div>'
  ].join('');

  // Insert before footer — or append to center if no footer found
  var footer = center.querySelector('.capture-footer, .capture-controls');
  if (footer) {
    center.insertBefore(zone, footer);
  } else {
    center.appendChild(zone);
  }

  _wireFilmResizeHandle(zone);
  _loadLiveFilmFrames(meeting);
}
```

---

## §6 — Fetch and render frames

```javascript
function _loadLiveFilmFrames(meeting) {
  var myToken = ++_liveFilmToken;
  if (!meeting.workstream_id) {
    var track = document.getElementById('ac-live-film-track');
    if (track) track.innerHTML = '<div class="ac-live-film-empty">No workstream context.</div>';
    return;
  }

  // Fetch sealed meetings in workstream
  API.get(
    'accord_meetings?workstream_id=eq.' + meeting.workstream_id +
    '&state=in.(closed,sealed)' +
    '&order=sealed_at.asc' +
    '&select=meeting_id,title,scheduled_for,sealed_at,state' +
    '&limit=30'
  ).then(function(meetings) {
    if (_liveFilmToken !== myToken) return;
    meetings = meetings || [];

    var track = document.getElementById('ac-live-film-track');
    if (!track || !track.isConnected) return;

    _liveFilmMeetings = meetings;

    if (!meetings.length) {
      track.innerHTML = '<div class="ac-live-film-empty">No prior meetings in this workstream.</div>';
      return;
    }

    // Update hint
    var hint = document.getElementById('ac-live-film-hint');
    if (hint) hint.textContent = meetings.length + ' prior meeting' +
                                  (meetings.length !== 1 ? 's' : '') +
                                  ' · click to filter thread history';

    // Render frames
    var html = meetings.map(function(m) {
      var date     = m.scheduled_for
        ? new Date(m.scheduled_for).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : 'Unknown';
      var isActive = m.meeting_id === _liveFilmActiveId;

      return '<div class="ac-film-frame' + (isActive ? ' ac-film-frame--active' : '') + '" ' +
             'data-meeting-id="' + esc(m.meeting_id) + '" ' +
             'data-action="live-film-select">' +
             '<div class="ac-film-thumb ac-film-thumb--f1"></div>' +
             '<div class="ac-film-meta">' +
               '<div class="ac-film-date">' + esc(date) + '</div>' +
             '</div>' +
             '</div>';
    }).join('');

    track.innerHTML = html;

    // Wire click delegation
    track.addEventListener('click', function(ev) {
      var frame = ev.target.closest('[data-action="live-film-select"]');
      if (!frame) return;
      _onLiveFilmSelect(frame.dataset.meetingId, meeting);
    });

    // Enrich with node data (reuse C-14 pattern)
    _enrichFilmCards();

    // Scroll to end (most recent)
    setTimeout(function() {
      track.scrollLeft = track.scrollWidth;
    }, 50);
  }).catch(function(e) {
    console.error('[AccordCapture] live filmstrip load failed', e);
  });
}
```

---

## §7 — Frame click: filter Thread History

```javascript
function _onLiveFilmSelect(meetingId, currentMeeting) {
  var track = document.getElementById('ac-live-film-track');

  // Toggle off if same frame clicked
  if (_liveFilmActiveId === meetingId) {
    _liveFilmActiveId = null;
    track.querySelectorAll('.ac-film-frame--active').forEach(function(f) {
      f.classList.remove('ac-film-frame--active');
    });
    _restoreCaptureStream();
    return;
  }

  // Activate frame
  _liveFilmActiveId = meetingId;
  track.querySelectorAll('.ac-film-frame--active').forEach(function(f) {
    f.classList.remove('ac-film-frame--active');
  });
  var activeFrame = track.querySelector('[data-meeting-id="' + meetingId + '"]');
  if (activeFrame) activeFrame.classList.add('ac-film-frame--active');

  // Switch to Thread History tab
  _activateThreadHistoryTab();

  // Load and render nodes for selected meeting
  _loadFilmThreadHistory(meetingId);
}

function _activateThreadHistoryTab() {
  // Find and click the Thread History tab button
  var thBtn = document.querySelector('[data-tab="thread-history"], #threadHistoryTab');
  if (thBtn && !thBtn.classList.contains('active')) {
    thBtn.click();
  }
  // Ensure stream is visible
  var thStream = document.querySelector('#threadHistoryStream, .thread-history-stream');
  if (thStream) thStream.style.display = '';
  var captureStream = document.querySelector('#captureStream, .capture-stream');
  if (captureStream) captureStream.style.display = 'none';
}

function _restoreCaptureStream() {
  // Restore Captured This Meeting view
  var captureBtn = document.querySelector('[data-tab="captured"], [data-tab="captured-this-meeting"]');
  if (captureBtn) captureBtn.click();
}

function _loadFilmThreadHistory(meetingId) {
  var thStream = document.querySelector('#threadHistoryStream, .thread-history-stream');
  if (!thStream) return;
  thStream.innerHTML = '<div class="ac-film-th-loading">Loading…</div>';

  API.get(
    'accord_nodes?meeting_id=eq.' + meetingId +
    '&tag=in.(decision,action,dissent,risk,note,question)' +
    '&order=created_at.asc' +
    '&select=node_id,tag,seq_id,summary,created_at,sealed_at'
  ).then(function(nodes) {
    if (!thStream.isConnected) return;
    nodes = nodes || [];

    if (!nodes.length) {
      thStream.innerHTML = '<div class="ac-film-th-empty">No captures in this meeting.</div>';
      return;
    }

    // Find meeting title
    var meeting = _liveFilmMeetings.find(function(m) { return m.meeting_id === meetingId; });
    var title   = meeting ? meeting.title : 'Prior meeting';
    var date    = meeting && meeting.scheduled_for
      ? new Date(meeting.scheduled_for).toLocaleDateString(undefined,
          { weekday: 'short', month: 'short', day: 'numeric' })
      : '';

    var html = '<div class="ac-film-th-header">' +
               '<span class="ac-film-th-title">' + esc(title) + '</span>' +
               '<span class="ac-film-th-date">' + esc(date) + '</span>' +
               '<button class="ac-film-th-close" data-action="film-th-close">✕ Back</button>' +
               '</div>';

    var TAG_ORDER = ['decision', 'action', 'dissent', 'risk', 'note', 'question'];
    var sorted = nodes.slice().sort(function(a, b) {
      return TAG_ORDER.indexOf(a.tag) - TAG_ORDER.indexOf(b.tag);
    });

    sorted.forEach(function(n) {
      var tagCls = 'ac-th-node--' + n.tag;
      html += '<div class="ac-th-node ' + tagCls + '">';
      html += '<span class="ac-th-node-seq">' + esc(n.seq_id || '') + '</span>';
      html += '<span class="ac-th-node-summary">' + esc(n.summary || '') + '</span>';
      html += '</div>';
    });

    thStream.innerHTML = html;

    // Wire close button
    var closeBtn = thStream.querySelector('[data-action="film-th-close"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        _liveFilmActiveId = null;
        var track = document.getElementById('ac-live-film-track');
        if (track) track.querySelectorAll('.ac-film-frame--active').forEach(function(f) {
          f.classList.remove('ac-film-frame--active');
        });
        _restoreCaptureStream();
      });
    }
  }).catch(function(e) {
    console.error('[AccordCapture] film thread history load failed', e);
    if (thStream.isConnected)
      thStream.innerHTML = '<div class="ac-film-th-empty">Could not load captures.</div>';
  });
}
```

---

## §8 — Resize handle

```javascript
function _wireFilmResizeHandle(zone) {
  var handle = document.getElementById('ac-live-film-handle');
  if (!handle) return;

  handle.addEventListener('mousedown', function(ev) {
    ev.preventDefault();
    _liveFilmResizing = true;
    var startY   = ev.clientY;
    var startH   = zone.getBoundingClientRect().height;

    function onMove(ev2) {
      if (!_liveFilmResizing) return;
      var delta  = startY - ev2.clientY;  // drag up = expand
      var newH   = Math.max(60, Math.min(220, startH + delta));
      zone.style.height = newH + 'px';
      zone.style.setProperty('--filmstrip-h', newH + 'px');
    }

    function onUp() {
      _liveFilmResizing = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
```

---

## §9 — Teardown additions

```javascript
// In accord-capture.js teardown():
_liveFilmToken    = 0;
_liveFilmMeetings = [];
_liveFilmActiveId = null;
_liveFilmResizing = false;
var liveFilm = document.getElementById('ac-live-filmstrip');
if (liveFilm) liveFilm.remove();
```

---

## §10 — CSS additions

```css
/* ── Live filmstrip zone ────────────────────────────── */
#ac-live-filmstrip {
  display: flex;
  flex-direction: column;
  height: 100px;
  min-height: 60px;
  max-height: 220px;
  border-top: 1px solid var(--ac-border-subtle);
  background: var(--ac-bg-deep);
  flex-shrink: 0;
  position: relative;
  --filmstrip-h: 100px;
}

/* Resize handle — drag up to expand */
.ac-live-film-handle {
  height: 4px;
  cursor: ns-resize;
  background: transparent;
  border-bottom: 1px solid var(--ac-border-subtle);
  flex-shrink: 0;
}
.ac-live-film-handle:hover { background: var(--ac-cyan-dim); }

/* Header */
.ac-live-film-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 14px 2px 14px;
  flex-shrink: 0;
}
.ac-live-film-label {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  color: var(--ac-text-faint);
  letter-spacing: 1.2px;
  text-transform: uppercase;
}
.ac-live-film-hint {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  color: var(--ac-text-faint);
}

/* Track — horizontal scroll */
.ac-live-film-track {
  display: flex;
  flex-direction: row;
  gap: 6px;
  overflow-x: auto;
  padding: 6px 14px 8px 14px;
  flex: 1;
  align-items: flex-start;
  scrollbar-width: thin;
  scrollbar-color: var(--ac-border-mid) transparent;
}

.ac-live-film-loading,
.ac-live-film-empty {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-faint);
  font-style: italic;
  padding: 8px 0;
  align-self: center;
}

/* Active frame highlight */
.ac-film-frame--active {
  border: 2px solid var(--ac-cyan) !important;
  box-shadow: 0 0 6px rgba(94,234,212,0.3);
}

/* ── Thread History filtered view ───────────────────── */
.ac-film-th-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 16px 6px 16px;
  border-bottom: 1px solid var(--ac-border-subtle);
  flex-shrink: 0;
}
.ac-film-th-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--ac-text-primary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ac-film-th-date {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-tertiary);
  white-space: nowrap;
}
.ac-film-th-close {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-faint);
  background: none;
  border: 1px solid var(--ac-border-subtle);
  border-radius: 3px;
  padding: 2px 8px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.ac-film-th-close:hover { color: var(--ac-text-secondary); }

.ac-film-th-loading,
.ac-film-th-empty {
  font-size: 12px;
  color: var(--ac-text-tertiary);
  font-style: italic;
  padding: 16px;
}

/* Node rows in filtered Thread History */
.ac-th-node {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--ac-border-subtle);
  font-size: 12px;
}
.ac-th-node:last-child { border-bottom: none; }
.ac-th-node-seq {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  font-weight: 700;
  flex-shrink: 0;
  width: 52px;
}
.ac-th-node-summary {
  color: var(--ac-text-primary);
  line-height: 1.4;
}

/* Tag colors */
.ac-th-node--decision .ac-th-node-seq { color: var(--ac-cyan); }
.ac-th-node--action   .ac-th-node-seq { color: var(--ac-amber); }
.ac-th-node--dissent  .ac-th-node-seq { color: var(--ac-rose); }
.ac-th-node--risk     .ac-th-node-seq { color: var(--ac-rose); }
.ac-th-node--note     .ac-th-node-seq { color: var(--ac-text-tertiary); }
.ac-th-node--question .ac-th-node-seq { color: var(--ac-violet, #a78bfa); }
```

---

## §11 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Filmstrip renders at base of center pane | Filmstrip zone visible below capture stream, above footer. Shows sealed workstream meetings as frames. Date labels on each frame. |
| 2 | Frame enrichment (C-14) | If C-14 CSS classes are loaded, frames show dot indicators and seq IDs at scale. |
| 3 | Click a frame | Frame highlights cyan border. Thread History tab activates. Nodes from that meeting render in order: decisions first, then actions, risks, notes. Meeting title + date in header. |
| 4 | Click same frame again | Filter clears. Active frame border removed. CAPTURED THIS MEETING view restores. |
| 5 | ✕ Back button | Same as clicking same frame — filter clears, capture stream restores. |
| 6 | Click different frame | Active frame switches. Thread History re-loads with new meeting's nodes. |
| 7 | Resize handle | Drag handle up → filmstrip zone expands. Drag down → collapses. Min 60px, max 220px. |
| 8 | Scroll to end | Filmstrip auto-scrolls to most recent meeting on load. |
| 9 | Teardown | Navigate away. Filmstrip zone removed from DOM. Token invalidated. |

---

## §12 — Files manifest

| File | Change |
|---|---|
| `accord-capture.js` | `_mountLiveFilmstrip`, `_loadLiveFilmFrames`, `_onLiveFilmSelect`, `_activateThreadHistoryTab`, `_restoreCaptureStream`, `_loadFilmThreadHistory`, `_wireFilmResizeHandle`; module-level vars; teardown additions; call `_mountLiveFilmstrip` from capture surface init |
| `accord-capture.css` | Live filmstrip zone, track, frame active state, thread history header, node rows |
| `version.js` | Operator-managed (IR65) |

---

## §13 — Discipline checklist

- `var` only
- Token pattern: `_liveFilmToken` on `_loadLiveFilmFrames`
- `isConnected` check before painting thread history
- Resize handle: named `onMove`/`onUp` functions — self-removing via `removeEventListener`
- `_liveFilmResizing` flag prevents stale listeners
- `_enrichFilmCards()` reuse from C-14 — do not duplicate; call directly
- Click delegation on track element — not per-frame listeners
- Thread History close button wired after innerHTML write — not stale reference
- Frame click toggle: same frame = clear filter; different frame = switch
- `--ac-*` token prefix throughout

---

**Halt-and-surface after §11. Close-out must confirm: V2 (Thread History tab selector found), smoke test 3 (nodes render in correct tag order), smoke test 7 (resize within min/max bounds).**

**After seal: A-10 · CMD-ACCORD-CAPTURE-ATTACHMENTS-1 is unblocked.**

---

*End Commission · A-09 · CMD-ACCORD-CAPTURE-FILMSTRIP-1.*
