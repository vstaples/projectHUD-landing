# Phase 6 Commission · CMD-ACCORD-MEETING-SETUP-1

**Phase:** 6 — Filmstrip: prior meeting thumbnail strip
**Authored:** 2026-05-09
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Predecessor:** Phase 5 sealed (all 8 smoke tests pass)
**Coding agent:** execute sequentially; halt-and-surface after §7

---

## §1 — Scope

Fill `.ac-setup-filmstrip` with a horizontal scrollable strip of prior meeting cards from the same workstream. Each card: meeting title, date, node-count summary. Cards are clickable — navigate to that meeting.

No new substrate. No new columns. Read-only display.

---

## §2 — Locked decisions

| Decision | Lock |
|---|---|
| Card content | Title, date (scheduled_for or sealed_at, formatted), node counts by tag |
| Node count query | Single `accord_nodes` query grouped client-side by `meeting_id` + `tag` |
| Prior meetings scope | Same workstream; state `in.(closed,sealed)`; exclude current meeting; limit 12; ordered most-recent first |
| Card click | `Accord.setLevel('meeting', { meetingId: card.meeting_id, workstreamId })` — same routing pattern as CMD-ACCORD-NEWMEETING-ROUTING-FIX-1 |
| Parking-lot meeting | Filmstrip hidden entirely (`display:none` on `.ac-setup-filmstrip`). No queries run. |
| Empty state (no prior meetings) | Single muted label inside strip: "No prior meetings in this workstream." |
| Animation | None. Filmstrip is static on render. Horizontal scroll via CSS only. |

---

## §3 — No substrate changes

No migration. No verification queries required beyond confirming `Accord.setLevel` signature (already confirmed in CMD-ACCORD-NEWMEETING-ROUTING-FIX-1 Phase 1 IR64 V2 — carry forward; document in close-out).

---

## §4 — `accord-meeting-setup.js` additions

### §4.1 — Entry point

Called from `render()`. Runs after shell HTML is written, in parallel with `_renderAgenda`, `_renderBriefing`, `_renderAnticipation`:

```javascript
function _renderFilmstrip(meeting, workstreamId) {
  var strip = document.querySelector('.ac-setup-filmstrip');
  if (!strip) return;

  if (!workstreamId) {
    strip.style.display = 'none';
    return;
  }

  strip.innerHTML = '<div class="ac-film-loading">Loading…</div>';

  _fetchPriorMeetings(meeting.meeting_id, workstreamId)
    .then(function(meetings) {
      if (_filmstripFetchAborted) return;
      return _fetchNodeCounts(meetings).then(function(countMap) {
        if (_filmstripFetchAborted) return;
        _paintFilmstrip(strip, meetings, countMap, workstreamId);
      });
    })
    .catch(function(e) {
      console.error('[AccordMeetingSetup] filmstrip fetch failed', e);
      if (strip) strip.innerHTML = '<div class="ac-film-error">Could not load prior meetings.</div>';
    });
}
```

Abort flag: `_filmstripFetchAborted` — same pattern as `_agendaFetchAborted` and `_anticipationFetchAborted`. Set `false` at top of `_renderFilmstrip`. Set `true` in `teardown()`. Check before each paint step.

### §4.2 — Fetch: prior meetings

```javascript
function _fetchPriorMeetings(currentMeetingId, workstreamId) {
  return API.get(
    'accord_meetings?workstream_id=eq.' + workstreamId +
    '&meeting_id=neq.' + currentMeetingId +
    '&state=in.(closed,sealed)' +
    '&select=meeting_id,title,scheduled_for,sealed_at,state' +
    '&order=scheduled_for.desc.nullslast,created_at.desc' +
    '&limit=12'
  ).then(function(rows) { return rows || []; });
}
```

### §4.3 — Fetch: node counts

Single query across all prior meeting IDs. Group client-side.

```javascript
function _fetchNodeCounts(meetings) {
  if (!meetings.length) return Promise.resolve({});
  var ids = meetings.map(function(m) { return m.meeting_id; }).join(',');
  return API.get(
    'accord_nodes?meeting_id=in.(' + ids + ')' +
    '&select=meeting_id,tag'
  ).then(function(nodes) {
    // Build countMap: { meeting_id: { tag: count, ... }, ... }
    var map = {};
    meetings.forEach(function(m) { map[m.meeting_id] = {}; });
    (nodes || []).forEach(function(n) {
      if (!map[n.meeting_id]) map[n.meeting_id] = {};
      map[n.meeting_id][n.tag] = (map[n.meeting_id][n.tag] || 0) + 1;
    });
    return map;
  });
}
```

`Promise.all` not used here — sequential by design (node count query depends on meeting IDs from first fetch). This is the correct sequential pattern; document in close-out.

### §4.4 — Paint

```javascript
function _paintFilmstrip(strip, meetings, countMap, workstreamId) {
  if (!meetings.length) {
    strip.innerHTML = '<div class="ac-film-empty">No prior meetings in this workstream.</div>';
    return;
  }

  var html = '<div class="ac-film-track">';
  meetings.forEach(function(m) {
    var counts = countMap[m.meeting_id] || {};
    var date = m.scheduled_for
      ? fmtDate(m.scheduled_for)
      : (m.sealed_at ? fmtDate(m.sealed_at) : '—');
    var summary = _buildCountSummary(counts);
    html += '<div class="ac-film-card" data-meeting-id="' + esc(m.meeting_id) + '"' +
            ' data-workstream-id="' + esc(workstreamId) + '">';
    html += '<div class="ac-film-card-title">' + esc(m.title) + '</div>';
    html += '<div class="ac-film-card-date">' + esc(date) + '</div>';
    html += '<div class="ac-film-card-summary">' + esc(summary) + '</div>';
    html += '</div>';
  });
  html += '</div>';
  strip.innerHTML = html;

  // Event delegation — single listener on strip
  strip.addEventListener('click', _onFilmCardClick);
}
```

**`_buildCountSummary(counts)`:**

Returns a compact string from the tag count map. Use the confirmed tag values from Phase 3/5 V3 findings. Omit zero-count tags. Examples:
- `"3D · 2A · 1R"` (Decision, Action, Risk)
- `"1N · 2D"` (Note, Decision)
- `"No captures"` if counts is empty

Tag abbreviations: use first letter of each tag (uppercased). Order: Note, Decision, Action, Risk, Question (or the canonical order from accord-capture.js tag bar — match it exactly).

### §4.5 — Card click handler

```javascript
function _onFilmCardClick(ev) {
  var card = ev.target.closest('.ac-film-card');
  if (!card) return;
  var meetingId = card.dataset.meetingId;
  var workstreamId = card.dataset.workstreamId;
  if (!meetingId) return;
  // Route through transitions layer per CMD-ACCORD-NEWMEETING-ROUTING-FIX-1
  if (window.Accord && Accord.setLevel) {
    Accord.setLevel('meeting', { meetingId: meetingId, workstreamId: workstreamId || null });
  } else {
    window.dispatchEvent(new CustomEvent('accord:level-changed', {
      detail: { level: 'meeting', context: { meetingId: meetingId, workstreamId: workstreamId || null } }
    }));
  }
}
```

IR71 note: `card` resolved via `closest()` at click time — no stale reference.

### §4.6 — Teardown additions

```javascript
// In teardown():
_filmstripFetchAborted = true;
var strip = document.querySelector('.ac-setup-filmstrip');
if (strip) strip.removeEventListener('click', _onFilmCardClick);
```

The listener is on `strip` (not `window`), so it's removed with the DOM on teardown. The explicit `removeEventListener` is a belt-and-suspenders guard in case teardown fires before the strip is wiped.

---

## §5 — CSS additions (`accord-meeting-setup.css`)

The `.ac-setup-filmstrip` container was established in Phase 2. Phase 6 adds the track and card rules.

```css
/* Filmstrip track — horizontal scroll */
.ac-film-track {
  display: flex;
  flex-direction: row;
  gap: 10px;
  overflow-x: auto;
  padding: 8px 0;
  /* hide scrollbar on webkit; still scrollable */
  scrollbar-width: thin;
  scrollbar-color: var(--surface-border, #2a2a2a) transparent;
}

/* Individual card */
.ac-film-card {
  flex: 0 0 160px;
  background: var(--surface-raised, #1e1e1e);
  border: 1px solid var(--surface-border, #2a2a2a);
  border-radius: 4px;
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ac-film-card:hover {
  border-color: var(--signal, #d4a04a);
}

.ac-film-card-title {
  font-size: 12px;
  font-weight: 600;
  /* truncate to 2 lines */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ac-film-card-date {
  font-size: 11px;
  color: var(--text-muted, #888);
}
.ac-film-card-summary {
  font-size: 11px;
  color: var(--text-muted, #888);
  margin-top: 4px;
}

/* Empty / loading / error states */
.ac-film-empty,
.ac-film-loading,
.ac-film-error {
  font-size: 12px;
  color: var(--text-muted, #888);
  font-style: italic;
  padding: 8px 0;
}
```

---

## §6 — `render()` coordination

`_renderFilmstrip` joins `_renderAgenda`, `_renderBriefing`, `_renderAnticipation` as a parallel call from `render()`. All four fire without awaiting each other — each paints its own area independently. Document this in close-out: four independent parallel renders, each with its own abort flag, each painting a distinct DOM area. No shared state between them.

---

## §7 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Open idle meeting in workstream with prior closed/sealed meetings | Filmstrip renders below anticipation column. Cards show title, date, node-count summary. Horizontal scroll works if cards overflow. |
| 2 | Card count summary accuracy | Pick a prior meeting. Verify summary matches actual node counts: `SELECT tag, COUNT(*) FROM accord_nodes WHERE meeting_id = '<id>' GROUP BY tag;` |
| 3 | Click a filmstrip card | Surface navigates to that meeting via transitions layer. No duplicate title, no stale surface (CMD-ACCORD-NEWMEETING-ROUTING-FIX-1 regression check). |
| 4 | Navigate back (ascend to constellation, descend to original idle meeting) | Filmstrip re-renders correctly. No stale click listeners. |
| 5 | Parking-lot meeting (workstream_id IS NULL) | Filmstrip strip hidden (`display:none`). No `accord_meetings` or `accord_nodes` query fires (confirm DevTools Network). |
| 6 | No prior meetings | Single "No prior meetings in this workstream." label. No JS error. |
| 7 | Teardown while filmstrip is loading | `_filmstripFetchAborted` prevents paint. No console error. No DOM write after teardown. |

---

## §8 — Files manifest

| File | Change |
|---|---|
| `accord-meeting-setup.js` | Filmstrip render/fetch/paint/click; teardown additions |
| `accord-meeting-setup.css` | Filmstrip track + card styles |
| `accord-views.js` | No changes |
| `accord-transitions.js` | No changes |
| `version.js` | Operator-managed (IR65) |

---

## §9 — Discipline checklist

- `var` only
- Sequential fetch (meetings → node counts) is correct here: second query depends on first result. Not `Promise.all`. Document in close-out.
- `_filmstripFetchAborted`: set false at top of `_renderFilmstrip`, true in `teardown()`, checked before each paint step
- Card click routes through `Accord.setLevel` / `accord:level-changed` — never direct render call (CMD-ACCORD-NEWMEETING-ROUTING-FIX-1 discipline)
- `_onFilmCardClick` uses `ev.target.closest()` — IR71 safe
- `removeEventListener` in teardown passes same `_onFilmCardClick` reference — must be a named module-level function, not an anonymous closure
- Tag abbreviations and order match accord-capture.js tag bar — verify before finalizing `_buildCountSummary`
- Style Doctrine v1.8 §3.8 — Accord palette only; no invented tokens

---

## §10 — Doctrine carry-forward

**Null-guard on DOM element access before mount** — 4+ data points (all MEETING-SETUP chain). Candidate text locked in Phase 5 §11. Awaiting cross-CMD instance for ratification. Include count and candidate text in Phase 6 close-out. No operator action required yet.

---

## §11 — Phase 7 preview (not in scope)

Phase 7 = Footer: time-budget gauge (estimated vs elapsed, if `scheduled_duration` or equivalent exists on `accord_meetings`), overrun warning, footer left-side content. Phase 7 commission authored after Phase 6 seal. Phase 7 completes CMD-ACCORD-MEETING-SETUP-1.

---

**Halt-and-surface after §7. Phase 6 close-out to include: `Accord.setLevel` signature confirmation (carry-forward from NEWMEETING-ROUTING-FIX-1), tag abbreviation source, and doctrine carry-forward (§10).**

---

*End Phase 6 Commission · CMD-ACCORD-MEETING-SETUP-1.*
