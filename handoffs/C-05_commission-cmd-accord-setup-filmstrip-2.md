# Commission · C-05 · CMD-ACCORD-SETUP-FILMSTRIP-2

**Phase:** 5 of Wave 1 — Filmstrip zone: full-width timeline strip
**Authored:** 2026-05-09
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Accord Meeting Setup Shell — Requirements Specification v1.1 §7
**Predecessor:** C-04 · CMD-ACCORD-SETUP-ATTENDEES-1 sealed
**Successor:** Wave 2 begins (C-06 · CMD-ACCORD-SETUP-BRIEFING-TABS-1)
**Coding agent:** execute sequentially; halt-and-surface after §8

---

## §1 — Scope

This is the final Wave 1 CMD. Wire the `.ac-setup-filmstrip` zone established in C-01 with the full workstream timeline strip. On completion, the Setup shell looks like mockup v5.

**Deliverables:**
1. Filmstrip header: workstream timeline label, meeting count, scrub controls
2. Frame strip: one frame per prior/current/future meeting, horizontal scroll
3. Three density states keyed to filmstrip height (compact / medium / expanded)
4. Dissent and decision marker dots on frames
5. Scrub-to-center-column: clicking a prior meeting frame loads that meeting's captured nodes into a read-only "scrub view" in the center column, with a back-to-agenda affordance
6. All 7 smoke tests pass

**What does NOT ship:**
- Tab system in center column (C-10)
- ▶ Play history animation (deferred — complex; document as future enhancement)
- Filmstrip in running-meeting surface (out of scope)
- Minute Notes as a formal tab (C-10 wires the full tab system; this CMD wires a lightweight scrub overlay)

---

## §2 — IR64 verification (before writing any code)

**V1 — Confirm filmstrip zone selector and current state:**
```javascript
var f = document.querySelector('.ac-setup-filmstrip');
JSON.stringify({
  cls: f?.className,
  h:   f?.offsetHeight,
  inner: f?.innerHTML?.slice(0, 200)
});
```
Confirm the zone exists, height is ~102px (default from C-01 grid), and `.ac-filmstrip-handle` + `.ac-filmstrip-content` are present.

**V2 — Prior meeting node counts query pattern:**
Confirm `accord_nodes` has `tag` and `meeting_id` columns (carry-forward — confirmed throughout). Confirm `dissent` is a valid tag value (confirmed from NRA surface work). Document as carry-forward.

**V3 — Center column tabbody content post-C-03/C-04:**
```javascript
document.querySelector('.ac-col-tabbody[data-col="center"]')?.innerHTML?.slice(0, 300);
```
Need: confirm the outcomes block and agenda placeholder are both present. The scrub overlay in §5.5 prepends a scrub panel and hides the existing content — must not destroy it.

**V4 — `accord_meetings.sealed_at` vs `scheduled_for` for frame dates:**
Carry-forward from Phase 6 (CMD-ACCORD-MEETING-SETUP-1): use `scheduled_for` as primary date, `sealed_at` as fallback. Document as carry-forward.

Report V1, V3 in close-out. V2, V4 as carry-forwards.

---

## §3 — No substrate changes

No migration. No new columns. No new RLS policies. All queries use existing tables. No `pg_notify` needed.

---

## §4 — Filmstrip render entry point

Called from `AccordMeetingSetup.render()`:

```javascript
var _filmstripAborted = false;

function _renderFilmstrip(meeting, workstreamId) {
  _filmstripAborted = false;
  var content = document.querySelector('.ac-filmstrip-content');
  if (!content) return;
  content.innerHTML = '<div class="ac-film-loading">Loading timeline…</div>';

  if (!workstreamId) {
    content.innerHTML = '<div class="ac-film-empty">No workstream — standalone meeting.</div>';
    return;
  }

  _fetchFilmMeetings(meeting.meeting_id, workstreamId)
    .then(function(meetings) {
      if (_filmstripAborted) return;
      return _fetchFilmNodeCounts(meetings).then(function(countMap) {
        if (_filmstripAborted) return;
        var content = document.querySelector('.ac-filmstrip-content');
        if (!content) return;
        _paintFilmstrip(content, meetings, countMap, meeting, workstreamId);
      });
    })
    .catch(function(e) {
      console.error('[AccordMeetingSetup] filmstrip fetch failed', e);
      var content = document.querySelector('.ac-filmstrip-content');
      if (content) content.innerHTML = '<div class="ac-film-error">Could not load timeline.</div>';
    });
}
```

---

## §5 — Fetch and paint

### §5.1 — Fetch meetings

```javascript
function _fetchFilmMeetings(currentMeetingId, workstreamId) {
  return API.get(
    'accord_meetings?workstream_id=eq.' + workstreamId +
    '&select=meeting_id,title,scheduled_for,sealed_at,state' +
    '&order=scheduled_for.asc.nullslast,created_at.asc'
  ).then(function(rows) { return rows || []; });
}
```

Fetches ALL meetings in workstream (past + current + future) ordered chronologically. No limit — the strip scrolls. Current meeting is identified by `meeting_id` match at paint time.

### §5.2 — Fetch node counts

```javascript
function _fetchFilmNodeCounts(meetings) {
  if (!meetings.length) return Promise.resolve({});
  var ids = meetings.map(function(m) { return m.meeting_id; }).join(',');
  return API.get(
    'accord_nodes?meeting_id=in.(' + ids + ')' +
    '&select=meeting_id,tag'
  ).then(function(nodes) {
    var map = {};
    meetings.forEach(function(m) { map[m.meeting_id] = {}; });
    (nodes || []).forEach(function(n) {
      if (!map[n.meeting_id]) map[n.meeting_id] = {};
      map[n.meeting_id][n.tag] = (map[n.meeting_id][n.tag] || 0) + 1;
    });
    return map;
  }).catch(function() { return {}; });
}
```

Sequential fetch: node count query depends on meeting IDs from first fetch. Not Promise.all — by design (second query depends on first result). Document in close-out.

### §5.3 — Paint filmstrip

```javascript
// Module-level scrub state
var _scrubState = { active: false, meetingId: null };

function _paintFilmstrip(content, meetings, countMap, currentMeeting, workstreamId) {
  var priorCount = meetings.filter(function(m) {
    return m.state === 'closed' || m.state === 'sealed';
  }).length;

  var html = '';

  // ── Header ──────────────────────────────────────────
  html += '<div class="ac-film-header">';
  html += '<span class="ac-film-label">WORKSTREAM TIMELINE · ';
  html += priorCount + ' PRIOR MEETING' + (priorCount !== 1 ? 'S' : '');
  html += ' · CLICK ANY FRAME TO SCRUB</span>';
  html += '<div class="ac-film-controls">';
  html += '<span class="ac-film-ctrl" data-action="scrub-first">⏮ FIRST</span>';
  // ▶ PLAY HISTORY deferred — future CMD
  html += '<span class="ac-film-ctrl ac-film-ctrl--active" data-action="scrub-today">⊙ TODAY</span>';
  html += '<span class="ac-film-ctrl" data-action="scrub-next">⏭ NEXT</span>';
  html += '</div>';
  html += '</div>';

  // ── Frame track ──────────────────────────────────────
  html += '<div class="ac-film-track" id="ac-film-track">';

  meetings.forEach(function(m) {
    var isCurrent = m.meeting_id === currentMeeting.meeting_id;
    var isFuture  = (m.state === 'idle') && !isCurrent;
    var isPast    = m.state === 'closed' || m.state === 'sealed';
    var counts    = countMap[m.meeting_id] || {};
    var date      = _filmDate(m);
    var label     = _filmLabel(m, date);
    var summary   = _filmCountSummary(counts);

    var frameClass = 'ac-film-frame';
    if (isCurrent) frameClass += ' ac-film-frame--current';
    if (isFuture)  frameClass += ' ac-film-frame--future';

    var hasDissent  = (counts['dissent'] || 0) > 0;
    var hasDecision = (counts['decision'] || 0) > 0;

    html += '<div class="' + frameClass + '" data-meeting-id="' + esc(m.meeting_id) + '">';

    // Gradient thumb
    var thumbIdx = ((meetings.indexOf(m) % 12) + 1);
    html += '<div class="ac-film-thumb ac-film-thumb--f' + thumbIdx + '"></div>';

    // Marker dots
    if (hasDissent)  html += '<div class="ac-film-marker ac-film-marker--dissent"></div>';
    else if (hasDecision) html += '<div class="ac-film-marker ac-film-marker--decision"></div>';

    // Frame meta (bottom overlay)
    html += '<div class="ac-film-meta">';
    html += '<div class="ac-film-date' + (isCurrent ? ' ac-film-date--current' : '') + '">';
    html += esc(label) + '</div>';
    if (summary) html += '<div class="ac-film-counts">' + esc(summary) + '</div>';
    html += '</div>';

    html += '</div>'; // .ac-film-frame
  });

  html += '</div>'; // .ac-film-track

  content.innerHTML = html;
  _wireFilmstripEvents(content, meetings, currentMeeting, workstreamId);
  _scrollToCurrentFrame(content);
}
```

### §5.4 — Date and label helpers

```javascript
function _filmDate(meeting) {
  var d = meeting.scheduled_for || meeting.sealed_at;
  if (!d) return '—';
  var dt = new Date(d);
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function _filmLabel(meeting, date) {
  // Use date as label; could be enriched with meeting shortname in future
  return date;
}

// Canonical tag order: N · D · A · R · Q · Di
// (locked 2026-05-09 per CMD-ACCORD-MEETING-SETUP-1 Phase 6 close-out)
var FILM_TAG_ORDER = [
  { tag: 'note',     abbr: 'N' },
  { tag: 'decision', abbr: 'D' },
  { tag: 'action',   abbr: 'A' },
  { tag: 'risk',     abbr: 'R' },
  { tag: 'question', abbr: 'Q' },
  { tag: 'dissent',  abbr: 'Di' }
];

function _filmCountSummary(counts) {
  var parts = [];
  FILM_TAG_ORDER.forEach(function(t) {
    var n = counts[t.tag] || 0;
    if (n > 0) parts.push(n + t.abbr);
  });
  return parts.length ? parts.join(' · ') : '';
}
```

### §5.5 — Scrub-to-center-column

When a prior meeting frame is clicked, load that meeting's captured nodes into a lightweight scrub overlay in the center column. The overlay sits above the existing content (outcomes + agenda placeholder); the existing content is hidden but not destroyed.

```javascript
function _activateScrub(meetingId, meetings, currentMeeting, workstreamId) {
  _scrubState.active    = true;
  _scrubState.meetingId = meetingId;

  // Mark frame as active
  document.querySelectorAll('.ac-film-frame').forEach(function(f) {
    f.classList.toggle('ac-film-frame--scrubbing', f.dataset.meetingId === meetingId);
  });

  // Scrub controls styling
  var todayCtrl = document.querySelector('[data-action="scrub-today"]');
  if (todayCtrl) todayCtrl.classList.remove('ac-film-ctrl--active');

  // Center column: show scrub overlay
  var tabbody = document.querySelector('.ac-col-tabbody[data-col="center"]');
  if (!tabbody) return;

  // Hide existing content (preserve it)
  tabbody.querySelectorAll(':scope > *:not(#ac-scrub-overlay)').forEach(function(el) {
    el.style.display = 'none';
  });

  // Create or update scrub overlay
  var overlay = document.getElementById('ac-scrub-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ac-scrub-overlay';
    overlay.className = 'ac-scrub-overlay';
    tabbody.insertBefore(overlay, tabbody.firstChild);
  }
  overlay.style.display = '';

  var idx   = meetings.findIndex(function(m) { return m.meeting_id === meetingId; });
  var total = meetings.filter(function(m) {
    return m.state === 'closed' || m.state === 'sealed';
  }).length;
  var mtg   = meetings[idx];

  overlay.innerHTML = [
    '<div class="ac-scrub-header">',
      '<span class="ac-scrub-title">' + esc(mtg ? mtg.title : '—') + '</span>',
      '<div class="ac-scrub-nav">',
        '<button class="ac-scrub-prev" data-action="scrub-prev">‹</button>',
        '<span class="ac-scrub-pos">' + _filmDate(mtg || {}) + '</span>',
        '<button class="ac-scrub-next" data-action="scrub-next-frame">›</button>',
      '</div>',
      '<button class="ac-scrub-close" data-action="scrub-close">Back to agenda</button>',
    '</div>',
    '<div class="ac-scrub-nodes" id="ac-scrub-nodes">',
      '<div class="ac-scrub-loading">Loading captures…</div>',
    '</div>'
  ].join('');

  _loadScrubNodes(meetingId, overlay);
  _wireScrubNav(overlay, meetings, currentMeeting, workstreamId);
}

function _deactivateScrub(currentMeeting) {
  _scrubState.active    = false;
  _scrubState.meetingId = null;

  // Restore center column
  var tabbody = document.querySelector('.ac-col-tabbody[data-col="center"]');
  if (tabbody) {
    tabbody.querySelectorAll(':scope > *').forEach(function(el) {
      el.style.display = '';
    });
    var overlay = document.getElementById('ac-scrub-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // Reset frame highlighting
  document.querySelectorAll('.ac-film-frame').forEach(function(f) {
    f.classList.remove('ac-film-frame--scrubbing');
  });

  // Restore scrub-today control
  var todayCtrl = document.querySelector('[data-action="scrub-today"]');
  if (todayCtrl) todayCtrl.classList.add('ac-film-ctrl--active');
}
```

### §5.6 — Load scrub nodes

```javascript
function _loadScrubNodes(meetingId, overlay) {
  API.get(
    'accord_nodes?meeting_id=eq.' + meetingId +
    '&order=created_at.asc' +
    '&select=node_id,tag,summary,seq_id,created_at'
  ).then(function(nodes) {
    var container = overlay.querySelector('#ac-scrub-nodes');
    if (!container) return;
    nodes = nodes || [];
    if (!nodes.length) {
      container.innerHTML = '<div class="ac-scrub-empty">No captures in this meeting.</div>';
      return;
    }
    container.innerHTML = nodes.map(function(n) {
      return [
        '<div class="ac-scrub-node ac-scrub-node--' + esc(n.tag) + '">',
          '<span class="ac-scrub-node-tag">' + esc((n.seq_id || n.tag).toUpperCase()) + '</span>',
          '<span class="ac-scrub-node-summary">' + esc(n.summary || '') + '</span>',
        '</div>'
      ].join('');
    }).join('');
  }).catch(function(e) {
    console.error('[AccordMeetingSetup] scrub nodes fetch failed', e);
    var container = overlay.querySelector('#ac-scrub-nodes');
    if (container) container.innerHTML = '<div class="ac-scrub-error">Could not load captures.</div>';
  });
}
```

### §5.7 — Scrub navigation

```javascript
function _wireScrubNav(overlay, meetings, currentMeeting, workstreamId) {
  overlay.addEventListener('click', function(ev) {
    var action = ev.target.dataset.action ||
                 ev.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'scrub-close') {
      _deactivateScrub(currentMeeting);
      return;
    }

    var priorMeetings = meetings.filter(function(m) {
      return m.state === 'closed' || m.state === 'sealed';
    });
    var idx = priorMeetings.findIndex(function(m) {
      return m.meeting_id === _scrubState.meetingId;
    });

    if (action === 'scrub-prev' && idx > 0) {
      _activateScrub(priorMeetings[idx - 1].meeting_id, meetings, currentMeeting, workstreamId);
    }
    if (action === 'scrub-next-frame' && idx < priorMeetings.length - 1) {
      _activateScrub(priorMeetings[idx + 1].meeting_id, meetings, currentMeeting, workstreamId);
    }
  });
}
```

### §5.8 — Filmstrip event wiring

```javascript
function _wireFilmstripEvents(content, meetings, currentMeeting, workstreamId) {
  var track = content.querySelector('#ac-film-track');
  if (track) {
    track.addEventListener('click', function(ev) {
      var frame = ev.target.closest('.ac-film-frame');
      if (!frame) return;
      var meetingId = frame.dataset.meetingId;
      if (!meetingId) return;

      // Clicking current meeting frame — deactivate scrub if active
      if (meetingId === currentMeeting.meeting_id) {
        if (_scrubState.active) _deactivateScrub(currentMeeting);
        return;
      }

      // Future meeting frames — not scrubable
      var mtg = meetings.find(function(m) { return m.meeting_id === meetingId; });
      if (!mtg || (mtg.state === 'idle' && meetingId !== currentMeeting.meeting_id)) return;

      _activateScrub(meetingId, meetings, currentMeeting, workstreamId);
    });
  }

  // Header scrub controls
  content.addEventListener('click', function(ev) {
    var action = ev.target.dataset.action ||
                 ev.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    var priorMeetings = meetings.filter(function(m) {
      return m.state === 'closed' || m.state === 'sealed';
    });

    if (action === 'scrub-first' && priorMeetings.length) {
      _activateScrub(priorMeetings[0].meeting_id, meetings, currentMeeting, workstreamId);
    }
    if (action === 'scrub-today') {
      if (_scrubState.active) _deactivateScrub(currentMeeting);
      _scrollToCurrentFrame(content);
    }
    if (action === 'scrub-next') {
      var futureIdle = meetings.filter(function(m) {
        return m.state === 'idle' && m.meeting_id !== currentMeeting.meeting_id;
      });
      if (futureIdle.length) {
        // Navigate to next idle meeting via transitions (not scrub)
        var next = futureIdle[0];
        if (window.Accord && Accord.setLevel) {
          Accord.setLevel('meeting', {
            meetingId:     next.meeting_id,
            workstreamId:  workstreamId
          });
        }
      }
    }
  });
}

function _scrollToCurrentFrame(content) {
  var current = content.querySelector('.ac-film-frame--current');
  if (current) {
    current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}
```

---

## §6 — Density state adaptation

The filmstrip height is draggable (C-01). Content adapts to three density states. Checked via `ResizeObserver` on `.ac-setup-filmstrip`:

```javascript
var _filmResizeObserver = null;

function _initFilmDensity() {
  var filmstrip = document.querySelector('.ac-setup-filmstrip');
  if (!filmstrip || typeof ResizeObserver === 'undefined') return;

  _filmResizeObserver = new ResizeObserver(function(entries) {
    var h = entries[0]?.contentRect?.height || filmstrip.offsetHeight;
    var density = h < 130 ? 'compact' : (h < 260 ? 'medium' : 'expanded');
    filmstrip.setAttribute('data-density', density);
  });
  _filmResizeObserver.observe(filmstrip);

  // Set initial density
  var h = filmstrip.offsetHeight;
  filmstrip.setAttribute('data-density', h < 130 ? 'compact' : (h < 260 ? 'medium' : 'expanded'));
}
```

CSS uses `[data-density]` on `.ac-setup-filmstrip` to show/hide content:

```css
/* Compact: date + label only */
.ac-setup-filmstrip[data-density="compact"] .ac-film-counts { display: none; }
.ac-setup-filmstrip[data-density="compact"] .ac-film-header { display: none; }

/* Medium: header + date + counts sparkline */
/* (default — all visible) */

/* Expanded: all content including additional context */
.ac-setup-filmstrip[data-density="expanded"] .ac-film-frame {
  height: 88px;  /* taller frames in expanded mode */
}
```

Call `_initFilmDensity()` from `_renderFilmstrip()` after paint.

---

## §7 — Teardown additions

```javascript
// In teardown():
_filmstripAborted = true;
if (_scrubState.active) { _scrubState.active = false; _scrubState.meetingId = null; }
if (_filmResizeObserver) { _filmResizeObserver.disconnect(); _filmResizeObserver = null; }
```

Also: if scrub is active at teardown, the center column content may still be hidden. Teardown must restore center column visibility:
```javascript
var tabbody = document.querySelector('.ac-col-tabbody[data-col="center"]');
if (tabbody) {
  tabbody.querySelectorAll(':scope > *').forEach(function(el) {
    el.style.display = '';
  });
}
```

---

## §8 — CSS additions

All styles inside `.ac-setup-shell`. Token prefix `--ac-*` only.

```css
/* ── Filmstrip content wrapper ───────────────────────── */
.ac-filmstrip-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 9px 22px;
  gap: 6px;
}

/* ── Header ─────────────────────────────────────────── */
.ac-film-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-shrink: 0;
}
.ac-film-label {
  font-family: var(--ac-font-mono);
  font-size: 9.5px;
  color: var(--ac-text-tertiary);
  letter-spacing: 1.4px;
  text-transform: uppercase;
}
.ac-film-controls {
  display: flex;
  gap: 12px;
  font-family: var(--ac-font-mono);
  font-size: 10px;
  color: var(--ac-text-tertiary);
}
.ac-film-ctrl { cursor: pointer; user-select: none; }
.ac-film-ctrl:hover { color: var(--ac-cyan); }
.ac-film-ctrl--active { color: var(--ac-cyan); }

/* ── Frame track ────────────────────────────────────── */
.ac-film-track {
  display: flex;
  gap: 5px;
  overflow-x: auto;
  flex: 1;
  scrollbar-width: thin;
  scrollbar-color: var(--ac-border-mid) transparent;
  align-items: flex-start;
}
.ac-film-track::-webkit-scrollbar { height: 4px; }
.ac-film-track::-webkit-scrollbar-thumb {
  background: var(--ac-border-mid);
  border-radius: 2px;
}

/* ── Individual frame ───────────────────────────────── */
.ac-film-frame {
  flex-shrink: 0;
  width: 88px;
  height: 56px;
  background: var(--ac-bg-pane);
  border: 1px solid var(--ac-border-subtle);
  border-radius: 4px;
  cursor: pointer;
  position: relative;
  transition: border-color .2s, transform .2s;
  overflow: hidden;
}
.ac-film-frame:hover {
  border-color: var(--ac-border-active);
  transform: translateY(-2px);
}
.ac-film-frame--current {
  border-color: var(--ac-cyan);
  box-shadow: 0 0 10px rgba(94,234,212,0.4);
}
.ac-film-frame--future {
  border-style: dashed;
  background: transparent;
  cursor: default;
}
.ac-film-frame--future:hover { transform: none; }
.ac-film-frame--scrubbing {
  border-color: var(--ac-amber);
  box-shadow: 0 0 8px rgba(251,191,119,0.4);
}

/* Gradient thumb backgrounds */
.ac-film-thumb { position: absolute; inset: 0; opacity: 0.5; }
.ac-film-thumb--f1  { background: linear-gradient(135deg, #1a3a4a 0%, #0d2030 100%); }
.ac-film-thumb--f2  { background: linear-gradient(135deg, #2a3a4a 0%, #1d2030 100%); }
.ac-film-thumb--f3  { background: linear-gradient(135deg, #1a3a3a 0%, #0d3020 100%); }
.ac-film-thumb--f4  { background: linear-gradient(135deg, #1a3a4a 30%, #2d1030 100%); }
.ac-film-thumb--f5  { background: linear-gradient(135deg, #2a3a5a 0%, #0d2040 100%); }
.ac-film-thumb--f6  { background: linear-gradient(135deg, #1a4a4a 0%, #0d2030 100%); }
.ac-film-thumb--f7  { background: linear-gradient(135deg, #1a3a4a 50%, #3d1020 100%); }
.ac-film-thumb--f8  { background: linear-gradient(135deg, #1a3a4a 70%, #1d2030 100%); }
.ac-film-thumb--f9  { background: linear-gradient(135deg, #2a3a3a 0%, #1d3030 100%); }
.ac-film-thumb--f10 { background: linear-gradient(135deg, #1a4a5a 0%, #0d2040 100%); }
.ac-film-thumb--f11 { background: linear-gradient(135deg, #1a3a4a 60%, #2d2030 100%); }
.ac-film-thumb--f12 { background: linear-gradient(135deg, #1a3a4a 0%, #0d2030 100%); }
.ac-film-frame--current .ac-film-thumb { opacity: 0.75; }

/* Marker dots */
.ac-film-marker {
  position: absolute;
  top: 3px; right: 3px;
  width: 5px; height: 5px;
  border-radius: 50%;
}
.ac-film-marker--dissent  { background: var(--ac-rose); }
.ac-film-marker--decision { background: var(--ac-cyan); }

/* Frame meta overlay */
.ac-film-meta {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  background: linear-gradient(180deg, transparent, rgba(10,14,20,0.92));
  padding: 9px 4px 3px 4px;
  font-family: var(--ac-font-mono);
  font-size: 7.5px;
  line-height: 1.3;
}
.ac-film-date         { color: var(--ac-text-primary); font-weight: 600; }
.ac-film-date--current { color: var(--ac-cyan); }
.ac-film-counts       { color: var(--ac-text-tertiary); }

/* ── Scrub overlay ──────────────────────────────────── */
.ac-scrub-overlay {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--ac-bg-pane);
  border-bottom: 1px solid var(--ac-border-subtle);
}
.ac-scrub-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--ac-border-subtle);
  flex-shrink: 0;
}
.ac-scrub-title {
  font-family: var(--ac-font-serif);
  font-size: 14px;
  font-weight: 500;
  color: var(--ac-text-primary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ac-scrub-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.ac-scrub-prev, .ac-scrub-next {
  font-size: 16px;
  background: none; border: none;
  color: var(--ac-text-secondary);
  cursor: pointer; padding: 0 4px;
}
.ac-scrub-prev:hover, .ac-scrub-next:hover { color: var(--ac-cyan); }
.ac-scrub-pos {
  font-family: var(--ac-font-mono);
  font-size: 10px;
  color: var(--ac-text-tertiary);
}
.ac-scrub-close {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-cyan);
  background: none; border: none;
  cursor: pointer; padding: 0;
  letter-spacing: 0.8px;
  flex-shrink: 0;
}
.ac-scrub-close:hover { text-decoration: underline; }

.ac-scrub-nodes {
  flex: 1;
  overflow-y: auto;
  padding: 12px 18px;
}
.ac-scrub-node {
  display: flex;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--ac-border-subtle);
  align-items: flex-start;
}
.ac-scrub-node:last-child { border-bottom: none; }
.ac-scrub-node-tag {
  font-family: var(--ac-font-mono);
  font-size: 8.5px;
  color: var(--ac-cyan);
  flex-shrink: 0;
  margin-top: 2px;
  min-width: 32px;
}
.ac-scrub-node--decision .ac-scrub-node-tag { color: var(--ac-cyan);   }
.ac-scrub-node--action   .ac-scrub-node-tag { color: var(--ac-amber);  }
.ac-scrub-node--risk     .ac-scrub-node-tag { color: var(--ac-rose);   }
.ac-scrub-node--dissent  .ac-scrub-node-tag { color: var(--ac-rose);   }
.ac-scrub-node--question .ac-scrub-node-tag { color: var(--ac-violet); }
.ac-scrub-node--note     .ac-scrub-node-tag { color: var(--ac-text-tertiary); }
.ac-scrub-node-summary {
  font-size: 12px;
  color: var(--ac-text-secondary);
  line-height: 1.4;
}
.ac-scrub-empty, .ac-scrub-loading, .ac-scrub-error {
  font-size: 12px;
  color: var(--ac-text-tertiary);
  font-style: italic;
  padding: 8px 0;
}
```

---

## §9 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Open idle meeting in workstream with prior meetings | Filmstrip renders. Header shows "N PRIOR MEETINGS". Frame track scrolls horizontally. Current meeting frame has cyan border + glow. |
| 2 | Frame markers | Prior meetings with dissent nodes have rose dot. Decision-heavy meetings without dissent have cyan dot. Clean meetings have no dot. Verify against `accord_nodes` counts. |
| 3 | Click prior meeting frame | Scrub overlay opens in center column. Outcomes block and agenda placeholder hidden (not destroyed). Meeting title + date in scrub header. Node list renders. |
| 4 | Scrub nav ‹ / › | Steps through prior meetings. Frame highlighting tracks correctly in filmstrip. Node list refreshes. |
| 5 | Back to agenda | Scrub overlay dismissed. Outcomes block and agenda placeholder visible again. Filmstrip frame highlighting reset. |
| 6 | ⏮ FIRST / ⊙ TODAY controls | FIRST opens scrub for oldest prior meeting. TODAY closes scrub (if active) and scrolls to current frame. |
| 7 | Filmstrip drag-resize density | Drag filmstrip handle up to ~200px → header appears, count summaries visible. Drag to ~350px → expanded. Drag back to ~102px → compact (header hidden). `data-density` attribute changes confirmed. |

---

## §10 — Files manifest

| File | Change |
|---|---|
| `accord-meeting-setup.js` | `_renderFilmstrip()` + all filmstrip/scrub functions; `_initFilmDensity()`; teardown additions |
| `accord-meeting-setup.css` | Filmstrip content, frame, marker, meta, scrub overlay styles |
| `accord-views.js` | No changes |
| `accord-transitions.js` | No changes |
| `version.js` | Operator-managed (IR65) |

---

## §11 — Discipline checklist

- `var` only
- IR71: all DOM references re-queried after async; `_filmstripAborted` checked before paint
- Sequential fetch (meetings → node counts) — second query depends on first; not Promise.all; documented in close-out
- `_filmstripAborted`, `_scrubState`, `_filmResizeObserver` all reset/disconnected in `teardown()`
- Center column content restored (unhidden) in `teardown()` if scrub was active
- `data-action` on ALL interactive elements — no id-only delegation targets (C-03 lesson)
- `FILM_TAG_ORDER` uses canonical tag order locked in MEETING-SETUP-1 Phase 6 close-out (N·D·A·R·Q·Di)
- ▶ PLAY HISTORY deferred — documented as future enhancement in close-out
- ⏭ NEXT navigates to next idle meeting via `Accord.setLevel()` per CMD-ACCORD-NEWMEETING-ROUTING-FIX-1 discipline — never direct render
- `--ac-*` token prefix throughout; no production Accord tokens

---

## §12 — Wave 1 completion note

**This CMD seals Wave 1.** After smoke tests pass:

The Setup shell:
- Is laid out correctly (C-01)
- Has a functional header with Stakes, schedule meta, and mode toggle (C-02)
- Shows Intended Outcomes above the Agenda (C-03)
- Shows a curated attendee roster with add/remove (C-04)
- Shows the full workstream timeline with scrub-to-prior-meeting (C-05)

The shell now **looks like mockup v5**. Wave 2 makes it **behave like mockup v5**.

**Wave 1 close-out deliverable (in addition to standard CMD close-out):** operator opens the Setup shell and compares visually to the mockup v5 screenshot. Document any material visual gaps in the close-out for Wave 2 prioritization.

---

**Halt-and-surface after §9. Include Wave 1 visual comparison note in close-out.**

**After seal: Wave 2 begins with C-06 · CMD-ACCORD-SETUP-BRIEFING-TABS-1.**

---

*End Commission · C-05 · CMD-ACCORD-SETUP-FILMSTRIP-2.*
